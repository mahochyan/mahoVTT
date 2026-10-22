/** Deathwatch module UI. Server owns every number; this file only renders and sends intents. */
const API = '/api/games/deathwatch-d100';
const $ = sel => document.querySelector(sel);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

let catalog = null, missions = [], sessions = [], current = null, view = null;
let selected = { cell: null, target: null };
let busy = false;

async function call(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
  return body;
}

function requestId(prefix) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------------- home ---------------- */
async function boot() {
  try {
    const root = await call('');
    catalog = root.catalog;
    missions = root.missions;
    sessions = root.sessions;
    $('#moduleDesc').textContent = root.module.description;
    $('#ruleProfile').textContent = root.module.rulesetId;
    $('#moduleState').textContent = root.module.phase === 'playable' ? '可玩' : '开发中 · 实验';
    $('#provider').textContent = root.provider.mode === 'openai'
      ? `模型：${root.provider.model || '未填模型 ID'}`
      : '规则演示模式（不调用模型）';
    renderHome();
    fillCreation();
    show('home');
  } catch (e) {
    $('#moduleState').textContent = '模块不可用';
    $('#moduleDesc').textContent = e.message;
  }
}

function show(name) {
  for (const id of ['home', 'creation', 'play']) $('#' + id).classList.toggle('hidden', id !== name);
}

function renderHome() {
  const list = $('#sessionList');
  list.replaceChildren();
  if (!sessions.length) list.append(el('li', 'muted', '还没有存档。先新建一支小队。'));
  for (const s of sessions) {
    const li = el('li');
    const open = el('button', 'link', s.title || '未命名战役');
    open.onclick = () => openSession(s.id);
    li.append(open, el('span', 'muted', ` · ${s.mission} · ${phaseName(s.phase)}`));
    list.append(li);
  }
  const ml = $('#missionList');
  ml.replaceChildren();
  for (const m of missions) {
    const li = el('li');
    li.append(el('strong', '', m.title), el('span', 'tag', m.sourceKind === 'original' ? '原创测试任务' : '私有适配'));
    if (m.sourceKind === 'original') li.append(el('span', 'muted', ' — 用于规则验证，不冒充官方冒险'));
    ml.append(li);
  }
}

function phaseName(p) {
  return ({ briefing: '简报', exploration: '探索', combat: '战斗', debrief: '结算', victory: '胜利', defeat: '失败' })[p] || p;
}

/* ---------------- creation ---------------- */
function fillCreation() {
  const slots = $('#slots');
  slots.replaceChildren();
  const roles = [['pc', '主角', 'player'], ['ally-1', '战斗兄弟 1', 'ai'], ['ally-2', '战斗兄弟 2', 'ai']];
  for (const [id, label] of roles) {
    const box = el('fieldset', 'slot');
    box.dataset.id = id;
    box.append(el('legend', '', label + (id === 'pc' ? '（你控制）' : '（AI 决策，可接管）')));
    const name = el('input'); name.placeholder = id === 'pc' ? '角色名' : '队友名'; name.maxLength = 24;
    name.value = id === 'pc' ? '塞维鲁' : id === 'ally-1' ? '凯' : '德拉科';
    const chapter = el('select');
    for (const c of catalog.chapters) chapter.append(new Option(c.name + (c.ban ? `（禁 ${c.ban.map(b => specialtyName(b)).join('/')}）` : ''), c.id));
    if (id === 'ally-1') chapter.value = 'blood-angels';
    if (id === 'ally-2') chapter.value = 'dark-angels';
    const specialty = el('select');
    for (const s of catalog.specialties) specialty.append(new Option(s.name, s.id));
    if (id === 'ally-1') specialty.value = 'assault';
    if (id === 'ally-2') specialty.value = 'devastator';
    const choice = el('div', 'chapter-choice hidden');
    const c1 = el('select'), c2 = el('select');
    for (const [k, v] of Object.entries(catalog.attrs)) { c1.append(new Option(v, k)); c2.append(new Option(v, k)); }
    c1.value = 'ws'; c2.value = 'bs';
    choice.append(el('span', 'muted', '极限战士加值：'), c1, c2);
    const syncChoice = () => choice.classList.toggle('hidden', chapter.value !== 'ultramarines');
    chapter.onchange = syncChoice;
    syncChoice();
    box.append(name, chapter, specialty, choice);
    box._fields = { name, chapter, specialty, c1, c2, choice };
    slots.append(box);
  }
  const leader = $('#leader');
  leader.replaceChildren();
  for (const [id, label] of roles) leader.append(new Option(label, id));
  const oath = $('#oath');
  oath.replaceChildren();
  for (const o of catalog.oaths) oath.append(new Option(`${o.name}（${o.effect}）`, o.id));
}

