import { randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameDescriptor, GameReply, GameRequest, GameRuntime } from '../contracts.ts';
import { attackPool, damageVsResilience, type RangeBand, rangeBand, woundedPenalty } from './rules/formulas.ts';
import { rollDamage, rollDetermination, rollPool, rollTest, shiftableExalted } from './rules/dice.ts';
import { WgStore } from './store.ts';
import { gmDecide, narrateWg } from './ai.ts';
import { findScene, loadScenarioPack, publicScene, type ScenarioPack } from './scenario.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DATA_DIR = process.env.SAGAS_DATA_DIR || join(ROOT, 'data');
const STORE_PATH = join(DATA_DIR, 'games', 'wrath-glory.sqlite');
const DEMO_PREGEN_PATH = join(ROOT, 'content', 'wg', 'prefabs', 'example-original.json');
const LOCAL_PACK_DIR = join(ROOT, 'data', 'wg', 'packs', 'graveyard-shift');
const LOCAL_PREGEN_PATH = join(LOCAL_PACK_DIR, 'pregens.json');
const SCENARIO_PACK_PATH = join(LOCAL_PACK_DIR, 'scenario.json');

const descriptor: GameDescriptor = {
    id: 'wrath-glory',
    name: '怒火与荣耀 · 代达隆',
    subtitle: 'Wrath & Glory · C7 · Graveyard Shift',
    rulesetId: 'wg-c7',
    route: '/games/wrath-glory',
    creationRoute: '/games/wrath-glory',
    phase: 'experimental',
    description: '按 C7 核心规则实现骰池、图标、怒火骰、转化与伤害结算。Graveyard Shift 五段调查为本地私有改编包；公开仓库只带原创训练演示。',
    features: ['d6 图标骰池', '怒火骰与转化', '伤害/冲击分离', '可暂停的结算'],
    disclaimer: '非官方授权产品；公开仓库不含官方书籍正文、插画或完整 stat block。',
};

type Weapon = {
    id: string;
    name: string;
    damage: number;
    ed: number;
    short: number;
    medium: number;
    long: number;
};

type Actor = {
    id: string;
    name: string;
    kind: 'pc' | 'enemy';
    archetype: string;
    attributes: Record<'strength' | 'toughness' | 'agility' | 'initiative' | 'willpower' | 'intellect' | 'fellowship', number>;
    skills: Record<string, number>;
    defence: number;
    resilience: number;
    woundsTaken: number;
    maxWounds: number;
    shockTaken: number;
    maxShock: number;
    weapon: Weapon | null;
    attackPool?: number;
    down?: boolean;
    exhausted?: boolean;
    onFire?: boolean;
    special?: { fear?: number; onFire?: boolean; deathSplit?: string; ruin?: { cost: number; bonusDamage: number; text: string } };
};

type ShiftPending = {
    decisionId: string;
    actionId: string;
    actorId: string;
    targetId: string;
    phase: 'shift';
    allowedChoices: ['damage', 'glory', 'skip'];
    roll: { faces: number[]; icons: number; exalted: number; shiftable: number; wrathSix: boolean; wrathOne: boolean };
    weaponDamage: number;
    weaponName: string;
};

type DeterminationPending = {
    decisionId: string;
    actionId: string;
    actorId: string;
    targetId: string;
    phase: 'determination';
    allowedChoices: ['determination', 'accept'];
    damageValue: number;
    resilience: number;
    woundCount: number;
    shockDie: number;
    source: string;
};

type Pending = ShiftPending | DeterminationPending;

type SessionState = {
    schemaVersion: 1;
    gameId: 'wrath-glory';
    rulesetId: 'wg-c7';
    rulesRevision: 'c7-2020-07-24-errata';
    contentVersion: string;
    id: string;
    scenarioId: 'training' | 'graveyard-shift';
    round: number;
    scene: string;
    sceneId?: string;
    sceneTitle?: string;
    scenePart?: string;
    clues?: string[];
    flags?: Record<string, boolean>;
    ending?: { id: string; title: string; text: string } | null;
    party: Actor[];
    enemies: Actor[];
    glory: number;
    ruin: number;
    log: string[];
    result: 'victory' | 'defeat' | null;
    pending: Pending | null;
    lastRequests: string[];
};

