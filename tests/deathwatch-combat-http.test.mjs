import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const dataDir = mkdtempSync(join(tmpdir(), 'maho-dw-combat-'));
let app, base, port;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function freePort() {
  const s = createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise(r => s.close(r));
  return p;
}
async function start() {
  app = spawn(process.execPath, ['dist/server.js'], {
    cwd: new URL('../', import.meta.url),
    env: {...process.env, PORT: String(port), SAGAS_DATA_DIR: dataDir, AI_PROVIDER: 'mock'},
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  app.stderr.on('data', d => { stderr += d.toString(); });
  for (let i = 0; i < 150; i++) {
    if (app.exitCode !== null) throw new Error('server exited: ' + stderr);
    try { const r = await fetch(base + '/api/health'); if (r.ok) return; } catch {}
    await sleep(40);
  }
  throw new Error('server did not start: ' + stderr);
}
async function stop() {
  if (!app || app.exitCode !== null) return;
  const done = new Promise(r => app.once('exit', r));
  app.kill('SIGKILL');
  await done;
}
async function req(path, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? {'Content-Type': 'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return {status: r.status, data: text ? JSON.parse(text) : null};
}
const SPEC = [
  {id: 'pc', name: '塞维鲁', chapter: 'ultramarines', specialty: 'tactical', chapterChoice: ['ws', 'bs']},
  {id: 'ally-1', name: '凯', chapter: 'blood-angels', specialty: 'assault'},
  {id: 'ally-2', name: '德拉科', chapter: 'dark-angels', specialty: 'devastator'},
];
async function createSession() {
  const r = await req('/api/games/deathwatch-d100/sessions', {
    title: '无 AI 战斗验收', missionId: 'watchstation-vigil', missionVersion: '1.0.0',
    leaderId: 'pc', oathId: 'astartes', squad: SPEC,
    requisition: [{actorId: 'ally-2', weaponId: 'heavy-bolter'}, {actorId: 'pc', weaponId: 'krak'}],
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.state;
}
const S = id => `/api/games/deathwatch-d100/sessions/${id}`;

async function advance(id, version) {
  return req(`${S(id)}/advance`, {expectedVersion: version});
}

/** Let every engine-controlled actor finish its turn; stop when the player acts. */
async function runAiUntilPlayer(id) {
  let state = (await req(S(id))).data.state;
  let guard = 0;
  while (state.combat && guard++ < 60) {
    const active = state.actors.find(a => a.id === state.activeActorId);
    if (!active || active.controller === 'player') return state;
    const r = await advance(id, state.version);
    if (r.status !== 200) throw new Error('advance failed: ' + JSON.stringify(r.data) + ' state=' + JSON.stringify({active: state.activeActorId, combat: !!state.combat, pending: state.pending?.ownerActorId, actors: state.actors.map(a => [a.id, a.controller, a.status])}));
    state = r.data.state;
  }
  return state;
}

function playerAction(state) {
  const active = state.actors.find(a => a.id === state.activeActorId);
  const enemy = state.actors.find(a => a.side === 'enemy' && a.status === 'active');
  if (!enemy) return {type: 'end_turn', actorId: active.id};
  const w = active.readied;
  const melee = ['chainsword', 'knife', 'power-sword', 'force-sword'].includes(w);
  const dist = Math.max(Math.abs(active.x - enemy.x), Math.abs(active.y - enemy.y));
  const weapon = active.inventory[w];
  if (!melee && weapon && weapon.clip === 0 && weapon.reserve > 0) return {type: 'reload', actorId: active.id};
  if (melee && dist > 1) {
    const stepX = active.x + Math.sign(enemy.x - active.x);
    const stepY = active.y + Math.sign(enemy.y - active.y);
    return {type: 'move', actorId: active.id, x: stepX, y: stepY, pace: active.ap >= 2 ? 'full' : 'half'};
  }
  if (!melee && active.aim === 0 && active.ap >= 2) return {type: 'aim', actorId: active.id, full: false};
  return {type: 'attack', actorId: active.id, targetId: enemy.id, mode: active.ap >= 2 && !melee ? 'semi' : (melee && active.ap >= 2 ? 'all_out' : 'single')};
}

async function fight(id, maxSteps = 120) {
  let steps = 0;
  let state = (await req(S(id))).data.state;
  while (state.combat && steps++ < maxSteps) {
    if (state.pending) {
      const r = await req(`${S(id)}/commands`, {
        requestId: randomUUID(), expectedVersion: state.version,
        command: {type: 'react', actorId: state.pending.ownerActorId, choice: 'dodge'},
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      state = r.data.state;
      continue;
    }
    const active = state.actors.find(a => a.id === state.activeActorId);
    if (!active) break;
    if (active.controller === 'player') {
      const r = await req(`${S(id)}/commands`, {
        requestId: randomUUID(), expectedVersion: state.version,
        command: playerAction(state),
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      state = r.data.state;
    } else {
      state = await runAiUntilPlayer(id);
    }
  }
  return {state, steps};
}

before(async () => { port = await freePort(); base = `http://127.0.0.1:${port}`; await start(); });
after(async () => { await stop(); rmSync(dataDir, {recursive: true, force: true}); });

test('无 AI 参与：从探索进入战斗，用按钮式命令打到胜败', async () => {
  const created = await createSession();
  const travel = await req(`${S(created.id)}/commands`, {
    requestId: randomUUID(), expectedVersion: 0,
    command: {type: 'travel', actorId: 'pc', sceneId: 'barracks'},
  });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  assert.ok(travel.data.state.combat, '进入驻军防线后应开始战斗');
  const {state, steps} = await fight(created.id);
  assert.equal(state.combat, null, `战斗未结束（steps=${steps}）`);
  assert.ok(['victory', 'defeat', 'exploration'].includes(state.phase), state.phase);
  const enemies = state.actors.filter(a => a.side === 'enemy');
  assert.ok(enemies.every(e => e.status !== 'active' || state.phase !== 'victory'));
  const snap = await req(S(created.id));
  assert.ok(snap.data.events.length > 5);
  assert.ok(snap.data.state.journal.some(t => /命中|未命中/.test(t)), '应留下攻击结算记录');
});

test('战斗中途 SIGKILL，重启后恢复到同一回合同一待定状态', async () => {
  const created = await createSession();
  await req(`${S(created.id)}/commands`, {
    requestId: randomUUID(), expectedVersion: 0,
    command: {type: 'travel', actorId: 'pc', sceneId: 'barracks'},
  });
  // 打两步，确保有提交过的攻击事件
  let state = await runAiUntilPlayer(created.id);
  for (let i = 0; i < 2 && state.combat; i++) {
    const r = await req(`${S(created.id)}/commands`, {
      requestId: randomUUID(), expectedVersion: state.version, command: playerAction(state),
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    state = r.data.state;
    if (state.combat && !state.pending) state = await runAiUntilPlayer(created.id);
  }
  const beforeRestart = state;
  await stop();
  await start();
  const resumed = (await req(S(created.id))).data.state;
  assert.equal(resumed.version, beforeRestart.version);
  assert.equal(resumed.sceneId, beforeRestart.sceneId);
  assert.deepEqual(resumed.combat, beforeRestart.combat);
  assert.deepEqual(resumed.pending, beforeRestart.pending);
  assert.deepEqual(
    resumed.actors.map(a => [a.id, a.damage, a.critical, a.status]),
    beforeRestart.actors.map(a => [a.id, a.damage, a.critical, a.status]),
  );
  // 重启后还能把这场战斗打完
  const {state: end} = await fight(created.id);
  assert.equal(end.combat, null);
});
