import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { defaultCharacter, validateCharacter, actorPreset } from '../dist/platform/characters.js';
import { Store } from '../dist/db/store.js';
import { newGame } from '../dist/world.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let app, base, appPort, dataDir;

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
async function send(path, body, method = 'POST') {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => null) };
}
before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'graylight-platform-'));
    appPort = await freePort();
    base = `http://127.0.0.1:${appPort}`;
    app = spawn(process.execPath, ['dist/server.js'], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, PORT: String(appPort), SAGAS_DATA_DIR: dataDir, AI_PROVIDER: 'mock' },
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    app.stderr.on('data', () => {});
    for (let i = 0; i < 100; i++) {
        try {
            const r = await fetch(base + '/api/health');
            if (r.ok)
                return;
        }
        catch { }
        await sleep(40);
    }
    throw new Error('platform test server did not start');
});
after(async () => {
    if (app && app.exitCode === null) {
        const p = new Promise((r) => app.once('exit', r));
        app.kill('SIGKILL');
        await p;
    }
    if (dataDir)
        rmSync(dataDir, { recursive: true, force: true });
});

test('角色校验：默认战士、属性派生、非法输入拒绝', () => {
    const c = defaultCharacter('铁砧');
    const p = actorPreset(c);
    assert.equal(p.role, '战士');
    assert.equal(p.hp, 36);
    assert.equal(p.ac, 16);
    assert.deepEqual(p.abilityIds, ['second_wind']);
    const ranger = validateCharacter({ name: '阿尔', className: '游侠', stats: { str: 12, dex: 16, con: 12, int: 10, wis: 14, cha: 10 } });
    const rp = actorPreset(ranger);
    assert.equal(rp.role, '游侠');
    assert.equal(rp.range, 12);
    assert.equal(rp.ac, 15);
    assert.deepEqual(rp.abilityIds, ['aimed_shot']);
    assert.throws(() => validateCharacter({ name: 'x', className: '法师' }), /职业/);
    assert.throws(() => validateCharacter({ name: 'x', className: '战士', stats: { str: 99 } }), /属性/);
});

test('旧 campaigns 表可迁移出平台列与 characters 表', () => {
    const dir = mkdtempSync(join(tmpdir(), 'graylight-migrate-'));
    const path = join(dir, 'old.sqlite');
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO migrations VALUES(1,datetime('now'));
        CREATE TABLE campaigns(id TEXT PRIMARY KEY,name TEXT NOT NULL,state_json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,lease_owner TEXT,lease_epoch INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
    const state = newGame('旧战役', '旧角色');
    db.prepare('INSERT INTO campaigns(id,name,state_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?)')
        .run(state.id, state.name, JSON.stringify(state), 0, state.createdAt, new Date().toISOString());
    db.close();
    const store = new Store(path);
    const list = store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].packId, 'whispering-tower');
    assert.equal(list[0].lifecycle, 'active');
    assert.equal(list[0].title, '旧战役');
    assert.ok(list[0].lastPlayedAt);
    assert.deepEqual(store.listCharacters(), []);
    store.close();
    rmSync(dir, { recursive: true, force: true });
});

test('平台接口：大厅只登记已交付模块、角色可创建、旧战役入口拒绝', async () => {
    const platform = await get('/api/platform');
    assert.equal(platform.status, 200);
    assert.equal(platform.data.worlds.length, 0);

    const created = await send('/api/characters', {
        name: '阿尔', ancestry: '精灵', className: '游侠',
        stats: { str: 12, dex: 16, con: 12, int: 10, wis: 14, cha: 10 },
        background: '来自北境', portrait: { icon: 'bow', color: 'teal' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.name, '阿尔');

    const campaign = await send('/api/campaigns', { packId: 'whispering-tower', title: '平台测试', characterId: created.data.id });
    assert.equal(campaign.status, 404);
    assert.deepEqual((await get('/api/campaigns')).data, []);

    const games = await get('/api/games');
    assert.equal(games.status, 200);
    // 清空演示后大厅不是空的：Deathwatch 模块已注册，且仍是 experimental，不是可玩版本。
    assert.deepEqual(games.data.games.map(g => g.id), ['deathwatch-d100']);
    assert.equal(games.data.games[0].phase, 'experimental');
});

test('世界与内容库为空，旧世界详情返回 404', async () => {
    assert.deepEqual((await get('/api/worlds')).data, []);
    assert.equal((await get('/api/worlds/whispering-tower')).status, 404);
    const lib = await get('/api/library');
    assert.deepEqual(lib.data, { monsters: [], npcs: [], items: [], maps: [] });
});

test('非法角色与未知游戏模块返回明确错误', async () => {
    const bad = await send('/api/characters', { name: '', className: '战士' });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error.code, 'BAD_CHARACTER');
    const unknown = await send('/api/campaigns', { packId: 'nope', playerName: '旅人', name: 'x' });
    assert.equal(unknown.status, 404);
    assert.equal((await get('/api/games/nope')).status, 404);
});
