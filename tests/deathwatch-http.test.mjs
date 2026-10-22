import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const dataDir = mkdtempSync(join(tmpdir(), 'maho-dw-http-'));
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
  throw new Error('test server did not start: ' + stderr);
}
async function stop() {
  if (!app || app.exitCode !== null) return;
  const done = new Promise(r => app.once('exit', r));
  app.kill('SIGKILL');
  await done;
}
async function req(path, body, method) {
  const r = await fetch(base + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: body ? {'Content-Type': 'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return {status: r.status, data: text ? JSON.parse(text) : null};
}
const squad = () => [
  {id: 'pc', name: '塞维鲁', chapter: 'ultramarines', specialty: 'tactical', chapterChoice: ['ws', 'bs']},
  {id: 'ally-1', name: '凯', chapter: 'blood-angels', specialty: 'assault'},
  {id: 'ally-2', name: '德拉科', chapter: 'dark-angels', specialty: 'devastator'},
];
async function create(over = {}) {
  const r = await req('/api/games/deathwatch-d100/sessions', {
    title: 'HTTP 隔离测试', missionId: 'watchstation-vigil', missionVersion: '1.0.0',
    leaderId: 'pc', oathId: 'astartes', weaponProfile: 'core', squad: squad(), ...over,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.state;
}

before(async () => { port = await freePort(); base = `http://127.0.0.1:${port}`; await start(); });
after(async () => { await stop(); rmSync(dataDir, {recursive: true, force: true}); });

test('大厅登记 Deathwatch 模块并给出目录', async () => {
  const games = await req('/api/games');
  assert.equal(games.status, 200);
  assert.deepEqual(games.data.games.map(g => g.id), ['deathwatch-d100']);
  const root = await req('/api/games/deathwatch-d100');
  assert.equal(root.status, 200);
  assert.equal(root.data.module.id, 'deathwatch-d100');
  assert.ok(root.data.catalog.chapters.length === 6);
  assert.ok(root.data.catalog.specialties.length === 6);
  assert.ok(root.data.missions.length >= 1);
});

test('模块页面与资源可访问', async () => {
  for (const [path, type] of [['/games/deathwatch/index.html', 'text/html'], ['/games/deathwatch/app.js', 'text/javascript'], ['/games/deathwatch/style.css', 'text/css']]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    assert.ok((r.headers.get('content-type') || '').includes(type), path);
  }
});

test('创建存档、读取快照、执行移动并落库', async () => {
  const s = await create();
  assert.equal(s.phase, 'exploration');
  const snap = await req(`/api/games/deathwatch-d100/sessions/${s.id}`);
  assert.equal(snap.status, 200);
  assert.equal(snap.data.state.version, 0);
  assert.equal(snap.data.state.actors.length, 3);
  const moved = await req(`/api/games/deathwatch-d100/sessions/${s.id}/commands`, {
    requestId: randomUUID(), expectedVersion: 0,
    command: {type: 'move', actorId: 'pc', x: 3, y: 7, pace: 'half'},
  });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.stateVersion, 1);
  const again = await req(`/api/games/deathwatch-d100/sessions/${s.id}`);
  assert.equal(again.data.state.version, 1);
  assert.equal(again.data.state.actors.find(a => a.id === 'pc').x, 3);
});

test('同一 requestId 重发返回原结果，不重复结算', async () => {
  const s = await create();
  const id = randomUUID();
  const body = {requestId: id, expectedVersion: 0, command: {type: 'move', actorId: 'pc', x: 2, y: 6, pace: 'half'}};
  const first = await req(`/api/games/deathwatch-d100/sessions/${s.id}/commands`, body);
  const second = await req(`/api/games/deathwatch-d100/sessions/${s.id}/commands`, body);
  assert.equal(second.status, 200);
  assert.equal(second.data.replayed, true);
  assert.equal(second.data.stateVersion, first.data.stateVersion);
  const snap = await req(`/api/games/deathwatch-d100/sessions/${s.id}`);
  assert.equal(snap.data.state.version, 1);
});

test('旧版本与非法命令被拒绝，状态不变', async () => {
  const s = await create();
  await req(`/api/games/deathwatch-d100/sessions/${s.id}/commands`, {
    requestId: randomUUID(), expectedVersion: 0,
    command: {type: 'move', actorId: 'pc', x: 2, y: 6, pace: 'half'},
  });
  const stale = await req(`/api/games/deathwatch-d100/sessions/${s.id}/commands`, {
    requestId: randomUUID(), expectedVersion: 0,
    command: {type: 'move', actorId: 'pc', x: 2, y: 5, pace: 'half'},
  });
  assert.equal(stale.status, 409);
  const illegal = await req(`/api/games/deathwatch-d100/sessions/${s.id}/commands`, {
    requestId: randomUUID(), expectedVersion: 1,
    command: {type: 'attack', actorId: 'pc', targetId: 'not-there', mode: 'single'},
  });
  assert.equal(illegal.status, 404);
  const snap = await req(`/api/games/deathwatch-d100/sessions/${s.id}`);
  assert.equal(snap.data.state.version, 1);
});

test('模型未配置时自由输入返回明确错误，不写状态', async () => {
  const s = await create();
  const r = await req(`/api/games/deathwatch-d100/sessions/${s.id}/plan`, {
    input: '我想开枪', actorId: 'pc', expectedVersion: 0,
  });
  assert.equal(r.status, 400);
  assert.match(r.data.error.message, /需要接入模型/);
  const snap = await req(`/api/games/deathwatch-d100/sessions/${s.id}`);
  assert.equal(snap.data.state.version, 0);
});

test('SIGKILL 后已提交状态恢复，重发原请求不重做', async () => {
  const s = await create();
  const id = randomUUID();
  const body = {requestId: id, expectedVersion: 0, command: {type: 'move', actorId: 'pc', x: 3, y: 7, pace: 'half'}};
  await req(`/api/games/deathwatch-d100/sessions/${s.id}/commands`, body);
  await stop();
  await start();
  const snap = await req(`/api/games/deathwatch-d100/sessions/${s.id}`);
  assert.equal(snap.data.state.version, 1);
  const replay = await req(`/api/games/deathwatch-d100/sessions/${s.id}/commands`, body);
  assert.equal(replay.data.replayed, true);
  const after = await req(`/api/games/deathwatch-d100/sessions/${s.id}`);
  assert.equal(after.data.state.version, 1);
});
