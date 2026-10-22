/** 死亡守望 UI。设计语言与《怒火与荣耀》模块一致：同一套 token、卡片、按钮与侧栏结构。
 *  服务端拥有所有数值；前端只负责渲染与提交意图。 */
const API = '/api/games/deathwatch-d100';
const LS_SESSION = 'dw-session';
const LS_DRAFT = 'dw-draft';
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

let catalog = null, missions = [], sessions = [];
let current = null, view = null, draft = null, draftId = null;
let busy = false, selected = {cell: null, target: null}, proposal = null;

async function request(path, options = {}) {
  const response = await fetch(API + path, {headers: {'Content-Type': 'application/json'}, ...options});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `请求失败（${response.status}）`);
  return body;
}
const newRequestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const say = (message) => { const target = document.getElementById('play').hidden ? $('start-msg') : $('play-msg'); if (target) target.textContent = message || ''; };
const phaseName = (p) => ({briefing: '简报', exploration: '探索', combat: '战斗', debrief: '结算', victory: '胜利', defeat: '失败'})[p] || p;

function show(which) {
  $('start').hidden = which !== 'start';
  $('creation').hidden = which !== 'creation';
  $('play').hidden = which !== 'play';
}

/* ---------------- 启动 ---------------- */
async function boot() {
  try {
    const root = await request('');
    catalog = root.catalog;
    missions = root.missions;
    sessions = root.sessions;
    $('moduleDesc').textContent = root.module.description;
    $('moduleState').textContent = root.module.phase === 'playable' ? '可玩' : '开发中 · 实验';
    $('rulesNote').textContent = root.module.disclaimer || '';
    renderStart();
    const saved = localStorage.getItem(LS_SESSION);
    if (saved) {
      try { await openSession(saved); } catch { localStorage.removeItem(LS_SESSION); }
    }
  } catch (error) {
    $('moduleState').textContent = '模块不可用';
    $('moduleDesc').textContent = error.message;
    say(error.message);
  }
}

function renderStart() {
  $('missions').innerHTML = missions.map((m, i) => `
    <article class="card">
      <h3>${esc(m.title)}</h3>
      <div class="sub">${m.sourceKind === 'original' ? '原创测试任务' : '私有改编'} · ${m.scenes} 场景</div>
      <p class="lead small">${esc(m.description || '')}</p>
      <div class="actions"><button class="btn ${i === 0 ? 'primary' : 'ghost'} small" data-mission="${esc(m.id)}">新建小队</button></div>
    </article>`).join('') || '<p class="empty">还没有可用副本。</p>';
  $('sessions').innerHTML = sessions.map((s) => `
    <article class="card">
      <h3>${esc(s.title || '未命名战役')}</h3>
      <div class="sub">${esc(s.mission)} · ${phaseName(s.phase)}</div>
      <div class="actions"><button class="btn small" data-session="${esc(s.id)}">继续</button></div>
    </article>`).join('') || '<p class="empty">还没有存档；先新建一支小队。</p>';
  document.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', () => openSession(b.dataset.session)));
  document.querySelectorAll('[data-mission]').forEach((b) => b.addEventListener('click', () => openCreation()));
}

/* ---------------- 建团 ---------------- */
const ROLES = [['pc', '主角'], ['ally-1', '战斗兄弟 1'], ['ally-2', '战斗兄弟 2']];
const ATTR_LABELS = {ws: '武器技巧', bs: '射击技巧', s: '力量', t: '坚韧', ag: '敏捷', int: '智力', per: '感知', wp: '意志', fel: '交涉'};

function openCreation() {
  show('creation');
  $('createError').textContent = '';
  fillSlots();
  const saved = localStorage.getItem(LS_DRAFT);
  if (saved) {
    draftId = saved;
    request(`/creation/${saved}`).then((r) => { draft = r.draft; renderDraft(); })
      .catch(() => { localStorage.removeItem(LS_DRAFT); draftId = null; startDraft(); });
  } else {
    startDraft();
  }
}

