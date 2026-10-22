export type WorldDescriptor = {
    id: string;
    title: string;
    subtitle: string;
    tagline: string;
    description: string;
    genre: string;
    system: string;
    rooms: number;
    status: 'ready' | 'soon';
    cover: string | null;
    features: string[];
    companions: { name: string; role: string; note: string }[];
    theme: { accent: string; tint: string; backdrop: string | null };
};

/** Old demo scenarios were removed on 2026-10-22. New ready-to-play scenario
 * packs will populate this registry; the platform renders empty states until
 * then. */
export const WORLDS: WorldDescriptor[] = [];

export function getWorld(id: string): WorldDescriptor | undefined {
    return WORLDS.find((w) => w.id === id);
}

export function worldBook(id: string) {
    return getWorld(id) ? null : null;
}
