import { randomUUID } from 'node:crypto';
import { GameError, type GameState, type Command, type Actor, type DomainEvent, type Dice, type Resolution, type View, type Point } from '../types.ts';
import { BOOK, ROOMS, TILES, WIDTH, HEIGHT, OBSTACLES, roomAt } from '../world.ts';
import { roll, criticalExpr, secureRng, type RNG } from './dice.ts';
import { distance, terrainOpen, canStep, pathfind, los, partyVisible } from './grid.ts';
const TYPES = ['move', 'attack', 'use_ability', 'use_item', 'interact', 'talk', 'end_turn'];
export function parseCommand(raw: unknown): Command {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new GameError('BAD_COMMAND', '行动必须是一个 JSON 对象。');
    const v = raw as Record<string, unknown>;
    const allowed = ['type', 'actorId', 'targetId', 'itemId', 'abilityId', 'interactionId', 'path', 'x', 'y'];
    if (Object.keys(v).some(k => !allowed.includes(k)))
        throw new GameError('BAD_COMMAND', '行动中包含未允许的字段；模型不得提交伤害或奖励。');
    if (!TYPES.includes(String(v.type)) || typeof v.actorId !== 'string' || v.actorId.length > 64)
        throw new GameError('BAD_COMMAND', '行动类型或角色 ID 不合法。');
    for (const k of ['targetId', 'itemId', 'abilityId', 'interactionId'])
        if (v[k] !== undefined && (typeof v[k] !== 'string' || (v[k] as string).length > 64))
            throw new GameError('BAD_COMMAND', `${k} 不合法。`);
    for (const k of ['x', 'y'])
        if (v[k] !== undefined && (!Number.isInteger(v[k]) || Number(v[k]) < 0 || Number(v[k]) > 100))
            throw new GameError('BAD_COMMAND', '坐标不合法。');
    if (v.path !== undefined) {
        if (!Array.isArray(v.path) || v.path.length < 1 || v.path.length > 60)
            throw new GameError('BAD_COMMAND', '路径必须包含 1 至 60 个格子。');
        for (const p of v.path) {
            if (!p || typeof p !== 'object' || !Number.isInteger(p.x) || !Number.isInteger(p.y) || Object.keys(p).some(k => !['x', 'y'].includes(k)))
                throw new GameError('BAD_COMMAND', '路径节点不合法。');
        }
    }
    return v as unknown as Command;
}
export function activeId(s: GameState): string | null { return s.combat ? s.combat.order[s.combat.active] : null; }
function need(ok: unknown, code: string, message: string): asserts ok { if (!ok)
    throw new GameError(code, message); }