function fillSlots() {
  $('slots').innerHTML = ROLES.map(([id, label]) => `
    <fieldset class="slot" data-id="${id}">
      <legend>${label}${id === 'pc' ? ' · 你控制' : ' · AI 决策，可接管'}</legend>
      <input data-role="name" maxlength="24" value="${id === 'pc' ? '塞维鲁' : id === 'ally-1' ? '凯' : '德拉科'}">
      <select data-role="chapter">${catalog.chapters.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <select data-role="specialty">${catalog.specialties.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <div class="chapter-choice" hidden>
        <span class="empty">极限战士加值：</span>
        <select data-role="c1">${Object.entries(ATTR_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select data-role="c2">${Object.entries(ATTR_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </div>
      <div class="attrs"></div>
    </fieldset>`).join('');
  const slot = (id) => document.querySelector(`.slot[data-id="${id}"]`);
  slot('ally-1').querySelector('[data-role=chapter]').value = 'blood-angels';
  slot('ally-1').querySelector('[data-role=specialty]').value = 'assault';
  slot('ally-2').querySelector('[data-role=chapter]').value = 'dark-angels';
  slot('ally-2').querySelector('[data-role=specialty]').value = 'devastator';
  slot('pc').querySelector('[data-role=c2]').value = 'bs';
  for (const id of ['pc', 'ally-1', 'ally-2']) {
    const box = slot(id);
    for (const el of box.querySelectorAll('select, input')) el.addEventListener('change', () => syncSpec(id));
    const chapter = box.querySelector('[data-role=chapter]');
    const syncChoice = () => { box.querySelector('.chapter-choice').hidden = chapter.value !== 'ultramarines'; };
    chapter.addEventListener('change', syncChoice);
    syncChoice();
  }
  $('leader').innerHTML = ROLES.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
  $('oath').innerHTML = catalog.oaths.map((o) => `<option value="${o.id}">${esc(o.name)}（${esc(o.effect)}）</option>`).join('');
  renderRequisition();
}

function specsFromForm() {
  const out = [];
  for (const box of document.querySelectorAll('.slot')) {
    const get = (role) => box.querySelector(`[data-role=${role}]`).value;
    const item = {id: box.dataset.id, name: get('name').trim(), chapter: get('chapter'), specialty: get('specialty')};
    if (get('chapter') === 'ultramarines') item.chapterChoice = [get('c1'), get('c2')];
    out.push(item);
  }
  return out;
}

async function startDraft() {
  try {
    const r = await request('/creation/roll', {method: 'POST', body: JSON.stringify({squad: specsFromForm()})});
    draftId = r.draftId; draft = r.draft;
    localStorage.setItem(LS_DRAFT, draftId);
    renderDraft();
  } catch (error) { $('createError').textContent = error.message; }
}

async function syncSpec() {
  if (!draftId) return;
  const box = document.activeElement?.closest?.('.slot');
  const id = box?.dataset?.id || 'pc';
  const get = (role) => document.querySelector(`.slot[data-id="${id}"] [data-role=${role}]`).value;
  const payload = {draftId, actorId: id, name: get('name'), chapter: get('chapter'), specialty: get('specialty')};
  if (get('chapter') === 'ultramarines') payload.chapterChoice = [get('c1'), get('c2')];
  try {
    const r = await request('/creation/spec', {method: 'POST', body: JSON.stringify(payload)});
    draft = r.draft; renderDraft(); $('createError').textContent = '';
  } catch (error) { $('createError').textContent = error.message; }
}

async function reroll(id) {
  try {
    const r = await request('/creation/reroll', {method: 'POST', body: JSON.stringify({draftId, actorId: id})});
    draft = r.draft; renderDraft();
  } catch (error) { $('createError').textContent = error.message; }
}