const WEAPONS: Record<string, Weapon> = {
    'demo-acolyte': { id: 'laspistol', name: '激光手枪（演示）', damage: 4, ed: 1, short: 12, medium: 24, long: 36 },
    'demo-guardsman': { id: 'lasgun', name: '激光步枪（演示）', damage: 5, ed: 1, short: 18, medium: 36, long: 54 },
    'demo-tech-adept': { id: 'laspistol', name: '激光手枪（演示）', damage: 4, ed: 1, short: 12, medium: 24, long: 36 },
    'pc-acolyte': { id: 'laspistol', name: '激光手枪', damage: 4, ed: 1, short: 12, medium: 24, long: 36 },
    'pc-guardsman': { id: 'lasgun', name: '激光步枪', damage: 5, ed: 1, short: 18, medium: 36, long: 54 },
    'pc-tech-adept': { id: 'laspistol', name: '激光手枪', damage: 4, ed: 1, short: 12, medium: 24, long: 36 },
};

function rng(): number {
    return (randomInt(1, 7) - 0.5) / 6;
}

function loadParty(): any[] {
    const path = existsSync(LOCAL_PREGEN_PATH) ? LOCAL_PREGEN_PATH : DEMO_PREGEN_PATH;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return data.pregens;
}

function pcFromPregen(p: any): Actor {
    return {
        id: p.id,
        name: p.name,
        kind: 'pc',
        archetype: p.archetype,
        attributes: p.attributes,
        skills: p.skills,
        defence: Math.max(1, p.attributes.initiative - 1),
        resilience: p.attributes.toughness + 1,
        woundsTaken: 0,
        maxWounds: p.attributes.toughness + 2 * p.tier,
        shockTaken: 0,
        maxShock: p.attributes.willpower + p.tier,
        weapon: WEAPONS[p.id] || null,
    };
}

function createSession(id: string): SessionState {
    const party = loadParty().map(pcFromPregen);
    return {
        schemaVersion: 1,
        gameId: 'wrath-glory',
        rulesetId: 'wg-c7',
        rulesRevision: 'c7-2020-07-24-errata',
        contentVersion: 'demo-1',
        id,
        scenarioId: 'training',
        round: 1,
        scene: '训练场：一台静止的训练机仆固定在 12 米外，等待队伍校准武器。',
        party,
        enemies: [{
            id: 'training-servitor',
            name: '训练机仆',
            kind: 'enemy',
            archetype: '训练目标',
            attributes: { strength: 2, toughness: 3, agility: 1, initiative: 1, willpower: 0, intellect: 0, fellowship: 0 },
            skills: {},
            defence: 2,
            resilience: 6,
            woundsTaken: 0,
            maxWounds: 4,
            shockTaken: 0,
            maxShock: 2,
            weapon: null,
        }],
        glory: 0,
        ruin: 3,
        log: ['训练遭遇开始。选择一名角色，向训练机仆开火。'],
        result: null,
        pending: null,
        lastRequests: [],
    };
}

function loadInstalledPack(): ScenarioPack | null {
    try {
        if (!existsSync(SCENARIO_PACK_PATH))
            return null;
        return loadScenarioPack(SCENARIO_PACK_PATH);
    }
    catch {
        return null;
    }
}

function threatActor(spec: ScenarioPack['threats'][string]): Actor {
    return {
        id: spec.id,
        name: spec.name,
        kind: 'enemy',
        archetype: spec.archetype,
        attributes: { strength: 3, toughness: 3, agility: 2, initiative: 2, willpower: 2, intellect: 1, fellowship: 1 },
        skills: {},
        defence: spec.defence,
        resilience: spec.resilience,
        woundsTaken: 0,
        maxWounds: spec.maxWounds,
        shockTaken: 0,
        maxShock: spec.maxShock,
        weapon: { id: spec.id + '-weapon', name: spec.name + '的攻击', damage: spec.damage, ed: spec.ed, short: spec.short, medium: spec.medium, long: spec.long },
        attackPool: spec.attackPool ?? 5,
        special: { fear: spec.fear, onFire: spec.onFire, deathSplit: spec.deathSplit, ruin: spec.ruin },
    };
}

