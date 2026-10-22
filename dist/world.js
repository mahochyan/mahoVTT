import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const BOOK = JSON.parse(readFileSync(new URL('../content/worldbook.json', import.meta.url), 'utf8'));
export const WIDTH = 31, HEIGHT = 22;
export const ROOMS = [
    { id: 'entry', name: '入口营地', subtitle: '仍然温暖的灯', rect: [1, 12, 8, 8], description: '帆布、铜灯与雨衣。伊蕾娅在火盆旁等待消息。营地连接镇子的补给线，脱离战斗后可以休整。', dmNotes: '安全区。委托需显式接受。不能提前发放钥匙和奖励。' },
    { id: 'hall', name: '裂石走廊', subtitle: '回声比脚步先到', rect: [10, 13, 5, 5], description: '狭长石廊被铜管穿过。北面的木门通向旧储藏室，东侧传来武器磕碰的声音。', dmNotes: '一个哥布林哨兵在这里。进入后由引擎决定遭遇。' },
    { id: 'guard', name: '守卫室', subtitle: '被占领的旧岗哨', rect: [16, 12, 9, 8], description: '折断的长桌被用作掩体。墙角堆着灰齿群的行囊，北面铁门通往祭坛下层。', dmNotes: '两个近战哥布林与两个弓手。补给箱只能领取一次。' },
    { id: 'store', name: '旧储藏室', subtitle: '纸页记得一切', rect: [9, 3, 7, 7], description: '墙上挂着旧式铜量具。书桌、铭文和一个发抖的身影藏在褪色的帆布后。', dmNotes: '账簿揭示挪用维护款；铭文是祭坛校准的前提；米咕可被救助。' },
    { id: 'altar', name: '调谐祭坛', subtitle: '最后一声尚未发生', rect: [18, 3, 11, 7], description: '悬空的铜钥匙缓缓转动。构装守卫立在低鸣石前，地上的调谐刻线仍泛着蓝光。', dmNotes: '击败守卫后可校准或取钥匙。校准需已读铭文。未校准也能通关。' }
];
export const OBSTACLES = [{ x: 18, y: 16 }, { x: 19, y: 16 }, { x: 22, y: 15 }, { x: 11, y: 5 }, { x: 12, y: 5 }, { x: 21, y: 5 }, { x: 25, y: 8 }];
export const TILES = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
for (const r of ROOMS) {
    const [x, y, w, h] = r.rect;
    for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++)
            TILES[j][i] = 1;
}
for (const p of [{ x: 9, y: 15 }, { x: 15, y: 15 }, { x: 12, y: 10 }, { x: 12, y: 11 }, { x: 12, y: 12 }, { x: 16, y: 6 }, { x: 17, y: 6 }, { x: 22, y: 10 }, { x: 22, y: 11 }])
    TILES[p.y][p.x] = 1;
for (const p of OBSTACLES)
    TILES[p.y][p.x] = 2;
