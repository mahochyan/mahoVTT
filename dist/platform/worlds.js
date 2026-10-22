import { BOOK, ROOMS, publicBook } from "../world.js";
export const WORLDS = [
    {
        id: 'whispering-tower',
        title: BOOK.title,
        subtitle: '五房间短篇冒险',
        tagline: BOOK.tagline,
        description: '钟塔停摆三天，守灯人请你取回调谐钥匙。入口营地、裂石走廊、守卫室、旧储藏室与调谐祭坛组成一段完整冒险，含两名 AI 同伴与三种结局。',
        genre: '暗色奇幻',
        system: '灰灯 d20',
        rooms: ROOMS.length,
        status: 'ready',
        cover: null,
        features: ['五房间战术地图', '两名 AI 同伴', '三幕主线 + 三项可选目标', '本地自动存档'],
    },
];
export function getWorld(id) {
    return WORLDS.find((w) => w.id === id);
}
export function worldBook(id) {
    if (!getWorld(id))
        return null;
    const b = publicBook();
    return { title: b.title, tagline: b.tagline, premise: b.premise, tone: b.tone, entries: b.entries };
}
