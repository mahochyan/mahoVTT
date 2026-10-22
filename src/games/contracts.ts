/** A game is a self-contained ruleset + adventure runtime, not a world skin. */
export type GameDescriptor = {
  id: string;
  name: string;
  subtitle: string;
  rulesetId: string;
  route: string;
  creationRoute: string;
  phase: 'playable' | 'experimental';
  description: string;
  features: string[];
  disclaimer?: string;
};

export type GameRequest = {
  method: string;
  tail: string[];
  readBody: () => Promise<unknown>;
};
export type GameReply = { status: number; data: unknown };
export interface GameRuntime {
  descriptor: GameDescriptor;
  handle(req: GameRequest): Promise<GameReply>;
}
