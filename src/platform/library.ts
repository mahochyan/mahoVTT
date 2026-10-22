import { newGame, ROOMS } from '../world.ts';

/** Read-only content library derived from the bundled world. */
export function library() {
    const s = newGame('内容库', '内容库');
    return {
        monsters: s.actors.filter((a) => a.faction === 'hostile').map((a) => ({
            id: a.id, name: a.name, role: a.role, hp: a.maxHp, ac: a.ac, attack: a.attack,
            damage: a.damage, range: a.range, room: a.roomId,
        })),
        npcs: s.objects.filter((o) => o.kind === 'npc').map((o) => ({
            id: o.id, name: o.name, description: o.description, room: o.roomId,
        })),
        items: [
            { id: 'potion', name: '治疗药水', kind: '消耗品', effect: '恢复 2d4+2 生命', source: '宝箱 / 初始背包' },
            { id: 'key', name: '调谐钥匙', kind: '任务物品', effect: '交付给伊蕾娅完成任务', source: '调谐祭坛' },
        ],
        maps: ROOMS.map((r) => ({
            id: r.id, name: r.name, subtitle: r.subtitle, description: r.description, rect: r.rect,
        })),
    };
}
