import { countIcons } from "./formulas.js";
function die(rng) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new Error('RNG must return a number in [0, 1).');
    return (Math.floor(value * 6) + 1);
}
/** Roll the pool; one die (default first) is the Wrath Die. No resource changes. */
export function rollPool(pool, rng, options = {}) {
    if (!Number.isInteger(pool) || pool < 1)
        throw new Error('A test pool must contain at least one die.');
    const wrathIndex = options.wrathIndex ?? 0;
    if (!Number.isInteger(wrathIndex) || wrathIndex < 0 || wrathIndex >= pool)
        throw new Error('Wrath Die index is outside the pool.');
    const faces = Array.from({ length: pool }, () => die(rng));
    const counted = countIcons(faces, wrathIndex);
    return { ...counted, faces, wrathIndex, pool };
}
/** Maximum Exalted dice that can be shifted after meeting the DN. */
export function shiftableExalted(result, dn) {
    if (!Number.isInteger(dn) || dn < 0)
        throw new Error('DN must be a non-negative integer.');
    if (result.icons < dn)
        return 0;
    const normalIcons = result.icons - 2 * result.exalted;
    const needed = Math.max(0, dn - normalIcons);
    const usedExalted = Math.min(result.exalted, Math.ceil(needed / 2));
    return Math.max(0, result.exalted - usedExalted);
}
export function rollTest(pool, dn, rng, options = {}) {
    const result = rollPool(pool, rng, options);
    return {
        ...result,
        dn,
        success: result.icons >= dn,
        shiftableExalted: shiftableExalted(result, dn),
    };
}
/** Wrath re-roll: failures (1-3) except the Wrath Die, which can never be re-rolled. */
export function rerollFailures(result, rng) {
    const faces = result.faces.map((face, index) => {
        if (index === result.wrathIndex || face > 3)
            return face;
        return die(rng);
    });
    const counted = countIcons(faces, result.wrathIndex);
    return { ...counted, faces, wrathIndex: result.wrathIndex, pool: result.pool };
}
/** Split shifted Exalted between effects. At most one per test may become Glory. */
export function allocateShift(result, dn, allocation) {
    const available = shiftableExalted(result, dn);
    const values = Object.entries(allocation).filter(([, value]) => value !== undefined);
    let spent = 0;
    for (const [key, value] of values) {
        if (!Number.isInteger(value) || value < 0)
            throw new Error(`Shift allocation ${key} must be a non-negative integer.`);
        spent += value;
    }
    if (spent > available)
        throw new Error(`Only ${available} Exalted dice can be shifted.`);
    if ((allocation.toGlory ?? 0) > 1)
        throw new Error('At most one shifted Exalted per test may be banked as Glory.');
    return { ...allocation, remaining: available - spent };
}
/** Extra Damage dice do not include a Wrath Die. Each Icon adds 1 damage. */
export function rollExtraDamage(count, rng) {
    if (!Number.isInteger(count) || count < 0)
        throw new Error('Extra Damage dice must be a non-negative integer.');
    const faces = Array.from({ length: count }, () => die(rng));
    return { faces, bonus: countIcons(faces).icons };
}
export function rollDamage(weaponDamage, extraDice, rng) {
    const extra = rollExtraDamage(extraDice, rng);
    return { faces: extra.faces, total: weaponDamage + extra.bonus, bonus: extra.bonus };
}
/** Determination: Toughness dice, no Wrath Die, no DN. */
export function rollDetermination(toughness, rng) {
    if (!Number.isInteger(toughness) || toughness < 1)
        throw new Error('Toughness must be at least 1.');
    const faces = Array.from({ length: toughness }, () => die(rng));
    return { faces, icons: countIcons(faces).icons };
}
