const API = '/api/games/wrath-glory';
const KEY = 'wg-training-session';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let session = null;
let sessionId = localStorage.getItem(KEY);

async function request(path, options = {}) {
  const response = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `请求失败（${response.status}）`);
  return body;
}

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function glyph(face) {
  if (face <= 3) return '·';
  if (face <= 5) return '◆';
  return '✦';
}

function dieClass(face, index) {
  const wrath = index === 0 ? ' wrath' : '';
  if (face === 6) return `die exalted${wrath}`;
  if (face >= 4) return `die icon${wrath}`;
  return `die${wrath}`;
}

function partyCard(actor, canAct) {
  const attack = canAct
    ? `<button class="btn small primary" data-attack="${esc(actor.id)}">开火</button>`
    : '';
  return `<article class="card">
    <h3>${esc(actor.name)}</h3>
    <div class="sub">${esc(actor.archetype)} · ${esc(actor.weapon?.name || '无武器')}</div>
    <div class="stats">
      <div class="stat"><small>DEFENCE</small><b>${actor.defence}</b></div>
      <div class="stat"><small>RESILIENCE</small><b>${actor.resilience}</b></div>
      <div class="stat"><small>WOUNDS</small><b>${actor.woundsTaken}/${actor.maxWounds}</b></div>
      <div class="stat"><small>SHOCK</small><b>${actor.shockTaken}/${actor.maxShock}</b></div>
      <div class="stat"><small>AGILITY</small><b>${actor.attributes.agility}</b></div>
      <div class="stat"><small>BALLISTIC</small><b>${actor.skills.ballisticSkill ?? 0}</b></div>
    </div>
    <div class="actions">${attack}</div>
  </article>`;
}

function enemyCard(actor) {
  return `<article class="card">
    <h3>${esc(actor.name)}</h3>
    <div class="sub">${esc(actor.archetype)} · 静止</div>
    <div class="stats">
      <div class="stat"><small>DEFENCE</small><b>${actor.defence}</b></div>
      <div class="stat"><small>RESILIENCE</small><b>${actor.resilience}</b></div>
      <div class="stat"><small>WOUNDS</small><b>${actor.woundsTaken}/${actor.maxWounds}</b></div>
      <div class="stat"><small>SHOCK</small><b>${actor.shockTaken}/${actor.maxShock}</b></div>
      <div class="stat"><small>STATUS</small><b>${actor.woundsTaken > actor.maxWounds ? '失能' : '待机'}</b></div>
      <div class="stat"><small>RANGE</small><b>12m</b></div>
    </div>
  </article>`;
}

function renderStart(listing) {
  $('start-party').innerHTML = (listing.party || []).map((p) => `<article class="card">
    <h3>${esc(p.name)}</h3>
    <div class="sub">${esc(p.archetype)} · Tier 1</div>
  </article>`).join('');
  $('start').hidden = false;
  $('play').hidden = true;
}

function renderPending(s) {
  const pending = s.pending;
  const box = $('pending');
  if (!pending) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = `<h3>结算：转化尊崇图标</h3>
    <p class="lead small">命中后还有 <b>${pending.roll.shiftable}</b> 个尊崇图标可转化（Exalted）。每次测试最多 1 个转为荣耀。</p>
    <div class="dice">${pending.roll.faces.map((face, index) => `<span class="${dieClass(face, index)}" title="${index === 0 ? '怒火骰' : ''}">${glyph(face)}</span>`).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-choice="damage">全部转为额外伤害骰</button>
      <button class="btn" data-choice="glory">1 点荣耀 + 其余伤害</button>
      <button class="btn ghost" data-choice="skip">跳过</button>
    </div>`;
}

function renderPlay(s) {
  session = s;
  $('start').hidden = true;
  $('play').hidden = false;
  $('scene-text').textContent = s.scene;
  $('glory').textContent = s.glory;
  $('ruin').textContent = s.ruin;
  $('round').textContent = s.round;
  const canAct = !s.pending && !s.result;
  $('party').innerHTML = s.party.map((a) => partyCard(a, canAct)).join('');
  $('enemy').innerHTML = s.enemies.map(enemyCard).join('');
  renderPending(s);
  $('log').innerHTML = s.log.slice(-18).map((line) => `<li>${esc(line)}</li>`).join('');
  $('end').hidden = !s.result;
  document.querySelectorAll('[data-attack]').forEach((button) => {
    button.addEventListener('click', () => attack(button.dataset.attack));
  });
  document.querySelectorAll('[data-choice]').forEach((button) => {
    button.addEventListener('click', () => decide(button.dataset.choice));
  });
}

async function start() {
  const button = $('start-btn');
  button.disabled = true;
  $('start-msg').textContent = '';
  try {
    const result = await request('/sessions', { method: 'POST', body: JSON.stringify({ scenarioId: 'training' }) });
    sessionId = result.session.id;
    localStorage.setItem(KEY, sessionId);
    renderPlay(result.session);
  } catch (error) {
    $('start-msg').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function attack(attackerId) {
  if (!session || session.pending || session.result) return;
  try {
    const result = await request(`/sessions/${sessionId}/commands`, {
      method: 'POST',
      body: JSON.stringify({
        requestId: newRequestId(),
        command: { type: 'attack', attackerId, targetId: 'training-servitor' },
      }),
    });
    renderPlay(result.session);
  } catch (error) {
    $('scene-text').textContent = `结算失败：${error.message}`;
  }
}

async function decide(choice) {
  if (!session?.pending) return;
  try {
    const result = await request(`/sessions/${sessionId}/decisions`, {
      method: 'POST',
      body: JSON.stringify({
        requestId: newRequestId(),
        decisionId: session.pending.decisionId,
        choice,
      }),
    });
    renderPlay(result.session);
  } catch (error) {
    $('scene-text').textContent = `结算失败：${error.message}`;
  }
}

async function boot() {
  let listing;
  try {
    listing = await request('');
  } catch (error) {
    $('start-msg').textContent = error.message;
    return;
  }
  renderStart(listing);
  if (sessionId) {
    try {
      const result = await request(`/sessions/${sessionId}`);
      renderPlay(result.session);
    } catch {
      localStorage.removeItem(KEY);
      sessionId = null;
    }
  }
}

$('start-btn').addEventListener('click', start);
$('restart-btn').addEventListener('click', () => {
  localStorage.removeItem(KEY);
  location.reload();
});
boot();
