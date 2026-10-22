/**
 * Deathwatch 页面真实浏览器验收（Edge headless + CDP）。
 * 覆盖：首页 → 建团草稿 → 开局 → 地图移动 → 进入战斗 → 攻击 → 三档宽度截图。
 * 找不到 Edge 时明确 SKIP，不当作通过。
 */
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const EDGE = [process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(p => existsSync(p));
if (!EDGE) { console.log('SKIP: Edge not found (set EDGE_PATH).'); process.exit(0); }

const SHOTS = process.env.DW_SHOTS || 'E:/VTT/docs/evidence/S7-ui';
mkdirSync(SHOTS, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dataDir = mkdtempSync(join(tmpdir(), 'dw-browser-data-'));
const profileDir = mkdtempSync(join(tmpdir(), 'dw-browser-edge-'));
let server, edge;
const results = [];
function check(name, ok, detail = '') {
  results.push({name, ok, detail});
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
}
async function freePort() {
  const s = createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise(r => s.close(r));
  return p;
}
async function waitFor(fn, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v; } catch {}
    await sleep(120);
  }
  return null;
}
class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  async open() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); }
    };
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise(res => { this.pending.set(id, res); this.ws.send(JSON.stringify({id, method, params})); });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''));
    return r.result?.result?.value;
  }
  async waitFor(expr, timeout = 12000) { return waitFor(async () => (await this.evaluate(expr)) === true, timeout); }
  async viewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height});
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
    if (r.result?.data) writeFileSync(join(SHOTS, name), Buffer.from(r.result.data, 'base64'));
  }
  close() { try { this.ws?.close(); } catch {} }
}

const clickText = (selector, text) => `(() => { const el = [...document.querySelectorAll('${selector}')].find(e => e.textContent.includes('${text}')); if (!el) return false; el.click(); return true; })()`;

async function main() {
  const appPort = await freePort(), cdpPort = await freePort();
  const base = `http://127.0.0.1:${appPort}`;
  server = spawn(process.execPath, ['dist/server.js'], {
    cwd: new URL('../', import.meta.url),
    env: {...process.env, PORT: String(appPort), SAGAS_DATA_DIR: dataDir, AI_PROVIDER: 'mock'},
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.stderr.on('data', () => {});
  const healthy = await waitFor(async () => { try { return (await fetch(base + '/api/health')).ok; } catch { return false; } }, 20000);
  if (!healthy) throw new Error('app server did not start');
  edge = spawn(EDGE, ['--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], {stdio: 'ignore', windowsHide: true});
  const target = await waitFor(async () => {
    try { const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); return list.find(t => t.type === 'page'); } catch { return null; }
  }, 15000);
  if (!target) throw new Error('Edge CDP did not start');
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const consoleErrors = [];
  cdp.ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map(a => a.value || a.description || '').join(' ');
      if (m.params.type === 'error') consoleErrors.push(text);
      else if (text.startsWith('DW_SPECS')) console.log('PAGE', text);
    }
  });

  await cdp.viewport(1440, 900);
  await cdp.send('Page.navigate', {url: base + '/games/deathwatch/index.html'});
  check('模块页打开', await cdp.waitFor('!!document.querySelector("#newSquad")'));
  check('模块状态来自服务端', await cdp.waitFor('document.querySelector("#moduleState").textContent.includes("实验")', 15000));
  await cdp.shot('01-home-1440.png');

  await cdp.evaluate('document.querySelector("#newSquad").click()');
  check('建团面板出现', await cdp.waitFor(`!document.querySelector('#creation').hidden`));
  const attrsOk = await cdp.waitFor('document.querySelectorAll(".slot .attr").length >= 27', 20000);
  check('服务端掷出九项属性', attrsOk, '');
  if (!attrsOk) console.log('DEBUG createError =', await cdp.evaluate('document.querySelector("#createError").textContent'));
  await cdp.shot('02-creation-1440.png');

  await cdp.evaluate('document.querySelector("#submitSquad").click()');
  check('进入游戏界面', await cdp.waitFor(`!!document.querySelector('#play') && !document.querySelector('#play').hidden`, 20000));
  check('三名队员的角色卡', await cdp.waitFor(`document.querySelectorAll('#pane-party .card').length === 3`));
  check('地图渲染出格子', await cdp.waitFor(`document.querySelectorAll('#map .cell').length > 300`));

  // 移动到相邻格并确认
  await cdp.evaluate(`(() => { const cells=[...document.querySelectorAll('#map .cell')]; const c=cells.find(x=>x.dataset.x==='3'&&x.dataset.y==='7'); c.click(); return true; })()`);
  check('选中格子后出现移动按钮', await cdp.waitFor(`[...document.querySelectorAll('#action-bar button')].some(b=>b.textContent.includes('移动到'))`));
  await cdp.evaluate(clickText('#action-bar button', '移动到'));
  check('移动后回合记录更新', await cdp.waitFor(`document.querySelector('#pane-log').textContent.includes('移动')`, 12000));
  await cdp.shot('03-play-1440.png');

  // 进入有敌人的场景
  await cdp.evaluate(clickText('#action-bar button', '前往驻军防线'));
  check('进入战斗并出现敌人棋子', await cdp.waitFor(`document.querySelectorAll('#map .token.enemy').length > 0`, 15000));
  check('场景标题显示战斗轮次', await cdp.waitFor(`document.querySelector('#scene-part').textContent.includes('轮')`));

  // 选敌人并攻击
  await cdp.evaluate(`(() => { const t=document.querySelector('#map .token.enemy'); t.closest('.cell').click(); return true; })()`);
  check('选中敌人后攻击按钮可用', await cdp.waitFor(`[...document.querySelectorAll('#action-bar button')].some(b=>b.textContent.includes('攻击') && !b.disabled)`));
  await cdp.evaluate(clickText('#action-bar button', '攻击（单发）'));
  check('攻击产生检定卡或未行动提示', await waitFor(async () => {
    const text = await cdp.evaluate(`document.querySelector('#pane-log').textContent`);
    return text.includes('命中') || text.includes('未命中') || text.includes('轮到') || text.includes('规则策略');
  }, 15000));
  check('骰子卡显示 d100', await cdp.waitFor(`!!document.querySelector('.dice-card')`, 15000));
  await cdp.shot('04-combat-1440.png');

  // 三档宽度
  await cdp.viewport(1024, 768);
  await sleep(400);
  check('1024 宽度下地图仍可见', await cdp.waitFor(`document.querySelectorAll('#map .cell').length > 300`));
  await cdp.shot('05-play-1024.png');
  await cdp.viewport(390, 844);
  await sleep(400);
  check('390 宽度下页面不横向溢出', await cdp.evaluate('document.documentElement.scrollWidth <= 400'));
  await cdp.shot('06-play-390.png');

  check('控制台无 error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log('\n结果：', results.filter(r => r.ok).length, '/', results.length, '通过');
  cdp.close();
}
main().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; }).finally(async () => {
  try { server?.kill('SIGKILL'); } catch {}
  try { edge?.kill(); } catch {}
  await sleep(300);
  try { rmSync(dataDir, {recursive: true, force: true}); } catch {}
  try { rmSync(profileDir, {recursive: true, force: true}); } catch {}
});
