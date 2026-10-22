import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let app, base, dataDir;

async function freePort() {
    const s = createServer();
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const port = s.address().port;
    await new Promise((r) => s.close(r));
    return port;
}
async function get(path) {
    const r = await fetch(base + path);
    return { status: r.status, data: await r.json().catch(() => null) };
}
async function post(path, body) {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => null) };
}

before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'graylight-wg-'));
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    app = spawn(process.execPath, ['dist/server.js'], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, PORT: String(port), SAGAS_DATA_DIR: dataDir, AI_PROVIDER: 'mock' },
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    app.stderr.on('data', () => {});
    for (let i = 0; i < 100; i++) {
        try {
            if ((await fetch(base + '/api/health')).ok) return;
        }
        catch { }
        await sleep(40);
    }
    throw new Error('W&G test server did not start');
});

after(async () => {
    if (app && app.exitCode === null) {
        const done = new Promise((r) => app.once('exit', r));
        app.kill('SIGKILL');
        await done;
    }
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

test('W&G module is registered and exposes a training scenario', async () => {
    const listing = await get('/api/games/wrath-glory');
    assert.equal(listing.status, 200);
    assert.equal(listing.data.game.id, 'wrath-glory');
    assert.equal(listing.data.game.rulesetId, 'wg-c7');
    assert.equal(listing.data.party.length, 3);
    assert.ok(listing.data.scenarios.some((s) => s.id === 'training'));
});

test('session creation, attack, persistence, and idempotent replay', async () => {
    const created = await post('/api/games/wrath-glory/sessions', { scenarioId: 'training' });
    assert.equal(created.status, 201);
    const id = created.data.session.id;
    const attackerId = created.data.session.party[1].id;
    assert.equal(created.data.session.party.length, 3);
    assert.equal(created.data.session.enemies.length, 1);
    assert.equal(created.data.session.rulesRevision, 'c7-2020-07-24-errata');

    const first = await post(`/api/games/wrath-glory/sessions/${id}/commands`, {
        requestId: 'req-attack-1',
        command: { type: 'attack', attackerId, targetId: 'training-servitor' },
    });
    assert.equal(first.status, 200);
    assert.ok(first.data.session.log.some((line) => line.includes('开火')));

    const replay = await post(`/api/games/wrath-glory/sessions/${id}/commands`, {
        requestId: 'req-attack-1',
        command: { type: 'attack', attackerId, targetId: 'training-servitor' },
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.session.log.length, first.data.session.log.length);

    const loaded = await get(`/api/games/wrath-glory/sessions/${id}`);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.data.session.id, id);
    assert.ok(loaded.data.session.log.length >= 3);

    if (replay.data.session.pending) {
        const pending = replay.data.session.pending;
        const decided = await post(`/api/games/wrath-glory/sessions/${id}/decisions`, {
            requestId: 'req-decision-1',
            decisionId: pending.decisionId,
            choice: 'damage',
        });
        assert.equal(decided.status, 200);
        assert.equal(decided.data.session.pending, null);
        const again = await post(`/api/games/wrath-glory/sessions/${id}/decisions`, {
            requestId: 'req-decision-1',
            decisionId: pending.decisionId,
            choice: 'damage',
        });
        assert.equal(again.status, 200);
        assert.equal(again.data.session.pending, null);
    }
});

test('unknown scenario and missing session return explicit errors', async () => {
    const bad = await post('/api/games/wrath-glory/sessions', { scenarioId: 'not-a-scenario' });
    assert.equal(bad.status, 404);
    assert.equal(bad.data.error.code, 'SCENARIO_NOT_FOUND');
    const missing = await get('/api/games/wrath-glory/sessions/not-a-session');
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error.code, 'SESSION_NOT_FOUND');
});

test('Graveyard Shift private pack supports investigation scenes when installed', async (t) => {
    const listing = await get('/api/games/wrath-glory');
    const installed = listing.data.scenarios.some((s) => s.id === 'graveyard-shift');
    if (!installed)
        return t.skip('private Graveyard Shift pack is not installed in this checkout');

    const created = await post('/api/games/wrath-glory/sessions', { scenarioId: 'graveyard-shift' });
    assert.equal(created.status, 201);
    const id = created.data.session.id;
    assert.equal(created.data.session.scenarioId, 'graveyard-shift');
    assert.ok(created.data.session.scenario.title.includes('停尸间'));

    let session = created.data.session;
    for (let i = 0; i < 6 && !(session.scenario.clues || []).includes('门德斯的简报'); i++) {
        const r = await post(`/api/games/wrath-glory/sessions/${id}/commands`, {
            requestId: `req-slate-${i}`,
            command: { type: 'choose', choiceId: 'read-slate' },
        });
        assert.equal(r.status, 200);
        session = r.data.session;
    }
    assert.ok(session.scenario.clues.includes('门德斯的简报'), 'investigation clue should be obtainable');

    const moved = await post(`/api/games/wrath-glory/sessions/${id}/commands`, {
        requestId: 'req-barastyr',
        command: { type: 'choose', choiceId: 'to-barastyr' },
    });
    assert.equal(moved.status, 200);
    assert.ok(moved.data.session.scenario.part.includes('第二幕'));
    assert.ok(moved.data.session.scenario.choices.some((c) => c.id === 'to-boneyards'));
});

test('AI narrator endpoint returns text without mutating the session', async () => {
    const created = await post('/api/games/wrath-glory/sessions', { scenarioId: 'training' });
    const session = created.data.session;
    const before = JSON.stringify(session.log);
    const r = await post(`/api/games/wrath-glory/sessions/${session.id}/narrate`, { input: '训练场的雨声。' });
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.text, 'string');
    assert.ok(r.data.text.length > 0);
    const loaded = await get(`/api/games/wrath-glory/sessions/${session.id}`);
    assert.equal(JSON.stringify(loaded.data.session.log), before);
});

test('AI GM endpoint returns a proposal without bypassing the rules engine', async () => {
    const created = await post('/api/games/wrath-glory/sessions', { scenarioId: 'training' });
    const session = created.data.session;
    const before = JSON.stringify(session.log);
    const r = await post(`/api/games/wrath-glory/sessions/${session.id}/gm`, { input: '我向训练机仆开火。' });
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.text, 'string');
    assert.ok(r.data.text.length > 0);
    assert.equal(r.data.action, null);
    const loaded = await get(`/api/games/wrath-glory/sessions/${session.id}`);
    assert.equal(JSON.stringify(loaded.data.session.log), before);
});

test('battlefield token movement is persisted in the session', async () => {
    const created = await post('/api/games/wrath-glory/sessions', { scenarioId: 'training' });
    const session = created.data.session;
    const actor = session.party[0];
    assert.ok(actor.position);
    const moved = await post(`/api/games/wrath-glory/sessions/${session.id}/commands`, {
        requestId: 'req-move-1',
        command: { type: 'move', actorId: actor.id, x: 10, y: 9 },
    });
    assert.equal(moved.status, 200);
    assert.deepEqual(moved.data.session.party[0].position, { x: 10, y: 9 });
    const loaded = await get(`/api/games/wrath-glory/sessions/${session.id}`);
    assert.deepEqual(loaded.data.session.party[0].position, { x: 10, y: 9 });
});
