import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BUILTIN} from '../modules/deathwatch/content.mjs';
import {DeathwatchStore, validateSave} from '../modules/deathwatch/store.mjs';
import {activeActor, fallbackCommand, newSession, resolve} from '../modules/deathwatch/engine.mjs';

const seq = values => {
  let i = 0;
  return sides => ((values[i++ % values.length] - 1) % sides) + 1;
};
const SPEC = [
  {id: 'pc', name: '塞维鲁', chapter: 'ultramarines', specialty: 'tactical', chapterChoice: ['ws', 'bs']},
  {id: 'ally-1', name: '凯', chapter: 'blood-angels', specialty: 'assault'},
  {id: 'ally-2', name: '德拉科', chapter: 'dark-angels', specialty: 'devastator'},
];

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), 'dw-rec-'));
  const store = new DeathwatchStore(join(dir, 'rec.sqlite'));
  return {dir, store};
}

test('待定决策在进程重启后仍在，并且只能被处理一次', () => {
  const {dir, store} = makeStore();
  try {
    // 用引擎构造一个真实的玩家防御节点：把异形放到主角旁边并让它行动。
    const base = newSession({
      title: '待定恢复', missionId: BUILTIN.id, missionVersion: BUILTIN.version,
      leaderId: 'pc', oathId: 'astartes', squad: SPEC,
    }, BUILTIN, seq([4, 8, 6, 10, 2]));
    base.combat = null;
    base.phase = 'exploration';
    let state = resolve(base, {type: 'travel', actorId: 'pc', sceneId: 'relay'}, 'player', seq([4])).state;
    state = resolve(state, {type: 'travel', actorId: 'pc', sceneId: 'nest'}, 'player', seq([4])).state;
    const pc = state.actors.find(a => a.id === 'pc');
    const xeno = state.actors.find(a => a.id === 'xeno');
    xeno.x = pc.x + 1; xeno.y = pc.y;
    pc.reactions = 1;
    state.combat.active = state.combat.order.indexOf('xeno');
    const hit = resolve(state, {type: 'attack', actorId: 'xeno', targetId: 'pc', mode: 'single'}, 'auto', seq([1, 15, 9]));
    assert.ok(hit.state.pending, '敌人命中后应留下玩家待定节点');
    assert.equal(hit.state.pending.ownerActorId, 'pc');
    const pendingState = hit.state;
    store.insert(pendingState);
    const pendingVersion = pendingState.version;
    store.close();

    const reopened = new DeathwatchStore(join(dir, 'rec.sqlite'));
    try {
      const restored = reopened.get(pendingState.id);
      assert.equal(restored.version, pendingVersion);
      assert.deepEqual(restored.pending, pendingState.pending);
      const choice = restored.pending.choices[0].id;
      const done = reopened.execute(pendingState.id, 'rec:react:0001', pendingVersion,
        {type: 'react', actorId: 'pc', choice}, {random: seq([5])});
      assert.equal(done.state.pending, null);
      const again = reopened.execute(pendingState.id, 'rec:react:0001', pendingVersion,
        {type: 'react', actorId: 'pc', choice}, {random: seq([5])});
      assert.equal(again.replayed, true);
    } finally {
      reopened.close();
    }
  } finally {
    try { store.close(); } catch {}
    rmSync(dir, {recursive: true, force: true});
  }
});

test('导出后篡改深层字段会被拒绝，checksum 不是授权', () => {
  const {dir, store} = makeStore();
  try {
    const created = store.create({
      title: '深层校验', missionId: BUILTIN.id, missionVersion: BUILTIN.version,
      leaderId: 'pc', oathId: 'astartes', squad: SPEC,
    }, seq([4, 8, 6, 10, 2]));
    const save = store.export(created.state.id);
    const tampered = structuredClone(save);
    tampered.state.actors[0].stats.ws = 999;
    assert.throws(() => validateSave(tampered), /校验不一致|属性无效/);
    const tampered2 = structuredClone(save);
    tampered2.state.sceneStates = {ghost: {enemies: [{}]}};
    assert.throws(() => validateSave(tampered2), /场景快照无效|校验不一致/);
    // 原样导入成功，且是新存档
    const imported = store.import(save);
    assert.notEqual(imported.state.id, created.state.id);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('同名不同内容的请求指纹不同，不能复用 requestId', () => {
  const {dir, store} = makeStore();
  try {
    const created = store.create({
      title: '幂等', missionId: BUILTIN.id, missionVersion: BUILTIN.version,
      leaderId: 'pc', oathId: 'astartes', squad: SPEC,
    }, seq([4, 8, 6, 10, 2]));
    const id = created.state.id;
    store.execute(id, 'rec:idem:0001', 0, {type: 'move', actorId: 'pc', x: 2, y: 6}, {random: seq([3])});
    assert.throws(() => store.execute(id, 'rec:idem:0001', 1, {type: 'end_turn', actorId: 'pc'}), /同一请求 ID/);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('导入进行中的存档被拒绝，原库不受影响', () => {
  const {dir, store} = makeStore();
  try {
    const created = store.create({
      title: '进行中', missionId: BUILTIN.id, missionVersion: BUILTIN.version,
      leaderId: 'pc', oathId: 'astartes', squad: SPEC,
    }, seq([4, 8, 6, 10, 2]));
    const id = created.state.id;
    let v2 = store.execute(id, 'rec:travel:0003', 0, {type: 'travel', actorId: 'pc', sceneId: 'relay'}, {random: seq([4])}).stateVersion;
    v2 = store.execute(id, 'rec:travel:0004', v2, {type: 'travel', actorId: 'pc', sceneId: 'nest'}, {random: seq([4])}).stateVersion;
    const save = store.export(id);
    // 人为制造待定状态后导出（导出允许，导入必须拒绝）
    const raw = store.get(id);
    raw.pending = {id: 'x'};
    const bad = {...save, state: raw, checksum: undefined};
    assert.throws(() => store.import(bad), /存档|待定/);
    assert.equal(store.list().length, 1);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
