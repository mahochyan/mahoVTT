import { randomUUID } from 'node:crypto';
import { MAP, MODULE_ID, MODULE_NAME, WORLD } from "./scenario.js";
import { rollPool, cryptoRng } from "./rules.js";
export class GameFault extends Error {
    code;
    status;
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'GameFault';
    }
}
const archetypes = {
    scout: { label: '侦察员', wounds: 7, shock: 6, defense: 3, resilience: 3, ballistic: 6, tech: 3, medicae: 2, damage: 4, range: 5, weapon: '侦察卡宾枪' },
    adept: { label: '修复师', wounds: 6, shock: 7, defense: 2, resilience: 3, ballistic: 4, tech: 6, medicae: 3, damage: 3, range: 4, weapon: '工艺侧臂枪' },
    medic: { label: '战地医师', wounds: 7, shock: 7, defense: 2, resilience: 3, ballistic: 4, tech: 4, medicae: 6, damage: 3, range: 4, weapon: '制式手枪' },
};
export const ARCHETYPES = Object.entries(archetypes).map(([id, p]) => ({ id, name: p.label, description: `射击 ${p.ballistic}d6 · 技术 ${p.tech}d6 · 医疗 ${p.medicae}d6` }));
function agent(id, name, side, controller, x, y, klass) {
    const p = archetypes[klass];
    return { id, name, side, controller, role: p.label, x, y, wounds: 0, maxWounds: p.wounds, shock: 0, maxShock: p.shock,
        defense: p.defense, resilience: p.resilience, ballistic: p.ballistic, tech: p.tech, medicae: p.medicae,
        weapon: p.weapon, damage: p.damage, range: p.range };
}
export function newSession(name, klass = 'scout', id = randomUUID()) {
    if (!name.trim() || name.length > 30 || !(klass in archetypes))
        throw new GameFault('BAD_CHARACTER', '角色姓名或职业不合法');
    return { id, gameId: MODULE_ID, rulesetId: 'wrath-d6-experiment-1', scenarioId: 'blackwell-relay', title: `${MODULE_NAME} · ${name.trim()}`,
        createdAt: new Date().toISOString(), version: 0, round: 1, status: 'playing', classId: klass,
        actors: [agent('pc', name.trim(), 'party', 'player', 2, 2, klass), agent('ally-scout', '艾蕾', 'party', 'ai', 2, 3, 'scout'),
            agent('ally-medic', '赫蒙', 'party', 'ai', 3, 2, 'medic'),
            { ...agent('raider-1', '掠夺者斥候', 'enemy', 'engine', 9, 2, 'scout'), wounds: 0, maxWounds: 5, defense: 2, resilience: 2, damage: 3, range: 4, ballistic: 3 },
            { ...agent('raider-2', '掠夺者哨兵', 'enemy', 'engine', 9, 6, 'adept'), wounds: 0, maxWounds: 5, defense: 2, resilience: 2, damage: 3, range: 4, ballistic: 3 }],
        flags: { cache: false, relay: false }, glory: 0,
        journal: [WORLD.scenes[0].text], lastEvents: [] };
}
export function safeCell(x, y) { return Number.isInteger(x) && Number.isInteger(y) && y >= 0 && y < MAP.length && x >= 0 && x < MAP[y].length && MAP[y][x] !== '#'; }
export function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
/** Simple four-direction shortest route; also used to validate every move. */
export function route(s, a, goal) {
    if (!safeCell(goal.x, goal.y) || s.actors.some(b => b.id !== a.id && b.wounds < b.maxWounds && b.x === goal.x && b.y === goal.y))
        return null;
    const start = `${a.x},${a.y}`, key = (x, y) => `${x},${y}`;
    let q = [{ x: a.x, y: a.y }];
    let seen = new Set([start]);
    let parent = new Map();
    for (let i = 0; i < q.length; i++) {
        const p = q[i], k = key(p.x, p.y);
        if (p.x === goal.x && p.y === goal.y) {
            const out = [];
            let t = k;
            while (t !== start) {
                const [x, y] = t.split(',').map(Number);
                out.unshift({ x, y });
                t = parent.get(t);
            }
            return out;
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = p.x + dx, y = p.y + dy, z = key(x, y);
            if (!safeCell(x, y) || seen.has(z) || MAP[y][x] === 'D' && !s.flags.cache)
                continue;
            if (s.actors.some(b => b.id !== a.id && b.wounds < b.maxWounds && b.x === x && b.y === y))
                continue;
            seen.add(z);
            parent.set(z, k);
            q.push({ x, y });
        }
    }
    return null;
}
export function lineOfSight(a, b) {
    const count = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 3;
    for (let i = 1; i < count; i++) {
        const t = i / count, x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
        if (!safeCell(x, y) || MAP[y][x] === 'D')
            return false;
    }
    return true;
}
export function publicState(s) { return { ...s, map: [...MAP], world: { title: MODULE_NAME, description: WORLD.public, scenes: WORLD.scenes.filter(x => x.id === 'arrival' || (x.id === 'cache' && s.flags.cache) || (x.id === 'relay' && s.flags.relay)) } }; }
function requirePlaying(s) { if (s.status !== 'playing')
    throw new GameFault('GAME_ENDED', '游戏已结束，请创建新副本。', 409); }
