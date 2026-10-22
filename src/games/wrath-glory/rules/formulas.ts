/** Pure W&G C7 formulas. No I/O and no state mutation: callers persist results. */

export type DiceFace = 1 | 2 | 3 | 4 | 5 | 6;

export type IconCount = {
    icons: number;
    exalted: number;
    blanks: number;
    wrathSix: boolean;
    wrathOne: boolean;
};

/** 1-3 blank; 4-5 one Icon; 6 Exalted (two Icons). */
export function countIcons(faces: readonly number[], wrathIndex?: number): IconCount {
    if (wrathIndex !== undefined && (!Number.isInteger(wrathIndex) || wrathIndex < 0 || wrathIndex >= faces.length))
        throw new Error(`Invalid Wrath Die index: ${wrathIndex}`);
    let icons = 0;
    let exalted = 0;
    let blanks = 0;
    for (const face of faces) {
        if (!Number.isInteger(face) || face < 1 || face > 6)
            throw new Error(`Invalid d6 face: ${face}`);
        if (face <= 3)
            blanks++;
        else if (face <= 5)
            icons++;
        else {
            icons += 2;
            exalted++;
        }
    }
    return {
        icons,
        exalted,
        blanks,
        wrathSix: wrathIndex !== undefined && faces[wrathIndex] === 6,
        wrathOne: wrathIndex !== undefined && faces[wrathIndex] === 1,
    };
}

export function maxWounds(toughness: number, tier: number, options: { errata?: boolean } = {}): number {
    const errata = options.errata ?? true;
    return toughness + (errata ? 2 : 1) * tier;
}

export function maxShock(willpower: number, tier: number): number {
    return willpower + tier;
}

export function defence(initiative: number): number {
    return Math.max(1, initiative - 1);
}

export function resilience(toughness: number, armour: number): number {
    return toughness + 1 + armour;
}

export function resolve(willpower: number): number {
    return Math.max(1, willpower - 1);
}

export function influence(fellowship: number): number {
    return Math.max(1, fellowship - 1);
}

export function woundedPenalty(woundsTaken: number): number {
    return woundsTaken > 0 ? 1 : 0;
}

export function isDying(woundsTaken: number, max: number): boolean {
    return woundsTaken > max;
}

export function isAnnihilated(damageValue: number, max: number): boolean {
    return damageValue > 2 * max;
}

export type DamageResult = { wounds: number; shock: number };

/** Compare total damage to Resilience. Equal = 1d3 Shock; greater = Wounds. */
export function damageVsResilience(damageValue: number, targetResilience: number, shockDie: number): DamageResult {
    if (damageValue < targetResilience)
        return { wounds: 0, shock: 0 };
    if (damageValue === targetResilience) {
        if (!Number.isInteger(shockDie) || shockDie < 1 || shockDie > 3)
            throw new Error(`Invalid 1d3 Shock roll: ${shockDie}`);
        return { wounds: 0, shock: shockDie };
    }
    return { wounds: damageValue - targetResilience, shock: 0 };
}

/** Determination: roll Toughness dice; each Icon converts one Wound to one Shock. */
export function determination(toughnessFaces: readonly number[]): { woundsConverted: number; shock: number; icons: number } {
    const counted = countIcons(toughnessFaces);
    return { woundsConverted: counted.icons, shock: counted.icons, icons: counted.icons };
}

export function criticalHit(attackSucceeded: boolean, wrathDie: number): boolean {
    return attackSucceeded && wrathDie === 6;
}

export function attackPool(input: {
    mode: 'melee' | 'ranged';
    initiative: number;
    weaponSkill: number;
    agility: number;
    ballisticSkill: number;
}): number {
    return input.mode === 'melee'
        ? input.initiative + input.weaponSkill
        : input.agility + input.ballisticSkill;
}

export type RangeBand = 'short' | 'medium' | 'long' | 'out';

/** Three ranges are stored per weapon; no medium x2 conversion. */
export function rangeBand(distance: number, short: number, medium: number, long: number): RangeBand {
    if (distance <= short)
        return 'short';
    if (distance <= medium)
        return 'medium';
    if (distance <= long)
        return 'long';
    return 'out';
}

export function ruinMax(playerCount: number): number {
    return 2 * playerCount;
}
