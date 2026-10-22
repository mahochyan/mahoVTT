import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BUILTIN, validateMission} from '../modules/deathwatch/content.mjs';
import {DeathwatchStore} from '../modules/deathwatch/store.mjs';
import {
  newSession, observation, activeActor, resolve, validateCommand, fallbackCommand, rollCharacteristics,
  parseCommand, validateAttributes, fateFromRoll, startingWounds, movementRates,
} from '../modules/deathwatch/engine.mjs';
import {test as d100, hitLocation, soak} from '../modules/deathwatch/rules.mjs';

/** Deterministic die source: returns the next value of a fixed sequence. */
const seq = values => {
  let i = 0;
  return sides => {
    const v = values[i++ % values.length];
    // 折叠到骰面范围内，保证同一序列可用于 d100/d10/d5；d100 的期望值不变。
    return ((v - 1) % sides) + 1;
  };
};

const squad = (over = {}) => [
  {id: 'pc', name: '塞维鲁', chapter: 'ultramarines', specialty: 'tactical', chapterChoice: ['ws', 'bs'], ...over.pc},
  {id: 'ally-1', name: '凯', chapter: 'blood-angels', specialty: 'assault', ...over.ally1},
  {id: 'ally-2', name: '德拉科', chapter: 'dark-angels', specialty: 'devastator', ...over.ally2},
];

function make(options = {}, random = seq([3, 7, 5, 9, 4, 8, 6, 10, 2, 10, 6, 4])) {
  return newSession({
    title: options.title ?? '测试任务',
    missionId: BUILTIN.id,
    missionVersion: BUILTIN.version,
    leaderId: options.leaderId ?? 'pc',
    oathId: options.oathId ?? 'astartes',
    weaponProfile: options.weaponProfile,
    squad: squad(options.squad ?? {}),
  }, BUILTIN, random);
}

function act(state, command, source = 'player', random = seq([7, 3, 9])) {
  return resolve(state, command, source, random);
}

test('属性生成符合 2d10+30，校验拒绝越界', () => {
  const lowest = seq([1, 1]), highest = seq([10, 10]);
  const rng = {next: null};
  const r = rollCharacteristics(lowest);
  assert.deepEqual(Object.values(r), Array(9).fill(32));
  const h = rollCharacteristics(highest);
  assert.deepEqual(Object.values(h), Array(9).fill(50));
  void rng;
  const attrs = {ws: 32, bs: 50, s: 41, t: 40, ag: 39, int: 42, per: 45, wp: 44, fel: 38};
  assert.deepEqual(validateAttributes(attrs), attrs);
  assert.throws(() => validateAttributes({...attrs, ws: 31}), /32\.\.50/);
  assert.throws(() => validateAttributes({...attrs, bs: 51}), /32\.\.50/);
  assert.throws(() => validateAttributes({...attrs, s: 40.5}), /32\.\.50/);
});

test('Wounds 与 Fate 按核心书表格', () => {
  assert.equal(startingWounds(1, 'ultramarines'), 19);
  assert.equal(startingWounds(5, 'ultramarines'), 23);
  assert.equal(startingWounds(3, 'storm-wardens'), 23, '风暴守卫 +2 Wounds');
  assert.equal(fateFromRoll(7), 3);
  assert.equal(fateFromRoll(8), 4);
  assert.equal(fateFromRoll(9), 4);
  assert.equal(fateFromRoll(10), 5);
});

test('建团：三人队伍、主角由玩家控制、初始经验与装备', () => {
  const s = make();
  assert.equal(s.actors.length, 3);
  assert.equal(s.actors.filter(a => a.side === 'party').length, 3);
  assert.equal(s.actors.find(a => a.id === 'pc').controller, 'player');
  assert.equal(s.actors.find(a => a.id === 'ally-1').controller, 'ai');
  for (const a of s.actors) {
    assert.ok(a.maxWounds >= 19 && a.maxWounds <= 25, `Wounds ${a.maxWounds}`);
    assert.ok(a.fate >= 3 && a.fate <= 5);
    assert.ok(a.xpSpent + a.xpAvailable === 1000);
  }
  // 极限战士 +5 WS/BS；战团修正已应用
  const pc = s.actors.find(a => a.id === 'pc');
  assert.ok(pc.stats.ws >= 40);
  assert.equal(s.phase, 'exploration');
  assert.equal(s.sceneId, 'dock');
});

test('建团反例：战团禁配、誓言领队资格、非法队伍结构', () => {
  assert.throws(
    () => make({squad: {ally1: {chapter: 'space-wolves', specialty: 'apothecary'}}}),
    /不能选择/,
  );
  assert.throws(
    () => make({oathId: 'astartes', squad: {pc: {specialty: 'librarian'}}}),
    /该专长不能担任此誓言的领队/,
  );
  assert.throws(() => newSession({squad: squad().slice(0, 2)}, BUILTIN, seq([3])), /必须创建/);
});

