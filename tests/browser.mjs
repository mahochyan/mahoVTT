/**
 * Browser smoke test for the v0.2 platform (Windows + Edge headless).
 *
 * Uses the Chrome DevTools Protocol over Node's built-in WebSocket, so the
 * project keeps its zero-runtime-dependency promise. Skips cleanly when Edge
 * is not installed.
 *
 *   node tests/browser.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE_CANDIDATES = [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const edgePath = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!edgePath) {
    console.log('SKIP: Edge not found (set EDGE_PATH to run the browser smoke test).');
    process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataDir = mkdtempSync(join(tmpdir(), 'graylight-browser-'));
const profileDir = mkdtempSync(join(tmpdir(), 'graylight-edge-'));
let server, edge, ws;
const results = [];

async function freePort() {
    const s = createServer();
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const port = s.address().port;
    await new Promise((r) => s.close(r));
    return port;
}
async function waitFor(fn, timeout = 15000, interval = 120) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const value = await fn();
            if (value) return value;
        } catch { /* retry */ }
        await sleep(interval);
    }
    return null;
}
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) process.exitCode = 1;
}

class Cdp {
    constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
    async open() {
        this.ws = new WebSocket(this.url);
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); }
        };
        await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    }
    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolve) => { this.pending.set(id, resolve); this.ws.send(JSON.stringify({ id, method, params })); });
    }
    async evaluate(expression) {
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''));
        return r.result?.result?.value;
    }
    async waitFor(expression, timeout = 12000) {
        return waitFor(async () => (await this.evaluate(expression)) === true, timeout);
    }
    async navigate(url) {
        await this.send('Page.navigate', { url });
        await sleep(500);
    }
    async viewport(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });
    }
    close() { try { this.ws?.close(); } catch { } }
}

