import { renderSceneArt } from './art/scene-art.js';

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
  const status = actor.down ? '濒死' : actor.onFire ? '燃烧' : actor.exhausted ? '力竭' : '就绪';
  const attack = canAct && !actor.down
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
      <div class="stat"><small>STATUS</small><b>${status}</b></div>
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
  const scenarios = listing.scenarios || [];
  $('scenarios').innerHTML = scenarios.map((sc, index) => `<button class="btn ${index === 0 ? 'primary' : 'ghost'}" data-start="${esc(sc.id)}">开始：${esc(sc.title)}${sc.installed ? ' · 本地包' : ''}</button>`).join('');
  document.querySelectorAll('[data-start]').forEach((button) => {
    button.addEventListener('click', () => start(button.dataset.start));
  });
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
  if (pending.phase === 'determination') {
    box.innerHTML = `<h3>结算：Determination</h3>
      <p class="lead small">${esc(pending.source)} 的伤害将造成 <b>${pending.woundCount}</b> 点创伤（Resilience ${pending.resilience}）。你可以掷 Toughness 骰，把每个图标转为 1 点冲击。</p>
      <div class="actions">
        <button class="btn primary" data-pending-choice="determination">掷 Determination（Toughness）</button>
        <button class="btn ghost" data-pending-choice="accept">承受全部创伤</button>
      </div>`;
    return;
  }
  box.innerHTML = `<h3>结算：转化尊崇图标</h3>
    <p class="lead small">命中后还有 <b>${pending.roll.shiftable}</b> 个尊崇图标可转化（Exalted）。每次测试最多 1 个转为荣耀。</p>
    <div class="dice">${pending.roll.faces.map((face, index) => `<span class="${dieClass(face, index)}" title="${index === 0 ? '怒火骰' : ''}">${glyph(face)}</span>`).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-pending-choice="damage">全部转为额外伤害骰</button>
      <button class="btn" data-pending-choice="glory">1 点荣耀 + 其余伤害</button>
      <button class="btn ghost" data-pending-choice="skip">跳过</button>
    </div>`;
}

function renderPlay(s) {
  session = s;
  const scenario = s.scenario;
  void renderSceneArt({ scenarioId: s.scenarioId, sceneId: scenario?.id });
  $('start').hidden = true;
  $('play').hidden = false;
  $('scene-part').textContent = scenario?.part || 'SCENE';
  $('scene-title').textContent = scenario?.title || '训练场';
  $('scene-text').textContent = scenario?.ending ? scenario.ending.text : (scenario?.text || s.scene);
  $('clues').innerHTML = (scenario?.clues || []).map((clue) => `<span class="clue">${esc(clue)}</span>`).join('');
  $('choices').innerHTML = (scenario?.choices || []).map((choice) => `<button class="btn" data-choice="${esc(choice.id)}">${esc(choice.label)}${choice.test ? ` <small>DN ${choice.test.dn}</small>` : ''}</button>`).join('');
  $('glory').textContent = s.glory;
  $('ruin').textContent = s.ruin;
  $('round').textContent = s.round;
  const canAct = !s.pending && !s.result && (s.enemies || []).length > 0;
  $('party').innerHTML = s.party.map((a) => partyCard(a, canAct)).join('');
  $('enemy').innerHTML = (s.enemies || []).length ? (s.enemies || []).map(enemyCard).join('') : '<p class="empty" style="margin:0">当前场景没有战斗目标。</p>';
  renderPending(s);
  $('log').innerHTML = s.log.slice(-18).map((line) => `<li>${esc(line)}</li>`).join('');
  $('end').hidden = !s.result;
  document.querySelectorAll('[data-attack]').forEach((button) => {
    button.addEventListener('click', () => attack(button.dataset.attack));
  });
  document.querySelectorAll('[data-choice]').forEach((button) => {
    button.addEventListener('click', () => choose(button.dataset.choice));
  });
  document.querySelectorAll('[data-pending-choice]').forEach((button) => {
    button.addEventListener('click', () => decide(button.dataset.pendingChoice));
  });
}

async function start(scenarioId = 'training') {
  $('start-msg').textContent = '';
  document.querySelectorAll('[data-start]').forEach((button) => { button.disabled = true; });
  try {
    const result = await request('/sessions', { method: 'POST', body: JSON.stringify({ scenarioId }) });
    sessionId = result.session.id;
    localStorage.setItem(KEY, sessionId);
    renderPlay(result.session);
  } catch (error) {
    $('start-msg').textContent = error.message;
  } finally {
    document.querySelectorAll('[data-start]').forEach((button) => { button.disabled = false; });
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

async function choose(choiceId) {
  if (!session || session.pending || session.result) return;
  try {
    const result = await request(`/sessions/${sessionId}/commands`, {
      method: 'POST',
      body: JSON.stringify({
        requestId: newRequestId(),
        command: { type: 'choose', choiceId },
      }),
    });
    renderPlay(result.session);
  } catch (error) {
    $('scene-text').textContent = `结算失败：${error.message}`;
  }
}

async function askGm() {
  if (!session) return;
  const input = $('gm-input').value.trim();
  const button = $('ask-gm');
  button.disabled = true;
  $('narration').textContent = 'GM 正在读取场景…';
  try {
    const result = await request(`/sessions/${sessionId}/gm`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
    if (result.session)
      renderPlay(result.session);
    const action = result.action?.type === 'choose' ? '（GM 已按你的描述推进场景）' : '';
    $('narration').textContent = `${result.text}${action}${result.warning ? `（${result.warning}）` : ''}`;
    $('gm-input').value = '';
  } catch (error) {
    $('narration').textContent = `GM 暂时离线：${error.message}`;
  } finally {
    button.disabled = false;
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


$('ask-gm').addEventListener('click', askGm);
$('gm-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') askGm(); });
$('restart-btn').addEventListener('click', () => {
  localStorage.removeItem(KEY);
  location.reload();
});
boot();
