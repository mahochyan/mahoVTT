import { GameError } from "../types.js";
export const CLASS_PRESETS = {
    战士: {
        role: '战士', hp: 36, ac: 16, attack: 5, dice: '1d8', range: 1, weapon: '短剑',
        primary: 'str', abilities: ['second_wind'], resources: { secondWind: 1 },
        skills: { athletics: 5, perception: 3, thieves_tools: 2 }, icon: 'shield', color: 'gold',
    },
    游侠: {
        role: '游侠', hp: 28, ac: 14, attack: 5, dice: '1d6', range: 12, weapon: '短弓',
        primary: 'dex', abilities: ['aimed_shot'], resources: {},
        skills: { athletics: 3, perception: 5, thieves_tools: 4 }, icon: 'bow', color: 'teal',
    },
    牧师: {
        role: '牧师', hp: 30, ac: 15, attack: 5, dice: '1d6', range: 1, weapon: '铜柄短杖',
        primary: 'wis', abilities: ['heal', 'radiance'], resources: { heal: 4 },
        skills: { athletics: 2, perception: 4, religion: 5 }, icon: 'sun', color: 'blue',
    },
};
export const ICONS = ['shield', 'bow', 'sun', 'sword', 'flame', 'book'];
export const COLORS = ['gold', 'teal', 'blue', 'ash'];
export const ANCESTRIES = ['人类', '精灵', '矮人', '半身人', '兽人', '混血'];
const integer = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const mod = (score) => Math.floor((score - 10) / 2);
export function validateCharacter(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new GameError('BAD_CHARACTER', '角色数据必须是对象。');
    const r = raw;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name || name.length > 20)
        throw new GameError('BAD_CHARACTER', '角色名须为 1 至 20 字。');
    const ancestry = typeof r.ancestry === 'string' && r.ancestry.trim() ? r.ancestry.trim().slice(0, 20) : '人类';
    if (!(r.className in CLASS_PRESETS))
        throw new GameError('BAD_CHARACTER', '职业只支持战士、游侠、牧师。');
    const stats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const source = r.stats && typeof r.stats === 'object' ? r.stats : {};
    for (const key of Object.keys(stats)) {
        const value = source[key] ?? stats[key];
        if (!integer(value, 8, 18))
            throw new GameError('BAD_CHARACTER', `属性 ${key} 须为 8 至 18 的整数。`);
        stats[key] = value;
    }
    const background = typeof r.background === 'string' ? r.background.trim().slice(0, 500) : '';
    const portrait = r.portrait && typeof r.portrait === 'object' ? r.portrait : {};
    return {
        name,
        ancestry,
        className: r.className,
        level: 1,
        stats,
        background,
        portrait: {
            icon: ICONS.includes(portrait.icon) ? portrait.icon : CLASS_PRESETS[r.className].icon,
            color: COLORS.includes(portrait.color) ? portrait.color : CLASS_PRESETS[r.className].color,
        },
    };
}
export function defaultCharacter(name = '旅人', className = '战士') {
    const stats = className === '战士'
        ? { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 }
        : className === '游侠'
            ? { str: 12, dex: 16, con: 12, int: 10, wis: 14, cha: 10 }
            : { str: 10, dex: 12, con: 12, int: 10, wis: 14, cha: 12 };
    return validateCharacter({ name, className, ancestry: '人类', stats, background: '', portrait: {} });
}
/** Derive the runtime actor preset. The engine still receives an Actor, not CharacterData. */
export function actorPreset(c) {
    const p = CLASS_PRESETS[c.className];
    const primaryMod = mod(c.stats[p.primary]);
    const basePrimaryMod = 2;
    const conMod = mod(c.stats.con);
    const hp = Math.max(12, p.hp + (conMod - 2) * 2);
    const attack = p.attack + (primaryMod - basePrimaryMod);
    const damage = `${p.dice}${primaryMod >= 0 ? '+' : ''}${primaryMod}`;
    const dexMod = mod(c.stats.dex);
    const ac = c.className === '游侠' ? p.ac + Math.max(0, dexMod - 2) : p.ac;
    return {
        name: c.name,
        role: c.className,
        hp,
        maxHp: hp,
        ac,
        attack,
        damage,
        range: p.range,
        weapon: p.weapon,
        speed: 6,
        dex: dexMod,
        skills: { ...p.skills },
        inventory: { potion: 2 },
        resources: { ...p.resources },
        abilityIds: [...p.abilities],
        description: c.background,
    };
}