async function main() {
    const appPort = await freePort();
    const cdpPort = await freePort();
    const base = `http://127.0.0.1:${appPort}`;
    server = spawn(process.execPath, ['dist/server.js'], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, PORT: String(appPort), SAGAS_DATA_DIR: dataDir, AI_PROVIDER: 'mock' },
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    server.stderr.on('data', () => { });
    const healthy = await waitFor(async () => {
        try { return (await fetch(base + '/api/health')).ok; } catch { return false; }
    }, 20000);
    if (!healthy) throw new Error('app server did not start');

    edge = spawn(edgePath, [
        '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
        `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    const target = await waitFor(async () => {
        try {
            const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
            return list.find((t) => t.type === 'page') || null;
        } catch { return null; }
    }, 15000);
    if (!target) throw new Error('Edge CDP did not start');

    const cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const consoleErrors = [];
    cdp.ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
            consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    });

    await cdp.viewport(1440, 900);
    await cdp.navigate(base + '/');
    check('dashboard renders', await cdp.waitFor('!!document.querySelector(".hero")'));
    check('dashboard shows empty-scenario state', await cdp.waitFor('document.body.innerText.includes("还没有可玩的剧本")'));

    await cdp.navigate(base + '/games');
    check('game hall lists Wrath & Glory', await cdp.waitFor('document.body.innerText.includes("怒火与荣耀")'));

    await cdp.navigate(base + '/games/wrath-glory');
    check('W&G start screen renders', await cdp.waitFor('!!document.querySelector("[data-start=training]")'));
    await cdp.evaluate('document.querySelector("[data-start=training]").click()');
    check('W&G session starts', await cdp.waitFor('!document.querySelector("#play").hidden && document.querySelectorAll("#party .card").length === 3', 20000));
    await cdp.evaluate('document.querySelector("[data-attack]").click()');
    check('W&G attack produces a result', await cdp.waitFor('document.querySelectorAll("#log li").length > 0 && (document.body.innerText.includes("开火") || document.body.innerText.includes("命中"))', 20000));
    await sleep(400);
    if (await cdp.evaluate('!document.querySelector("#pending").hidden'))
        await cdp.evaluate('document.querySelector("[data-pending-choice=damage]").click()');
    await sleep(500);
    check('W&G pending decision resolves', await cdp.evaluate('document.querySelector("#pending").hidden'));
    await cdp.navigate(base + '/games/wrath-glory');
    check('W&G session survives reload', await cdp.waitFor('!document.querySelector("#play").hidden && document.querySelectorAll("#party .card").length === 3', 20000));
    await cdp.evaluate(`(() => { const i = document.querySelector('#gm-input'); i.value = '观察训练场'; document.querySelector('#ask-gm').click(); })()`);
    check('W&G GM panel responds', await cdp.waitFor('document.querySelector("#narration").textContent.includes("规则演示模式")', 20000));
    await cdp.evaluate(`(() => { const i = document.querySelector('#gm-input'); i.value = '继续观察'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    check('Enter sends the composer without Shift', await cdp.waitFor('document.querySelector("#gm-input").value === ""', 20000));

    await cdp.navigate(base + '/campaigns/new');
    check('wizard explains no scenario', await cdp.waitFor('document.body.innerText.includes("还没有可直接游玩的剧本")'));

    await cdp.navigate(base + '/characters/new');
    check('character form renders', await cdp.waitFor('!!document.querySelector("#character-form")'));
    await cdp.evaluate(`(() => { const f = document.querySelector('#character-form'); f.elements.namedItem('name').value = '浏览器旅人'; f.elements.namedItem('className').value = '游侠'; f.requestSubmit(); })()`);
    const onSheet = await cdp.waitFor('location.pathname.startsWith("/characters/") && !location.pathname.endsWith("/new")', 20000);
    check('character creation navigates to sheet', onSheet, await cdp.evaluate('location.pathname'));
    check('character sheet renders', await cdp.waitFor('document.body.innerText.includes("生命值")'));

    await cdp.navigate(base + '/characters');
    check('roster shows created character', await cdp.waitFor('document.body.innerText.includes("浏览器旅人")'));

    await cdp.navigate(base + '/worlds');
    check('worlds page shows empty state', await cdp.waitFor('document.body.innerText.includes("还没有世界")'));

    await cdp.navigate(base + '/library');
    check('library shows empty state', await cdp.waitFor('document.body.innerText.includes("暂无条目")'));

    await cdp.navigate(base + '/settings');
    check('settings form renders', await cdp.waitFor('!!document.querySelector("#settings-form")'));

    await cdp.viewport(390, 844);
    await cdp.navigate(base + '/');
    await cdp.waitFor('!!document.querySelector(".hero")');
    check('dashboard mobile has no horizontal overflow', await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await cdp.navigate(base + '/games/wrath-glory');
    await cdp.waitFor('!document.querySelector("#play").hidden', 20000);
    check('W&G mobile has no horizontal overflow', await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth'));

    await cdp.viewport(1440, 1000);
    await cdp.navigate(base + '/games/wrath-glory');
    await cdp.evaluate('localStorage.removeItem("wg-training-session"); location.reload()');
    await sleep(700);
    await cdp.waitFor('!!document.querySelector("[data-start]")');
    const hasGraveyard = await cdp.evaluate('!!document.querySelector("[data-start=graveyard-shift]")');
    if (hasGraveyard) {
        await cdp.evaluate('document.querySelector("[data-start=graveyard-shift]").click()');
        check('Graveyard Shift opens', await cdp.waitFor('!document.querySelector("#play").hidden && document.body.innerText.includes("停尸间")', 20000));
        check('Graveyard scene art loads', await cdp.waitFor('!!document.querySelector("#scene-art:not([hidden]) img")', 20000));
        await cdp.evaluate('document.querySelector("[data-choice]").click()');
        check('Graveyard choice resolves', await cdp.waitFor('document.querySelectorAll("#log li").length > 1 && (document.body.innerText.includes("线索") || document.body.innerText.includes("检定"))', 20000));
        check('desktop shell uses wide layout', await cdp.evaluate('document.querySelector(".app-shell").getBoundingClientRect().width > 1300'));
        const latinWords = await cdp.evaluate('(document.querySelector("main").innerText.match(/[A-Za-z]+/g) || [])');
        check('W&G visible text has no English labels', latinWords.length === 0, latinWords.slice(0, 8).join(','));
        await cdp.viewport(1920, 1080);
        await cdp.navigate(base + '/games/wrath-glory');
        await cdp.waitFor('!document.querySelector("#play").hidden', 20000);
        check('wide viewport keeps three columns', await cdp.evaluate('document.querySelector(".app-shell").getBoundingClientRect().width > 1700 && getComputedStyle(document.querySelector(".sheet")).display !== "none"'));
        check('chat text is at least 15px', await cdp.evaluate('parseFloat(getComputedStyle(document.querySelector(".msg.gm")).fontSize) >= 15'));
        check('status labels are at least 12px', await cdp.evaluate('parseFloat(getComputedStyle(document.querySelector(".stat small")).fontSize) >= 12'));
        check('primary buttons are at least 40px tall', await cdp.evaluate('document.querySelector("#ask-gm").getBoundingClientRect().height >= 40'));
        check('sheet tabs are at least 40px tall', await cdp.evaluate('document.querySelector(".sheet-tabs button").getBoundingClientRect().height >= 40'));
    }
    else
        console.log('SKIP: private Graveyard Shift pack is not installed');

    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    cdp.close();
}

try {
    await main();
} catch (error) {
    check('browser test completed', false, error.message);
} finally {
    try { ws?.close(); } catch { }
    if (edge && edge.exitCode === null) {
        if (process.platform === 'win32')
            spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else edge.kill('SIGKILL');
    }
    if (server && server.exitCode === null) server.kill('SIGKILL');
    await sleep(300);
    try { rmSync(dataDir, { recursive: true, force: true }); rmSync(profileDir, { recursive: true, force: true }); } catch { }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
    process.exit(failed ? 1 : 0);
}