function enterScene(state: SessionState, pack: ScenarioPack, sceneId: string): void {
    const scene = findScene(pack, sceneId);
    state.sceneId = scene.id;
    state.sceneTitle = scene.title;
    state.scenePart = scene.part;
    state.scene = scene.text;
    state.ending = scene.ending || null;
    state.enemies = scene.combat ? scene.combat.enemies.map((id) => threatActor(pack.threats[id])) : [];
    if (scene.ending)
        state.result = 'victory';
    state.log.push(`【${scene.part}】${scene.title}`);
    if (scene.corruption)
        resolveCorruption(state, scene.corruption);
    if (scene.combat) {
        const fear = scene.combat.enemies
            .map((id) => pack.threats[id]?.fear)
            .filter((dn): dn is number => typeof dn === 'number');
        if (fear.length) {
            const dn = Math.max(...fear);
            state.log.push(`恐惧（Fear）检定 DN ${dn}。`);
            for (const pc of state.party) {
                const roll = rollTest(Math.max(1, pc.attributes.willpower - 1), dn, rng);
                if (roll.success)
                    state.log.push(`${pc.name} 压住了恐惧。`);
                else {
                    pc.shockTaken += 1;
                    state.log.push(`${pc.name} 恐惧失败，受到 1 点冲击。`);
                    if (pc.maxShock > 0 && pc.shockTaken > pc.maxShock) {
                        pc.exhausted = true;
                        state.log.push(`${pc.name} 力竭。`);
                    }
                }
            }
        }
    }
    if (scene.combat?.intro)
        state.log.push(scene.combat.intro);
}

function resolveCorruption(state: SessionState, check: { dn: number; text: string }): void {
    state.log.push(`腐化检定（DN ${check.dn}）：${check.text}`);
    for (const pc of state.party) {
        const roll = rollTest(pc.attributes.willpower, check.dn, rng);
        if (roll.success)
            state.log.push(`${pc.name} 抵抗住腐化（${roll.icons} 个图标）。`);
        else {
            state.ruin = Math.min(2 * state.party.length, state.ruin + 1);
            state.log.push(`${pc.name} 腐化检定失败；GM 获得 1 点毁灭（Ruin）。`);
        }
    }
}

function createScenarioSession(id: string, pack: ScenarioPack): SessionState {
    const party = loadParty().map(pcFromPregen);
    const state: SessionState = {
        ...createSession(id),
        scenarioId: 'graveyard-shift',
        contentVersion: 'graveyard-shift-private-1',
        party,
        enemies: [],
        sceneId: pack.startScene,
        clues: [],
        flags: {},
        ending: null,
        result: null,
        log: ['Graveyard Shift：原创中文改编，五个 Part；官方数值请以本地规则书核对。'],
    };
    enterScene(state, pack, pack.startScene);
    return state;
}

function advanceAfterCombat(state: SessionState, pack: ScenarioPack): boolean {
    if (!state.sceneId)
        return false;
    const scene = findScene(pack, state.sceneId);
    if (!scene.combat)
        return false;
    if (state.enemies.some((e) => e.woundsTaken <= e.maxWounds))
        return false;
    state.log.push('遭遇结束。');
    enterScene(state, pack, scene.combat.victory);
    return true;
}

function createDeterminationPending(state: SessionState, target: Actor, damage: number, source: string): void {
    const woundCount = damage - target.resilience;
    const decisionId = crypto.randomUUID();
    state.pending = {
        decisionId,
        actionId: `enemy-${state.round}`,
        actorId: target.id,
        targetId: source,
        phase: 'determination',
        allowedChoices: ['determination', 'accept'],
        damageValue: damage,
        resilience: target.resilience,
        woundCount,
        shockDie: randomInt(1, 4),
        source,
    };
    state.log.push(`${target.name} 将承受 ${woundCount} 点创伤（Wounds）；可以选择掷 Determination 把创伤转为冲击。`);
}