function renderDraft() {
  if (!draft) return;
  for (const box of document.querySelectorAll('.slot')) {
    const row = draft.squad.find((s) => s.id === box.dataset.id);
    const host = box.querySelector('.attrs');
    if (!row) { host.innerHTML = ''; continue; }
    const attrs = Object.entries(row.final).map(([k, v]) => `<span class="attr">${ATTR_LABELS[k] || k} ${v}</span>`).join('');
    const button = `<button class="btn small" type="button" data-reroll="${esc(row.id)}"${row.rerolled ? ' disabled' : ''}>${row.rerolled ? '已重掷' : '重掷最低项'}</button>`;
    host.innerHTML = attrs + button;
  }
  document.querySelectorAll('[data-reroll]').forEach((b) => b.addEventListener('click', () => reroll(b.dataset.reroll)));
  $('leader').innerHTML = draft.squad.map((s) => `<option value="${s.id}">${esc(s.name || s.id)}（${esc(s.specialtyName)}）</option>`).join('');
}

function renderRequisition() {
  const items = Object.values(catalog.weapons).filter((w) => (w.req ?? 0) > 0 && !w.npc && (w.renown ?? 0) <= 0);
  $('requisition').innerHTML = items.map((w) => `
    <label class="req-item">
      <input type="checkbox" value="${esc(w.id)}" data-cost="${w.req}">
      <span>${esc(w.name)}（征用 ${w.req}）</span>
      <select>${ROLES.map(([id]) => `<option value="${id}">${id}</option>`).join('')}</select>
    </label>`).join('');
  document.querySelectorAll('#requisition input').forEach((cb) => cb.addEventListener('change', () => updateBudget()));
  updateBudget();
}

function updateBudget() {
  const budget = missions[0]?.requisition ?? 30;
  let spent = 0;
  for (const cb of document.querySelectorAll('#requisition input:checked')) spent += Number(cb.dataset.cost);
  $('reqBudget').textContent = `已用 ${spent} / ${budget}${spent > budget ? '（超预算，服务端会拒绝）' : ''}`;
  $('reqBudget').style.color = spent > budget ? 'var(--bad)' : 'var(--faint)';
}

function requisitionFromForm() {
  return [...document.querySelectorAll('#requisition .req-item')].filter((row) => row.querySelector('input').checked)
    .map((row) => ({actorId: row.querySelector('select').value, weaponId: row.querySelector('input').value}));
}

async function submitSquad() {
  const err = $('createError');
  err.textContent = '';
  if (!draftId) await startDraft();
  if (!draftId) return;
  $('submitSquad').disabled = true;
  try {
    const created = await request('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        title: $('title').value.trim() || '守望任务',
        missionId: missions[0].id,
        missionVersion: missions[0].version,
        leaderId: $('leader').value,
        oathId: $('oath').value,
        weaponProfile: $('weaponProfile').value,
        requisition: requisitionFromForm(),
        draftId,
      }),
    });
    localStorage.removeItem(LS_DRAFT);
    draft = null; draftId = null;
    await openSession(created.state.id);
  } catch (error) {
    err.textContent = error.message;
  } finally {
    $('submitSquad').disabled = false;
  }
}

/* ---------------- 游戏界面 ---------------- */
async function openSession(id) {
  const snap = await request(`/sessions/${id}`);
  current = id;
  localStorage.setItem(LS_SESSION, id);
  renderPlay(snap.state);
}

function renderPlay(state) {
  view = state;
  say('');
  view.id = view.id || current;
  show('play');
  const active = view.actors.find((a) => a.id === view.activeActorId);
  $('scene-part').textContent = view.combat ? `第 ${view.combat.round} 轮 · 战斗` : phaseName(view.phase);
  $('scene-title').textContent = view.scene.name;
  $('scene-desc').textContent = view.scene.description || '';
  $('round').textContent = view.combat ? view.combat.round : '—';
  $('ap').textContent = active ? `${active.ap}` : '—';
  $('cohesion').textContent = view.cohesion ?? '—';
  $('version').textContent = view.version;
  renderMap();
  renderSheet();
  renderPending();
  renderActions();
  renderProposal();
}

const CHAPTER_HUE = {'ultramarines': 'ultra', 'blood-angels': 'blood', 'dark-angels': 'dark', 'space-wolves': 'wolf', 'black-templars': 'templar', 'storm-wardens': 'storm'};

