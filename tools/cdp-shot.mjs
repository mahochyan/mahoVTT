import { writeFileSync } from 'node:fs';
const [,, portArg, widthArg, heightArg, outPath, urlArg] = process.argv;
const port = portArg || '9333';
const width = Number(widthArg || 390), height = Number(heightArg || 844);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => new Promise((resolve) => { const my = ++id; pending.set(my, resolve); ws.send(JSON.stringify({ id: my, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });
if (urlArg) { await send('Page.navigate', { url: urlArg }); await new Promise((r) => setTimeout(r, 2500)); }
else { await new Promise((r) => setTimeout(r, 800)); }
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
if (shot.result?.data) { writeFileSync(outPath, Buffer.from(shot.result.data, 'base64')); console.log('saved', outPath); }
else console.error(JSON.stringify(shot).slice(0, 500));
const ev = await send('Runtime.evaluate', { expression: 'JSON.stringify({inner:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth})', returnByValue: true });
console.log(ev.result?.result?.value);
ws.close();
