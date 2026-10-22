export type AbilityDef = {
    id: string;
    name: string;
    cost: 'action' | 'bonus';
    target: 'self' | 'ally' | 'enemy';
    range?: number;
    dice: string;
    kind: 'heal' | 'attack';
    requiresHpBelowMax?: boolean;
    resource?: string;
    uses?: number;
    description: string;
};

export const ABILITIES: Record<string, AbilityDef> = {
    second_wind: {
        id: 'second_wind', name: '回气', cost: 'bonus', target: 'self', dice: '1d10+3',
        kind: 'heal', requiresHpBelowMax: true, resource: 'secondWind', uses: 1,
        description: '战士的附赠动作，恢复少量生命，长休后恢复一次。',
    },
    heal: {
        id: 'heal', name: '疗愈术', cost: 'action', target: 'ally', range: 6, dice: '1d8+4',
        kind: 'heal', requiresHpBelowMax: true, resource: 'heal', uses: 4,
        description: '六格内可见同伴恢复生命，每次长休恢复四次。',
    },
    radiance: {
        id: 'radiance', name: '灯辉术', cost: 'action', target: 'enemy', range: 8, dice: '1d8+3',
        kind: 'attack', description: '八格内的远程圣光攻击。',
    },
    aimed_shot: {
        id: 'aimed_shot', name: '瞄准射击', cost: 'action', target: 'enemy', range: 12, dice: '1d8+3',
        kind: 'attack', description: '凝聚呼吸后的精准射击。',
    },
};

export const ABILITY_IDS = Object.keys(ABILITIES);

export function actorAbilities(ids: string[] | undefined): AbilityDef[] {
    return (ids ?? []).map((id) => ABILITIES[id]).filter((x): x is AbilityDef => !!x);
}

export function maxUses(def: AbilityDef): number {
    return def.uses ?? 1;
}