/** 与服务器同规则的路径预览：切比雪夫距离、斜向不切墙角、活体占位。 */
function pathPreview() {
  const active = view.actors.find((a) => a.id === view.activeActorId);
  if (!active || !selected.cell || view.pending || active.controller !== 'player') return null;
  const map = view.scene.map;
  const blocked = new Set(view.actors.filter((a) => a.status === 'active' && a.id !== active.id).map((a) => `${a.x},${a.y}`));
  const start = `${active.x},${active.y}`, goal = `${selected.cell.x},${selected.cell.y}`;
  if (blocked.has(goal) || map[selected.cell.y][selected.cell.x] === '#') return null;
  const prev = new Map([[start, null]]);
  const queue = [[active.x, active.y]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (`${x},${y}` === goal) {
      const out = [];
      let cur = goal;
      while (cur !== start) { out.push(cur); cur = prev.get(cur); }
      return out.reverse();
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (ny < 0 || ny >= map.length || nx < 0 || nx >= map[0].length) continue;
      if (map[ny][nx] === '#' || blocked.has(`${nx},${ny}`) || prev.has(`${nx},${ny}`)) continue;
      if (dx && dy && (map[y][nx] === '#' || map[ny][x] === '#')) continue;
      prev.set(`${nx},${ny}`, `${x},${y}`); queue.push([nx, ny]);
    }
  }
  return null;
}

let fitTimer = null;
/** 按可用空间算出格子尺寸，保证整块棋盘不裁切、不出现内部滚动。 */
function fitBoard(width, height) {
  const board = document.querySelector('.board');
  const area = document.querySelector('.map-stage');
  const map = $('map');
  if (!board || !area || !map) return;
  // 用真实外框尺寸（头/脚/内边距/标尺）反推格子大小，避免拍脑袋的常量。
  const chromeH = Math.max(60, board.offsetHeight - map.offsetHeight);
  const chromeW = Math.max(40, board.offsetWidth - map.offsetWidth);
  const availH = area.clientHeight - chromeH - (height - 1) - 6;
  const availW = area.clientWidth - chromeW - (width - 1) - 6;
  const cell = Math.max(11, Math.min(34, Math.floor(Math.min(availH / height, availW / width))));
  board.style.setProperty('--cell', `${cell}px`);
  $('col-ruler').style.gridTemplateColumns = `repeat(${width}, ${cell}px)`;
  $('row-ruler').style.gridTemplateRows = `repeat(${height}, ${cell}px)`;
  map.style.gridTemplateColumns = `repeat(${width}, ${cell}px)`;
}
addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => { if (view) renderMap(); }, 140); });