export function roomAt(p) { return ROOMS.find(r => { const [x, y, w, h] = r.rect; return p.x >= x && p.x < x + w && p.y >= y && p.y < y + h; })?.id ?? 'passage'; }
const obj = (id, name, kind, x, y, roomId, description, locked = false) => ({ id, name, kind, x, y, roomId, open: false, locked, looted: false, description });
function actor(id, name, role, x, y, kind, hp, ac, attack, damage, range) { return { id, name, role, x, y, kind, controller: kind === 'pc' ? 'player' : kind === 'companion' ? 'ai' : 'engine', faction: kind === 'enemy' ? 'hostile' : 'party', hp, maxHp: hp, tempHp: 0, ac, speed: 6, attack, damage, range, weapon: range > 1 ? '短弓' : '短剑', dex: kind === 'enemy' ? 1 : 2, skills: { athletics: 5, perception: 3, thieves_tools: 2 }, inventory: { potion: kind === 'enemy' ? 0 : 2 }, resources: { heal: kind === 'companion' && id === 'cleric' ? 4 : 0, secondWind: kind === 'pc' ? 1 : 0 }, abilityIds: id === 'pc' ? ['second_wind'] : id === 'cleric' ? ['heal', 'radiance'] : [], conditions: [], roomId: roomAt({ x, y }), description: '', personality: '' }; }
export function newGame(name = '无声钟塔', playerName = '旅人', pcPreset) {
    const actors = [actor('pc', playerName, '战士', 4, 15, 'pc', 36, 16, 5, '1d8+3', 1), actor('ranger', '沈鸢', '游侠', 3, 16, 'companion', 28, 14, 5, '1d6+3', 12), actor('cleric', '洛恩', '牧师', 4, 16, 'companion', 30, 15, 5, '1d6+2', 1), actor('g1', '灰齿哨兵', '哥布林', 13, 14, 'enemy', 9, 11, 3, '1d4+1', 1), actor('g2', '灰齿守卫', '哥布林', 19, 14, 'enemy', 10, 12, 3, '1d4+1', 1), actor('g3', '灰齿刀手', '哥布林', 21, 18, 'enemy', 10, 12, 3, '1d4+1', 1), actor('g4', '灰齿弓手', '弓手', 23, 14, 'enemy', 8, 11, 3, '1d4+1', 10), actor('g5', '灰齿斥候', '弓手', 23, 18, 'enemy', 8, 11, 3, '1d4+1', 10), actor('guardian', '祭坛守卫', '构装体', 24, 6, 'enemy', 28, 14, 4, '1d8+2', 1)];
    if (pcPreset) {
        const pc = actors[0];
        const { hp, maxHp, skills, inventory, resources, abilityIds, ...rest } = pcPreset;
        Object.assign(pc, rest);
        pc.hp = hp ?? pc.hp;
        pc.maxHp = maxHp ?? pc.hp;
        pc.skills = skills ?? pc.skills;
        pc.inventory = inventory ?? pc.inventory;
        pc.resources = resources ?? pc.resources;
        pc.abilityIds = abilityIds ?? pc.abilityIds;
        pc.weapon = pcPreset.weapon ?? pc.weapon;
        pc.name = pcPreset.name ?? playerName;
        playerName = pc.name;
    }
    actors[1].personality = BOOK.publicEntries.find(e => e.id === 'ranger').text;
    actors[2].personality = BOOK.publicEntries.find(e => e.id === 'cleric').text;
    actors[2].weapon = '铜柄短杖';
    return { schemaVersion: 1, contentVersion: BOOK.version, id: randomUUID(), name: name.slice(0, 60), playerName: playerName.slice(0, 20), version: 0, createdAt: new Date().toISOString(), worldTime: 0, status: 'playing', actors, objects: [
            obj('ileya', '伊蕾娅', 'npc', 5, 14, 'entry', '守灯人。接受委托，或交付祭坛钥匙。'), obj('camp', '营地火盆', 'rest', 2, 14, 'entry', '非战斗时长休。恢复 HP 与职业能力，不补充药水。'),
            obj('door_entry', '营地石门', 'door', 9, 15, 'entry', '推开石门。'), obj('door_guard', '守卫室木门', 'door', 15, 15, 'hall', '门后有兵器的声音。'), obj('door_store', '储藏室门', 'door', 12, 10, 'hall', '旧锁仍能工作。可撬锁，也可以强行推开。', true), obj('door_west', '祭坛侧门', 'door', 16, 6, 'store', '一扇未上锁的铜门。'), obj('door_north', '祭坛铁门', 'door', 22, 11, 'guard', '可以强行推开，不需要任务钥匙。', true),
            obj('supply', '守卫补给箱', 'chest', 17, 18, 'guard', '两瓶药水与十枚金币。'), obj('store_chest', '旧药箱', 'chest', 14, 8, 'store', '两瓶尚未失效的药水。'), obj('ledger', '维护账簿', 'clue', 14, 4, 'store', '查看维护记录。'), obj('inscription', '调谐铭文', 'clue', 10, 8, 'store', '阅读留下余振的方法。'), obj('migu', '米咕', 'npc', 10, 4, 'store', '一名躲藏的哥布林搬运工。'), obj('altar', '调谐祭坛', 'altar', 26, 6, 'altar', '守卫倒下后可以校准或取走钥匙。')
        ], combat: null, discovered: ['entry'], flags: { accepted: false, key: false, returned: false, ledger: false, inscription: false, rescued: false, calibrated: false }, claims: [], gold: 0, xp: 0, journal: [BOOK.chapters[0].readAloud], summary: '你与沈鸢、洛恩来到灰灯镇的钟塔营地。', summaryThroughVersion: 0, ending: null };
}
export function publicBook() { return { title: BOOK.title, tagline: BOOK.tagline, premise: BOOK.premise, tone: BOOK.tone, entries: BOOK.publicEntries }; }
