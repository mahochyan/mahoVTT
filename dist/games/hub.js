import { wrathRuntime } from "./wrath/runtime.js";
/** First-tier lobby registry. A game owns its rules, state, routes and UI.
 * The existing d20 application is a legacy adapter: it is NOT rewritten. */
export const legacy = {
    id: 'graylight-d20', name: '灰灯纪事', subtitle: '无声钟塔 · d20', rulesetId: 'graylight-d20-v1',
    route: '/campaigns', creationRoute: '/campaigns/new?world=whispering-tower', phase: 'playable',
    description: '守灯人委托、五房间探索与两名 AI 同伴。原有存档和接口保持不变。',
    features: ['d20 行动与战斗', 'AI 主持人', '原存档完全独立'],
};
const games = [legacy, wrathRuntime.descriptor];
const active = new Map([[wrathRuntime.descriptor.id, wrathRuntime]]);
export function listGames() { return games.map(g => ({ ...g, features: [...g.features] })); }
export function findGame(id) { return games.find(g => g.id === id); }
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
    const runtime = active.get(game.id);
    if (!m[2] && method === 'GET' && !runtime)
        return { status: 200, data: { game } };
    if (!runtime)
        return { status: 409, data: { error: { code: 'LEGACY_ROUTE', message: '此游戏通过原战役接口运行。', route: game.route } } };
    const req = { method, tail: (m[2] || '').split('/').filter(Boolean), readBody };
    return runtime.handle(req);
}
