import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const port = process.argv[2] || '9334';
const base = process.argv[3] || 'http://127.0.0.1:3021';
const campaignId = process.argv[4];
const characterId = process.argv[5];
const outDir = 'artifacts/acceptance';
mkdirSync(outDir, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => new Promise((resolve) => { const my = ++id; pending.set(my, resolve); ws.send(JSON.stringify({ id: my, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable');

const wide = [
  ['dashboard', '/'],
  ['campaigns', '/campaigns'],
  ['campaign', `/campaigns/${campaignId}`],
  ['wizard', '/campaigns/new', 'document.querySelector("[data-action=wizard-world]")?.click()'],
  ['characters', '/characters'],
  ['character', `/characters/${characterId}`],
  ['world', '/worlds/whispering-tower'],
  ['library', '/library'],
  ['settings', '/settings'],
  ['play', `/c/${campaignId}`],
];
const multi = new Set(['dashboard', 'campaign', 'wizard', 'play']);
const widths = [1440, 1024, 390];
const report = [];

for (const [name, path, after] of wide) {
  for (const w of (multi.has(name) ? widths : [1440])) {
    const h = w === 390 ? 844 : w === 1024 ? 768 : 900;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: h });
    await send('Page.navigate', { url: base + path });
    await sleep(1600);
    if (after) { await evaluate(after); await sleep(600); }
    const metrics = await evaluate(`JSON.stringify({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      missingImages: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length,
      imgCount: document.images.length
    })`);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = join(outDir, `${name}-${w}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    report.push({ name, width: w, height: h, path, ...JSON.parse(metrics), file });
    console.log(name, w, metrics);
  }
}
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
ws.close();
