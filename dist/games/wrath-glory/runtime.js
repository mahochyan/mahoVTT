import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attackPool, damageVsResilience, rangeBand } from "./rules/formulas.js";
import { rollDamage, rollTest, shiftableExalted } from "./rules/dice.js";
import { WgStore } from "./store.js";
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DATA_DIR = process.env.SAGAS_DATA_DIR || join(ROOT, 'data');
const STORE_PATH = join(DATA_DIR, 'games', 'wrath-glory.sqlite');
const PREGEN_PATH = join(ROOT, 'content', 'wg', 'prefabs', 'example-original.json');
const descriptor = {
    id: 'wrath-glory',
    name: '怒火与荣耀 · 训练遭遇',
    subtitle: 'Wrath & Glory · C7 核心规则演示',
    rulesetId: 'wg-c7',
    route: '/games/wrath-glory',
    creationRoute: '/games/wrath-glory',
    phase: 'experimental',
    description: '按 C7 核心规则实现骰池、图标、怒火骰、转化与伤害结算的训练遭遇。公开 demo 使用原创预置队与训练目标；官方 Graveyard Shift 适配包需本地导入。',
    features: ['d6 图标骰池', '怒火骰与转化', '伤害/冲击分离', '可暂停的结算'],
    disclaimer: '非官方授权产品；公开仓库不含官方书籍正文、插画或完整 stat block。',
};
const WEAPONS = {
    'demo-acolyte': { id: 'laspistol', name: '激光手枪（演示）', damage: 4, ed: 1, short: 12, medium: 24, long: 36 },
    'demo-guardsman': { id: 'lasgun', name: '激光步枪（演示）', damage: 5, ed: 1, short: 18, medium: 36, long: 54 },
    'demo-tech-adept': { id: 'laspistol', name: '激光手枪（演示）', damage: 4, ed: 1, short: 12, medium: 24, long: 36 },
};
function rng() {
    return (randomInt(1, 7) - 0.5) / 6;
}
function loadDemoParty() {
    const data = JSON.parse(readFileSync(PREGEN_PATH, 'utf8'));
    return data.pregens;
}
function pcFromPregen(p) {
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
function createSession(id) {
    const party = loadDemoParty().map(pcFromPregen);
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
function publicState(state) {
    return state;
}
function ok(data, status = 200) {
    return { status, data };
}
function fail(code, message, status = 400) {
    return { status, data: { error: { code, message } } };
}
function actor(state, id) {
    return [...state.party, ...state.enemies].find((a) => a.id === id);
}
function applyDamage(state, target, damage, shockDie) {
    const result = damageVsResilience(damage, target.resilience, shockDie);
    const lines = [];
    if (result.shock) {
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
function finishAttack(state, pending, choice) {
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
    if (target.woundsTaken > target.maxWounds) {
        state.result = 'victory';
        state.log.push('训练目标失能。训练遭遇完成。');
    }
    state.pending = null;
    state.round += 1;
}
const runtime = {
    descriptor,
    async handle(req) {
        const { method, tail } = req;
        if (!tail.length && method === 'GET')
            return ok({
                game: descriptor,
                scenarios: [{ id: 'training', title: '训练遭遇', tier: 1, minutes: 10, note: '规则演示，不是官方剧本。' }],
                party: loadDemoParty().map((p) => ({ id: p.id, name: p.name, archetype: p.archetype })),
            });
        if (tail[0] !== 'sessions')
            return fail('NOT_FOUND', '未知游戏接口。', 404);
        const store = new WgStore(STORE_PATH);
        try {
            if (tail.length === 1 && method === 'POST') {
                const body = await req.readBody();
                if (body?.scenarioId && body.scenarioId !== 'training')
                    return fail('SCENARIO_NOT_FOUND', '当前只安装了训练演示。', 404);
                const id = crypto.randomUUID();
                const state = createSession(id);
                store.create(id, state);
                return ok({ session: publicState(state) }, 201);
            }
            const id = tail[1];
            if (!id)
                return fail('BAD_SESSION', '缺少会话 ID。');
            const loaded = store.load(id);
            if (!loaded)
                return fail('SESSION_NOT_FOUND', '会话不存在。', 404);
            const state = loaded.state;
            if (tail.length === 2 && method === 'GET')
                return ok({ session: publicState(state) });
            const body = await req.readBody();
            const requestId = typeof body?.requestId === 'string' ? body.requestId : '';
            if (!requestId)
                return fail('BAD_REQUEST', '缺少 requestId。');
            if (state.lastRequests.includes(requestId))
                return ok({ session: publicState(state) });
            if (tail.length === 3 && tail[2] === 'commands' && method === 'POST') {
                if (body?.expectedVersion !== undefined && Number(body.expectedVersion) !== loaded.version)
                    return fail('VERSION_CONFLICT', '状态已变化，请刷新后重试。', 409);
                if (body?.command?.type !== 'attack')
                    return fail('BAD_COMMAND', '目前只实现攻击命令。');
                if (state.pending)
                    return fail('PENDING_DECISION', '请先完成当前选择。', 409);
                const attacker = state.party.find((a) => a.id === body.command.attackerId);
                const target = state.enemies.find((a) => a.id === body.command.targetId);
                if (!attacker || !target)
                    return fail('BAD_TARGET', '攻击者或目标无效。', 404);
                if (!attacker.weapon)
                    return fail('NO_WEAPON', '该角色没有可用武器。');
                const distance = 12;
                const band = rangeBand(distance, attacker.weapon.short, attacker.weapon.medium, attacker.weapon.long);
                if (band === 'out')
                    return fail('OUT_OF_RANGE', '目标超出武器射程。');
                const pool = attackPool({
                    mode: 'ranged',
                    initiative: attacker.attributes.initiative,
                    weaponSkill: attacker.skills.weaponSkill ?? 0,
                    agility: attacker.attributes.agility,
                    ballisticSkill: attacker.skills.ballisticSkill ?? 0,
                });
                const bonus = band === 'short' ? 1 : 0;
                const roll = rollTest(pool + bonus, target.defence, rng);
                state.lastRequests.push(requestId);
                state.log.push(`${attacker.name} 向 ${target.name} 开火：${roll.faces.join('、')}，${roll.icons} 个图标（Defence ${target.defence}${roll.wrathSix ? '，怒火暴击' : ''}）。`);
                if (!roll.success) {
                    state.log.push('未命中。');
                    const saved = store.save(id, loaded.version, state, { type: 'attack.miss', payload: { requestId, attackerId: attacker.id } });
                    if (!saved)
                        return fail('VERSION_CONFLICT', '状态已变化。', 409);
                    return ok({ session: publicState(state) });
                }
                state.log.push('命中。');
                const shiftable = shiftableExalted(roll, target.defence);
                if (shiftable > 0) {
                    const decisionId = crypto.randomUUID();
                    state.pending = {
                        decisionId,
                        actionId: requestId,
                        actorId: attacker.id,
                        targetId: target.id,
                        phase: 'shift',
                        allowedChoices: ['damage', 'glory', 'skip'],
                        roll: { faces: roll.faces, icons: roll.icons, exalted: roll.exalted, shiftable, wrathSix: roll.wrathSix, wrathOne: roll.wrathOne },
                        weaponDamage: attacker.weapon.damage,
                        weaponName: attacker.weapon.name,
                    };
                    const saved = store.save(id, loaded.version, state, { type: 'attack.shift', payload: { requestId, decisionId } });
                    if (!saved)
                        return fail('VERSION_CONFLICT', '状态已变化。', 409);
                    return ok({ session: publicState(state) });
                }
                finishAttack(state, {
                    decisionId: '', actionId: requestId, actorId: attacker.id, targetId: target.id,
                    phase: 'shift', allowedChoices: ['damage', 'glory', 'skip'],
                    roll: { faces: roll.faces, icons: roll.icons, exalted: roll.exalted, shiftable: 0, wrathSix: roll.wrathSix, wrathOne: roll.wrathOne },
                    weaponDamage: attacker.weapon.damage, weaponName: attacker.weapon.name,
                }, 'skip');
                const saved = store.save(id, loaded.version, state, { type: 'attack.resolve', payload: { requestId } });
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
                if (!pending.allowedChoices.includes(body?.choice))
                    return fail('BAD_CHOICE', '选择不在允许范围内。');
                state.lastRequests.push(requestId);
                finishAttack(state, pending, body.choice);
                const saved = store.save(id, loaded.version, state, { type: 'attack.decision', payload: { requestId, decisionId: pending.decisionId, choice: body.choice } });
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