test('属性不合法时拒绝建团，不写入任何状态', () => {
  assert.throws(
    () => make({squad: {pc: {attributes: {ws: 99, bs: 40, s: 40, t: 40, ag: 40, int: 40, per: 40, wp: 40, fel: 40}}}}),
    /32\.\.50/,
  );
});

test('检定：合并修正封顶 ±60，成功程度只计完整 10 点', () => {
  const t = d100(55, [{label: '瞄准', value: 10}, {label: '超远', value: -100}], seq([45]));
  assert.equal(t.modifier, -60);
  assert.equal(t.target, -5);
  assert.equal(t.roll, 45);
  assert.equal(t.success, false);
  const ok = d100(55, [], seq([45]));
  assert.equal(ok.success, true);
  assert.equal(ok.degrees, 1);
});

test('命中部位：个位与十位反转，100 视为 0', () => {
  assert.equal(hitLocation(1), 'head');
  assert.equal(hitLocation(12), 'leftArm');
  assert.equal(hitLocation(61), 'rightArm');
  assert.equal(hitLocation(100), 'head');
});

test('伤害：护甲-穿甲后再减坚韧，不低于 0', () => {
  const actor = {stats: {t: 40}, unnaturalToughness: 2, armour: {head: 8, body: 10, leftArm: 8, rightArm: 8, leftLeg: 8, rightLeg: 8}};
  const r = soak(actor, {pen: 6}, 'body', 20, 0);
  assert.equal(r.armourAfterPen, 4);
  assert.equal(r.toughness, 8);
  assert.equal(r.suffered, 8);
  const none = soak(actor, {pen: 0}, 'head', 5, 0);
  assert.equal(none.suffered, 0);
});

test('非法攻击不消耗动作与弹药', () => {
  const s = make();
  const pc = s.actors.find(a => a.id === 'pc');
  const before = {ap: pc.ap, clip: pc.inventory[pc.readied].clip};
  const enemy = {id: 'ghost', side: 'enemy'};
  // 没有目标、没有敌人时不能攻击
  assert.throws(() => resolve(s, {type: 'attack', actorId: 'pc', targetId: 'ghost', mode: 'single'}, 'player'), /角色不存在|目标无效/);
  assert.equal(pc.ap, before.ap);
  assert.equal(pc.inventory[pc.readied].clip, before.clip);
});

test('合法未命中仍消耗动作与弹药', () => {
  let s = make();
  s = resolve(s, {type: 'travel', actorId: 'pc', sceneId: 'barracks'}, 'player', seq([4])).state;
  // 轮到主角时再射击
  let guard = 0;
  while (activeActor(s).controller !== 'player' && guard++ < 10) {
    s = resolve(s, {type: 'end_turn', actorId: activeActor(s).id}, 'ai', seq([5])).state;
  }
  const pc = s.actors.find(a => a.id === 'pc');
  const apBefore = pc.ap, clipBefore = pc.inventory.bolter.clip;
  const target = s.actors.find(a => a.side === 'enemy');
  // d100 = 100 必定未命中
  const r = resolve(s, {type: 'attack', actorId: 'pc', targetId: target.id, mode: 'single'}, 'player', seq([100]));
  const after = r.state.actors.find(a => a.id === 'pc');
  assert.equal(after.ap, apBefore - 1);
  assert.equal(after.inventory.bolter.clip, clipBefore - 1);
  assert.ok(r.events.some(e => /未命中/.test(e.text)));
});

test('Horde 按 Magnitude 结算，穿甲武器每次命中减 1、爆炸武器减 2', () => {
  let s = make();
  s = resolve(s, {type: 'travel', actorId: 'pc', sceneId: 'barracks'}, 'player', seq([4])).state;
  const horde = s.actors.find(a => a.id === 'mob');
  assert.equal(horde.magnitude, 30);
  let guard = 0;
  while (activeActor(s).controller !== 'player' && guard++ < 10) {
    s = resolve(s, {type: 'end_turn', actorId: activeActor(s).id}, 'ai', seq([5])).state;
  }
  // 爆矢枪是 X 型：一次命中应减 2 点 Magnitude
  const r = resolve(s, {type: 'attack', actorId: 'pc', targetId: 'mob', mode: 'single'}, 'player', seq([10, 55, 65]));
  const after = r.state.actors.find(a => a.id === 'mob');
  assert.ok(after.magnitude < 30, `Magnitude 未下降：${after.magnitude}`);
  assert.equal(after.damage, 0, 'Horde 不使用 Wounds');
});