function renderMap() {
  const map = view.scene.map;
  const width = map[0].length, height = map.length;
  const tokens = new Map();
  for (const a of view.actors) if (a.status === 'active') tokens.set(`${a.x},${a.y}`, a);
  const covers = new Set((view.scene.cover || []).map((c) => `${c.x},${c.y}`));
  const path = pathPreview();
  const pathSet = new Set(path || []);
  const moveLimit = view.actors.find((a) => a.id === view.activeActorId);
  const html = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const wall = map[y][x] === '#';
      const a = tokens.get(key);
      const cls = ['cell', wall ? 'wall' : 'floor'];
      // 甲板接缝：每四格一条细线，比棋盘格更像舰体/巢都地面。
      if (!wall && x % 4 === 0 && x > 0) cls.push('seam-x');
      if (!wall && y % 4 === 0 && y > 0) cls.push('seam-y');
      if (covers.has(key) && !wall) cls.push('cover');
      if (pathSet.has(key)) cls.push('path');
      if (selected.cell && selected.cell.x === x && selected.cell.y === y) cls.push('selected');
      const hp = a ? Math.max(0, Math.min(1, 1 - (a.damage || 0) / Math.max(1, a.maxWounds || 1))) : 1;
      const tok = a ? `<span class="token ${a.side === 'party' ? 'party' : 'enemy'}${a.side === 'party' ? ' hue-' + (CHAPTER_HUE[a.chapter] || 'ultra') : ''}${a.id === view.activeActorId ? ' acting' : ''}${selected.target === a.id ? ' selected' : ''}" style="--hp:${hp.toFixed(3)}" title="${esc(a.name)} · ${a.damage}/${a.maxWounds}">${esc(a.name.slice(0, 1))}</span>` : (covers.has(key) && !wall ? '<span class="cover-mark" title="掩体"></span>' : '');
      html.push(`<button type="button" class="${cls.join(' ')}" data-x="${x}" data-y="${y}" aria-label="格 ${x},${y}">${tok}</button>`);
    }
  }
  $('map').innerHTML = html.join('');
  $('map').style.gridTemplateColumns = `repeat(${width}, var(--cell, 30px))`;
  $('col-ruler').innerHTML = Array.from({length: width}, (_, i) => `<span>${String.fromCharCode(65 + (i % 26))}</span>`).join('');
  $('row-ruler').innerHTML = Array.from({length: height}, (_, i) => `<span>${String(i + 1).padStart(2, '0')}</span>`).join('');
  $('col-ruler').style.gridTemplateColumns = `repeat(${width}, var(--cell, 30px))`;
  $('row-ruler').style.gridTemplateRows = `repeat(${height}, var(--cell, 30px))`;
  const narrow = innerWidth < 760;
  $('board-meta').textContent = narrow ? `${width} × ${height}` : `${width} × ${height} 格 · 1 米/格`;
  requestAnimationFrame(() => fitBoard(width, height));
  const hint = $('board-hint');
  if (path && moveLimit) {
    hint.textContent = narrow ? `路径 ${path.length} 格` : `路径 ${path.length} 格 · ${path.length <= (moveLimit.ap >= 2 ? 10 : 5) ? '可达' : '超出半/全动作'}`;
  } else if (selected.cell) {
    hint.textContent = '该格不可达';
  } else if (selected.target) {
    const target = view.actors.find((a) => a.id === selected.target);
    const active = view.actors.find((a) => a.id === view.activeActorId);
    hint.textContent = active && target ? `目标 ${target.name} · 距离 ${Math.max(Math.abs(active.x - target.x), Math.abs(active.y - target.y))} 米` : '';
  } else {
    hint.textContent = narrow ? '点格预览 · 点敌锁定' : '点击地格预览路径，点击敌人锁定目标';
  }
}
function actorCard(a) {
  const w = catalog.weapons[a.readied] || {name: a.readied};
  const inv = a.inventory?.[a.readied] || {};
  const status = a.status === 'active' ? (a.id === view.activeActorId ? '行动中' : '就绪') : a.status === 'unconscious' ? '失能' : a.status === 'dead' ? '阵亡' : a.status;
  return `<article class="card hue-${CHAPTER_HUE[a.chapter] || 'ultra'}">
    <h3>${esc(a.name)}</h3>
    <div class="sub">${esc((catalog.specialties.find((s) => s.id === a.specialty) || {}).name || a.specialty)} · ${esc((catalog.chapters.find((c) => c.id === a.chapter) || {}).name || a.chapter)}</div>
    <div class="stats">
      <div class="stat"><small>创伤</small><b>${a.damage}/${a.maxWounds}</b></div>
      <div class="stat"><small>命运</small><b>${a.fate}/${a.maxFate}</b></div>
      <div class="stat"><small>动作</small><b>${a.ap}</b></div>
      <div class="stat"><small>反应</small><b>${a.reactions}</b></div>
      <div class="stat"><small>模式</small><b>${a.mode === 'squad' ? '小队' : '单兵'}</b></div>
      <div class="stat"><small>状态</small><b>${status}</b></div>
    </div>
    <div class="sub" style="margin:8px 0 0">${esc(w.name)} · 弹匣 ${inv.clip ?? '—'}/${inv.reserve ?? '—'}</div>
  </article>`;
}