function canonicalSummary(s: GameState): string { return `${s.playerName}与沈鸢、洛恩同行。已探索：${ROOMS.filter(r => s.discovered.includes(r.id)).map(r => r.name).join('、')}。${s.flags.accepted ? '已接受伊蕾娅的委托。' : '尚未接受委托。'}${s.flags.ledger ? '持有维护款账簿证据。' : ''}${s.flags.inscription ? '已读调谐铭文。' : ''}${s.flags.rescued ? '米咕已获救。' : ''}${s.flags.calibrated ? '祭坛已校准。' : ''}${s.flags.key ? '已取得调谐钥匙。' : ''}${s.flags.returned ? '已交付钥匙，六十金币奖励已发放。' : ''}`; }
export function resolve(original: GameState, raw: Command, source: 'player' | 'auto' = 'player', rng: RNG = secureRng): Resolution {
    const c = parseCommand(raw), s = structuredClone(original), events: DomainEvent[] = [], dice: Dice[] = [];
    need(s.status === 'playing', 'ADVENTURE_ENDED', '这段冒险已经结束。可查看记录，或从首页开始新的冒险。');
    const a = s.actors.find(a => a.id === c.actorId);
    need(a, 'UNKNOWN_ACTOR', '角色不存在。');
    need(source === 'player' ? a.kind === 'pc' : a.controller !== 'player', 'FORBIDDEN_ACTOR', '你不能通过这个入口操纵其他角色。');
    need(a.hp > 0, 'DOWNED', '倒地角色无法行动。');
    if (s.combat)
        need(activeId(s) === a.id, 'NOT_YOUR_TURN', '还没有轮到这个角色。');
    else
        need(a.kind === 'pc', 'NO_ENCOUNTER', '探索阶段由玩家角色带队。');
    const emit = (type: string, text: string, data?: Record<string, unknown>, targetId?: string) => events.push({ type, text, actorId: a.id, ...(targetId ? { targetId } : {}), ...(data ? { data } : {}) });
    const spend = (which: 'action' | 'bonus') => { if (s.combat) {
        const field = which === 'action' ? 'actionUsed' : 'bonusUsed';
        need(!s.combat[field], 'RESOURCE_USED', which === 'action' ? '本回合动作已用完。' : '本回合附赠动作已用完。');
        s.combat[field] = true;
    } };
    const rolling = (expr: string, purpose: string) => { const d = roll(expr, purpose, rng); dice.push(d); return d; };
    const heal = (target: Actor, amount: number) => { const before = target.hp; target.hp = Math.min(target.maxHp, target.hp + Math.max(0, amount)); if (target.hp > 0)
        target.conditions = target.conditions.filter(x => x.id !== 'downed'); emit('healed', `${target.name}的 HP ${before} → ${target.hp}。`, { before, after: target.hp, amount: target.hp - before }, target.id); };
    const damage = (target: Actor, amount: number) => { const before = target.hp, temp = Math.min(target.tempHp, amount); target.tempHp -= temp; target.hp = Math.max(0, target.hp - (amount - temp)); emit('damage_dealt', `${target.name}受到 ${amount} 点伤害，HP ${before} → ${target.hp}${temp ? `（临时 HP 吸收 ${temp}）` : ''}。`, { before, after: target.hp, amount, temp }, target.id); if (before > 0 && target.hp === 0) {
        target.conditions = [{ id: 'downed', remainingRounds: -1 }];
        emit(target.faction === 'party' ? 'downed' : 'defeated', `${target.name}${target.faction === 'party' ? '倒地，等待治疗。' : '被击败。'}`, {}, target.id);
        if (target.faction === 'hostile' && !s.claims.includes(`defeat:${target.id}`)) {
            s.claims.push(`defeat:${target.id}`);
            const xp = target.id === 'guardian' ? 60 : 15;
            s.xp += xp;
            emit('xp_granted', `队伍获得 ${xp} 点经验。`, { amount: xp, sourceId: target.id });
        }
    } };
    const discover = () => { for (const room of ROOMS) {
        if (s.discovered.includes(room.id))
            continue;
        const [x, y, w, h] = room.rect;
        let seen = false;
        for (let j = y; j < y + h && !seen; j++)
            for (let i = x; i < x + w && !seen; i++)
                if (TILES[j][i] === 1 && partyVisible(s, { x: i, y: j }))
                    seen = true;
        if (seen) {
            s.discovered.push(room.id);
            emit('room_discovered', `发现「${room.name}」。${room.description}`, { roomId: room.id });
            s.journal.push(`${room.name}：${room.description}`);
        }
    } };
    const detect = () => {
        const foes = s.actors.filter(x => x.faction === 'hostile' && x.hp > 0 && partyVisible(s, x));
        if (!foes.length)
            return false;
        const rooms = new Set(foes.map(x => x.roomId));
        const group = s.actors.filter(x => x.hp > 0 && (x.faction === 'party' || rooms.has(x.roomId)));
        if (s.combat) {
            for (const x of group)
                if (!s.combat.order.includes(x.id)) {
                    s.combat.order.push(x.id);
                    emit('encounter_joined', `${x.name}加入战斗。`, {}, x.id);
                }
            return false;
        }
        const order = group.map(x => ({ id: x.id, dex: x.dex, n: rolling(`d20+${x.dex}`, `${x.name}的先攻`).total })).sort((a, b) => b.n - a.n || b.dex - a.dex || a.id.localeCompare(b.id)).map(x => x.id);
        s.combat = { id: randomUUID(), order, active: 0, round: 1, serial: 1, actionUsed: false, bonusUsed: false, movementUsed: 0 };
        emit('encounter_started', '进入战斗。按先攻顺序行动。', { order });
        emit('turn_started', `轮到${s.actors.find(x => x.id === order[0])!.name}。`);
        return true;
    };
    const finish = () => {
        if (!s.actors.some(x => x.faction === 'party' && x.hp > 0)) {
            s.status = 'defeat';
            s.combat = null;
            emit('party_defeated', '全队倒地。这次远征结束；存档与全部事实记录仍然保留。');
            return;
        }
        if (s.combat && !s.combat.order.some(id => { const x = s.actors.find(x => x.id === id)!; return x.faction === 'hostile' && x.hp > 0; })) {
            s.combat = null;
            for (const x of s.actors)
                x.conditions = x.conditions.filter(z => z.id === 'downed');
            emit('encounter_ended', '战斗结束。HP 与消耗品保持当前数值；你重新带队探索。');
            const down = s.actors.filter(x => x.faction === 'party' && x.hp === 0);
            if (down.length) {
                for (const x of down) {
                    x.hp = 1;
                    x.conditions = [];
                    emit('stabilized', `同伴为${x.name}实施战后急救，HP 0 → 1。`, { before: 0, after: 1, source: 'post_combat_aid' }, x.id);
                }
                s.worldTime += 600;
                emit('time_advanced', '战后急救花费十分钟。', { seconds: 600 });
            }
        }
    };
    const attack = (target: Actor, expr: string, range: number, label: string) => { need(target.faction !== a.faction && target.hp > 0, 'BAD_TARGET', '必须选择仍在战斗的敌人。'); need(a.faction === 'hostile' || (s.discovered.includes(target.roomId) || partyVisible(s, target)), 'HIDDEN_TARGET', '尚未发现这个目标。'); need(distance(a, target) <= range && los(s, a, target), 'OUT_OF_RANGE', '目标不在攻击距离或视线内。'); spend('action'); const d = rolling(`d20+${a.attack}`, `${a.name}使用${label}攻击${target.name}`); const natural = d.rolls[0], hit = natural === 20 || (natural !== 1 && d.total >= target.ac); emit('attack_rolled', `${a.name}攻击${target.name}：${d.total} 对 AC ${target.ac}。`, { diceId: d.id, total: d.total, ac: target.ac, natural }, target.id); if (hit) {
        emit('hit', natural === 20 ? '天然 20，暴击。' : '命中。', {}, target.id);
        damage(target, Math.max(0, rolling(natural === 20 ? criticalExpr(expr) : expr, `${label}伤害`).total));
    }
    else
        emit('missed', natural === 1 ? '天然 1，未命中。' : '攻击未命中，动作已经消耗。', {}, target.id); };
    if (c.type === 'move') {
        const budget = s.combat ? a.speed - s.combat.movementUsed : a.speed;
        need(budget > 0, 'NO_MOVEMENT', '本回合移动距离已经用完。');
        let path = c.path;
        if (!path) {
            need(c.x !== undefined && c.y !== undefined, 'NO_DESTINATION', '请选择目的地。');
            path = pathfind(s, a, { x: c.x, y: c.y }) ?? undefined;
        }
        need(path && path.length > 0, 'NO_PATH', '没有可通行的路径。');
        need(path.length <= budget, 'TOO_FAR', `本次最多可以移动 ${budget} 格。`);
        let prev: Point = a;
        for (let i = 0; i < path.length; i++) {
            need(canStep(s, a, prev, path[i], i === path.length - 1), 'BLOCKED', '路径穿过障碍、敌人、关闭的门或被占用的终点。');
            prev = path[i];
        }
        const from = { x: a.x, y: a.y };
        let walked = 0;
        for (const p of path) {
            a.x = p.x;
            a.y = p.y;
            a.roomId = roomAt(a);
            walked++;
            if (s.combat)
                s.combat.movementUsed++;
            discover();
            if (detect())
                break;
        }
        emit('moved', `${a.name}移动 ${walked} 格。`, { from, to: { x: a.x, y: a.y }, steps: walked });
        if (!s.combat && a.kind === 'pc') {
            for (const ally of s.actors.filter(x => x.kind === 'companion' && x.hp > 0)) {
                const candidates: Point[] = [];
                for (let dx = -1; dx <= 1; dx++)
                    for (let dy = -1; dy <= 1; dy++)
                        if (dx || dy)
                            candidates.push({ x: a.x + dx, y: a.y + dy });
                const options = candidates.map(p => pathfind(s, ally, p)).filter((p): p is Point[] => p !== null).sort((a, b) => a.length - b.length);
                const route = options[0];
                if (route?.length) {
                    let n = Math.min(ally.speed, route.length);
                    while (n > 0 && !canStep(s, ally, n > 1 ? route[n - 2] : ally, route[n - 1], true))
                        n--;
                    if (n > 0) {
                        const old = { x: ally.x, y: ally.y };
                        ally.x = route[n - 1].x;
                        ally.y = route[n - 1].y;
                        ally.roomId = roomAt(ally);
                        events.push({ type: 'moved', text: `${ally.name}跟随队伍。`, actorId: ally.id, data: { from: old, to: { x: ally.x, y: ally.y }, steps: n } });
                    }
                }
            }
            discover();
            detect();
        }
    }
    else if (c.type === 'attack') {
        const target = s.actors.find(x => x.id === c.targetId);
        need(target, 'BAD_TARGET', '请选择一个敌人。');
        attack(target, a.damage, a.range, a.weapon);
    }
    else if (c.type === 'use_item') {
        need(c.itemId === 'potion', 'BAD_ITEM', '本作可主动使用的消耗品是治疗药水。');
        need((a.inventory.potion ?? 0) > 0, 'NO_ITEM', '背包里没有治疗药水。');
        const t = s.actors.find(x => x.id === (c.targetId ?? a.id));
        need(t && t.faction === a.faction && distance(a, t) <= 1 && (t.id === a.id || los(s, a, t)), 'BAD_TARGET', '药水只能用于自己或相邻可见同伴。');
        need(t.hp < t.maxHp, 'FULL_HP', '目标已满血，不消耗药水。');
        spend('bonus');
        a.inventory.potion--;
        emit('item_consumed', `${a.name}消耗治疗药水 ×1。`, { itemId: 'potion', quantity: 1 });
        heal(t, rolling('2d4+2', '治疗药水').total);
    }
    else if (c.type === 'use_ability') {
        if (c.abilityId === 'second_wind') {
            need(a.kind === 'pc' && a.resources.secondWind > 0, 'NO_ABILITY', '回气尚未恢复，或当前角色没有这项能力。');
            need(a.hp < a.maxHp, 'FULL_HP', '你已满血。');
            spend('bonus');
            a.resources.secondWind--;
            emit('resource_consumed', '消耗回气次数 ×1。');
            heal(a, rolling('1d10+3', '战士回气').total);
        }
        else if (c.abilityId === 'heal') {
            need(a.id === 'cleric' && a.resources.heal > 0, 'NO_ABILITY', '疗愈术次数不足。');
            const t = s.actors.find(x => x.id === c.targetId);
            need(t && t.faction === 'party' && distance(a, t) <= 6 && los(s, a, t), 'BAD_TARGET', '疗愈目标必须在六格内且可见。');
            need(t.hp < t.maxHp, 'FULL_HP', '目标已满血。');
            spend('action');
            a.resources.heal--;
            emit('resource_consumed', '洛恩消耗疗愈术次数 ×1。');
            heal(t, rolling('1d8+4', '疗愈术').total);
        }
        else if (c.abilityId === 'radiance') {
            need(a.id === 'cleric', 'NO_ABILITY', '该角色没有灯辉术。');
            const t = s.actors.find(x => x.id === c.targetId);
            need(t, 'BAD_TARGET', '请选择敌人。');
            attack(t, '1d8+3', 8, '灯辉术');
        }
        else
            throw new GameError('NO_ABILITY', '未知的职业能力。');
    }
    else if (c.type === 'end_turn') {
        need(s.combat, 'NO_ENCOUNTER', '探索阶段无需结束回合。');
        emit('turn_ended', `${a.name}结束回合。`);
        a.conditions = a.conditions.map(z => z.remainingRounds > 0 ? { ...z, remainingRounds: z.remainingRounds - 1 } : z).filter(z => z.remainingRounds !== 0);
        const combat = s.combat;
        for (let guard = 0; guard < combat.order.length; guard++) {
            combat.active++;
            if (combat.active >= combat.order.length) {
                combat.active = 0;
                combat.round++;
            }
            combat.serial++;
            const next = s.actors.find(x => x.id === combat.order[combat.active])!;
            if (next.hp > 0) {
                combat.actionUsed = false;
                combat.bonusUsed = false;
                combat.movementUsed = 0;
                emit('turn_started', `第 ${combat.round} 轮，轮到${next.name}。`, { activationId: `${combat.id}:${combat.serial}` });
                break;
            }
        }
    }
    else {
        if (c.targetId === 'scene') {
            const r = ROOMS.find(r => r.id === roomAt(a)) ?? ROOMS[0];
            emit('observed', `${r.name}：${r.description}`);
        }
        else if (c.type === 'talk' && s.actors.some(x => x.id === c.targetId && x.kind === 'companion')) {
            const companion = s.actors.find(x => x.id === c.targetId)!;
            need(companion.hp > 0 && distance(a, companion) <= 6 && los(s, a, companion), 'NOT_ADJACENT', '同伴需要在六格内且可见。');
            spend('bonus');
            const line = companion.id === 'ranger' ? (s.combat ? '别站在门口挡住射线。我会找机会压制远处的敌人。' : s.flags.key ? '钥匙已经在手。现在把所有人带回去，才算完成。' : '先看门，再看退路。走廊另一边有声音，别一口气冲太远。') : (s.combat ? '倒下的人我会优先照顾。你的药水和回气也别忘了。' : '营地的火盆可以休整。我能治伤，但疗愈术并不是无穷的。');
            emit('companion_talked', `${companion.name}：「${line}」`, { companionId: companion.id });
        }
        else {
            const o = s.objects.find(o => o.id === c.targetId);
            need(o, 'BAD_TARGET', '交互对象不存在。');
            need(distance(a, o) <= 1, 'NOT_ADJACENT', '请先移动到交互物的相邻格。');
            if (a.x !== o.x && a.y !== o.y)
                need(terrainOpen(s, { x: a.x, y: o.y }) && terrainOpen(s, { x: o.x, y: a.y }), 'BLOCKED', '不能隔着墙角交互。');
            if (o.kind === 'door') {
                if (o.open) {
                    emit('door_unchanged', `${o.name}已经打开。`);
                }
                else if (o.locked) {
                    spend('action');
                    const picking = c.interactionId === 'pick_lock', dc = picking ? 12 : 10;
                    const skill = picking ? a.skills.thieves_tools : a.skills.athletics;
                    const d = rolling(`d20+${skill}`, `${picking ? '撬开' : '强推'}${o.name}`);
                    const success = d.total >= dc;
                    emit('check_resolved', `${o.name}检定 ${d.total} 对 DC ${dc}：${success ? '成功' : '失败'}。${success ? '' : '动作与时间已消耗；可再次尝试或绕行。'}`, { checkId: d.checkId, total: d.total, dc, success });
                    if (success) {
                        o.locked = false;
                        o.open = true;
                        emit('door_opened', `${o.name}打开了。`, { objectId: o.id });
                    }
                }
                else {
                    spend('bonus');
                    o.open = true;
                    emit('door_opened', `${o.name}打开了。`, { objectId: o.id });
                }
                discover();
                detect();
            }
            else if (o.kind === 'rest') {
                need(!s.combat, 'IN_COMBAT', '战斗中不能长休。');
                for (const x of s.actors.filter(x => x.faction === 'party')) {
                    x.hp = x.maxHp;
                    x.tempHp = 0;
                    x.conditions = [];
                    if (x.kind === 'pc')
                        x.resources.secondWind = 1;
                    if (x.id === 'cleric')
                        x.resources.heal = 4;
                }
                s.worldTime += 8 * 3600;
                emit('rested', '在营地长休八小时。全队 HP 与职业能力恢复，药水数量不变。');
            }
            else if (o.kind === 'chest') {
                need(!s.claims.includes(`loot:${o.id}`), 'ALREADY_CLAIMED', '这个容器已经领取过，不能再次取得物品。');
                spend('bonus');
                s.claims.push(`loot:${o.id}`);
                o.looted = true;
                a.inventory.potion = (a.inventory.potion ?? 0) + 2;
                emit('item_added', `${a.name}取得治疗药水 ×2。`, { itemId: 'potion', quantity: 2, sourceId: o.id });
                if (o.id === 'supply') {
                    s.gold += 10;
                    emit('reward_granted', '队伍取得 10 枚金币。', { sourceId: o.id, amount: 10 });
                }
            }
            else if (o.kind === 'clue') {
                const flag = o.id === 'ledger' ? 'ledger' : 'inscription';
                if (s.flags[flag])
                    emit('observed', `${o.name}已经记录在冒险日志中。`);
                else {
                    spend('bonus');
                    s.flags[flag] = true;
                    o.looted = true;
                    const text = flag === 'ledger' ? '维护账簿显示：维护款有支出，却没有对应的低鸣石入库。伊蕾娅不是记录上的签收人。' : '铭文说明：击败守卫后，先校准祭坛，再取走钥匙，可以留下稳定的余振。';
                    s.journal.push(text);
                    emit('fact_recorded', text, { entityId: o.id });
                }
            }
            else if (o.kind === 'npc') {
                spend('bonus');
                if (o.id === 'migu') {
                    s.flags.rescued = true;
                    o.looted = true;
                    emit('npc_talked', '米咕：「我只是搬东西的！账簿在那边……谢谢你没把我留在这里。」米咕沿安全路线撤往营地。', { npcId: o.id });
                }
                else if (!s.flags.accepted) {
                    s.flags.accepted = true;
                    s.journal.push('接受伊蕾娅的委托：取回调谐钥匙，报酬六十金币。');
                    emit('quest_step_completed', '接受委托：取回祭坛钥匙，再交给伊蕾娅。', { stepId: 'accept' });
                    emit('npc_talked', '伊蕾娅：「钥匙在祭坛上。先确保你们都能回来。」', { npcId: o.id });
                }
                else if (s.flags.key && !s.flags.returned) {
                    const pc = s.actors.find(x => x.kind === 'pc')!;
                    need((pc.inventory.key ?? 0) > 0, 'NO_KEY', '队伍没有可以交付的钥匙。');
                    need(!s.claims.includes('quest:return'), 'ALREADY_CLAIMED', '委托奖励已经领取。');
                    pc.inventory.key--;
                    s.flags.returned = true;
                    s.claims.push('quest:return');
                    s.gold += 60;
                    s.xp += 50;
                    s.status = 'victory';
                    s.ending = (s.flags.calibrated ? BOOK.endings.restored : BOOK.endings.retrieved) + (s.flags.ledger ? '\n\n' + BOOK.endings.evidence : '') + (s.flags.rescued ? '\n\n' + BOOK.endings.mercy : '');
                    emit('item_consumed', '交付调谐钥匙 ×1。', { itemId: 'key', quantity: 1 });
                    emit('quest_step_completed', '委托完成：调谐钥匙已归还。', { stepId: 'return' });
                    emit('reward_granted', '收到任务报酬：60 金币与 50 经验。', { sourceId: 'quest:return', gold: 60, xp: 50 });
                    emit('adventure_completed', s.ending);
                    s.journal.push(s.ending);
                }
                else
                    emit('npc_talked', '伊蕾娅：「北面的储藏室也许留下了维护记录。别忘了，入口的火盆一直为你们留着。」', { npcId: o.id });
            }
            else if (o.kind === 'altar') {
                need(s.actors.find(x => x.id === 'guardian')!.hp === 0 && !s.combat, 'GUARDIAN_ALIVE', '先击败祭坛守卫并结束战斗。');
                if (c.interactionId === 'calibrate') {
                    need(s.flags.inscription, 'MISSING_KNOWLEDGE', '你还没读过调谐铭文。可返回储藏室，也可以直接取钥匙完成委托。');
                    need(!s.flags.key, 'KEY_REMOVED', '钥匙已经取走，本次不能再校准。');
                    need(!s.flags.calibrated, 'ALREADY_DONE', '祭坛已经完成校准。');
                    s.flags.calibrated = true;
                    emit('fact_recorded', '你按铭文校准了祭坛。稳定的余振被留在低鸣石中。', { entityId: 'altar' });
                }
                else {
                    need(!s.claims.includes('altar:key'), 'ALREADY_CLAIMED', '钥匙已经被取走。');
                    s.claims.push('altar:key');
                    s.flags.key = true;
                    o.looted = true;
                    const pc = s.actors.find(x => x.kind === 'pc')!;
                    pc.inventory.key = (pc.inventory.key ?? 0) + 1;
                    emit('item_added', '取得调谐钥匙 ×1，交由玩家角色保管。', { itemId: 'key', quantity: 1 });
                    emit('quest_step_completed', '取得祭坛钥匙。返回入口，与伊蕾娅交谈。', { stepId: 'key' });
                }
            }
        }
    }
    finish();
    s.worldTime += 6;
    s.version = original.version + 1;
    if (s.version - s.summaryThroughVersion >= 8) {
        s.summary = canonicalSummary(s);
        s.summaryThroughVersion = s.version;
    }
    s.journal = s.journal.slice(-80);
    return { state: s, events, dice, commands: [c] };
}
export function resolvePlan(s: GameState, commands: Command[], source: 'player' | 'auto', rng: RNG = secureRng): Resolution {
    need(commands.length >= 1 && commands.length <= 4, 'BAD_PLAN', '行动计划必须含 1 至 4 步。');
    let state = s;
    const events: DomainEvent[] = [], dice: Dice[] = [], accepted: Command[] = [];
    const actorId = commands[0].actorId;
    for (const c of commands) {
        need(c.actorId === actorId, 'BAD_PLAN', '一个计划只能操纵同一个角色。');
        if (state.status !== 'playing' || (state.combat && activeId(state) !== actorId) || (!state.combat && (source === 'auto' || s.combat !== null)))
            break;
        try {
            const r = resolve(state, c, source, rng);
            state = r.state;
            events.push(...r.events);
            dice.push(...r.dice);
            accepted.push(c);
        }
        catch (e) {
            if (source === 'player' || !(e instanceof GameError))
                throw e;
            events.push({ type: 'command_rejected', text: `计划中的动作未执行：${e.message}`, actorId });
        }
    }
    if (source === 'auto' && state.combat && activeId(state) === actorId && state.status === 'playing') {
        const r = resolve(state, { type: 'end_turn', actorId }, source, rng);
        state = r.state;
        events.push(...r.events);
        dice.push(...r.dice);
        accepted.push({ type: 'end_turn', actorId });
    }
    need(accepted.length > 0, 'NO_ACTION', '没有执行任何合法动作。');
    state.version = s.version + 1;
    if (state.version - s.summaryThroughVersion >= 8) {
        state.summary = canonicalSummary(state);
        state.summaryThroughVersion = state.version;
    }
    else {
        state.summary = s.summary;
        state.summaryThroughVersion = s.summaryThroughVersion;
    }
    return { state, events, dice, commands: accepted };
}
export function tacticalPlan(s: GameState, id: string): Command[] {
    const a = s.actors.find(a => a.id === id)!;
    if (!s.combat || a.hp === 0)
        return [];
    const plan: Command[] = [];
    const allies = s.actors.filter(x => x.faction === a.faction);
    if (a.id === 'cleric' && a.resources.heal > 0 && !s.combat.actionUsed) {
        const hurt = allies.filter(x => x.hp < x.maxHp * 0.6 && distance(a, x) <= 6 && los(s, a, x)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt) {
            plan.push({ type: 'use_ability', actorId: id, abilityId: 'heal', targetId: hurt.id });
            return [...plan, { type: 'end_turn', actorId: id }];
        }
    }
    if (!s.combat.bonusUsed && a.hp < a.maxHp / 2 && (a.inventory.potion ?? 0) > 0)
        plan.push({ type: 'use_item', actorId: id, itemId: 'potion', targetId: id });
    const foes = s.actors.filter(x => x.faction !== a.faction && x.hp > 0 && s.combat!.order.includes(x.id)).sort((x, y) => distance(a, x) - distance(a, y) || x.hp - y.hp);
    const range = a.id === 'cleric' ? 8 : a.range;
    let target = foes.find(x => distance(a, x) <= range && los(s, a, x));
    if (!target) {
        const budget = a.speed - s.combat.movementUsed;
        let best: {
            path: Point[];
            target: Actor;
            score: number;
        } | null = null;
        for (const foe of foes) {
            if (a.faction === 'hostile' && !los(s, a, foe))
                continue;
            for (let y = Math.max(0, a.y - budget); y <= Math.min(HEIGHT - 1, a.y + budget); y++)
                for (let x = Math.max(0, a.x - budget); x <= Math.min(WIDTH - 1, a.x + budget); x++) {
                    const p = { x, y };
                    if (distance(p, foe) > range || !terrainOpen(s, p) || !los(s, p, foe))
                        continue;
                    const path = pathfind(s, a, p, budget);
                    if (!path || !path.length)
                        continue;
                    const score = path.length + (foe.hp / 100) + (range > 1 ? Math.max(0, 2 - distance(p, foe)) * 2 : 0);
                    if (!best || score < best.score)
                        best = { path, target: foe, score };
                }
        }
        if (best) {
            plan.push({ type: 'move', actorId: id, path: best.path });
            target = best.target;
        }
    }
    if (target && !s.combat.actionUsed)
        plan.push(a.id === 'cleric' ? { type: 'use_ability', actorId: id, abilityId: 'radiance', targetId: target.id } : { type: 'attack', actorId: id, targetId: target.id });
    plan.push({ type: 'end_turn', actorId: id });
    return plan.slice(0, 4);
}
export function view(s: GameState): View {
    const known = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
    for (let y = 0; y < HEIGHT; y++)
        for (let x = 0; x < WIDTH; x++) {
            const r = roomAt({ x, y });
            if (s.discovered.includes(r) || partyVisible(s, { x, y }))
                known[y][x] = 1;
        }
    for (const o of s.objects)
        if (o.kind === 'door' && s.discovered.includes(o.roomId))
            known[o.y][o.x] = 1;
    const { flags, ...base } = s;
    return { ...base, actors: s.actors.filter(a => a.faction === 'party' || ((s.discovered.includes(a.roomId) || partyVisible(s, a)) && a.hp > 0)).map(({ personality, ...a }) => a), objects: s.objects.filter(o => known[o.y]?.[o.x] && (o.id !== 'migu' || !s.flags.rescued)), rooms: ROOMS.filter(r => s.discovered.includes(r.id)).map(({ dmNotes, ...r }) => r), map: { width: WIDTH, height: HEIGHT, tiles: TILES.map((r, y) => r.map((t, x) => known[y][x] ? t : 0)), known, obstacles: OBSTACLES.filter(o => known[o.y][o.x]) }, objectives: [{ id: 'accept', title: '与伊蕾娅交谈，接受委托', done: !!s.flags.accepted }, { id: 'key', title: '击败祭坛守卫，取得调谐钥匙', done: !!s.flags.key }, { id: 'return', title: '将钥匙交还伊蕾娅', done: !!s.flags.returned }, { id: 'ledger', title: '可选：找出维护款的真相', done: !!s.flags.ledger }, { id: 'rescue', title: '可选：救助被困搬运工', done: !!s.flags.rescued }, { id: 'ritual', title: '可选：校准祭坛，留下余振', done: !!s.flags.calibrated }], activeActorId: activeId(s), facts: [canonicalSummary(s)] };
}
