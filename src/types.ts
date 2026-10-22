export type Point = {
    x: number;
    y: number;
};
export type Controller = 'player' | 'ai' | 'engine';
export type Actor = Point & {
    id: string;
    name: string;
    role: string;
    kind: 'pc' | 'companion' | 'enemy';
    controller: Controller;
    faction: 'party' | 'hostile';
    hp: number;
    maxHp: number;
    tempHp: number;
    ac: number;
    speed: number;
    attack: number;
    damage: string;
    range: number;
    weapon: string;
    dex: number;
    skills: Record<string, number>;
    inventory: Record<string, number>;
    resources: Record<string, number>;
    abilityIds: string[];
    conditions: {
        id: string;
        remainingRounds: number;
    }[];
    roomId: string;
    description: string;
    personality: string;
};
export type Interactable = Point & {
    id: string;
    name: string;
    kind: 'npc' | 'door' | 'chest' | 'clue' | 'altar' | 'rest';
    roomId: string;
    open: boolean;
    locked: boolean;
    looted: boolean;
    description: string;
};
export type Room = {
    id: string;
    name: string;
    subtitle: string;
    description: string;
    dmNotes: string;
    rect: [
        number,
        number,
        number,
        number
    ];
};
export type Combat = {
    id: string;
    order: string[];
    active: number;
    round: number;
    serial: number;
    actionUsed: boolean;
    bonusUsed: boolean;
    movementUsed: number;
};
export type GameState = {
    schemaVersion: 1;
    contentVersion: string;
    id: string;
    name: string;
    playerName: string;
    version: number;
    createdAt: string;
    worldTime: number;
    status: 'playing' | 'victory' | 'defeat';
    actors: Actor[];
    objects: Interactable[];
    combat: Combat | null;
    discovered: string[];
    flags: Record<string, boolean>;
    claims: string[];
    gold: number;
    xp: number;
    journal: string[];
    summary: string;
    summaryThroughVersion: number;
    ending: string | null;
};
export type Command = {
    type: 'move' | 'attack' | 'use_ability' | 'use_item' | 'interact' | 'talk' | 'end_turn';
    actorId: string;
    targetId?: string;
    itemId?: string;
    abilityId?: string;
    interactionId?: string;
    path?: Point[];
    x?: number;
    y?: number;
};
export type DomainEvent = {
    type: string;
    text: string;
    actorId?: string;
    targetId?: string;
    data?: Record<string, unknown>;
};
export type Dice = {
    id: string;
    expr: string;
    rolls: number[];
    modifier: number;
    total: number;
    purpose: string;
    checkId: string;
    mode: 'normal' | 'adv' | 'dis';
};
export type Resolution = {
    state: GameState;
    events: DomainEvent[];
    dice: Dice[];
    commands: Command[];
};
export type ProviderConfig = {
    mode: 'mock' | 'openai';
    baseUrl: string;
    model: string;
    apiKey: string;
    jsonMode: 'off' | 'json_object';
    timeoutMs: number;
    maxTokens: number;
    temperature: number;
    contextChars: number;
    extraBody: Record<string, unknown>;
};
export type View = Omit<GameState, 'actors' | 'objects' | 'flags'> & {
    actors: Omit<Actor, 'personality'>[];
    objects: Interactable[];
    rooms: Omit<Room, 'dmNotes'>[];
    map: {
        width: number;
        height: number;
        tiles: number[][];
        known: number[][];
        obstacles: Point[];
    };
    objectives: {
        id: string;
        title: string;
        done: boolean;
    }[];
    activeActorId: string | null;
    facts: string[];
};
export class GameError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 400) { super(message); this.name = 'GameError'; this.code = code; this.status = status; }
}