function renderSheet() {
  const party = view.actors.filter((a) => a.side === 'party');
  $('pane-party').innerHTML = `<div class="cards">${party.map(actorCard).join('')}</div>`;
  $('pane-objectives').innerHTML = `<h2>任务目标</h2>${(view.objectives || []).map((o) => `
    <div class="objective${o.done ? ' done' : ''}"><span>${o.done ? '✔' : '○'}</span><span>${esc(o.label)}</span>
    <span class="empty">（${o.type === 'primary' ? '主要' : o.type === 'secondary' ? '次要' : '机会'}）</span></div>`).join('')}`;
  $('pane-lore').innerHTML = `<h2>公开世界书</h2>${(view.mission.publicLore || []).map((l, i) => `
    <details class="lore"${i === 0 ? ' open' : ''}><summary>${esc(l.title || '条目')}</summary><p>${esc(l.text)}</p></details>`).join('')}`;
  const dice = (view.lastEvents || []).filter((e) => e.test).pop();
  const diceHtml = dice ? `<div class="dice-card"><h2 style="margin-top:0">检定 · 目标 ${dice.test.target}</h2>
    <div class="empty">基础 ${dice.test.base} ${dice.test.parts.map((p) => `${esc(p.label)} ${p.value > 0 ? '+' : ''}${p.value}`).join(' ')}</div>
    <div class="die-big ${dice.test.success ? 'ok' : 'bad'}">${dice.test.roll}</div>
    <div class="${dice.test.success ? 'objective done' : 'objective'}">${dice.test.success ? `成功（程度 ${dice.test.degrees}）` : '失败'}</div></div>` : '';
  $('pane-log').innerHTML = diceHtml + `<h2>行动记录</h2><ol id="log">${(view.journal || []).slice(-18).map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
}

/* ---------------- 决策、提案与结算 ---------------- */
function renderPending() {
  const box = $('pending');
  const p = view.pending;
  if (!p) { box.hidden = true; box.innerHTML = ''; return; }
  const owner = view.actors.find((a) => a.id === p.ownerActorId);
  box.hidden = false;
  box.innerHTML = `<h3>等待 ${esc(owner?.name || '角色')} 决定</h3>
    <p class="lead small">${p.kind === 'reaction' ? '命中已经掷出，伤害将在防御决定后结算。' : '需要先完成这个决策，才能继续。'}</p>
    <div class="actions">${p.choices.map((c) => `<button class="btn ${c.id === 'none' ? 'ghost' : 'primary'} small" data-react="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div>`;
  box.querySelectorAll('[data-react]').forEach((b) => b.addEventListener('click', () => {
    send({type: 'react', actorId: p.ownerActorId, choice: b.dataset.react}, 'react');
  }));
}

function describeCommand(c) {
  if (!c) return '（无动作）';
  const map = {move: '移动', attack: '攻击', aim: '瞄准', ready: '换装', reload: '装填', clear_jam: '排除卡壳', stance: '调整姿态', stand: '起身', end_turn: '结束回合', interact: '交互', travel: '前往', medicae: '急救', squad_mode: '进入小队模式', solo_mode: '进入单兵模式', power: '灵能', skill: '技能检定', support: '呼叫支援', fate: '使用命运', debrief: '结算任务', react: '防御'};
  let text = map[c.type] || c.type;
  if (c.type === 'move') text += ` → (${c.x},${c.y})`;
  if (c.type === 'aim') text += c.full ? '（全动作）' : '（半动作）';
  if (c.type === 'attack') text += ` ${c.mode || 'single'} → ${c.targetId}`;
  if (c.type === 'react') text += `（${c.choice}）`;
  if (c.type === 'travel') text += ` → ${c.sceneId}`;
  return text;
}

function renderProposal() {
  const box = $('proposal');
  if (!proposal) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<div class="who">规则引擎提案 · ${esc(proposal.source || '')}</div>
    <div><b>${esc(describeCommand(proposal.command))}</b></div>
    ${proposal.line ? `<p class="lead small">“${esc(proposal.line)}”</p>` : ''}
    <div class="actions">
      <button class="btn primary small" data-confirm="1">确认执行</button>
      <button class="btn ghost small" data-cancel="1">放弃</button>
    </div>`;
  box.querySelector('[data-confirm]').onclick = () => { const c = proposal.command; proposal = null; send(c, 'plan'); };
  box.querySelector('[data-cancel]').onclick = () => { proposal = null; renderProposal(); };
}

async function askProposal() {
  const input = $('input').value.trim();
  if (!input || !view) return;
  $('ask').disabled = true;
  proposal = null; renderProposal();
  try {
    const r = await request(`/sessions/${current}/plan`, {
      method: 'POST',
      body: JSON.stringify({input, actorId: 'pc', expectedVersion: view.version}),
    });
    proposal = r.proposal;
    renderProposal();
    $('input').value = '';
  } catch (error) {
    say(error.message);
    const box = $('proposal');
    box.hidden = false;
    box.innerHTML = `<div class="who">提案失败</div><div class="error">${esc(error.message)}</div>`;
  } finally {
    $('ask').disabled = false;
  }
}

async function send(command, prefix) {
  if (busy) return;
  busy = true;
  $('action-bar').querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const r = await request(`/sessions/${current}/commands`, {
      method: 'POST',
      body: JSON.stringify({requestId: `${prefix}:${newRequestId()}`, expectedVersion: view.version, command}),
    });
    selected = {cell: null, target: null};
    renderPlay(r.state);
    await afterCommand();
  } catch (error) {
    say(error.message);
  } finally {
    busy = false;
    if (view) renderActions();
  }
}

async function afterCommand() {
  let guard = 0;
  while (view?.combat && !view.pending && guard++ < 40) {
    const active = view.actors.find((a) => a.id === view.activeActorId);
    if (!active || active.controller === 'player') break;
    try {
      const r = await request(`/sessions/${current}/advance`, {method: 'POST', body: JSON.stringify({expectedVersion: view.version})});
      renderPlay(r.state);
    } catch (error) {
      if (!/需要玩家操作|状态已更新|正在处理/.test(error.message)) say(error.message);
      break;
    }
  }
}

async function advance() {
  try {
    const r = await request(`/sessions/${current}/advance`, {method: 'POST', body: JSON.stringify({expectedVersion: view.version})});
    renderPlay(r.state);
  } catch (error) { say(error.message); }
}

/* ---------------- 动作栏 ---------------- */
function renderActions() {
  const bar = $('action-bar');
  if (!view) { bar.innerHTML = ''; return; }
  const active = view.actors.find((a) => a.id === view.activeActorId);
  if (view.pending) { bar.innerHTML = '<span class="empty">先处理上方的待定决策。</span>'; return; }
  if (!active) { bar.innerHTML = '<span class="empty">没有可行动的角色。</span>'; return; }
  if (active.controller !== 'player') {
    bar.innerHTML = `<span class="empty">${esc(active.name)} 由规则策略行动</span><button class="btn primary small" data-act="advance">推进自动回合</button>`;
    return;
  }
  const weapons = Object.keys(active.inventory || {});
  const w = catalog.weapons[active.readied] || {};
  const melee = w.kind === 'melee';
  const target = view.actors.find((a) => a.id === selected.target && a.status === 'active');
  const btn = (label, attrs, disabled = false) => `<button class="btn small" ${attrs}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
  const out = [];
  out.push(btn('瞄准（半）', 'data-act="aim" data-full="0"'));
  out.push(btn('瞄准（全）', 'data-act="aim" data-full="1"'));
  out.push(btn('攻击（单发）', 'data-act="attack" data-mode="single"', !target));
  out.push(btn('攻击（半自动）', 'data-act="attack" data-mode="semi"', !target || melee));
  out.push(btn('攻击（全自动）', 'data-act="attack" data-mode="full"', !target || melee));
  if (melee) out.push(btn('攻击（全力）', 'data-act="attack" data-mode="all_out"', !target));
  const other = weapons.find((x) => x !== active.readied);
  if (other) out.push(btn(`换装 ${catalog.weapons[other]?.name || other}`, `data-act="ready" data-weapon="${esc(other)}"`));
  out.push(btn('装填', 'data-act="reload"'));
  if (active.inventory?.[active.readied]?.jammed) out.push(btn('排除卡壳', 'data-act="jam"'));
  out.push(btn(active.stance === 'prone' ? '起身' : '卧倒', 'data-act="stance"'));
  out.push(btn('结束回合', 'data-act="end"'));
  if (selected.cell) out.push(btn(`移动到 (${selected.cell.x},${selected.cell.y})`, `data-act="move" data-x="${selected.cell.x}" data-y="${selected.cell.y}"`));
  for (const obj of view.scene.objects || []) {
    if (Math.max(Math.abs(obj.x - active.x), Math.abs(obj.y - active.y)) > 1) continue;
    for (const ch of obj.choices) {
      if (ch.done) continue;
      out.push(btn(`${obj.name}：${ch.label}`, `data-act="interact" data-obj="${esc(obj.id)}" data-choice="${esc(ch.id)}"`));
    }
  }
  for (const exit of view.scene.exits || []) {
    const missing = (exit.requires || []).filter((f) => !view.flags[f]);
    out.push(btn(missing.length ? `${exit.label}（未解锁）` : exit.label, `data-act="travel" data-scene="${esc(exit.to)}"`, missing.length > 0));
  }
  bar.innerHTML = out.join('');
}

$('map').addEventListener('click', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell || cell.classList.contains('wall') || !view) return;
  const x = Number(cell.dataset.x), y = Number(cell.dataset.y);
  const actor = view.actors.find((a) => a.status === 'active' && a.x === x && a.y === y);
  if (actor && actor.side === 'enemy') { selected = {cell: null, target: actor.id}; }
  else if (!actor) { selected = {cell: {x, y}, target: null}; }
  else { selected = {cell: null, target: null}; }
  renderMap(); renderActions();
});

