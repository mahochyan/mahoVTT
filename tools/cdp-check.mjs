const port = process.argv[2] || '9333';
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
await new Promise((r) => { ws.onopen = r; });
function send(method, params = {}) {
  const myId = ++id;
  return new Promise((resolve) => { pending.set(myId, resolve); ws.send(JSON.stringify({ id: myId, method, params })); });
}
const expr = `JSON.stringify({
  inner: innerWidth,
  doc: document.documentElement.scrollWidth,
  body: document.body.scrollWidth,
  shell: document.querySelector('.shell')?.getBoundingClientRect().width,
  main: document.querySelector('.main')?.getBoundingClientRect().width,
  view: document.querySelector('.view')?.getBoundingClientRect().width,
  wide: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => el.tagName + '.' + (el.className || '').toString().slice(0, 40) + '|w' + Math.round(el.getBoundingClientRect().width) + '|r' + Math.round(el.getBoundingClientRect().right))
})`;
const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(res.result?.result?.value || JSON.stringify(res));
ws.close();
