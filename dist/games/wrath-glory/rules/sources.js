export const ALLOWED_SOURCES = {
    'wg-c7-core': { id: 'wg-c7-core', title: 'Warhammer 40,000 Roleplay: Wrath & Glory — Core Rulebook (C7)', edition: 'c7', role: 'core' },
    'wg-c7-forsaken-guide': { id: 'wg-c7-forsaken-guide', title: "Forsaken System Player's Guide (C7)", edition: 'c7', role: 'supplement' },
    'wg-c7-graveyard-shift': { id: 'wg-c7-graveyard-shift', title: 'Graveyard Shift (C7)', edition: 'c7', role: 'scenario' },
};
export const REJECTED_SOURCES = {
    'wg-ulisses-core': '458-page Ulisses-era Core Rules; not the C7 baseline',
};
export function assertAllowedSource(id) {
    if (!Object.hasOwn(ALLOWED_SOURCES, id))
        throw new Error(`Rule source "${id}" is not allowed. Only C7 sources may enter W&G rule data.`);
}
export function isRejectedSource(id) {
    return Object.hasOwn(REJECTED_SOURCES, id);
}
