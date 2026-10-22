import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
import { join, extname, resolve as pathResolve, sep } from 'node:path';
import { Store } from "./db/store.js";
import { ConfigStore, DATA_DIR } from "./ai/config.js";
import { Provider, deterministicNarrative } from "./ai/provider.js";
import { newGame, ROOT, BOOK, publicBook } from "./world.js";
import { GameError } from "./types.js";
import { parseCommand, resolvePlan, tacticalPlan, activeId, view } from "./engine/engine.js";
import { roll } from "./engine/dice.js";
import { WORLDS, getWorld, worldBook } from "./platform/worlds.js";
import { validateCharacter, actorPreset } from "./platform/characters.js";
import { library } from "./platform/library.js";
// This single-user edition must never run two servers against the same save directory.
mkdirSync(DATA_DIR, { recursive: true });
const lockPath = join(DATA_DIR, 'server.lock');
if (existsSync(lockPath)) {
    let prior = 0;
    try {
        prior = Number(JSON.parse(readFileSync(lockPath, 'utf8')).pid);
    }
    catch { }
    let alive = false;
    if (Number.isInteger(prior) && prior > 0) {
        try {
            process.kill(prior, 0);
            alive = true;
        }
        catch { }
    }
    if (alive) {
        console.error('这个存档目录已有运行中的服务。请先关闭原来的窗口。');
        process.exit(1);
    }
    unlinkSync(lockPath);
}
try {
    const fd = openSync(lockPath, 'wx');
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    closeSync(fd);
}
catch {
    console.error('无法取得存档目录锁。');
    process.exit(1);
}
process.on('exit', () => {
    try {
        if (JSON.parse(readFileSync(lockPath, 'utf8')).pid === process.pid)
            unlinkSync(lockPath);
    }
    catch { }
});
const store = new Store(join(DATA_DIR, 'sagas.sqlite'));
const configs = new ConfigStore();
const PORT = Number(process.env.PORT) || 3000;
const runningAuto = new Set();
function json(res, data, status = 200) {
    if (res.headersSent || res.writableEnded)
        return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
}
function failure(e) {
    if (e instanceof GameError)
        return { error: { code: e.code, message: e.message }, status: e.status };
    console.error('[server]', e instanceof Error ? e.message : 'unknown');
    return { error: { code: 'INTERNAL', message: '服务处理失败。已提交的状态不会回滚；请刷新查看存档。' }, status: 500 };
}
async function body(req, max = 256000) {
    if (!String(req.headers['content-type'] ?? '').includes('application/json'))
        throw new GameError('CONTENT_TYPE', '请发送 application/json。', 415);
    let total = 0;
    const chunks = [];
    for await (const part of req) {
        const b = Buffer.from(part);
        total += b.length;
        if (total > max)
            throw new GameError('TOO_LARGE', '请求内容过大。', 413);
        chunks.push(b);
    }
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error();
        return parsed;
    }
    catch {
        throw new GameError('BAD_JSON', '请求不是合法 JSON。');
    }
}
function ensureOrigin(req) {
    const host = req.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
        throw new GameError('HOST_REJECTED', '此版本只允许本机访问。', 403);
    if (req.headers.origin && req.headers.origin !== `http://${host}`)
        throw new GameError('ORIGIN_REJECTED', '拒绝跨站请求。', 403);
}
function snapshot(id) { const s = store.get(id); const meta = store.list().find((c) => c.id === id); return { state: view(s), pack: meta ? getWorld(meta.packId) ?? null : null, turns: store.history(id), events: store.recentEvents(id), dice: store.dice(id), autoRunning: runningAuto.has(id), provider: configs.public() }; }
function recent(id) { return store.history(id).slice(-8).map(t => t.narrative || t.input).filter(Boolean); }
function stream(res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = (type, data) => {
        if (!res.destroyed && !res.writableEnded)
            res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const timer = setInterval(() => send('ping', { at: Date.now() }), 15000);
    return { send, end: () => {
            clearInterval(timer);
            if (!res.destroyed && !res.writableEnded)
                res.end();
        } };
}
async function narration(turn, state, send) {
    const attempt = store.beginNarration(turn.id);
    send('narration', { turnId: turn.id, attempt });
    const provider = new Provider(configs.config);
    let text = '';
    try {
        for await (const delta of provider.narrate(state, JSON.parse(turn.facts_json || '[]'), turn.input, recent(turn.campaign_id))) {
            text += delta;
            send('delta', { turnId: turn.id, attempt, text: delta });
        }
        store.saveNarration(turn.id, attempt, text, true);
        send('done', { turnId: turn.id, attempt });
    }
    catch (e) {
        const f = failure(e);
        store.saveNarration(turn.id, attempt, text, false, f.error.message);
        send('error', { ...f.error, turnId: turn.id, resolved: true });
    }
}
function scheduleAuto(id) { setImmediate(() => pump(id).catch(e => console.error('[auto]', failure(e).error.message))); }
async function pump(id) {
    if (runningAuto.has(id))
        return;
    runningAuto.add(id);
    try {
        for (let n = 0; n < 60; n++) {
            const s = store.get(id);
            if (s.status !== 'playing' || !s.combat)
                break;
            const actorId = activeId(s);
            const a = s.actors.find(x => x.id === actorId);
            if (a.controller === 'player')
                break;
            const prefix = `auto:${s.combat.id}:${s.combat.serial}:${actorId}`, attempt = store.autoAttempts(id, prefix);
            const requestId = prefix + ':' + attempt;
            let reserved;
            try {
                reserved = store.reserve(id, requestId, { activation: prefix }, `${a.name}的回合`, 'auto', a.kind === 'enemy' ? 'rules-engine' : configs.config.mode === 'mock' ? 'mock' : configs.config.model, s.version);
            }
            catch (e) {
                if (e instanceof GameError && e.code === 'BUSY')
                    break;
                throw e;
            }
            if (!reserved.owner)
                break;
            const { turn, owner } = reserved;
            const start = Date.now();
            const heartbeat = setInterval(() => store.heartbeat(turn, owner), 15000);
            try {
                let commands, line = '', fallback = '';
                if (a.kind === 'enemy' || configs.config.mode === 'mock') {
                    commands = tacticalPlan(s, actorId);
                    line = a.kind === 'companion' ? (actorId === 'ranger' ? '我来找一个合适的射击角度。' : '别离灯光太远。') : '';
                }
                else {
                    try {
                        const p = await new Provider(configs.config).plan(s, '', actorId, true, recent(id));
                        commands = p.commands;
                        line = p.line;
                    }
                    catch (e) {
                        commands = tacticalPlan(s, actorId);
                        fallback = '队友 AI 暂不可用，改用规则策略。' + failure(e).error.message;
                    }
                }
                const r = resolvePlan(s, commands, 'auto');
                if (fallback)
                    r.events.unshift({ type: 'ai_fallback', text: fallback, actorId });
                const result = store.commit(turn, owner, r, { commands, line, fallback }, Date.now() - start);
                store.setNarrative(result.turn.id, line || deterministicNarrative(r.state, r.events));
            }
            catch (e) {
                store.fail(turn, owner, failure(e).error.message);
                if (attempt >= 2) {
                    console.error('[auto] repeated resolution failure', actorId);
                    break;
                }
            }
            finally {
                clearInterval(heartbeat);
            }
            await new Promise(r => setTimeout(r, 180));
        }
    }
    finally {
        runningAuto.delete(id);
    }
}
async function action(req, res, id) {
    const b = await body(req);
    if (typeof b.requestId !== 'string' || !/^[-a-zA-Z0-9:]{8,180}$/.test(b.requestId) || !Number.isInteger(b.baseVersion))
        throw new GameError('BAD_REQUEST', '缺少请求 ID 或状态版本。');
    const input = typeof b.input === 'string' ? b.input.trim() : '';
    if (input.length > 2000)
        throw new GameError('INPUT_LONG', '每次输入最多 2000 字。');
    const direct = b.command !== undefined ? parseCommand(b.command) : null;
    if (!direct && !input)
        throw new GameError('EMPTY_INPUT', '请输入行动，或选择界面按钮。');
    const s = store.get(id);
    const reserved = store.reserve(id, b.requestId, { input, command: direct, baseVersion: b.baseVersion }, input || commandLabel(direct), 'player', configs.config.mode === 'mock' ? 'mock' : configs.config.model, b.baseVersion);
    const output = stream(res), { send } = output;
    send('meta', { turnId: reserved.turn.id, stateVersion: s.version });
    if (!reserved.owner) {
        send('state', { ...snapshot(id), replayed: true });
        const t = reserved.turn;
        if (t.resolution_status === 'failed')
            send('error', { code: 'PREVIOUS_FAILED', message: t.error, turnId: t.id, resolved: false });
        else
            send('done', { turnId: t.id, replayed: true, pending: t.resolution_status === 'pending' });
        output.end();
        return;
    }
    const { turn, owner } = reserved, start = Date.now();
    const heartbeat = setInterval(() => store.heartbeat(turn, owner), 15000);
    let committed = false;
    try {
        const provider = new Provider(configs.config);
        const p = direct ? { commands: [direct], line: '' } : await provider.plan(s, input, 'pc', false, recent(id));
        send('plan', { turnId: turn.id, commands: p.commands });
        const r = resolvePlan(s, p.commands, 'player');
        const result = store.commit(turn, owner, r, p, Date.now() - start);
        committed = true;
        clearInterval(heartbeat);
        send('rolls', { turnId: turn.id, dice: r.dice });
        send('facts', { turnId: turn.id, events: r.events, eventSeq: result.eventSeq, stateVersion: r.state.version });
        send('state', snapshot(id));
        scheduleAuto(id);
        if (direct) {
            store.setNarrative(turn.id, deterministicNarrative(r.state, r.events));
            send('done', { turnId: turn.id });
        }
        else
            await narration(result.turn, r.state, send);
    }
    catch (e) {
        const f = failure(e);
        if (!committed)
            store.fail(turn, owner, f.error.message);
        send('error', { ...f.error, turnId: turn.id, resolved: committed });
    }
    finally {
        clearInterval(heartbeat);
        output.end();
    }
}
function commandLabel(c) { return { move: '移动', attack: '攻击', use_item: '使用药水', use_ability: '使用能力', interact: '交互', talk: '交谈', end_turn: '结束回合' }[c.type] + (c.targetId ? ' · ' + c.targetId : ''); }
const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
        ensureOrigin(req);
        const url = new URL(req.url || '/', `http://${req.headers.host}`), path = url.pathname, method = req.method || 'GET';
        if (path === '/api/health' && method === 'GET')
            return json(res, { ok: true, version: '0.2.0', contentVersion: BOOK.version });
        if (path === '/api/platform' && method === 'GET')
            return json(res, { worlds: WORLDS, campaigns: store.list(), characters: store.listCharacters(), provider: configs.public(), version: '0.2.0' });
        if (path === '/api/dashboard' && method === 'GET') {
            const all = store.list(), active = all.filter((c) => c.lifecycle === 'active');
            return json(res, {
                worlds: WORLDS,
                campaigns: active.slice(0, 8),
                archived: all.length - active.length,
                characters: store.listCharacters().slice(0, 8),
                counts: { active: active.length, victory: all.filter((c) => c.status === 'victory').length, total: all.length },
                provider: configs.public(),
                version: '0.2.0',
            });
        }
        if (path === '/api/worlds' && method === 'GET')
            return json(res, WORLDS);
        if (path === '/api/library' && method === 'GET')
            return json(res, library());
        const wm = /^\/api\/worlds\/([a-z0-9-]{1,64})$/.exec(path);
        if (wm && method === 'GET') {
            const w = getWorld(wm[1]);
            if (!w)
                throw new GameError('NOT_FOUND', '未知世界。', 404);
            return json(res, { world: w, book: worldBook(w.id) });
        }
        if (path === '/api/characters' && method === 'GET')
            return json(res, store.listCharacters());
        if (path === '/api/characters' && method === 'POST') {
            const data = validateCharacter(await body(req));
            return json(res, store.createCharacter(data.name, data), 201);
        }
        const cm = /^\/api\/characters\/([a-f0-9-]{36})$/.exec(path);
        if (cm) {
            if (method === 'GET')
                return json(res, store.getCharacter(cm[1]));
            if (method === 'PATCH') {
                const data = validateCharacter(await body(req));
                return json(res, store.updateCharacter(cm[1], data.name, data));
            }
            if (method === 'DELETE') {
                store.deleteCharacter(cm[1]);
                return json(res, { ok: true });
            }
        }
        if (path === '/api/bootstrap' && method === 'GET')
            return json(res, { campaigns: store.list(), characters: store.listCharacters(), worlds: WORLDS, provider: configs.public(), book: publicBook(), version: '0.2.0' });
        if (path === '/api/settings' && method === 'GET')
            return json(res, configs.public());
        if (path === '/api/settings' && method === 'POST')
            return json(res, configs.update(await body(req)));
        if (path === '/api/ai/ping' && method === 'POST') {
            await body(req);
            return json(res, await new Provider(configs.config).ping());
        }
        if (path === '/api/campaigns' && method === 'GET') {
            const lifecycle = url.searchParams.get('lifecycle');
            return json(res, store.list(lifecycle === 'active' || lifecycle === 'archived' ? lifecycle : undefined));
        }
        if (path === '/api/campaigns' && method === 'POST') {
            const b = await body(req);
            const packId = typeof b.packId === 'string' && b.packId ? b.packId : 'whispering-tower';
            const world = getWorld(packId);
            if (!world)
                throw new GameError('NOT_FOUND', '未知世界。', 404);
            let characterId = null;
            let playerName = typeof b.playerName === 'string' ? b.playerName.trim() : '';
            let preset;
            if (typeof b.characterId === 'string' && b.characterId) {
                const record = store.getCharacter(b.characterId);
                const data = validateCharacter(record.data);
                characterId = record.id;
                playerName = data.name;
                preset = actorPreset(data);
            }
            else if (b.character && typeof b.character === 'object') {
                const data = validateCharacter(b.character);
                playerName = data.name;
                preset = actorPreset(data);
            }
            if (!playerName || playerName.length > 20)
                throw new GameError('BAD_NAME', '角色名须为 1 至 20 字。');
            const title = (typeof b.title === 'string' ? b.title : typeof b.name === 'string' ? b.name : '').trim() || world.title;
            if (title.length > 60)
                throw new GameError('BAD_NAME', '战役名最多 60 字。');
            const created = store.create(newGame(title, playerName, preset), { packId, characterId });
            return json(res, { state: view(created), campaign: store.list().find((c) => c.id === created.id) }, 201);
        }
        if (path === '/api/campaigns/import' && method === 'POST') {
            const s = store.import(await body(req, 10 * 1024 * 1024));
            scheduleAuto(s.id);
            return json(res, { state: view(s) }, 201);
        }
        const m = /^\/api\/campaigns\/([a-f0-9-]{36})(?:\/(.*))?$/.exec(path);
        if (m) {
            const id = m[1], tail = m[2] ?? '';
            if (tail === '' && method === 'GET')
                return json(res, snapshot(id));
            if (tail === '' && method === 'PATCH') {
                const b = await body(req);
                if (b.lifecycle !== undefined && !['active', 'archived'].includes(b.lifecycle))
                    throw new GameError('BAD_LIFECYCLE', '状态只能是进行中或已归档。');
                if (b.title !== undefined && (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 100))
                    throw new GameError('BAD_NAME', '战役名须为 1 至 100 字。');
                if (b.lifecycle)
                    store.setLifecycle(id, b.lifecycle);
                if (b.title)
                    store.rename(id, b.title.trim());
                return json(res, { campaign: store.list().find((c) => c.id === id) });
            }
            if (tail === '' && method === 'DELETE') {
                if (url.searchParams.get('confirm') !== '1')
                    throw new GameError('CONFIRM_REQUIRED', '删除战役需要 confirm=1。', 400);
                store.remove(id);
                return json(res, { ok: true });
            }
            if (tail === 'turn' && method === 'POST') {
                await action(req, res, id);
                return;
            }
            if (tail === 'roll' && method === 'POST') {
                const b = await body(req);
                if (typeof b.expr !== 'string' || b.expr.length > 30)
                    throw new GameError('BAD_DICE', '骰子表达式不合法。');
                if (b.mode && !['normal', 'adv', 'dis'].includes(b.mode))
                    throw new GameError('BAD_DICE', '未知骰子模式。');
                const d = roll(b.expr, '自由骰：不自动触发任何游戏结算', undefined, b.mode || 'normal');
                store.freeRoll(id, d);
                return json(res, d);
            }
            if (tail === 'character' && method === 'PATCH') {
                const b = await body(req);
                return json(res, { state: view(store.patchHp(id, b.baseVersion, b.actorId, b.hp)) });
            }
            if (tail === 'export' && method === 'GET') {
                const save = store.export(id);
                res.setHeader('Content-Disposition', `attachment; filename="graylight-${id.slice(0, 8)}.json"`);
                return json(res, save);
            }
            if (tail === 'resume' && method === 'POST') {
                await body(req);
                store.recover();
                scheduleAuto(id);
                return json(res, { ok: true });
            }
            const tm = /^turns\/([a-f0-9-]{36})(?:\/(retry))?$/.exec(tail);
            if (tm) {
                const t = store.turn(tm[1]);
                if (t.campaign_id !== id)
                    throw new GameError('NOT_FOUND', '回合不属于当前战役。', 404);
                if (!tm[2] && method === 'GET')
                    return json(res, store.publicTurn(t));
                if (tm[2] && method === 'POST') {
                    await body(req);
                    if (t.resolution_status !== 'resolved')
                        throw new GameError('NOT_RESOLVED', '仅可重试已经结算的叙事。', 409);
                    const output = stream(res);
                    try {
                        await narration(t, t.context_json ? JSON.parse(t.context_json) : store.get(id), output.send);
                    }
                    finally {
                        output.end();
                    }
                    return;
                }
            }
        }
        if (path.startsWith('/api/'))
            throw new GameError('NOT_FOUND', '接口不存在。', 404);
        if (method !== 'GET' && method !== 'HEAD')
            throw new GameError('METHOD', '不支持这个请求方法。', 405);
        const platformPage = path === '/' || /^\/(campaigns|characters|worlds|library|settings)(\/|$)/.test(path);
        let file = path.startsWith('/c/') ? join(ROOT, 'public/index.html')
            : platformPage ? join(ROOT, 'public/platform.html')
                : pathResolve(ROOT, 'public', '.' + decodeURIComponent(path));
        const root = pathResolve(ROOT, 'public') + sep;
        if (!file.startsWith(root) || !existsSync(file))
            throw new GameError('NOT_FOUND', '文件不存在。', 404);
        const ext = extname(file);
        const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
        if (!types[ext])
            throw new GameError('NOT_FOUND', '不允许访问该文件。', 404);
        res.writeHead(200, { 'Content-Type': types[ext], 'Cache-Control': 'no-cache' });
        res.end(method === 'HEAD' ? '' : readFileSync(file));
    }
    catch (e) {
        const f = failure(e);
        json(res, { error: f.error }, f.status);
        if (res.headersSent && !res.writableEnded)
            res.end();
    }
});
server.on('error', e => { console.error('无法启动：' + e.message + '。请确认 3000 端口未被占用。'); store.close(); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => {
    store.recover(true);
    console.log(`\n灰灯纪事 v0.2.0\n打开 http://127.0.0.1:${PORT}\n存档目录：${DATA_DIR}\nAI 模式：${configs.config.mode}\n按 Ctrl+C 停止；已提交状态自动保存在 SQLite。\n`);
    for (const c of store.list())
        scheduleAuto(String(c.id));
});
const autoTimer = setInterval(() => {
    for (const c of store.list())
        if (c.status === 'playing')
            scheduleAuto(String(c.id));
}, 4000);
autoTimer.unref();
process.on('SIGINT', () => { server.close(() => { store.close(); process.exit(0); }); setTimeout(() => process.exit(0), 1500).unref(); });