function specialtyName(id) {
  return catalog?.specialties.find(s => s.id === id)?.name || id;
}

$('#newSquad').onclick = () => { show('creation'); $('#createError').textContent = ''; };
$('#cancelCreate').onclick = () => show('home');

$('#submitSquad').onclick = async () => {
  const err = $('#createError');
  err.textContent = '';
  const squad = [];
  for (const box of document.querySelectorAll('.slot')) {
    const f = box._fields;
    const item = { id: box.dataset.id, name: f.name.value.trim(), chapter: f.chapter.value, specialty: f.specialty.value };
    if (f.chapter.value === 'ultramarines') item.chapterChoice = [f.c1.value, f.c2.value];
    squad.push(item);
  }
  try {
    $('#submitSquad').disabled = true;
    const created = await call('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        title: $('#title').value.trim() || '守望任务',
        missionId: missions[0].id,
        missionVersion: missions[0].version,
        leaderId: $('#leader').value,
        oathId: $('#oath').value,
        weaponProfile: $('#weaponProfile').value,
        squad,
      }),
    });
    sessions.unshift({ id: created.state.id, title: created.state.title, mission: created.state.mission.title, phase: created.state.phase, version: created.state.version });
    await openSession(created.state.id);
  } catch (e) {
    err.textContent = e.message;
  } finally {
    $('#submitSquad').disabled = false;
  }
};

/* ---------------- play ---------------- */
async function openSession(id) {
  current = id;
  const snap = await call(`/sessions/${id}`);
  view = snap.state;
  show('play');
  render();
}

function activeActor() {
  return view?.actors.find(a => a.id === view.activeActorId) || null;
}

function render() {
  renderHeader();
  renderActors();
  renderObjectives();
  renderMap();
  renderActions();
  renderPending();
  renderEvents();
  renderWorldbook();
}

function renderHeader() {
  const s = view.scene;
  const combat = view.combat ? `第 ${view.combat.round} 轮` : '非战斗';
  $('#sceneHeader').replaceChildren(
    el('strong', '', s.name),
    el('span', 'muted', ` · ${combat} · 世界时间 ${view.worldTime} 分 · 状态版本 ${view.version}`),
  );
}

function renderActors() {
  const box = $('#actorCards');
  box.replaceChildren();
  for (const a of view.actors.filter(x => x.side === 'party')) {
    const card = el('article', 'actor' + (a.id === view.activeActorId ? ' active' : '') + (a.status !== 'active' ? ' down' : ''));
    const head = el('header');
    head.append(el('strong', '', a.name), el('span', 'muted', ` ${specialtyName(a.specialty)} · ${catalog.chapters.find(c => c.id === a.chapter)?.name || a.chapter}`));
    card.append(head);
    const wounds = el('div', 'bar');
    const fill = el('i');
    fill.style.width = `${Math.max(0, 100 - (a.damage / Math.max(1, a.maxWounds)) * 100)}%`;
    wounds.append(fill);
    card.append(wounds);
    card.append(el('div', 'stats', `W ${a.damage}/${a.maxWounds}${a.critical ? `（重伤 ${a.critical}）` : ''} · 命运 ${a.fate}/${a.maxFate} · 动作 ${a.ap} · 反应 ${a.reactions}`));
    const w = catalog.weapons[a.readied];
    card.append(el('div', 'muted', `${w?.name || a.readied} · 弹匣 ${a.inventory[a.readied]?.clip ?? '-'}/${a.inventory[a.readied]?.reserve ?? '-'}`));
    card.append(el('div', 'muted', `模式 ${a.mode === 'squad' ? '小队' : '单兵'} · ${a.controller === 'player' ? '你控制' : 'AI'} · ${a.status}`));
    box.append(card);
  }
}

function renderObjectives() {
  const box = $('#objectives');
  box.replaceChildren(el('h3', '', '任务目标'), el('div', 'muted', view.mission.title));
  for (const o of view.objectives) {
    const row = el('div', 'objective' + (o.done ? ' done' : ''));
    row.append(el('span', '', o.done ? '✔ ' : '○ '), el('span', '', o.label), el('span', 'muted', `（${o.type === 'primary' ? '主要' : '次要'}）`));
    box.append(row);
  }
}

