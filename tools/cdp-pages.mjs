const port = process.argv[2] || '9333';
const base = process.argv[3] || 'http://127.0.0.1:3021';
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => new Promise((resolve) => { const my = ++id; pending.set(my, resolve); ws.send(JSON.stringify({ id: my, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const checks = [
  ['/settings', '!!document.querySelector("#settings-form")'],
  ['/worlds/whispering-tower', 'document.body.innerText.includes("公开世界书")'],
  ['/characters/new', '!!document.querySelector("#character-form")'],
  ['/campaigns', 'document.querySelectorAll(".campaign-card").length > 0'],
];
for (const [path, expr] of checks) {
  await send('Page.navigate', { url: base + path });
  await sleep(1600);
  console.log(path, await evalJs(expr));
}
ws.close();
