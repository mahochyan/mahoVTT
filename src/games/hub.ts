import type {GameDescriptor, GameReply, GameRequest, GameRuntime} from './contracts.ts';

/** First-tier lobby registry. Games register a descriptor + isolated runtime.
 * The old demo scenarios were removed; the registry is intentionally empty
 * until a ready-to-play scenario pack is installed. */
export const games: GameDescriptor[] = [];
const active = new Map<string, GameRuntime>();

export function listGames(): GameDescriptor[] {
  return games.map(g => ({...g, features:[...g.features]}));
}
export function findGame(id: string): GameDescriptor | undefined {
  return games.find(g => g.id === id);
}

/** All second-tier modules use a stable, isolated API namespace. */
export async function gameRequest(path: string, method: string, readBody: () => Promise<unknown>): Promise<GameReply | null> {
  if (path === '/api/games' && method === 'GET') return {status: 200, data: {games: listGames()}};
  const m = /^\/api\/games\/([a-z0-9-]+)(?:\/(.*))?$/.exec(path);
  if (!m) return null;
  const game = findGame(m[1]);
  if (!game) return {status: 404, data: {error: {code: 'GAME_NOT_FOUND', message: '未找到游戏模块。'}}};
  const runtime = active.get(game.id);
  if (!m[2] && method === 'GET' && !runtime) return {status: 200, data: {game}};
  if (!runtime) return {status: 409, data: {error: {code: 'LEGACY_ROUTE', message: '此游戏通过原战役接口运行。', route: game.route}}};
  const req: GameRequest = {method, tail: (m[2] || '').split('/').filter(Boolean), readBody};
  return runtime.handle(req);
}
