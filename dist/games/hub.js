import { DATA_DIR, ConfigStore } from '../ai/config.js';
import { createRuntime } from '../../modules/deathwatch/runtime.mjs';
const deathwatch = createRuntime({ dataDir: DATA_DIR, getConfig: () => new ConfigStore().config });
export const games = [deathwatch.descriptor];
const active = new Map([[deathwatch.descriptor.id, deathwatch]]);
export function listGames() { return games.map(g => ({ ...g, features: [...g.features] })); }
export function findGame(id) { return games.find(g => g.id === id); }
export async function gameRequest(path, method, readBody) {
    if (path === '/api/games' && method === 'GET') return { status: 200, data: { games: listGames() } };
    const m = /^\/api\/games\/([a-z0-9-]+)(?:\/(.*))?$/.exec(path);
    if (!m) return null;
    const game = findGame(m[1]);
    if (!game) return { status: 404, data: { error: { code: 'GAME_NOT_FOUND', message: '未找到游戏模块。' } } };
    const runtime = active.get(game.id);
    if (!m[2] && method === 'GET' && !runtime) return { status: 200, data: { game } };
    if (!runtime) return { status: 409, data: { error: { code: 'LEGACY_ROUTE', message: '此游戏通过原战役接口运行。', route: game.route } } };
    return runtime.handle({ method, tail: (m[2] || '').split('/').filter(Boolean), readBody });
}