function enemyTurn(state: SessionState): void {
    if (state.pending || state.result)
        return;
    for (const pc of state.party) {
        if (!pc.onFire || pc.woundsTaken > pc.maxWounds)
            continue;
        pc.woundsTaken += 1;
        pc.onFire = false;
        state.log.push(`${pc.name} 身上的火焰造成 1 点创伤。`);
        if (pc.woundsTaken > pc.maxWounds) {
            pc.down = true;
            state.log.push(`${pc.name} 进入濒死。`);
        }
    }
    if (state.party.every((p) => p.woundsTaken > p.maxWounds)) {
        state.result = 'defeat';
        state.log.push('小队全灭，遭遇失败。');
        return;
    }
    const enemy = state.enemies.find((e) => e.woundsTaken <= e.maxWounds && e.weapon);
    if (!enemy) {
        state.round += 1;
        return;
    }
    const candidates = state.party.filter((p) => p.woundsTaken <= p.maxWounds);
    if (!candidates.length) {
        state.result = 'defeat';
        state.log.push('小队全灭，遭遇失败。');
        return;
    }
    const target = candidates[0];
    const penalty = woundedPenalty(target.woundsTaken);
    const roll = rollTest(enemy.attackPool ?? 5, target.defence + penalty, rng);
    state.log.push(`${enemy.name} 反击 ${target.name}：${roll.faces.join('、')}，${roll.icons} 个图标（Defence ${target.defence}${penalty ? '，受伤 +1' : ''}）。`);
    if (!roll.success) {
        state.log.push(`${enemy.name} 未命中。`);
        state.round += 1;
        return;
    }
    let bonusDamage = 0;
    if (enemy.special?.ruin && state.ruin >= enemy.special.ruin.cost) {
        state.ruin -= enemy.special.ruin.cost;
        bonusDamage = enemy.special.ruin.bonusDamage;
        state.log.push(`${enemy.name} 消耗 ${enemy.special.ruin.cost} 点毁灭（Ruin）：${enemy.special.ruin.text}`);
    }
    const dmg = rollDamage(enemy.weapon!.damage + bonusDamage, 0, rng);
    state.log.push(`${enemy.name} 命中，伤害 ${dmg.total}（Resilience ${target.resilience}）。`);
    if (enemy.special?.onFire) {
        target.onFire = true;
        state.log.push(`${target.name} 被点燃（On Fire）——下一次敌方回合受到 1 点创伤。`);
    }
    if (dmg.total > target.resilience) {
        createDeterminationPending(state, target, dmg.total, enemy.name);
        return;
    }
    state.log.push(...applyDamage(state, target, dmg.total, randomInt(1, 4)));
    state.round += 1;
}

function resolveDetermination(state: SessionState, pending: DeterminationPending, choice: 'determination' | 'accept'): void {
    const target = actor(state, pending.actorId);
    if (!target) {
        state.pending = null;
        return;
    }
    let wounds = pending.woundCount;
    let shock = 0;
    if (choice === 'determination') {
        const det = rollDetermination(target.attributes.toughness, rng);
        const converted = Math.min(det.icons, wounds);
        wounds -= converted;
        shock += converted;
        state.log.push(`${target.name} 掷 Determination：${det.faces.join('、')}，把 ${converted} 点创伤转为冲击。`);
    }
    else
        state.log.push(`${target.name} 放弃 Determination，承受全部创伤。`);
    if (shock) {
        target.shockTaken += shock;
        state.log.push(`${target.name} 受到 ${shock} 点冲击（Shock）。`);
        if (target.maxShock > 0 && target.shockTaken > target.maxShock) {
            target.exhausted = true;
            state.log.push(`${target.name} 超过冲击上限，力竭（Exhausted）。`);
        }
    }
    if (wounds) {
        target.woundsTaken += wounds;
        state.log.push(`${target.name} 受到 ${wounds} 点创伤（Wounds）。`);
        if (target.woundsTaken > target.maxWounds) {
            target.down = true;
            state.log.push(`${target.name} 超过创伤上限，进入濒死（Dying）。`);
        }
    }
    state.pending = null;
    state.round += 1;
    if (state.party.every((p) => p.woundsTaken > p.maxWounds)) {
        state.result = 'defeat';
        state.log.push('小队全灭，遭遇失败。');
    }
}

type ChoiceResult = { ok: true } | { ok: false; code: string; message: string; status?: number };

