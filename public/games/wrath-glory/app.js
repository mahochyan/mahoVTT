import { renderSceneArt } from './art/scene-art.js';

const API = '/api/games/wrath-glory';
const KEY = 'wg-training-session';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let session = null;
let sessionId = localStorage.getItem(KEY);
let renderedSessionId = null;
let renderedLog = 0;
let shownTab = 'party';

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
      <div class="stat"><small>防御</small><b>${actor.defence}</b></div>
      <div class="stat"><small>抗性</small><b>${actor.resilience}</b></div>
      <div class="stat"><small>创伤</small><b>${actor.woundsTaken}/${actor.maxWounds}</b></div>
      <div class="stat"><small>冲击</small><b>${actor.shockTaken}/${actor.maxShock}</b></div>
      <div class="stat"><small>敏捷</small><b>${actor.attributes.agility}</b></div>
      <div class="stat"><small>射击</small><b>${actor.skills.ballisticSkill ?? 0}</b></div>
      <div class="stat"><small>状态</small><b>${status}</b></div>
    </div>
    <div class="actions">${attack}</div>
  </article>`;
}

function enemyCard(actor) {
  return `<article class="card">
    <h3>${esc(actor.name)}</h3>
    <div class="sub">${esc(actor.archetype)} · 静止</div>
    <div class="stats">
      <div class="stat"><small>防御</small><b>${actor.defence}</b></div>
      <div class="stat"><small>抗性</small><b>${actor.resilience}</b></div>
      <div class="stat"><small>创伤</small><b>${actor.woundsTaken}/${actor.maxWounds}</b></div>
      <div class="stat"><small>冲击</small><b>${actor.shockTaken}/${actor.maxShock}</b></div>
      <div class="stat"><small>状态</small><b>${actor.woundsTaken > actor.maxWounds ? '失能' : '待机'}</b></div>
      <div class="stat"><small>距离</small><b>12m</b></div>
    </div>
  </article>`;
}

function renderStart(listing) {
  $('start-party').innerHTML = (listing.party || []).map((p) => `<article class="card">
    <h3>${esc(p.name)}</h3>
    <div class="sub">${esc(p.archetype)} · 第一级</div>
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
    box.innerHTML = `<h3>结算：决心检定</h3>
      <p class="lead small">${esc(pending.source)} 的伤害将造成 <b>${pending.woundCount}</b> 点创伤（抗性 ${pending.resilience}）。你可以掷坚韧骰，把每个图标转为 1 点冲击。</p>
      <div class="actions">
        <button class="btn primary" data-pending-choice="determination">掷决心检定（坚韧）</button>
        <button class="btn ghost" data-pending-choice="accept">承受全部创伤</button>
      </div>`;
    return;
  }
  box.innerHTML = `<h3>结算：转化尊崇图标</h3>
    <p class="lead small">命中后还有 <b>${pending.roll.shiftable}</b> 个尊崇图标可转化。每次测试最多 1 个转为荣耀。</p>
    <div class="dice">${pending.roll.faces.map((face, index) => `<span class="${dieClass(face, index)}" title="${index === 0 ? '怒火骰' : ''}">${glyph(face)}</span>`).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-pending-choice="damage">全部转为额外伤害骰</button>
      <button class="btn" data-pending-choice="glory">1 点荣耀 + 其余伤害</button>
      <button class="btn ghost" data-pending-choice="skip">跳过</button>
    </div>`;
}

function appendChat(role, text) {
  if (!text) return;
  const chat = $('chat');
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 90;
  const node = document.createElement('article');
  node.className = `msg ${role}`;
  if (role === 'fact')
    node.textContent = text;
  else {
    const label = document.createElement('div');
    label.className = 'msg-role';
    label.textContent = role === 'player' ? '你' : '主持人';
    const body = document.createElement('div');
    body.textContent = text;
    node.append(label, body);
  }
  $('chat-stream').append(node);
  if (nearBottom)
    chat.scrollTop = chat.scrollHeight;
  else
    $('to-bottom').hidden = false;
}

function syncChat(s) {
  if (renderedSessionId !== s.id) {
    $('chat-stream').replaceChildren();
    renderedSessionId = s.id;
    renderedLog = 0;
  }
  for (const line of s.log.slice(renderedLog))
    appendChat('fact', line);
  renderedLog = s.log.length;
}