function renderMap() {
  const wrap = $('#mapWrap');
  wrap.replaceChildren();
  const map = view.scene.map;
  const grid = el('div', 'grid');
  grid.style.gridTemplateColumns = `repeat(${map[0].length}, var(--cell))`;
  const tokens = new Map();
  for (const a of view.actors) if (a.status === 'active') tokens.set(`${a.x},${a.y}`, a);
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[0].length; x++) {
      const cell = el('button', 'cell' + (map[y][x] === '#' ? ' wall' : ''));
      cell.dataset.x = x; cell.dataset.y = y;
      cell.setAttribute('aria-label', `格 ${x},${y}`);
      const a = tokens.get(`${x},${y}`);
      if (a) {
        const tok = el('span', 'token ' + (a.side === 'party' ? 'party' : 'enemy'), a.name.slice(0, 1));
        tok.title = a.name;
        if (a.id === view.activeActorId) tok.classList.add('acting');
        if (selected.target === a.id) tok.classList.add('selected');
        cell.append(tok);
      }
      if (selected.cell && selected.cell.x === x && selected.cell.y === y) cell.classList.add('selected');
      if (map[y][x] === '.') cell.onclick = () => onCell(a, x, y);
      grid.append(cell);
    }
  }
  wrap.append(grid);
}

function onCell(actor, x, y) {
  if (actor) { selected.target = actor.side === 'enemy' ? actor.id : null; selected.cell = null; }
  else { selected.cell = { x, y }; selected.target = null; }
  renderMap();
  renderActions();
}

function renderPending() {
  const box = $('#pending');
  box.replaceChildren();
  const p = view.pending;
  if (!p) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const owner = view.actors.find(a => a.id === p.ownerActorId);
  box.append(el('strong', '', `${owner?.name || '角色'} 需要决定：`));
  for (const c of p.choices) {
    const b = el('button', '', c.label);
    b.onclick = () => send({ type: 'react', actorId: p.ownerActorId, choice: c.id }, 'react');
    box.append(b);
  }
}

function renderActions() {
  const box = $('#actions');
  box.replaceChildren();
  const a = activeActor();
  if (!a) { box.append(el('span', 'muted', '没有可行动的角色。')); return; }
  if (view.pending) { box.append(el('span', 'muted', '先处理待定决策。')); return; }
  if (a.controller !== 'player') {
    box.append(el('span', 'muted', `${a.name} 由规则策略行动。`));
    const b = el('button', 'primary', '推进自动回合');
    b.onclick = advance;
    box.append(b);
    return;
  }
  const weapons = Object.keys(a.inventory || {});
  const wid = a.readied;
  const w = catalog.weapons[wid];
  const isMelee = w?.kind === 'melee';
  const target = view.actors.find(t => t.id === selected.target && t.status === 'active');

  const btn = (label, fn, disabled = false, title = '') => { const b = el('button', '', label); b.onclick = fn; b.disabled = disabled || busy; b.title = title; return b; };

  box.append(btn('瞄准（半）', () => send({ type: 'aim', actorId: a.id, full: false }, 'aim')));
  box.append(btn('瞄准（全）', () => send({ type: 'aim', actorId: a.id, full: true }, 'aim')));
  box.append(btn('攻击（单发）', () => attack(a, target, 'single'), !target));
  box.append(btn('攻击（半自动）', () => attack(a, target, 'semi'), !target || isMelee));
  box.append(btn('攻击（全自动）', () => attack(a, target, 'full'), !target || isMelee));
  if (isMelee) box.append(btn('攻击（全力）', () => attack(a, target, 'all_out'), !target));
  const other = weapons.find(x => x !== wid);
  if (other) box.append(btn(`换装 ${catalog.weapons[other]?.name || other}`, () => send({ type: 'ready', actorId: a.id, weaponId: other }, 'ready')));
  box.append(btn('装填', () => send({ type: 'reload', actorId: a.id }, 'reload')));
  if (a.inventory[wid]?.jammed) box.append(btn('排除卡壳', () => send({ type: 'clear_jam', actorId: a.id }, 'jam')));
  box.append(btn(a.stance === 'prone' ? '起身' : '卧倒', () => send({ type: a.stance === 'prone' ? 'stand' : 'stance', actorId: a.id, stance: 'prone' }, 'stance')));
  box.append(btn('结束回合', () => send({ type: 'end_turn', actorId: a.id }, 'end'), false, '剩余动作会被放弃'));

  if (selected.cell) {
    const dist = Math.max(Math.abs(selected.cell.x - a.x), Math.abs(selected.cell.y - a.y));
    const b = el('button', 'primary', `移动到 (${selected.cell.x},${selected.cell.y}) · ${dist} 格`);
    b.disabled = busy;
    b.onclick = () => send({ type: 'move', actorId: a.id, x: selected.cell.x, y: selected.cell.y, pace: a.ap >= 2 && dist > 4 ? 'full' : 'half' }, 'move');
    box.append(b);
  }
  for (const obj of view.scene.objects || []) {
    if (Math.max(Math.abs(obj.x - a.x), Math.abs(obj.y - a.y)) > 1) continue;
    for (const ch of obj.choices) {
      if (view.flags[`done:${obj.id}:${ch.id}`]) continue;
      box.append(btn(`${obj.name}：${ch.label}`, () => send({ type: 'interact', actorId: a.id, objectId: obj.id, choiceId: ch.id }, 'interact')));
    }
  }
  for (const exit of view.scene.exits || []) {
    const missing = (exit.requires || []).filter(f => !view.flags[f]);
    box.append(btn(`${exit.label}${missing.length ? '（未解锁）' : ''}`, () => send({ type: 'travel', actorId: a.id, sceneId: exit.to }, 'travel'), missing.length > 0));
  }
}