function applyChoice(state: SessionState, pack: ScenarioPack, choiceId: string, actorId?: string): ChoiceResult {
    if (state.scenarioId !== 'graveyard-shift' || !state.sceneId)
        return { ok: false, code: 'BAD_COMMAND', message: '当前会话没有剧本场景。' };
    const scene = findScene(pack, state.sceneId);
    const choice = scene.choices.find((c) => c.id === choiceId);
    if (!choice)
        return { ok: false, code: 'BAD_CHOICE', message: '场景中没有这个选择。', status: 404 };
    if (choice.requires?.clue && !(state.clues || []).includes(choice.requires.clue))
        return { ok: false, code: 'MISSING_CLUE', message: '缺少必要的线索。', status: 409 };
    if (choice.requires?.flag && !state.flags?.[choice.requires.flag])
        return { ok: false, code: 'MISSING_FLAG', message: '缺少必要的前置条件。', status: 409 };
    const who = state.party.find((a) => a.id === actorId) || state.party[0];
    let success = true;
    if (choice.test) {
        const attribute = who.attributes[choice.test.attribute];
        const skill = choice.test.skill ? (who.skills[choice.test.skill] || 0) : 0;
        const wounded = who.woundsTaken > 0 ? 1 : 0;
        const roll = rollTest(attribute + skill, choice.test.dn + wounded, rng);
        success = roll.success;
        state.log.push(`${who.name} 进行 ${choice.test.attribute}${choice.test.skill ? ' + ' + choice.test.skill : ''} 检定：${roll.faces.join('、')}，${roll.icons} 个图标（DN ${choice.test.dn}${wounded ? '，受伤 +1' : ''}）。`);
    }
    const branch = success ? choice.success : choice.failure;
    if (branch?.text)
        state.log.push(branch.text);
    if (branch?.clue && !(state.clues || []).includes(branch.clue)) {
        state.clues = [...(state.clues || []), branch.clue];
        state.log.push(`获得线索：${pack.clues[branch.clue] || branch.clue}。`);
    }
    if (branch?.flag) {
        state.flags = { ...(state.flags || {}), [branch.flag]: true };
        state.log.push(`标记：${branch.flag}。`);
    }
    if (branch?.shock) {
        who.shockTaken += branch.shock;
        state.log.push(`${who.name} 受到 ${branch.shock} 点冲击。`);
        if (who.shockTaken > who.maxShock)
            state.log.push(`${who.name} 力竭。`);
    }
    enterScene(state, pack, choice.next);
    return { ok: true };
}

type AttackResult = { ok: true; hit: boolean; pending: boolean } | { ok: false; code: string; message: string; status?: number };

function applyAttack(state: SessionState, attackerId: string, targetId: string, actionId: string): AttackResult {
    const attacker = state.party.find((a) => a.id === attackerId);
    const target = state.enemies.find((a) => a.id === targetId);
    if (!attacker || !target)
        return { ok: false, code: 'BAD_TARGET', message: '攻击者或目标无效。', status: 404 };
    if (!attacker.weapon)
        return { ok: false, code: 'NO_WEAPON', message: '该角色没有可用武器。' };
    const distance = 12;
    const band: RangeBand = rangeBand(distance, attacker.weapon.short, attacker.weapon.medium, attacker.weapon.long);
    if (band === 'out')
        return { ok: false, code: 'OUT_OF_RANGE', message: '目标超出武器射程。' };
    const pool = attackPool({
        mode: 'ranged',
        initiative: attacker.attributes.initiative,
        weaponSkill: attacker.skills.weaponSkill ?? 0,
        agility: attacker.attributes.agility,
        ballisticSkill: attacker.skills.ballisticSkill ?? 0,
    });
    const bonus = band === 'short' ? 1 : 0;
    const attackPenalty = woundedPenalty(attacker.woundsTaken);
    const roll = rollTest(pool + bonus, target.defence + attackPenalty, rng);
    state.log.push(`${attacker.name} 向 ${target.name} 开火：${roll.faces.join('、')}，${roll.icons} 个图标（Defence ${target.defence}${attackPenalty ? '，受伤 +1' : ''}${roll.wrathSix ? '，怒火暴击' : ''}）。`);
    if (!roll.success) {
        state.log.push('未命中。');
        enemyTurn(state);
        return { ok: true, hit: false, pending: !!state.pending };
    }
    state.log.push('命中。');
    const shiftable = shiftableExalted(roll, target.defence);
    if (shiftable > 0) {
        const decisionId = crypto.randomUUID();
        state.pending = {
            decisionId,
            actionId,
            actorId: attacker.id,
            targetId: target.id,
            phase: 'shift',
            allowedChoices: ['damage', 'glory', 'skip'],
            roll: { faces: roll.faces, icons: roll.icons, exalted: roll.exalted, shiftable, wrathSix: roll.wrathSix, wrathOne: roll.wrathOne },
            weaponDamage: attacker.weapon.damage,
            weaponName: attacker.weapon.name,
        };
        return { ok: true, hit: true, pending: true };
    }
    finishAttack(state, {
        decisionId: '', actionId, actorId: attacker.id, targetId: target.id,
        phase: 'shift', allowedChoices: ['damage', 'glory', 'skip'],
        roll: { faces: roll.faces, icons: roll.icons, exalted: roll.exalted, shiftable: 0, wrathSix: roll.wrathSix, wrathOne: roll.wrathOne },
        weaponDamage: attacker.weapon.damage, weaponName: attacker.weapon.name,
    }, 'skip');
    return { ok: true, hit: true, pending: !!state.pending };
}

