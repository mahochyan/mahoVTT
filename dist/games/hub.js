import { DATA_DIR, ConfigStore } from "../ai/config.js";
/** The hall discovers modules; each module owns rules, state and content.
 * Keep the clean-slate main branch: removed legacy demos are not reintroduced.
 *
 * The Deathwatch module is loaded behind a failure boundary: a broken or missing
 * module must not take the whole hall (and every other game) down. The original
 * draft used a static import here, which turned one missing file into a fatal
 * startup error for the entire server.
 */
let deathwatch = null;
let loadError = null;
try {
    const module = await import('../../modules/deathwatch/runtime.mjs');
    deathwatch = module.createRuntime({
        dataDir: DATA_DIR,
        getConfig: () => new ConfigStore().config,
    });
}
catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    console.error(`[games] Deathwatch 模块不可用：${loadError}`);
}
export const games = deathwatch ? [deathwatch.descriptor] : [];
const active = new Map(deathwatch ? [[deathwatch.descriptor.id, deathwatch]] : []);
export function listGames() {
    return games.map(g => ({ ...g, features: [...g.features] }));
}
export function findGame(id) {
    return games.find(g => g.id === id);
}
export function unavailableGames() {
    return deathwatch ? [] : [{ id: 'deathwatch-d100', reason: loadError ?? '模块未加载' }];
}
/** All second-tier modules use a stable, isolated API namespace. */
export async function gameRequest(path, method, readBody) {
    if (path === '/api/games' && method === 'GET') {
        return { status: 200, data: { games: listGames(), unavailable: unavailableGames() } };
    }
    const m = /^\/api\/games\/([a-z0-9-]+)(?:\/(.*))?$/.exec(path);
    if (!m)
        return null;
    if (!deathwatch && m[1] === 'deathwatch-d100') {
        return { status: 503, data: { error: { code: 'GAME_UNAVAILABLE', message: `Deathwatch 模块不可用：${loadError ?? '未加载'}` } } };
    }
    const game = findGame(m[1]);
    if (!game)
        return { status: 404, data: { error: { code: 'GAME_NOT_FOUND', message: '未找到游戏模块。' } } };
    const runtime = active.get(game.id);
    if (!m[2] && method === 'GET' && !runtime)
        return { status: 200, data: { game } };
    if (!runtime)
        return { status: 409, data: { error: { code: 'LEGACY_ROUTE', message: '此游戏通过原战役接口运行。', route: game.route } } };
    const req = { method, tail: (m[2] || '').split('/').filter(Boolean), readBody };
    return runtime.handle(req);
}
