import { assertAllowedSource, type SourceBookId } from './sources.ts';
import { defence, influence, maxShock, maxWounds, resilience, resolve } from './formulas.ts';

export type AttributeBlock = {
    strength: number;
    toughness: number;
    agility: number;
    initiative: number;
    willpower: number;
    intellect: number;
    fellowship: number;
};

export type Pregen = {
    id: string;
    name: string;
    archetype: string;
    tier: number;
    xpCost: number;
    attributes: AttributeBlock;
    skills: Record<string, number>;
    talents: string[];
    abilities: string[];
    gear: string[];
    keywords: string[];
    armour?: number;
    sourceBook: SourceBookId;
    printedPage: number;
    verification: 'verified' | 'draft' | 'missing';
};

const ATTRIBUTES: (keyof AttributeBlock)[] = ['strength', 'toughness', 'agility', 'initiative', 'willpower', 'intellect', 'fellowship'];

export function validatePregen(p: Pregen): string[] {
    const errors: string[] = [];
    if (p.tier !== 1)
        errors.push('Gate A party is fixed at Tier 1.');
    if (!Number.isInteger(p.xpCost) || p.xpCost <= 0)
        errors.push('xpCost must be a positive integer.');
    for (const key of ATTRIBUTES) {
        if (!Number.isInteger(p.attributes[key]) || p.attributes[key] < 1)
            errors.push(`Attribute ${key} must be an integer >= 1.`);
    }
    for (const [skill, value] of Object.entries(p.skills)) {
        if (!Number.isInteger(value) || value < 0)
            errors.push(`Skill ${skill} must be an integer >= 0.`);
    }
    if (!p.name.trim() || !p.archetype.trim())
        errors.push('name and archetype are required.');
    if (!p.keywords.includes('IMPERIUM'))
        errors.push('Graveyard Shift pregens must have the IMPERIUM keyword.');
    if (!Number.isInteger(p.printedPage) || p.printedPage < 1)
        errors.push('printedPage is required.');
    try {
        assertAllowedSource(p.sourceBook);
    }
    catch (error) {
        errors.push((error as Error).message);
    }
    return errors;
}

export function derivedTraits(p: Pregen, options: { errataWounds?: boolean } = {}) {
    const a = p.attributes;
    return {
        defence: defence(a.initiative),
        resilience: resilience(a.toughness, Number(p.armour) || 0),
        maxWounds: maxWounds(a.toughness, p.tier, { errata: options.errataWounds ?? true }),
        maxShock: maxShock(a.willpower, p.tier),
        resolve: resolve(a.willpower),
        influence: influence(a.fellowship),
    };
}
