import { assertAllowedSource, type SourceBookId } from './sources.ts';

export type VerificationStatus = 'verified' | 'external-unverified' | 'draft' | 'missing';

export type RuleEntry = {
    id: string;
    value: unknown;
    sourceBook: SourceBookId;
    printedPage: number;
    pdfPage?: number;
    errataRef?: string;
    verification: VerificationStatus;
    notes?: string;
};

/** C7 rule registry. Every entry is traceable to a page and an errata state.
 * Values are mechanical formulas, not reproduced prose. */
export const RULES: readonly RuleEntry[] = [
    {
        id: 'dice.icons',
        value: { blank: [1, 2, 3], icon: [4, 5], exalted: [6], exaltedCountsAs: 2 },
        sourceBook: 'wg-c7-core', printedPage: 158, pdfPage: 159, verification: 'verified',
        notes: 'Wrath Die is one die of the pool; a 6 is also a Wrath Critical/Glory trigger.',
    },
    {
        id: 'dn.reference',
        value: { routine: 1, standard: 3, challenging: 5, difficult: 7, extreme: 9, nearImpossible: 11, note: 'guidance, not a closed enum; scenario may set 4 or 10' },
        sourceBook: 'wg-c7-core', printedPage: 160, pdfPage: 161, verification: 'verified',
    },
    {
        id: 'maxWounds',
        value: { printed: 'toughness + tier', target: 'toughness + 2 * tier' },
        sourceBook: 'wg-c7-core', printedPage: 37, pdfPage: 38,
        errataRef: 'W&G Rulebook Errata 24/07/2020 (official Cubicle 7 PDF)',
        verification: 'verified',
        notes: 'C7 printed text says Toughness + Tier (also p.193/PDF 194). The official 24/07/2020 errata states Max Wounds = Tier x 2 + Toughness; host blocked direct download, text confirmed via the official errata listing.',
    },
    {
        id: 'maxShock',
        value: 'willpower + tier',
        sourceBook: 'wg-c7-core', printedPage: 195, pdfPage: 196, verification: 'verified',
        notes: 'Start at 0 Shock; Exhausted when Shock exceeds Maximum Shock.',
    },
    {
        id: 'defence',
        value: 'initiative - 1 (minimum 1)',
        sourceBook: 'wg-c7-core', printedPage: 36, pdfPage: 37, verification: 'verified',
    },
    {
        id: 'resilience',
        value: 'toughness + 1 + armour',
        sourceBook: 'wg-c7-core', printedPage: 41, pdfPage: 42, verification: 'verified',
        notes: 'Official calculated character sheet uses the same formula.',
    },
    {
        id: 'determination.pool',
        value: 'toughness dice; each Icon converts 1 Wound to 1 Shock; no DN, no Wrath Die',
        sourceBook: 'wg-c7-core', printedPage: 196, pdfPage: 197, verification: 'verified',
    },
    {
        id: 'wounds.start',
        value: 0,
        sourceBook: 'wg-c7-core', printedPage: 194, pdfPage: 195, verification: 'verified',
        notes: 'Wounds are cumulative damage taken, not a decreasing HP pool.',
    },
    {
        id: 'wounded.penalty',
        value: { condition: 'woundsTaken > 0', dnPenalty: 1 },
        sourceBook: 'wg-c7-core', printedPage: 194, pdfPage: 195, verification: 'verified',
        notes: 'Any Wounds makes the character Wounded: +1 DN to all Tests. No half-health tiers.',
    },
    {
        id: 'dying.threshold',
        value: { condition: 'woundsTaken > maxWounds', immediate: 'Memorable Injury', furtherWounds: 'Traumatic Injury', death: 'traumaticInjuries > tier + 1' },
        sourceBook: 'wg-c7-core', printedPage: 194, pdfPage: 195, verification: 'verified',
    },
    {
        id: 'annihilation',
        value: 'single attack damage > 2 * maxWounds',
        sourceBook: 'wg-c7-core', printedPage: 195, pdfPage: 196, verification: 'verified',
    },
    {
        id: 'wrath.start',
        value: 2,
        sourceBook: 'wg-c7-core', printedPage: 162, pdfPage: 163, verification: 'verified',
    },
    {
        id: 'glory.start',
        value: 0,
        sourceBook: 'wg-c7-core', printedPage: 162, pdfPage: 163, verification: 'verified',
    },
    {
        id: 'ruin.start',
        value: 'playerCount',
        sourceBook: 'wg-c7-core', printedPage: 320, pdfPage: 321, verification: 'verified',
    },
    {
        id: 'ruin.max',
        value: '2 * playerCount',
        sourceBook: 'wg-c7-core', printedPage: 320, pdfPage: 321, verification: 'verified',
    },
    {
        id: 'wrathCritical.player',
        value: { trigger: 'Wrath Die = 6', effect: '+1 Glory; Critical Hit only if the attack succeeded' },
        sourceBook: 'wg-c7-core', printedPage: 162, pdfPage: 163, verification: 'verified',
    },
    {
        id: 'wrathCritical.gm',
        value: { trigger: 'Wrath Die = 6 on a GM roll', effect: '+1 Ruin' },
        sourceBook: 'wg-c7-core', printedPage: 320, pdfPage: 321, verification: 'verified',
    },
    {
        id: 'attack.melee',
        value: 'initiative + weaponSkill vs Defence; add Strength to damage',
        sourceBook: 'wg-c7-core', printedPage: 183, pdfPage: 184, verification: 'verified',
    },
    {
        id: 'attack.ranged',
        value: 'agility + ballisticSkill vs Defence',
        sourceBook: 'wg-c7-core', printedPage: 183, pdfPage: 184, verification: 'verified',
    },
    {
        id: 'weapon.ranges',
        value: { bands: ['short', 'medium', 'long'], short: '+1 bonus die', beyondMedium: '+2 Defence', beyondLong: 'automatic miss' },
        sourceBook: 'wg-c7-core', printedPage: 184, pdfPage: 185, verification: 'verified',
        notes: 'Each weapon stores three distances; never derive them as medium x2.',
    },
    {
        id: 'damage.resilience',
        value: { equal: '1d3 Shock', greater: 'difference in Wounds' },
        sourceBook: 'wg-c7-core', printedPage: 193, pdfPage: 194, verification: 'verified',
    },
    {
        id: 'tier.bonusDice',
        value: { tier1: 4, tier2: 5, tier3: 6, tier4: 7, tier5: 8 },
        sourceBook: 'wg-c7-core', printedPage: 161, pdfPage: 162, verification: 'draft',
        notes: 'Old-lineage rule; verify against C7 before enabling in play.',
    },
    {
        id: 'tier.buySuccess',
        value: 'tier x 2 icons',
        sourceBook: 'wg-c7-core', printedPage: 161, pdfPage: 162, verification: 'draft',
        notes: 'Old-lineage rule; verify against C7 before enabling in play.',
    },
];

export function getRule(id: string): RuleEntry | undefined {
    return RULES.find((r) => r.id === id);
}

export function requireRule(id: string): RuleEntry {
    const rule = getRule(id);
    if (!rule)
        throw new Error(`Unknown W&G rule "${id}"`);
    return rule;
}

/** Loader gate: reject foreign editions and untraceable entries. */
export function validateRegistry(entries: readonly RuleEntry[] = RULES): void {
    for (const rule of entries) {
        assertAllowedSource(rule.sourceBook);
        if (!Number.isInteger(rule.printedPage) || rule.printedPage < 1)
            throw new Error(`Rule ${rule.id} has no valid printed page.`);
        if (rule.verification === 'external-unverified' && !rule.errataRef)
            throw new Error(`Rule ${rule.id} is external-unverified but has no errata reference.`);
    }
}

export function rulesByStatus(status: VerificationStatus): RuleEntry[] {
    return RULES.filter((r) => r.verification === status);
}
