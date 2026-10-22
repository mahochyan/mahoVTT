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
    check('dashboard has quick actions', await cdp.waitFor('document.body.innerText.includes("新建战役")'));

    // Wizard: world -> character -> party -> title -> play
    await cdp.navigate(base + '/campaigns/new');
    check('wizard opens', await cdp.waitFor('!!document.querySelector("[data-action=wizard-world]")'));
    await cdp.evaluate('document.querySelector("[data-action=wizard-world]").click()');
    await cdp.waitFor('!!document.querySelector("#wz-name")');
    await cdp.evaluate(`(() => { const i = document.querySelector('#wz-name'); i.value = '浏览器旅人'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-action=wizard-next]').click(); })()`);
    const partyStep = await cdp.waitFor('document.body.innerText.includes("确认队伍")');
    check('wizard reaches party step', partyStep);
    await cdp.evaluate('document.querySelector("[data-action=wizard-next]").click()');
    await cdp.waitFor('!!document.querySelector("#wz-title")');
    await cdp.evaluate(`(() => { const t = document.querySelector('#wz-title'); t.value = '浏览器冒烟战役'; document.querySelector('[data-action=wizard-create]').click(); })()`);
    const onPlay = await cdp.waitFor('location.pathname.startsWith("/c/") && !!document.querySelector(".map-stage")', 20000);
    check('wizard creates campaign and enters play page', onPlay, await cdp.evaluate('location.pathname'));
    const campaignId = (await cdp.evaluate('location.pathname')).split('/').pop();
    check('play page loads token images', await cdp.waitFor('[...document.querySelectorAll(".portrait img")].length > 0 && [...document.querySelectorAll(".portrait img")].every(i => i.complete && i.naturalWidth > 0)'));
    check('play page action panel', await cdp.waitFor('!!document.querySelector(".action-panel")'));

    await cdp.navigate(base + '/campaigns');
    check('campaign list shows campaign', await cdp.waitFor('document.querySelectorAll(".campaign-card").length > 0'));
    await cdp.evaluate('document.querySelector("[data-action=archive]").click()');
    await sleep(900);
    check('archive removes from active list', await cdp.evaluate('document.querySelectorAll(".campaign-card").length === 1 && document.body.innerText.includes("已归档")'));
    await cdp.evaluate('document.querySelector("[data-action=restore]").click()');
    await sleep(900);
    check('restore brings campaign back', await cdp.evaluate('document.querySelectorAll(".campaign-card").length === 1 && document.body.innerText.includes("进行中 · 1")'));

    await cdp.navigate(base + '/settings');
    check('settings form renders', await cdp.waitFor('!!document.querySelector("#settings-form")'));
    await cdp.navigate(base + '/worlds/whispering-tower');
    check('world detail renders public book', await cdp.waitFor('document.body.innerText.includes("公开世界书")'));

    await cdp.viewport(390, 844);
    await cdp.navigate(base + '/');
    await cdp.waitFor('!!document.querySelector(".hero")');
    check('dashboard mobile has no horizontal overflow', await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    await cdp.navigate(base + '/c/' + campaignId);
    await cdp.waitFor('!!document.querySelector(".map-stage")');
    check('play page mobile has no horizontal overflow', await cdp.evaluate('document.documentElement.scrollWidth <= innerWidth'));

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
