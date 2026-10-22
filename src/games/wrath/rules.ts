import { randomInt } from 'node:crypto';

/** W&G-style dice mechanics based on the publisher's public overview. This is
 * NOT a complete implementation of the licensed Wrath & Glory core rules. */
export type RNG = (sides: number) => number;
export const cryptoRng: RNG = sides => randomInt(1, sides + 1);
export type PoolResult = {
  dice: number[];
  wrathDie: number;
  icons: number;
  exalted: number;
  dn: number;
  success: boolean;
  complication: boolean;
  wrathCritical: boolean;
};
export function rollPool(pool: number, dn: number, rng: RNG = cryptoRng): PoolResult {
  if (!Number.isInteger(pool) || pool < 1 || pool > 30 || !Number.isInteger(dn) || dn < 1 || dn > 20)
    throw new Error('INVALID_POOL');
  const dice = Array.from({length:pool}, () => {
    const face = rng(6);
    if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error('INVALID_RNG');
    return face;
  });
  const exalted = dice.filter(x => x === 6).length;
  const icons = dice.filter(x => x === 4 || x === 5).length + exalted * 2;
  const wrathDie = dice[0];
  return {dice, wrathDie, icons, exalted, dn, success: icons >= dn,
    complication: wrathDie === 1, wrathCritical: wrathDie === 6};
}
export function fixedRng(sequence: number[]): RNG {
  if (!sequence.length) throw new Error('EMPTY_SEQUENCE');
  let index = 0;
  return sides => {
    const face = sequence[index++ % sequence.length];
    if (face < 1 || face > sides) throw new Error('BAD_FIXED_DIE');
    return face;
  };
}