function alive(a) { return a.wounds < a.maxWounds; }
function event(events, type, text, actorId, targetId, roll) { events.push({ type, text, ...(actorId ? { actorId } : {}), ...(targetId ? { targetId } : {}), ...(roll ? { roll } : {}) }); }
function test(s, events, a, pool, dn, reason, rng) {
    const r = rollPool(pool, dn, rng);
    event(events, 'test', `${a.name}进行${reason}：${r.icons} 图标 / 难度 ${dn}，${r.success ? '成功' : '失败'}。`, a.id, undefined, r);
    if (r.complication)
        event(events, 'complication', 'Wrath Die 为 1：发生一次叙事性意外，不自动改写胜负。', a.id);
    if (r.wrathCritical) {
        s.glory = Math.min(6, s.glory + 1);
        event(events, 'wrath_critical', 'Wrath Die 为 6：队伍 Glory +1。', a.id);
    }
    return r;
}
function attack(s, events, a, target, rng) {
    if (!alive(target) || a.side === target.side)
        throw new GameFault('BAD_TARGET', '目标不可攻击。');
    if (distance(a, target) > a.range || !lineOfSight(a, target))
        throw new GameFault('NO_LINE_OF_SIGHT', '距离太远或被墙阻挡。');
    const r = test(s, events, a, a.ballistic, target.defense, '射击', rng);
    if (!r.success) {
        event(events, 'missed', `${a.name}射击${target.name}，未能命中。`, a.id, target.id);
        return;
    }
    const damage = Math.max(1, a.damage - Math.max(0, target.resilience - 1));
    target.wounds = Math.min(target.maxWounds, target.wounds + damage);
    event(events, 'damage', `${a.name}命中${target.name}，造成 ${damage} 点实验规则伤害。创伤 ${target.wounds}/${target.maxWounds}。`, a.id, target.id);
    if (!alive(target))
        event(events, 'downed', `${target.name}退出战斗。`, target.id);
}
function approach(s, a, target, steps) {
    const options = [];
    for (let y = 1; y < MAP.length - 1; y++)
        for (let x = 1; x < MAP[y].length - 1; x++) {
            const p = route(s, a, { x, y });
            if (p && p.length > 0 && p.length <= steps)
                options.push({ x, y, d: distance({ x, y }, target) });
        }
    options.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x);
    if (options.length) {
        a.x = options[0].x;
        a.y = options[0].y;
        return true;
    }
    return false;
}
function autoPhase(s, events, rng) {
    for (const a of s.actors.filter(x => x.side === 'party' && x.controller === 'ai' && alive(x))) {
        const enemies = s.actors.filter(x => x.side === 'enemy' && alive(x));
        if (!enemies.length)
            break;
        const target = enemies.sort((x, y) => distance(a, x) - distance(a, y))[0];
        if (distance(a, target) <= a.range && lineOfSight(a, target))
            attack(s, events, a, target, rng);
        else if (approach(s, a, target, 2))
            event(events, 'ai_move', `${a.name}占据新的战术位置。`, a.id);
    }
    for (const a of s.actors.filter(x => x.side === 'enemy' && alive(x))) {
        const allies = s.actors.filter(x => x.side === 'party' && alive(x));
        if (!allies.length)
            break;
        const target = allies.sort((x, y) => distance(a, x) - distance(a, y))[0];
        if (distance(a, target) <= a.range && lineOfSight(a, target))
            attack(s, events, a, target, rng);
        else if (approach(s, a, target, 2))
            event(events, 'enemy_move', `${a.name}向你们靠近。`, a.id);
    }
}
export function resolveAction(original, raw, rng = cryptoRng) {
    const s = structuredClone(original), events = [];
    requirePlaying(s);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new GameFault('BAD_COMMAND', '行动必须是对象。');
    const c = raw;
    if (Object.keys(c).some(k => !['type', 'targetId', 'x', 'y'].includes(k)))
        throw new GameFault('BAD_COMMAND', '不允许直接提交数值修改。');
    if (!['move', 'attack', 'interact', 'end_turn'].includes(String(c.type)))
        throw new GameFault('BAD_COMMAND', '不支持的行动。');
    const pc = s.actors.find(a => a.id === 'pc');
    if (!alive(pc))
        throw new GameFault('PLAYER_DOWN', '玩家已倒地，不能行动。');
    if (c.type === 'move') {
        const x = c.x, y = c.y;
        if (!Number.isInteger(x) || !Number.isInteger(y))
            throw new GameFault('BAD_MOVE', '缺少目标坐标。');
        const path = route(s, pc, { x: Number(x), y: Number(y) });
        if (!path || !path.length || path.length > 3)
            throw new GameFault('BAD_MOVE', '只能移动最多三格，且不能穿墙、穿人。');
        const from = `${pc.x},${pc.y}`;
        pc.x = Number(x);
        pc.y = Number(y);
        event(events, 'moved', `${pc.name} 从 ${from} 移至 (${pc.x},${pc.y})。`, pc.id);
    }
    else if (c.type === 'attack') {
        const target = s.actors.find(a => a.id === c.targetId);
        if (!target)
            throw new GameFault('BAD_TARGET', '目标不存在。');
        attack(s, events, pc, target, rng);
    }
    else if (c.type === 'interact') {
        const target = c.targetId;
        if (target === 'cache') {
            if (distance(pc, { x: 3, y: 5 }) > 1)
                throw new GameFault('TOO_FAR', '请靠近缓存终端 C。');
            if (s.flags.cache)
                throw new GameFault('ALREADY_DONE', '缓存已经扫描过。');
            if (test(s, events, pc, pc.tech, 2, '缓存技术检定', rng).success) {
                s.flags.cache = true;
                event(events, 'clue', WORLD.scenes[1].text, pc.id);
            }
        }
        else if (target === 'relay') {
            if (distance(pc, { x: 10, y: 7 }) > 1)
                throw new GameFault('TOO_FAR', '请靠近主终端 T。');
            if (!s.flags.cache)
                throw new GameFault('PREREQUISITE', '先扫描缓存 C，取得维护信息。');
            if (test(s, events, pc, pc.tech, 3, '中继站恢复', rng).success) {
                s.flags.relay = true;
                s.status = 'victory';
                event(events, 'victory', WORLD.endings.victory, pc.id);
            }
        }
        else
            throw new GameFault('BAD_TARGET', '只能与已定义的 C/T 终端交互。');
    }
    else
        event(events, 'end_turn', `${pc.name}结束了这一轮行动。`, pc.id);
    if (s.status === 'playing')
        autoPhase(s, events, rng);
    if (s.actors.filter(a => a.side === 'party').every(a => !alive(a))) {
        s.status = 'defeat';
        event(events, 'defeat', WORLD.endings.defeat);
    }
    s.version++;
    s.round++;
    s.lastEvents = events;
    s.journal.push(...events.map(e => e.text));
    if (s.journal.length > 120)
        s.journal = s.journal.slice(-120);
    return { state: s, events };
}
