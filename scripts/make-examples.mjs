import { Store } from '../dist/db/store.js';
import { newGame } from '../dist/world.js';
import { fullAdventure } from '../tests/helpers.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('examples', { recursive: true });
mkdirSync('tests/fixtures', { recursive: true });
const store = new Store(':memory:');
let first = true, saved = false;
const result = fullAdventure(73, (before, r) => { if (first) {
    store.create(before);
    writeFileSync('examples/01-new-adventure.json', JSON.stringify(store.export(before.id), null, 2));
    first = false;
} const lease = store.reserve(before.id, 'example-' + before.version, r.commands, '示例行动', 'player', 'seeded-rules-demo', before.version); store.commit(lease.turn, lease.owner, r, r.commands); store.setNarrative(lease.turn.id, r.events.map(x => x.text).join('\n')); if (!saved && r.state.discovered.includes('guard') && r.state.combat && r.state.combat.order[r.state.combat.active] === 'pc') {
    writeFileSync('examples/02-guardroom-battle.json', JSON.stringify(store.export(before.id), null, 2));
    saved = true;
} }, { name: '灰灯镇：无声钟塔', playerName: '旅人' });
writeFileSync('examples/03-completed-adventure.json', JSON.stringify(store.export(result.state.id), null, 2));
const fixture = newGame('UI 战斗验证', '界面测试者');
fixture.actors[0].x = 12;
fixture.actors[0].y = 14;
fixture.actors[0].roomId = 'hall';
fixture.discovered.push('hall');
fixture.objects.find(o => o.id === 'door_entry').open = true;
fixture.combat = { id: 'ui-test-fight', order: ['pc', 'g1'], active: 0, round: 1, serial: 1, actionUsed: false, bonusUsed: false, movementUsed: 0 };
store.create(fixture);
writeFileSync('tests/fixtures/combat.json', JSON.stringify(store.export(fixture.id), null, 2));
console.log(JSON.stringify({ steps: result.steps, version: result.state.version, gold: result.state.gold, xp: result.state.xp, allGoals: result.state.flags }, null, 2));
store.close();