function publicState(state: SessionState) {
    if (state.scenarioId === 'graveyard-shift' && state.sceneId) {
        const pack = loadInstalledPack();
        if (pack) {
            const scene = findScene(pack, state.sceneId);
            const view = publicScene(pack, state.sceneId);
            view.choices = view.choices.filter((c) => {
                const full = scene.choices.find((x) => x.id === c.id);
                if (!full)
                    return false;
                if (full.requires?.clue && !(state.clues || []).includes(full.requires.clue))
                    return false;
                if (full.requires?.flag && !state.flags?.[full.requires.flag])
                    return false;
                return true;
            });
            return {
                ...state,
                scenario: {
                    ...view,
                    clues: (state.clues || []).map((id) => pack.clues[id] || id),
                },
            };
        }
    }
    return state;
}

function ok(data: unknown, status = 200): GameReply {
    return { status, data };
}

function fail(code: string, message: string, status = 400): GameReply {
    return { status, data: { error: { code, message } } };
}

function actor(state: SessionState, id: string): Actor | undefined {
    return [...state.party, ...state.enemies].find((a) => a.id === id);
}

function applyDamage(state: SessionState, target: Actor, damage: number, shockDie: number): string[] {
    const result = damageVsResilience(damage, target.resilience, shockDie);
    const lines: string[] = [];
    if (result.shock && target.maxShock > 0) {
        target.shockTaken += result.shock;
        lines.push(`${target.name} 受到 ${result.shock} 点冲击（Shock）。`);
        if (target.shockTaken > target.maxShock) {
            target.woundsTaken = target.maxWounds + 1;
            lines.push(`${target.name} 超过冲击上限，失去战斗能力。`);
        }
    }
    if (result.wounds) {
        target.woundsTaken += result.wounds;
        lines.push(`${target.name} 受到 ${result.wounds} 点创伤（Wounds）。`);
        if (target.woundsTaken > target.maxWounds) {
            lines.push(`${target.name} 超过创伤上限，进入濒死/失能。`);
        }
    }
    if (!result.wounds && !result.shock)
        lines.push(`伤害未穿透 ${target.name} 的抗性（Resilience ${target.resilience}）。`);
    return lines;
}

function finishAttack(state: SessionState, pending: ShiftPending, choice: 'damage' | 'glory' | 'skip'): void {
    const attacker = actor(state, pending.actorId);
    const target = actor(state, pending.targetId);
    if (!attacker || !target) {
        state.pending = null;
        return;
    }
    let extra = 0;
    if (choice === 'damage')
        extra = pending.roll.shiftable;
    else if (choice === 'glory') {
        state.glory += 1;
        extra = Math.max(0, pending.roll.shiftable - 1);
        state.log.push(`转化 1 个尊崇图标为 1 点荣耀（Glory）。`);
    }
    else
        state.log.push('未转化剩余的尊崇图标。');

    const dmg = rollDamage(pending.weaponDamage, extra, rng);
    state.log.push(`${attacker.name} 用 ${pending.weaponName} 命中，伤害 ${dmg.total}（武器 ${pending.weaponDamage} + 额外伤害骰 ${dmg.bonus}）。`);
    state.log.push(...applyDamage(state, target, dmg.total, randomInt(1, 4)));
    const down = target.woundsTaken > target.maxWounds;
    if (down)
        state.log.push(`${target.name} 失能。`);
    state.pending = null;
    if (state.scenarioId === 'training') {
        if (down) {
            state.result = 'victory';
            state.log.push('训练目标失能。训练遭遇完成。');
        }
        state.round += 1;
        return;
    }
    const pack = loadInstalledPack();
    if (pack && down && target.special?.deathSplit) {
        const spec = pack.threats[target.special.deathSplit];
        if (spec) {
            const split = threatActor(spec);
            split.id = `${target.id}-split-${state.round}`;
            split.name = `分裂的${spec.name}`;
            state.enemies.push(split);
            target.special = { ...target.special, deathSplit: undefined };
            state.log.push(`${target.name} 死亡分裂出 ${split.name}。`);
        }
    }
    const advanced = pack ? advanceAfterCombat(state, pack) : false;
    if (!advanced && !state.result)
        enemyTurn(state);
    else
        state.round += 1;
}

