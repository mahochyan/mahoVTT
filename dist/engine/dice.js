import { randomInt, randomUUID } from 'node:crypto';
import { GameError } from "../types.js";
export const secureRng = sides => randomInt(1, sides + 1);
export function roll(expr, purpose, rng = secureRng, mode = 'normal', checkId = randomUUID()) {
    const m = /^(\d{0,2})d(\d{1,3})([+-]\d{1,3})?$/.exec(expr.toLowerCase().replace(/\s/g, ''));
    if (!m)
        throw new GameError('BAD_DICE', '骰子格式应为 d20 或 2d6+3。');
    const count = m[1] ? Number(m[1]) : 1, sides = Number(m[2]), modifier = Number(m[3] ?? 0);
    if (count < 1 || count > 20 || sides < 2 || sides > 100 || Math.abs(modifier) > 100)
        throw new GameError('BAD_DICE', '骰子数量、面数或修正值超出范围。');
    if (mode !== 'normal' && (count !== 1 || sides !== 20))
        throw new GameError('BAD_DICE', '优劣势只用于单个 d20。');
    const rolls = Array.from({ length: mode === 'normal' ? count : 2 }, () => {
        const n = rng(sides);
        if (!Number.isInteger(n) || n < 1 || n > sides)
            throw new GameError('BAD_RNG', '随机数源返回非法值。', 500);
        return n;
    });
    const raw = mode === 'adv' ? Math.max(...rolls) : mode === 'dis' ? Math.min(...rolls) : rolls.reduce((a, b) => a + b, 0);
    return { id: randomUUID(), expr, rolls, modifier, total: raw + modifier, purpose, checkId, mode };
}
export function criticalExpr(expr) { return expr.replace(/^(\d*)d/, (_, n) => `${2 * Number(n || 1)}d`); }
export function seededRng(seed) { let x = seed >>> 0; return sides => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x % sides + 1; }; }
