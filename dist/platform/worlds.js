/** Old demo scenarios were removed on 2026-10-22. New ready-to-play scenario
 * packs will populate this registry; the platform renders empty states until
 * then. */
export const WORLDS = [];
export function getWorld(id) {
    return WORLDS.find((w) => w.id === id);
}
export function worldBook(id) {
    return getWorld(id) ? null : null;
}
