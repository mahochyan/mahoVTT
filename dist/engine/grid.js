import { TILES, WIDTH, HEIGHT } from "../world.js";
export const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const key = (p) => `${p.x},${p.y}`;
export function terrainOpen(s, p) { return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < WIDTH && p.y < HEIGHT && TILES[p.y][p.x] === 1 && !s.objects.some(o => o.kind === 'door' && o.x === p.x && o.y === p.y && !o.open); }
export function los(s, a, b) {
    let x = a.x, y = a.y;
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    let err = dx - dy;
    for (let guard = 0; guard < 100; guard++) {
        if (x === b.x && y === b.y)
            return true;
        const e2 = 2 * err;
        let nx = x, ny = y;
        if (e2 > -dy) {
            err -= dy;
            nx += sx;
        }
        if (e2 < dx) {
            err += dx;
            ny += sy;
        }
        if (nx !== x && ny !== y && (!terrainOpen(s, { x: nx, y }) || !terrainOpen(s, { x, y: ny })))
            return false;
        x = nx;
        y = ny;
        if (!terrainOpen(s, { x, y }))
            return false;
    }
    return false;
}
export function canStep(s, a, from, to, final = false) {
    if (distance(from, to) !== 1 || !terrainOpen(s, to))
        return false;
    if (from.x !== to.x && from.y !== to.y && (!terrainOpen(s, { x: from.x, y: to.y }) || !terrainOpen(s, { x: to.x, y: from.y })))
        return false;
    return !s.actors.some(o => o.id !== a.id && o.hp > 0 && o.x === to.x && o.y === to.y && (final || o.faction !== a.faction));
}
export function pathfind(s, a, target, max = 200) {
    if (a.x === target.x && a.y === target.y)
        return [];
    const queue = [{ x: a.x, y: a.y }], seen = new Set([key(a)]), prev = new Map();
    for (let i = 0; i < queue.length && i < WIDTH * HEIGHT; i++) {
        const p = queue[i];
        if (distance(a, p) > max)
            continue;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
            const n = { x: p.x + dx, y: p.y + dy };
            if (seen.has(key(n)) || !canStep(s, a, p, n, n.x === target.x && n.y === target.y))
                continue;
            seen.add(key(n));
            prev.set(key(n), p);
            if (n.x === target.x && n.y === target.y) {
                const path = [n];
                let cur = p;
                while (cur.x !== a.x || cur.y !== a.y) {
                    path.unshift(cur);
                    cur = prev.get(key(cur));
                }
                return path.length <= max ? path : null;
            }
            queue.push(n);
        }
    }
    return null;
}
export function visible(s, a, b) { return a.hp > 0 && distance(a, b) <= 12 && los(s, a, b); }
export function partyVisible(s, b) { return s.actors.some(a => a.faction === 'party' && visible(s, a, b)); }
