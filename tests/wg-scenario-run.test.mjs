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
    dataDir = mkdtempSync(join(tmpdir(), 'graylight-wg-run-'));
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    app = spawn(process.execPath, ['dist/server.js'], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, PORT: String(port), SAGAS_DATA_DIR: dataDir, AI_PROVIDER: 'mock', WG_SEED: '42' },
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
    throw new Error('scenario test server did not start');
});

after(async () => {
    if (app && app.exitCode === null) {
        const done = new Promise((r) => app.once('exit', r));
        app.kill('SIGKILL');
        await done;
    }
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

let seq = 0;
async function command(sid, command) {
    const r = await post(`/api/games/wrath-glory/sessions/${sid}/commands`, { requestId: `run-${++seq}`, command });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data.session;
}
async function decide(sid, pending) {
    const r = await post(`/api/games/wrath-glory/sessions/${sid}/decisions`, {
        requestId: `run-dec-${++seq}`,
        decisionId: pending.decisionId,
        choice: pending.phase === 'shift' ? 'damage' : 'determination',
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data.session;
}
async function chooseUntil(sid, session, choiceId, predicate, limit = 6) {
    for (let i = 0; i < limit; i++) {
        if (predicate(session)) return session;
        session = await command(sid, { type: 'choose', choiceId });
    }
    return session;
}

test('Graveyard Shift can be completed end-to-end with the rules engine', async (t) => {
    const listing = await get('/api/games/wrath-glory');
    if (!listing.data.scenarios.some((s) => s.id === 'graveyard-shift'))
        return t.skip('private pack not installed');
    const created = await post('/api/games/wrath-glory/sessions', { scenarioId: 'graveyard-shift' });
    assert.equal(created.status, 201);
    const sid = created.data.session.id;
    let s = created.data.session;

    s = await chooseUntil(sid, s, 'read-slate', (x) => (x.clues || []).includes('briefing'));
    s = await command(sid, { type: 'choose', choiceId: 'to-barastyr' });
    s = await chooseUntil(sid, s, 'librarium', (x) => (x.clues || []).includes('necropolis-location'));
    s = await command(sid, { type: 'choose', choiceId: 'to-boneyards' });
    s = await chooseUntil(sid, s, 'navigate-guided', (x) => x.scenario.id === 'necropolis', 4);
    assert.equal(s.scenario.id, 'necropolis');
    s = await command(sid, { type: 'choose', choiceId: 'to-descent' });
    assert.equal(s.enemies.length, 1);

    for (let i = 0; i < 80 && !s.scenario?.ending && !s.result; i++) {
        if (s.pending) {
            s = await decide(sid, s.pending);
            continue;
        }
        if (s.enemies.length) {
            const attacker = s.party.find((p) => p.woundsTaken <= p.maxWounds && p.weapon);
            const target = s.enemies.find((e) => e.woundsTaken <= e.maxWounds);
            if (!attacker || !target) break;
            s = await command(sid, { type: 'attack', attackerId: attacker.id, targetId: target.id });
            continue;
        }
        if (s.scenario?.choices?.length) {
            const next = s.scenario.choices.find((c) => ['signal-mendax', 'to-descent', 'to-barastyr', 'to-boneyards'].includes(c.id)) || s.scenario.choices[0];
            s = await command(sid, { type: 'choose', choiceId: next.id });
            continue;
        }
        break;
    }

    if (!s.scenario?.ending && s.scenario?.choices?.length) {
        const signal = s.scenario.choices.find((c) => c.id === 'signal-mendax');
        if (signal) {
            s = await command(sid, { type: 'choose', choiceId: 'signal-mendax' });
            s = await command(sid, { type: 'choose', choiceId: 'defy' });
            for (let i = 0; i < 80 && !s.result && !s.scenario?.ending; i++) {
                if (s.pending) {
                    s = await decide(sid, s.pending);
                    continue;
                }
                if (!s.enemies.length) break;
                const attacker = s.party.find((p) => p.woundsTaken <= p.maxWounds && p.weapon);
                const target = s.enemies.find((e) => e.woundsTaken <= e.maxWounds);
                if (!attacker || !target) break;
                s = await command(sid, { type: 'attack', attackerId: attacker.id, targetId: target.id });
            }
        }
    }

    assert.equal(s.result, 'victory', JSON.stringify({ scene: s.scenario?.id, log: s.log?.slice(-8) }));
    assert.ok(s.scenario?.ending, 'scenario should expose an ending');
});

async function reachRevelations() {
    const created = await post('/api/games/wrath-glory/sessions', { scenarioId: 'graveyard-shift' });
    assert.equal(created.status, 201);
    const sid = created.data.session.id;
    let s = created.data.session;
    s = await command(sid, { type: 'choose', choiceId: 'to-barastyr' });
    s = await chooseUntil(sid, s, 'librarium', (x) => (x.clues || []).includes('necropolis-location'));
    s = await command(sid, { type: 'choose', choiceId: 'to-boneyards' });
    s = await chooseUntil(sid, s, 'navigate-guided', (x) => x.scenario.id === 'necropolis', 5);
    assert.equal(s.scenario.id, 'necropolis');
    s = await command(sid, { type: 'choose', choiceId: 'to-descent' });
    for (let i = 0; i < 100 && !s.result && s.scenario?.id !== 'revelations'; i++) {
        if (s.pending) {
            s = await decide(sid, s.pending);
            continue;
        }
        if (s.enemies.length) {
            const attacker = s.party.find((p) => p.woundsTaken <= p.maxWounds && p.weapon);
            const target = s.enemies.find((e) => e.woundsTaken <= e.maxWounds);
            if (!attacker || !target) break;
            s = await command(sid, { type: 'attack', attackerId: attacker.id, targetId: target.id });
            continue;
        }
        break;
    }
    assert.equal(s.scenario.id, 'revelations', JSON.stringify(s.log.slice(-6)));
    return { sid, s };
}

test('Graveyard Shift reaches the destroy and keep endings', async (t) => {
    const listing = await get('/api/games/wrath-glory');
    if (!listing.data.scenarios.some((s) => s.id === 'graveyard-shift'))
        return t.skip('private pack not installed');
    for (const [choice, ending] of [['destroy', 'destroy'], ['keep', 'keep']]) {
        const { sid, s } = await reachRevelations();
        const done = await command(sid, { type: 'choose', choiceId: choice });
        assert.equal(done.result, 'victory');
        assert.equal(done.scenario.ending.id, ending);
    }
});

test('Graveyard Shift reaches the handover ending', async (t) => {
    const listing = await get('/api/games/wrath-glory');
    if (!listing.data.scenarios.some((s) => s.id === 'graveyard-shift'))
        return t.skip('private pack not installed');
    const { sid } = await reachRevelations();
    let s = await command(sid, { type: 'choose', choiceId: 'signal-mendax' });
    s = await command(sid, { type: 'choose', choiceId: 'hand-over' });
    assert.equal(s.result, 'victory');
    assert.equal(s.scenario.ending.id, 'handover');
});
