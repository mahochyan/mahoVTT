import { wrathGloryRuntime } from "./wrath-glory/runtime.js";
/** First-tier lobby registry. Modules register a descriptor + isolated runtime;
 * the hall does not know their rules or save schema. */
const registry = new Map();
export function registerGame(runtime) {
    const id = runtime.descriptor.id;
    if (registry.has(id))
        throw new Error(`Game "${id}" is already registered.`);
    registry.set(id, runtime);
}
export function listGames() {
    return [...registry.values()].map(r => ({ ...r.descriptor, features: [...r.descriptor.features] }));
}
export function findGame(id) {
    return registry.get(id)?.descriptor;
}
registerGame(wrathGloryRuntime);
/** All second-tier modules use a stable, isolated API namespace. */
export async function gameRequest(path, method, readBody) {
    if (path === '/api/games' && method === 'GET')
        return { status: 200, data: { games: listGames() } };
    const m = /^\/api\/games\/([a-z0-9-]+)(?:\/(.*))?$/.exec(path);
    if (!m)
        return null;
    const game = findGame(m[1]);
    if (!game)
        return { status: 404, data: { error: { code: 'GAME_NOT_FOUND', message: '未找到游戏模块。' } } };
    const runtime = registry.get(game.id);
    if (!m[2] && method === 'GET' && !runtime)
        return { status: 200, data: { game } };
    if (!runtime)
        return { status: 409, data: { error: { code: 'LEGACY_ROUTE', message: '此游戏通过原战役接口运行。', route: game.route } } };
    const req = { method, tail: (m[2] || '').split('/').filter(Boolean), readBody };
    return runtime.handle(req);
}
