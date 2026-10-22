/** Source lock for the Wrath & Glory module.
 *
 * Only C7-era books plus the explicitly registered Graveyard Shift scenario
 * may enter rule data. The 458-page Ulisses-era core is deliberately rejected:
 * mixing the two printings produces rules that pass tests but are not the
 * edition we claim to implement.
 */
export type SourceBookId = 'wg-c7-core' | 'wg-c7-forsaken-guide' | 'wg-c7-graveyard-shift';

export type SourceBook = {
    id: SourceBookId;
    title: string;
    edition: 'c7';
    role: 'core' | 'supplement' | 'scenario';
};

export const ALLOWED_SOURCES: Record<SourceBookId, SourceBook> = {
    'wg-c7-core': { id: 'wg-c7-core', title: 'Warhammer 40,000 Roleplay: Wrath & Glory — Core Rulebook (C7)', edition: 'c7', role: 'core' },
    'wg-c7-forsaken-guide': { id: 'wg-c7-forsaken-guide', title: "Forsaken System Player's Guide (C7)", edition: 'c7', role: 'supplement' },
    'wg-c7-graveyard-shift': { id: 'wg-c7-graveyard-shift', title: 'Graveyard Shift (C7)', edition: 'c7', role: 'scenario' },
};

export const REJECTED_SOURCES = {
    'wg-ulisses-core': '458-page Ulisses-era Core Rules; not the C7 baseline',
} as const;

export type RejectedSourceId = keyof typeof REJECTED_SOURCES;

export function assertAllowedSource(id: string): asserts id is SourceBookId {
    if (!Object.hasOwn(ALLOWED_SOURCES, id))
        throw new Error(`Rule source "${id}" is not allowed. Only C7 sources may enter W&G rule data.`);
}

export function isRejectedSource(id: string): id is RejectedSourceId {
    return Object.hasOwn(REJECTED_SOURCES, id);
}