function attack(a, target, mode) {
  if (!target) return;
  send({ type: 'attack', actorId: a.id, targetId: target.id, mode }, 'attack');
}

async function send(command, prefix) {
  if (busy) return;
  busy = true;
  try {
    const res = await call(`/sessions/${current}/commands`, {
      method: 'POST',
      body: JSON.stringify({ requestId: requestId(prefix), expectedVersion: view.version, command }),
    });
    view = res.state;
    selected.target = null; selected.cell = null;
    render();
    await afterCommand();
  } catch (e) {
    flash(e.message);
  } finally {
    busy = false;
    renderActions();
  }
}

/** Enemy/companion turns are driven by the server; the client just asks to advance. */
async function afterCommand() {
  let guard = 0;
  while (view && view.combat && !view.pending && guard++ < 40) {
    const a = activeActor();
    if (!a || a.controller === 'player') break;
    try {
      const res = await call(`/sessions/${current}/advance`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: view.version }),
      });
      view = res.state;
      render();
    } catch (e) {
      if (!/需要玩家操作|状态已更新|正在处理/.test(e.message)) flash(e.message);
      break;
    }
  }
}

async function advance() {
  busy = true;
  try {
    const res = await call(`/sessions/${current}/advance`, { method: 'POST', body: JSON.stringify({ expectedVersion: view.version }) });
    view = res.state; render();
  } catch (e) { flash(e.message); }
  finally { busy = false; renderActions(); }
}

function renderEvents() {
  const box = $('#events');
  box.replaceChildren(el('h3', '', '结算与叙事'));
  const list = el('div', 'event-list');
  for (const ev of (view.lastEvents || []).slice(-12)) list.append(el('p', 'event ' + ev.type, ev.text));
  box.append(list);
  const dice = (view.lastEvents || []).filter(e => e.test).pop();
  const card = $('#diceCard');
  card.replaceChildren();
  if (dice) {
    const t = dice.test;
    card.append(el('h4', '', `检定 · 目标 ${t.target}`));
    card.append(el('div', 'muted', `基础 ${t.base} ${t.parts.map(p => `${p.label} ${p.value > 0 ? '+' : ''}${p.value}`).join(' ')}`));
    card.append(el('div', 'dice', `d100 = ${t.roll}`));
    card.append(el('div', t.success ? 'ok' : 'bad', t.success ? `成功（程度 ${t.degrees}）` : '失败'));
  } else card.append(el('p', 'muted', '尚未进行检定。'));
}

function renderWorldbook() {
  const box = $('#worldbook');
  box.replaceChildren(el('h3', '', '公开世界书'));
  for (const lore of view.mission.publicLore || []) {
    const d = el('details');
    d.append(el('summary', '', lore.title || '条目'), el('p', '', lore.text));
    box.append(d);
  }
}

function flash(message) {
  const box = $('#events');
  const p = el('p', 'error', message);
  box.prepend(p);
  setTimeout(() => p.remove(), 6000);
}

boot();