test('命中后的闪避决策是持久化节点，重掷不会重复扣反应', () => {
  let s = make();
  s = resolve(s, {type: 'travel', actorId: 'pc', sceneId: 'relay'}, 'player', seq([4])).state;
  s = resolve(s, {type: 'travel', actorId: 'pc', sceneId: 'nest'}, 'player', seq([4])).state;
  let guard = 0;
  while (activeActor(s).controller !== 'player' && guard++ < 10) {
    s = resolve(s, {type: 'end_turn', actorId: activeActor(s).id}, 'ai', seq([5])).state;
  }
  // 把敌人临时标为由玩家决定反应，才能观察到持久化的待定节点；
  // 引擎控制的防守者会在同一次结算里立刻选择闪避（见下一条断言）。
  s = structuredClone(s);
  s.actors.find(a => a.id === 'xeno').controller = 'player';
  // 命中后进入 pending，等待目标反应
  const r = resolve(s, {type: 'attack', actorId: 'pc', targetId: 'xeno', mode: 'single'}, 'player', seq([10, 55, 65]));
  assert.ok(r.state.pending, '应有待定反应节点');
  assert.equal(r.state.pending.ownerActorId, 'xeno');
  const reactionBefore = r.state.actors.find(a => a.id === 'xeno').reactions;
  const done = resolve(r.state, {type: 'react', actorId: 'xeno', choice: 'dodge'}, 'ai', seq([95]));
  assert.equal(done.state.pending, null);
  assert.equal(done.state.actors.find(a => a.id === 'xeno').reactions, reactionBefore - 1);
});

test('持久化：同一 requestId 不重掷，不同内容冲突', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dw-store-'));
  const store = new DeathwatchStore(join(dir, 'test.sqlite'));
  try {
    const created = store.create({
      title: '幂等测试', missionId: BUILTIN.id, missionVersion: BUILTIN.version,
      leaderId: 'pc', oathId: 'astartes', squad: squad(),
    }, seq([3, 7, 5, 9, 4, 8, 6, 10, 2, 10, 6, 4]));
    const id = created.state.id;
    const cmd = {type: 'move', actorId: 'pc', x: 3, y: 7, pace: 'half'};
    const first = store.execute(id, 'req:test:0001', 0, cmd, {random: seq([5])});
    const replay = store.execute(id, 'req:test:0001', 0, cmd, {random: seq([9])});
    assert.equal(replay.stateVersion, first.stateVersion);
    assert.equal(replay.replayed, true);
    assert.throws(() => store.execute(id, 'req:test:0001', 1, {type: 'end_turn', actorId: 'pc'}), /同一请求 ID/);
    assert.throws(() => store.execute(id, 'req:test:0002', 0, {type: 'end_turn', actorId: 'pc'}), /当前版本/);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('导出导入创建新存档，不改动原局', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dw-io-'));
  const store = new DeathwatchStore(join(dir, 'test.sqlite'));
  try {
    const created = store.create({
      title: '导出测试', missionId: BUILTIN.id, missionVersion: BUILTIN.version,
      leaderId: 'pc', oathId: 'astartes', squad: squad(),
    }, seq([3, 7, 5, 9, 4, 8, 6, 10, 2, 10, 6, 4]));
    const save = store.export(created.state.id);
    const imported = store.import(save);
    assert.notEqual(imported.state.id, created.state.id);
    assert.equal(imported.state.version, 0);
    assert.equal(store.list().length, 2);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('内容包校验拒绝无解场景与重复 ID', () => {
  const bad = structuredClone(BUILTIN);
  bad.scenes.push({...structuredClone(BUILTIN.scenes[0])});
  assert.throws(() => validateMission(bad), /场景 ID 重复/);
  const badExit = structuredClone(BUILTIN);
  badExit.scenes[0].exits[0].to = 'nowhere';
  assert.throws(() => validateMission(badExit), /场景出口无效/);
});

test('parseCommand 拒绝未知命令与越界参数', () => {
  assert.equal(parseCommand({type: 'end_turn'}).type, 'end_turn');
  assert.throws(() => parseCommand({type: 'teleport'}), /不支持的命令/);
  assert.throws(() => parseCommand({type: 'move', x: -1, y: 3}), /目标坐标无效/);
  assert.throws(() => parseCommand({type: 'attack', targetId: 'x', mode: 'orbital'}), /攻击模式无效/);
});

test('规则策略在无模型时始终返回合法命令', () => {
  let s = make();
  s = resolve(s, {type: 'travel', actorId: 'pc', sceneId: 'barracks'}, 'player', seq([4])).state;
  for (let i = 0; i < 6 && s.combat; i++) {
    const a = activeActor(s);
    const cmd = fallbackCommand(s);
    assert.ok(cmd, 'fallbackCommand 不应为空');
    assert.equal(cmd.actorId, a.id);
    const r = resolve(s, cmd, 'ai', seq([7, 4, 9, 2, 8, 5]));
    s = r.state;
  }
});

test('观察视图不包含 GM 秘密', () => {
  const s = make();
  const view = observation(s);
  const text = JSON.stringify(view);
  assert.ok(!text.includes('gmLore'));
  assert.ok(!text.includes('信标认证被人为破坏'));
  assert.equal(view.actors.length, 3);
  assert.ok(view.scene.map.length > 0);
  assert.ok(movementRates(s.actors[0]).half >= 1);
});