$('action-bar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-act]');
  if (!button || !view) return;
  const act = button.dataset.act;
  const active = view.actors.find((a) => a.id === view.activeActorId);
  if (act === 'advance') return advance();
  if (!active) return;
  if (act === 'aim') return send({type: 'aim', actorId: active.id, full: button.dataset.full === '1'}, 'aim');
  if (act === 'attack') {
    const target = view.actors.find((a) => a.id === selected.target);
    if (!target) return;
    return send({type: 'attack', actorId: active.id, targetId: target.id, mode: button.dataset.mode}, 'attack');
  }
  if (act === 'ready') return send({type: 'ready', actorId: active.id, weaponId: button.dataset.weapon}, 'ready');
  if (act === 'reload') return send({type: 'reload', actorId: active.id}, 'reload');
  if (act === 'jam') return send({type: 'clear_jam', actorId: active.id}, 'jam');
  if (act === 'stance') return send({type: active.stance === 'prone' ? 'stand' : 'stance', actorId: active.id, stance: 'prone'}, 'stance');
  if (act === 'end') return send({type: 'end_turn', actorId: active.id}, 'end');
  if (act === 'move') return send({type: 'move', actorId: active.id, x: Number(button.dataset.x), y: Number(button.dataset.y), pace: active.ap >= 2 ? 'full' : 'half'}, 'move');
  if (act === 'interact') return send({type: 'interact', actorId: active.id, objectId: button.dataset.obj, choiceId: button.dataset.choice}, 'interact');
  if (act === 'travel') return send({type: 'travel', actorId: active.id, sceneId: button.dataset.scene}, 'travel');
});

function activateSheet(tab) {
  for (const pane of ['party', 'objectives', 'lore', 'log']) $(`pane-${pane}`).hidden = pane !== tab;
  document.querySelectorAll('[data-sheet-tab]').forEach((b) => b.classList.toggle('active', b.dataset.sheetTab === tab));
}
document.querySelectorAll('[data-sheet-tab]').forEach((b) => b.addEventListener('click', () => activateSheet(b.dataset.sheetTab)));

$('newSquad').addEventListener('click', openCreation);
$('submitSquad').addEventListener('click', submitSquad);
$('cancelCreate').addEventListener('click', () => { show('start'); renderStart(); });
$('ask').addEventListener('click', askProposal);
$('input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askProposal(); } });

boot();