function activateSheet(name) {
  shownTab = name;
  document.querySelectorAll('[data-sheet-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sheetTab === name);
  });
  document.querySelectorAll('.sheet-pane').forEach((pane) => {
    pane.hidden = pane.id !== `sheet-${name}`;
  });
}

function renderPlay(s) {
  session = s;
  const scenario = s.scenario;
  const fresh = renderedSessionId !== s.id;
  void renderSceneArt({ scenarioId: s.scenarioId, sceneId: scenario?.id });
  $('start').hidden = true;
  $('play').hidden = false;
  $('scene-part').textContent = scenario?.part || '场景';
  $('scene-title').textContent = scenario?.title || '训练场';
  $('scene-text').textContent = scenario?.ending ? scenario.ending.text : (scenario?.text || s.scene);
  $('clues').innerHTML = (scenario?.clues || []).length
    ? (scenario?.clues || []).map((clue) => `<span class="clue">${esc(clue)}</span>`).join('')
    : '<p class="empty" style="margin:0">尚未获得线索。</p>';
  $('choices').innerHTML = (scenario?.choices || []).map((choice) => `<button class="btn" data-choice="${esc(choice.id)}">${esc(choice.label)}${choice.test ? ` <small>难度 ${choice.test.dn}</small>` : ''}</button>`).join('');
  $('glory').textContent = s.glory;
  $('ruin').textContent = s.ruin;
  $('round').textContent = s.round;
  const canAct = !s.pending && !s.result && (s.enemies || []).length > 0;
  const hasEnemies = (s.enemies || []).length > 0;
  $('target-section').hidden = !hasEnemies;
  $('no-target').hidden = hasEnemies;
  $('party').innerHTML = s.party.map((a) => partyCard(a, canAct)).join('');
  $('enemy').innerHTML = hasEnemies ? s.enemies.map(enemyCard).join('') : '';
  renderPending(s);
  $('log').innerHTML = s.log.slice(-30).map((line) => `<li>${esc(line)}</li>`).join('');
  $('end').hidden = !s.result;
  if (fresh)
    $('narration').textContent = '雨声压低了远处的钟声。你想做什么？';
  syncChat(s);
  activateSheet(shownTab);
  if (fresh) {
    requestAnimationFrame(() => {
      const chat = $('chat');
      chat.scrollTop = chat.scrollHeight;
      $('to-bottom').hidden = true;
    });
  }
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
  const who = session.party.find((p) => p.id === attackerId);
  appendChat('player', `${who?.name || '我'} 向目标开火。`);
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
    appendChat('fact', `结算失败：${error.message}`);
    $('narration').textContent = `结算失败：${error.message}`;
  }
}

async function choose(choiceId) {
  if (!session || session.pending || session.result) return;
  const label = session.scenario?.choices?.find((c) => c.id === choiceId)?.label;
  if (label) appendChat('player', label);
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
    appendChat('fact', `结算失败：${error.message}`);
    $('narration').textContent = `结算失败：${error.message}`;
  }
}

async function askGm() {
  if (!session) return;
  const input = $('gm-input').value.trim();
  const button = $('ask-gm');
  button.disabled = true;
  $('narration').textContent = '主持人正在读取场景…';
  try {
    const result = await request(`/sessions/${sessionId}/gm`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
    if (result.session)
      renderPlay(result.session);
    const action = result.action?.type === 'choose' ? '（主持人已按你的描述推进场景）' : '';
    $('narration').textContent = `${result.text}${action}${result.warning ? `（${result.warning}）` : ''}`;
    $('gm-input').value = '';
  } catch (error) {
    $('narration').textContent = `主持人暂时离线：${error.message}`;
    appendChat('fact', `主持人暂时离线：${error.message}`);
  } finally {
    button.disabled = false;
    $('gm-input').focus();
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
    appendChat('fact', `结算失败：${error.message}`);
    $('narration').textContent = `结算失败：${error.message}`;
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


document.querySelectorAll('[data-sheet-tab]').forEach((button) => button.addEventListener('click', () => activateSheet(button.dataset.sheetTab)));
$('ask-gm').addEventListener('click', askGm);
$('gm-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askGm(); } });
$('to-bottom').addEventListener('click', () => { $('chat').scrollTop = $('chat').scrollHeight; $('to-bottom').hidden = true; });
$('chat').addEventListener('scroll', () => { const chat = $('chat'); $('to-bottom').hidden = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 90; });
$('restart-btn').addEventListener('click', () => {
  localStorage.removeItem(KEY);
  location.reload();
});
boot();
