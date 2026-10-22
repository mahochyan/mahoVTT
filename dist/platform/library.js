/** Read-only content library for scenario packs.
 * The old demo scenario was removed; this returns empty until a pack lands. */
export function library() {
    return { monsters: [], npcs: [], items: [], maps: [] };
}