const runtime: GameRuntime = {
    descriptor,
    async handle(req: GameRequest): Promise<GameReply> {
        const { method, tail } = req;
        if (!tail.length && method === 'GET') {
            const scenarios: any[] = [{ id: 'training', title: '训练遭遇', tier: 1, minutes: 10, note: '规则演示，不是官方剧本。' }];
            const pack = loadInstalledPack();
            if (pack)
                scenarios.unshift({ id: pack.id, title: pack.title, subtitle: pack.subtitle, tier: pack.tier, minutes: pack.minutes, note: pack.adaptation, installed: true });
            return ok({
                game: descriptor,
                scenarios,
                party: loadParty().map((p: any) => ({ id: p.id, name: p.name, archetype: p.archetype })),
            });
        }

        if (tail[0] !== 'sessions')
            return fail('NOT_FOUND', '未知游戏接口。', 404);

        const store = new WgStore(STORE_PATH);
        try {
            if (tail.length === 1 && method === 'POST') {
                const body = await req.readBody() as any;
                const scenarioId = body?.scenarioId || 'training';
                let state: SessionState;
                if (scenarioId === 'training')
                    state = createSession(crypto.randomUUID());
                else if (scenarioId === 'graveyard-shift') {
                    const pack = loadInstalledPack();
                    if (!pack)
                        return fail('SCENARIO_NOT_INSTALLED', '未安装 Graveyard Shift 私有内容包。', 404);
                    state = createScenarioSession(crypto.randomUUID(), pack);
                }
                else
                    return fail('SCENARIO_NOT_FOUND', '未知剧本。', 404);
                store.create(state.id, state);
                return ok({ session: publicState(state) }, 201);
            }

            const id = tail[1];
            if (!id)
                return fail('BAD_SESSION', '缺少会话 ID。');
            const loaded = store.load(id);
            if (!loaded)
                return fail('SESSION_NOT_FOUND', '会话不存在。', 404);
            const state = loaded.state as SessionState;

            if (tail.length === 2 && method === 'GET')
                return ok({ session: publicState(state) });

            if (tail.length === 3 && tail[2] === 'narrate' && method === 'POST') {
                const body = await req.readBody() as any;
                try {
                    const text = await narrateWg(publicState(state), typeof body?.input === 'string' ? body.input : '');
                    return ok({ text });
                }
                catch (error) {
                    return fail('AI_NARRATION', (error as Error).message, 502);
                }
            }

            if (tail.length === 3 && tail[2] === 'gm' && method === 'POST') {
                const body = await req.readBody() as any;
                if (state.pending)
                    return fail('PENDING_DECISION', '请先完成当前选择，再让 GM 推进。', 409);
                const pack = loadInstalledPack();
                if (!pack)
                    return fail('SCENARIO_NOT_INSTALLED', '当前没有可推进的剧本包。', 404);
                const view = publicState(state) as any;
                const choices = (view?.scenario?.choices || []) as { id: string; label: string }[];
                const attacks = state.party
                    .filter((p) => p.woundsTaken <= p.maxWounds && p.weapon)
                    .flatMap((p) => state.enemies
                        .filter((e) => e.woundsTaken <= e.maxWounds)
                        .map((e) => ({ attackerId: p.id, targetId: e.id, label: `${p.name} 向 ${e.name} 开火` })));
                try {
                    const decision = await gmDecide(view, typeof body?.input === 'string' ? body.input : '', choices, attacks);
                    if (decision.action?.type === 'choose') {
                        const applied = applyChoice(state, pack, decision.action.choiceId, body?.actorId);
                        if (!applied.ok)
                            return ok({ text: decision.narration, action: null, warning: applied.message, session: publicState(state) });
                        state.lastRequests.push(`gm-${crypto.randomUUID()}`);
                        const saved = store.save(id, loaded.version, state, { type: 'ai.choose', payload: { choiceId: decision.action.choiceId } });
                        if (!saved)
                            return fail('VERSION_CONFLICT', '状态已变化。', 409);
                        return ok({ text: decision.narration, action: decision.action, session: publicState(state) });
                    }
                    if (decision.action?.type === 'attack') {
                        const gmId = `gm-${crypto.randomUUID()}`;
                        const applied = applyAttack(state, decision.action.attackerId, decision.action.targetId, gmId);
                        if (!applied.ok)
                            return ok({ text: decision.narration, action: null, warning: applied.message, session: publicState(state) });
                        state.lastRequests.push(gmId);
                        const saved = store.save(id, loaded.version, state, { type: 'ai.attack', payload: decision.action });
                        if (!saved)
                            return fail('VERSION_CONFLICT', '状态已变化。', 409);
                        return ok({ text: decision.narration, action: decision.action, session: publicState(state) });
                    }
                    return ok({ text: decision.narration, action: null, session: publicState(state) });
                }
                catch (error) {
                    return fail('AI_GM', (error as Error).message, 502);
                }
            }

            const body = await req.readBody() as any;
            const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
            if (!requestId)
                return fail('BAD_REQUEST', '缺少 requestId。');
            if (state.lastRequests.includes(requestId))
                return ok({ session: publicState(state) });

            if (tail.length === 3 && tail[2] === 'commands' && method === 'POST') {
                if (body?.expectedVersion !== undefined && Number(body.expectedVersion) !== loaded.version)
                    return fail('VERSION_CONFLICT', '状态已变化，请刷新后重试。', 409);
                if (state.pending)
                    return fail('PENDING_DECISION', '请先完成当前选择。', 409);

                if (body?.command?.type === 'choose') {
                    const pack = loadInstalledPack();
                    if (!pack)
                        return fail('SCENARIO_NOT_INSTALLED', '剧本包已被移除。', 404);
                    const result = applyChoice(state, pack, body.command.choiceId, body.command.actorId);
                    if (!result.ok)
                        return fail(result.code, result.message, result.status ?? 400);
                    state.lastRequests.push(requestId);
                    const saved = store.save(id, loaded.version, state, { type: 'scenario.choose', payload: { requestId, choiceId: body.command.choiceId } });
                    if (!saved)
                        return fail('VERSION_CONFLICT', '状态已变化。', 409);
                    return ok({ session: publicState(state) });
                }

                if (body?.command?.type !== 'attack')
                    return fail('BAD_COMMAND', '目前只实现攻击、场景选择命令。');
                const result = applyAttack(state, body.command.attackerId, body.command.targetId, requestId);
                if (!result.ok)
                    return fail(result.code, result.message, result.status ?? 400);
                state.lastRequests.push(requestId);
                const saved = store.save(id, loaded.version, state, { type: result.pending ? 'attack.pending' : 'attack.resolve', payload: { requestId, attackerId: body.command.attackerId, targetId: body.command.targetId } });
                if (!saved)
                    return fail('VERSION_CONFLICT', '状态已变化。', 409);
                return ok({ session: publicState(state) });
            }

            if (tail.length === 3 && tail[2] === 'decisions' && method === 'POST') {
                const pending = state.pending;
                if (!pending)
                    return fail('NO_DECISION', '当前没有待决选择。', 409);
                if (body?.decisionId !== pending.decisionId)
                    return fail('BAD_DECISION', 'decisionId 不匹配。', 409);
                const choice = String(body?.choice ?? '');
                if (!(pending.allowedChoices as readonly string[]).includes(choice))
                    return fail('BAD_CHOICE', '选择不在允许范围内。');
                state.lastRequests.push(requestId);
                if (pending.phase === 'shift')
                    finishAttack(state, pending, choice as 'damage' | 'glory' | 'skip');
                else
                    resolveDetermination(state, pending, choice as 'determination' | 'accept');
                const saved = store.save(id, loaded.version, state, { type: 'attack.decision', payload: { requestId, decisionId: pending.decisionId, choice } });
                if (!saved)
                    return fail('VERSION_CONFLICT', '状态已变化。', 409);
                return ok({ session: publicState(state) });
            }

            return fail('NOT_FOUND', '未知会话接口。', 404);
        }
        finally {
            store.close();
        }
    },
};

export { runtime as wrathGloryRuntime };
