import { $, e, icon, api, toast, modal, closeModal, confirmDialog, fmtDate, relTime } from './core.js';

const NAV = [
    { id: 'dashboard', href: '/', label: '工作台', icon: 'grid' },
    { id: 'games', href: '/games', label: '游戏厅', icon: 'die' },
    { id: 'campaigns', href: '/campaigns', label: '战役', icon: 'flag' },
    { id: 'characters', href: '/characters', label: '角色', icon: 'users' },
    { id: 'worlds', href: '/worlds', label: '世界', icon: 'globe' },
    { id: 'library', href: '/library', label: '内容库', icon: 'library' },
    { id: 'settings', href: '/settings', label: '设置', icon: 'gear' },
];

const state = {
    data: null,
    libTab: 'monsters',
    wizard: null,
};

function world(id) {
    return state.data.worlds.find((w) => w.id === id) || {
        id, title: id, subtitle: '', tagline: '', genre: '', system: '', cover: null,
        theme: { accent: '#c8a86b', tint: 'rgba(200,168,107,.12)', backdrop: null },
        companions: [], features: [],
    };
}
function coverOf(id) { return world(id).cover || ''; }
function statusTag(c) {
    if (c.status === 'victory') return '<span class="tag good">已完成</span>';
    if (c.status === 'defeat') return '<span class="tag warn">远征结束</span>';
    return '<span class="tag">进行中</span>';
}
function worldTag(id) {
    const w = world(id);
    return `<span class="tag world" style="--world-accent:${w.theme.accent};--world-tint:${w.theme.tint}">${e(w.title)}</span>`;
}
function providerLabel(p) { return p?.mode === 'openai' ? '自定义 AI 已连接' : '规则演示模式'; }

function navHtml(active) {
    $('#nav').innerHTML = NAV.map((n) => `<a href="${n.href}" data-link class="${n.id === active ? 'active' : ''}" aria-label="${n.label}" ${n.id === active ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a>`).join('');
}
function setChrome(active, crumb, actions = '') {
    navHtml(active);
    $('#crumb').innerHTML = crumb;
    $('#top-actions').innerHTML = actions;
    const p = state.data?.provider;
    const status = $('#ai-status');
    status.classList.toggle('on', p?.mode === 'openai');
    status.querySelector('span').textContent = providerLabel(p);
    document.title = crumb ? `${crumb.replace(/<[^>]+>/g, '')} · mahoVTT` : 'mahoVTT · AI 跑团游戏厅';
}
function view(html, wire) {
    const el = $('#view');
    el.innerHTML = html;
    if (wire) wire(el);
    window.scrollTo({ top: 0, behavior: 'instant' });
}

function pageHead(eyebrow, title, desc, actions = '') {
    return `<header class="page-head"><div><div class="eyebrow">${e(eyebrow)}</div><h1>${e(title)}</h1>${desc ? `<p>${e(desc)}</p>` : ''}</div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</header>`;
}

/* ── Dashboard ─────────────────────────────────────────────── */
function campaignCard(c) {
    const w = world(c.packId);
    return `<article class="campaign-card" style="--world-accent:${w.theme.accent};--world-tint:${w.theme.tint}">
      <a class="cover" href="/campaigns/${c.id}" data-link style="background-image:url('${e(coverOf(c.packId))}')">
        <span class="badge">${statusTag(c)}</span>
        <span class="world-tag">${worldTag(c.packId)}</span>
      </a>
      <div class="card-body">
        <h3><a href="/campaigns/${c.id}" data-link>${e(c.title)}</a></h3>
        <p class="meta">${e(c.party.join(' · '))}</p>
        <p class="time">${icon('clock')} ${relTime(c.lastPlayedAt)} · 状态版本 v${c.version}</p>
        <div class="card-actions">
          <a class="btn small primary" href="/c/${c.id}" data-link>${icon('play')} 继续</a>
          <a class="btn small ghost" href="/campaigns/${c.id}" data-link>详情</a>
          <span class="spacer"></span>
          <span class="faint">已探索 ${c.rooms}/${world(c.packId).rooms}</span>
        </div>
      </div>
    </article>`;
}
function personCard(ch) {
    const c = ch.data;
    return `<article class="person-card">
      <span class="avatar" style="color:${c.portrait.color === 'teal' ? '#7fb6b0' : c.portrait.color === 'blue' ? '#8fa8c9' : '#c8a86b'}">${icon(c.portrait.icon)}</span>
      <div style="min-width:0;flex:1">
        <h3>${e(c.name)}</h3>
        <p>${e(c.ancestry)} · ${e(c.className)} · ${e(ch.updatedAt ? '最近编辑 ' + relTime(ch.updatedAt) : '')}</p>
        <div class="row"><a class="btn small ghost" href="/characters/${ch.id}" data-link>角色卡</a></div>
      </div>
    </article>`;
}
function heroContinue(c) {
    const w = world(c.packId);
    return `<section class="hero" style="--world-accent:${w.theme.accent};--world-tint:${w.theme.tint}">
      <div class="hero-bg" style="background-image:url('${e(coverOf(c.packId))}')"></div>
      <div class="hero-content">
        <div class="eyebrow">继续冒险</div>
        <h2>${e(c.title)}</h2>
        <p>${e(w.tagline)}</p>
        <div class="hero-actions">
          <a class="btn primary" href="/c/${c.id}" data-link>${icon('play')} 进入跑团</a>
          <a class="btn ghost" href="/campaigns/${c.id}" data-link>查看战役</a>
        </div>
        <div class="hero-meta"><span>${icon('users')} ${e(c.party.join('、'))}</span><span>${icon('clock')} ${relTime(c.lastPlayedAt)}</span><span>${worldTag(c.packId)}</span></div>
      </div>
    </section>`;
}
function heroEmpty() {
    const noWorlds = state.data.worlds.length === 0;
    return `<section class="hero" style="--world-accent:#8fa4ba;--world-tint:rgba(143,164,186,.12)">
      <div class="hero-content hero-empty">
        <div class="eyebrow">${noWorlds ? '准备中' : '档案库'}</div>
        <h2>${noWorlds ? '还没有可玩的剧本。' : '还没有正在进行的战役。'}</h2>
        <p>${noWorlds ? '旧剧本已移除。新的“点开即玩”剧本正在制作中；你仍可以先创建角色，等剧本上线。' : '选择一个世界，创建角色，进入第一段冒险。每个战役独立存档，随时可以回到这里继续。'}</p>
        <div class="hero-actions">${noWorlds ? `<a class="btn primary" href="/games" data-link>${icon('die')} 查看游戏厅</a><a class="btn ghost" href="/characters/new" data-link>${icon('users')} 创建角色</a>` : `<a class="btn primary" href="/campaigns/new" data-link>${icon('plus')} 新建战役</a><a class="btn ghost" href="/worlds" data-link>浏览世界</a>`}</div>
      </div>
    </section>`;
}
async function pageDashboard() {
    const d = state.data;
    const noWorlds = d.worlds.length === 0;
    setChrome('dashboard', '<b>工作台</b>', `<a class="btn small ghost" href="/settings" data-link>${icon('gear')} 设置</a>` + (noWorlds
        ? `<a class="btn small primary" href="/games" data-link>${icon('die')} 进入游戏厅</a>`
        : `<a class="btn small primary" href="/campaigns/new" data-link>${icon('plus')} 新建战役</a>`));
    const active = d.campaigns.filter((c) => c.lifecycle === 'active');
    const counts = { active: active.length, victory: d.campaigns.filter((c) => c.status === 'victory').length };
    const recent = active[0];
    const cards = active.slice(0, 6).map(campaignCard).join('');
    view(`
      ${pageHead('工作台', '工作台', '战役、角色与世界的本地档案库。所有状态保存在本机 SQLite，模型只提案，引擎负责结算。')}
      <div class="panel" style="margin-bottom:18px"><div class="panel-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px"><div><strong>🎲 多游戏入口</strong><p class="muted" style="margin:4px 0 0">切换独立跑团规则、地图、角色和存档。${noWorlds ? '旧剧本已移除，新剧本制作中。' : '选择一个模块开始。'}</p></div><a class="btn primary" href="/games" data-link>进入游戏厅 →</a></div></div>
      ${recent ? heroContinue(recent) : heroEmpty()}
      <div class="stat-row">
        <div class="stat"><strong>${counts.active}</strong><small>进行中战役</small></div>
        <div class="stat"><strong>${counts.victory}</strong><small>已完成战役</small></div>
        <div class="stat"><strong>${d.characters.length}</strong><small>角色</small></div>
        <div class="stat"><strong>${d.worlds.length}</strong><small>世界</small></div>
      </div>
      <div class="dash-grid">
        <section>
          <div class="section-title"><h2>最近战役</h2><a href="/campaigns" data-link>全部战役 →</a></div>
          ${cards ? `<div class="campaign-grid">${cards}</div>` : `<div class="panel"><div class="empty"><h3>还没有战役</h3><p>${noWorlds ? '旧剧本已移除，新的可直接游玩的剧本正在制作中。' : '新建一段冒险，或者导入旧版存档。'}</p>${noWorlds ? '<a class="btn primary" href="/games" data-link>查看游戏厅</a>' : '<a class="btn primary" href="/campaigns/new" data-link>新建战役</a>'}</div></div>`}
        </section>
        <aside class="stack">
          <section class="panel">
            <div class="panel-head"><h2>快速操作</h2></div>
            <div class="panel-body quick-list">
              ${noWorlds
                ? `<a class="quick-link" href="/games" data-link>${icon('die')}<span>浏览游戏厅<small>新剧本制作中</small></span></a>`
                : `<a class="quick-link" href="/campaigns/new" data-link>${icon('flag')}<span>新建战役<small>选择世界、角色与队伍</small></span></a>`}
              <a class="quick-link" href="/characters/new" data-link>${icon('users')}<span>新建角色<small>战士、游侠或牧师</small></span></a>
              <button class="quick-link" data-action="import">${icon('upload')}<span>导入存档<small>把旧版 JSON 战役放进档案库</small></span></button>
              <a class="quick-link" href="/settings" data-link>${icon('gear')}<span>模型设置<small>${e(providerLabel(d.provider))}</small></span></a>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>角色名册</h2><a class="faint" href="/characters" data-link>全部</a></div>
            <div class="panel-body roster-strip">
              ${d.characters.length ? d.characters.slice(0, 4).map((ch) => `<a class="roster-row" href="/characters/${ch.id}" data-link><span class="avatar">${icon(ch.data.portrait.icon)}</span><span><b>${e(ch.data.name)}</b><small>${e(ch.data.className)} · ${e(ch.data.ancestry)}</small></span></a>`).join('') : '<p class="faint" style="margin:0">还没有角色。创建角色后可以在战役向导中直接选用。</p>'}
            </div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>世界</h2><a class="faint" href="/worlds" data-link>全部</a></div>
            <div class="panel-body roster-strip">
              ${d.worlds.map((w) => `<a class="roster-row" href="/worlds/${w.id}" data-link><span class="avatar" style="color:${w.theme.accent}">${icon('globe')}</span><span><b>${e(w.title)}</b><small>${e(w.genre)} · ${w.rooms} 个地点</small></span></a>`).join('')}
            </div>
          </section>
        </aside>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
      <input type="file" id="cover-input" hidden>
    `, () => {
        $('#import-file')?.addEventListener('change', importSave);
    });
}

/* ── Campaigns ─────────────────────────────────────────────── */
function pageCampaigns() {
    const noWorlds = state.data.worlds.length === 0;
    setChrome('campaigns', '<b>战役</b>', noWorlds
        ? `<a class="btn small primary" href="/games" data-link>${icon('die')} 查看游戏厅</a>`
        : `<a class="btn small primary" href="/campaigns/new" data-link>${icon('plus')} 新建战役</a>`);
    const active = state.data.campaigns.filter((c) => c.lifecycle === 'active');
    const archived = state.data.campaigns.filter((c) => c.lifecycle === 'archived');
    const cards = (list) => `<div class="campaign-grid">${list.map((c) => `<article class="campaign-card" style="--world-accent:${world(c.packId).theme.accent};--world-tint:${world(c.packId).theme.tint}">
      <a class="cover" href="/campaigns/${c.id}" data-link style="background-image:url('${e(coverOf(c.packId))}')"><span class="badge">${statusTag(c)}</span><span class="world-tag">${worldTag(c.packId)}</span></a>
      <div class="card-body"><h3><a href="/campaigns/${c.id}" data-link>${e(c.title)}</a></h3><p class="meta">${e(c.party.join(' · '))}</p><p class="time">${icon('clock')} ${relTime(c.lastPlayedAt)}</p>
      <div class="card-actions"><a class="btn small primary" href="/c/${c.id}" data-link>${icon('play')} 继续</a><a class="btn small ghost" href="/campaigns/${c.id}" data-link>详情</a><span class="spacer"></span>
      <button class="btn small ghost" data-action="${c.lifecycle === 'active' ? 'archive' : 'restore'}" data-id="${c.id}">${c.lifecycle === 'active' ? '归档' : '恢复'}</button></div></div>
    </article>`).join('')}</div>`;
    view(`${pageHead('战役', '战役', '进行中的冒险与已归档的记录。归档后仍可恢复，不会被删除。')}
      <div class="section-title"><h2>进行中 · ${active.length}</h2></div>
      ${active.length ? cards(active) : `<div class="panel"><div class="empty"><h3>没有进行中的战役</h3><p>${noWorlds ? '旧剧本已移除，新的可直接游玩的剧本正在制作中。' : '创建一段新冒险，或从归档中恢复。'}</p>${noWorlds ? '<a class="btn primary" href="/games" data-link>查看游戏厅</a>' : '<a class="btn primary" href="/campaigns/new" data-link>新建战役</a>'}</div></div>`}
      <div class="section-title" style="margin-top:30px"><h2>已归档 · ${archived.length}</h2></div>
      ${archived.length ? cards(archived) : '<div class="panel"><div class="empty"><h3>归档是空的</h3><p>暂时搁置的战役会出现在这里。</p></div></div>'}`);
}

/* ── Campaign detail ───────────────────────────────────────── */
async function pageCampaignDetail(id) {
    const meta = state.data.campaigns.find((c) => c.id === id);
    let snap;
    try { snap = await api('/api/campaigns/' + id); } catch (err) { notFound('找不到这份战役。'); return; }
    if (!meta) { refresh().then(() => pageCampaignDetail(id)); return; }
    const s = snap.state;
    const w = world(meta.packId);
    setChrome('campaigns', `<a href="/campaigns" data-link>战役</a> ${icon('chevron')} <b>${e(meta.title)}</b>`, `<a class="btn small ghost" href="/campaigns" data-link>${icon('arrow')} 返回</a>`);
    const party = s.actors.filter((a) => a.faction === 'party');
    const objectives = s.objectives || [];
    view(`
      ${pageHead('战役', meta.title, `${w.title} · ${s.status === 'victory' ? '冒险完成' : s.status === 'defeat' ? '远征结束' : '进行中'} · 状态版本 v${s.version}`)}
      <div class="detail-head">
        <div class="detail-cover" style="background-image:url('${e(coverOf(meta.packId))}')"></div>
        <div class="info" style="flex:1">
          <div class="hero-meta" style="margin:0 0 12px"><span>${icon('clock')} 最后行动 ${relTime(meta.lastPlayedAt)}</span><span>${icon('users')} ${party.length} 人小队</span><span>${worldTag(meta.packId)}</span></div>
          <p class="muted" style="margin:0 0 14px">${e(w.description)}</p>
          <div class="detail-actions">
            <a class="btn primary" href="/c/${meta.id}" data-link>${icon('play')} 继续冒险</a>
            <a class="btn ghost" href="/api/campaigns/${meta.id}/export">${icon('download')} 导出存档</a>
            <button class="btn ghost" data-action="rename" data-id="${meta.id}">${icon('edit')} 改名</button>
            <button class="btn ghost" data-action="${meta.lifecycle === 'active' ? 'archive' : 'restore'}" data-id="${meta.id}">${icon('archive')} ${meta.lifecycle === 'active' ? '归档' : '恢复'}</button>
            <button class="btn danger" data-action="delete" data-id="${meta.id}">${icon('trash')} 删除</button>
          </div>
        </div>
      </div>
      <div class="dash-grid">
        <div class="stack">
          <section class="panel"><div class="panel-head"><h2>冒险小队</h2><span class="faint">${party.length} 人</span></div><div class="panel-body party-grid">
            ${party.map((a) => `<div class="party-card"><div class="top"><span class="avatar">${icon(a.id === 'pc' ? (a.role === '游侠' ? 'bow' : a.role === '牧师' ? 'sun' : 'shield') : a.id === 'ranger' ? 'bow' : 'sun')}</span><div><h3>${e(a.name)}</h3><p>${e(a.role)} · ${a.id === 'pc' ? '由你控制' : 'AI 同伴'}</p></div></div><div class="hp-bar"><i style="width:${Math.round((a.hp / a.maxHp) * 100)}%"></i></div><div class="stats"><span>HP ${a.hp}/${a.maxHp}</span><span>AC ${a.ac}</span><span>+${a.attack}</span></div></div>`).join('')}
          </div></section>
          <section class="panel"><div class="panel-head"><h2>任务</h2></div><div class="panel-body">
            ${objectives.map((o) => `<div class="log-row" style="border-left-color:${o.done ? 'var(--good)' : 'var(--line-2)'}">${o.done ? icon('check') : '○'} ${e(o.title)}</div>`).join('') || '<p class="faint">暂无任务记录。</p>'}
          </div></section>
          <section class="panel"><div class="panel-head"><h2>编年史</h2><span class="faint">最近 ${Math.min(6, (s.journal || []).length)} 条</span></div><div class="panel-body log-list">
            ${(s.journal || []).slice(-6).reverse().map((j) => `<div class="log-row">${e(j)}</div>`).join('') || '<p class="faint">还没有记录。</p>'}
          </div></section>
        </div>
        <aside class="stack">
          <section class="panel"><div class="panel-head"><h2>最近回合</h2></div><div class="panel-body log-list">
            ${(snap.turns || []).slice(-5).reverse().map((t) => `<div class="log-row"><b>${e(t.input || '规则行动')}</b><br><span class="faint">${e(t.narrative || t.error || '已结算')}</span></div>`).join('') || '<p class="faint">还没有行动。</p>'}
          </div></section>
          <section class="panel"><div class="panel-head"><h2>存档信息</h2></div><div class="panel-body faint" style="font-size:12px;line-height:1.9">
            <div>战役编号：${e(meta.id.slice(0, 8))}…</div><div>创建：${fmtDate(meta.createdAt)}</div><div>最后行动：${fmtDate(meta.lastPlayedAt)}</div><div>导出包含完整历史，可能剧透。</div>
          </div></section>
        </aside>
      </div>`);
}

/* ── Wizard ────────────────────────────────────────────────── */
function defaultDraft() {
    return { name: '旅人', ancestry: '人类', className: '战士', stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 }, background: '', portrait: { icon: 'shield', color: 'gold' } };
}
const CLASS_META = {
    战士: { icon: 'shield', color: 'gold', primary: 'str', dice: '1d8', range: 1, hp: 36, ac: 16, weapon: '短剑' },
    游侠: { icon: 'bow', color: 'teal', primary: 'dex', dice: '1d6', range: 12, hp: 28, ac: 14, weapon: '短弓' },
    牧师: { icon: 'sun', color: 'blue', primary: 'wis', dice: '1d6', range: 1, hp: 30, ac: 15, weapon: '铜柄短杖' },
};
const ANCESTRIES = ['人类', '精灵', '矮人', '半身人', '兽人', '混血'];
function derivePreview(d) {
    const meta = CLASS_META[d.className];
    const mod = (v) => Math.floor((Number(v) - 10) / 2);
    const primary = mod(d.stats[meta.primary]);
    const con = mod(d.stats.con);
    const dex = mod(d.stats.dex);
    const hp = Math.max(12, meta.hp + (con - 2) * 2);
    const attack = 5 + (primary - 2);
    const ac = d.className === '游侠' ? meta.ac + Math.max(0, dex - 2) : meta.ac;
    return { hp, ac, attack, damage: `${meta.dice}${primary >= 0 ? '+' : ''}${primary}`, range: meta.range };
}
function startWizard(packId) {
    state.wizard = { step: 1, packId: packId || state.data.worlds[0]?.id || 'whispering-tower', mode: 'new', characterId: null, rosterId: null, draft: defaultDraft(), title: '' };
}
function pageWizard(packId) {
    if (!state.data.worlds.length) {
        setChrome('campaigns', `<a href="/campaigns" data-link>战役</a> ${icon('chevron')} <b>新建战役</b>`, '');
        view(`${pageHead('新建战役', '新建战役', '暂无可用剧本')}
          <div class="panel"><div class="empty"><h3>还没有可直接游玩的剧本</h3><p>旧剧本已移除。新的“点开即玩”剧本上线后，这里会出现世界与预设队伍。</p><a class="btn primary" href="/games" data-link>查看游戏厅</a><a class="btn ghost" href="/characters/new" data-link>先创建角色</a></div></div>`);
        return;
    }
    if (!state.wizard || (packId && state.wizard.packId !== packId)) startWizard(packId);
    const w = state.wizard;
    setChrome('campaigns', `<a href="/campaigns" data-link>战役</a> ${icon('chevron')} <b>新建战役</b>`, '');
    const stepBar = [1, 2, 3, 4].map((n) => `<div class="step ${w.step === n ? 'active' : ''} ${w.step > n ? 'done' : ''}"><b>${w.step > n ? '✓' : n}</b>${['世界', '角色', '队伍', '开始'][n - 1]}</div>`).join('');
    view(`<div class="wizard">${pageHead('新建战役', '新建战役', '选择世界、创建或挑选角色，确认队伍后开始。')}
      <div class="steps">${stepBar}</div>
      <section class="panel wizard-panel" id="wizard-panel">${wizardStep(w)}</section>
      <div class="form-actions"><button class="btn ghost" data-action="wizard-prev" ${w.step === 1 ? 'disabled' : ''}>${icon('arrow')} 上一步</button>${w.step < 4 ? `<button class="btn primary" data-action="wizard-next">下一步 ${icon('arrow')}</button>` : `<button class="btn primary" data-action="wizard-create">${icon('play')} 创建并进入</button>`}</div>
    </div>`, () => wireWizard());
}
function wizardStep(w) {
    if (w.step === 1) {
        const worlds = state.data.worlds.map((x) => `<button class="choice ${x.id === w.packId ? 'selected' : ''}" data-action="wizard-world" data-id="${x.id}" style="--world-accent:${x.theme.accent}"><b>${e(x.title)}</b><small>${e(x.genre)} · ${x.rooms} 个地点 · ${e(x.system)}</small><p class="faint" style="margin:8px 0 0;font-size:12px">${e(x.tagline)}</p></button>`).join('');
        return `<div class="eyebrow">第一步</div><h2 style="margin:0 0 6px">选择世界</h2><p class="muted" style="margin:0 0 18px">世界决定地图、NPC、任务与默认同伴。更多世界会在内容包阶段加入。</p><div class="choice-grid">${worlds}</div>`;
    }
    if (w.step === 2) {
        const roster = state.data.characters;
        const newTab = w.mode === 'new';
        const fields = `<div class="form-grid" style="margin-top:16px">
          <label class="field span2"><span>角色名</span><input id="wz-name" maxlength="20" value="${e(w.draft.name)}" autocomplete="off"></label>
          <label class="field"><span>种族</span><select id="wz-ancestry">${ANCESTRIES.map((a) => `<option ${a === w.draft.ancestry ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
          <label class="field"><span>职业</span><select id="wz-class">${Object.keys(CLASS_META).map((c) => `<option ${c === w.draft.className ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <div class="field span2"><span>属性</span><div class="stat-inputs">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<label>${k.toUpperCase()}<input type="number" min="8" max="18" id="wz-${k}" value="${w.draft.stats[k]}"></label>`).join('')}</div></div>
          <label class="field span2"><span>背景（可选）</span><textarea id="wz-background" maxlength="500" rows="3">${e(w.draft.background)}</textarea></label>
        </div><div class="preview" id="wz-preview">${previewHtml(w.draft)}</div>`;
        return `<div class="eyebrow">第二步</div><h2 style="margin:0 0 6px">创建或选择角色</h2>
          <div class="tabs" style="margin-top:12px"><button class="${newTab ? 'active' : ''}" data-action="wizard-mode" data-mode="new">新建角色</button><button class="${!newTab ? 'active' : ''}" data-action="wizard-mode" data-mode="roster">从名册选择</button></div>
          ${newTab ? fields : `<div class="card-grid">${roster.length ? roster.map((ch) => `<button class="choice ${w.rosterId === ch.id ? 'selected' : ''}" data-action="wizard-roster" data-id="${ch.id}"><b>${e(ch.data.name)}</b><small>${e(ch.data.ancestry)} · ${e(ch.data.className)}</small></button>`).join('') : '<p class="faint">还没有角色。切换到「新建角色」。</p>'}</div>`}`;
    }
    if (w.step === 3) {
        const x = world(w.packId);
        return `<div class="eyebrow">第三步</div><h2 style="margin:0 0 6px">确认队伍</h2><p class="muted" style="margin:0 0 18px">你控制自己的角色，AI 同伴由规则引擎与模型共同驱动。当前世界固定两名同伴。</p>
          <div class="party-grid">${x.companions.map((c) => `<div class="party-card"><div class="top"><span class="avatar">${icon(c.role === '游侠' ? 'bow' : 'sun')}</span><div><h3>${e(c.name)}</h3><p>${e(c.role)} · AI 同伴</p></div></div><p class="muted" style="margin-top:10px;font-size:12px">${e(c.note)}</p></div>`).join('')}
          <div class="party-card"><div class="top"><span class="avatar">${icon(CLASS_META[w.draft.className]?.icon || 'shield')}</span><div><h3>${w.mode === 'roster' ? e(state.data.characters.find((c) => c.id === w.rosterId)?.data.name || '你的角色') : e(w.draft.name)}</h3><p>${w.mode === 'roster' ? e(state.data.characters.find((c) => c.id === w.rosterId)?.data.className || '') : e(w.draft.className)} · 由你控制</p></div></div><p class="muted" style="margin-top:10px;font-size:12px">你的选择会复制进战役；之后修改角色卡不会回写已开始的战役。</p></div></div>`;
    }
    const ww = world(w.packId);
    return `<div class="eyebrow">第四步</div><h2 style="margin:0 0 6px">命名并开始</h2><p class="muted" style="margin:0 0 18px">确认后创建独立存档，并直接进入跑团界面。</p>
      <label class="field"><span>战役名称</span><input id="wz-title" maxlength="60" value="${e(w.title || ww.title)}" placeholder="${e(ww.title)}"></label>
      <div class="panel" style="margin-top:16px"><div class="panel-body"><div class="hero-meta" style="margin:0"><span>${worldTag(w.packId)}</span><span>${icon('users')} ${w.mode === 'roster' ? e(state.data.characters.find((c) => c.id === w.rosterId)?.data.name || '') : e(w.draft.name)} + ${ww.companions.map((c) => e(c.name)).join('、')}</span><span>${icon('map')} ${ww.rooms} 个地点</span></div></div></div>`;
}
function previewHtml(d) {
    const p = derivePreview(d);
    return `<div><strong>${p.hp}</strong><small>生命值</small></div><div><strong>${p.ac}</strong><small>护甲</small></div><div><strong>+${p.attack}</strong><small>攻击 · ${p.damage}</small></div>`;
}
function wireWizard() {
    const w = state.wizard;
    if (!w || w.step !== 2 || w.mode !== 'new') return;
    const sync = () => {
        w.draft.name = $('#wz-name')?.value || '';
        w.draft.ancestry = $('#wz-ancestry')?.value || '人类';
        w.draft.className = $('#wz-class')?.value || '战士';
        for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
            const v = Number($('#wz-' + k)?.value);
            if (Number.isFinite(v)) w.draft.stats[k] = v;
        }
        w.draft.background = $('#wz-background')?.value || '';
        const meta = CLASS_META[w.draft.className];
        w.draft.portrait = { icon: meta.icon, color: meta.color };
        const pv = $('#wz-preview');
        if (pv) pv.innerHTML = previewHtml(w.draft);
    };
    ['wz-name', 'wz-ancestry', 'wz-class', 'wz-str', 'wz-dex', 'wz-con', 'wz-int', 'wz-wis', 'wz-cha', 'wz-background'].forEach((id) => $('#' + id)?.addEventListener('input', sync));
}
function wizardNext() {
    const w = state.wizard;
    if (!w) return;
    if (w.step === 1) { if (!w.packId) return toast('请选择一个世界。'); w.step = 2; return pageWizard(); }
    if (w.step === 2) {
        if (w.mode === 'new') {
            const name = $('#wz-name')?.value.trim();
            if (!name) return toast('请填写角色名。');
            w.draft.name = name;
            w.draft.ancestry = $('#wz-ancestry')?.value || '人类';
            w.draft.className = $('#wz-class')?.value || '战士';
            for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) w.draft.stats[k] = Number($('#wz-' + k)?.value || 10);
            w.draft.background = $('#wz-background')?.value || '';
            w.draft.portrait = { icon: CLASS_META[w.draft.className].icon, color: CLASS_META[w.draft.className].color };
        } else if (!w.rosterId) return toast('请选择一个角色。');
        w.step = 3; return pageWizard();
    }
    if (w.step === 3) { w.step = 4; return pageWizard(); }
}
async function wizardCreate() {
    const w = state.wizard;
    if (!w) return;
    const title = $('#wz-title')?.value.trim() || world(w.packId).title;
    try {
        let characterId = w.rosterId;
        if (w.mode === 'new') {
            const created = await api('/api/characters', { method: 'POST', body: w.draft });
            characterId = created.id;
        }
        const res = await api('/api/campaigns', { method: 'POST', body: { packId: w.packId, title, characterId } });
        state.wizard = null;
        location.href = '/c/' + res.state.id;
    } catch (err) { toast(err.message); }
}

/* ── Characters ────────────────────────────────────────────── */
function characterCards(list) {
    return `<div class="card-grid">${list.map((ch) => {
        const c = ch.data;
        const m = CLASS_META[c.className] || CLASS_META['战士'];
        return `<article class="person-card"><span class="avatar" style="color:${m.color === 'teal' ? '#7fb6b0' : m.color === 'blue' ? '#8fa8c9' : '#c8a86b'}">${icon(m.icon)}</span>
          <div style="min-width:0;flex:1"><h3>${e(c.name)}</h3><p>${e(c.ancestry)} · ${e(c.className)} · ${fmtDate(ch.updatedAt)}</p>
          <p class="faint" style="font-size:11px;margin-top:4px">STR ${c.stats.str} · DEX ${c.stats.dex} · CON ${c.stats.con} · WIS ${c.stats.wis}</p>
          <div class="row"><a class="btn small ghost" href="/characters/${ch.id}" data-link>角色卡</a><button class="btn small ghost" data-action="delete-character" data-id="${ch.id}">${icon('trash')}</button></div></div></article>`;
    }).join('')}</div>`;
}
function pageCharacters() {
    setChrome('characters', '<b>角色</b>', `<a class="btn small primary" href="/characters/new" data-link>${icon('plus')} 新建角色</a>`);
    view(`${pageHead('角色', '角色', '独立于战役的角色名册。创建战役时会复制一份进入存档，之后修改名册不会影响已开始的战役。')}
      ${state.data.characters.length ? characterCards(state.data.characters) : '<div class="panel"><div class="empty"><h3>还没有角色</h3><p>创建一个角色，然后在新建战役时选用。</p><a class="btn primary" href="/characters/new" data-link>新建角色</a></div></div>'}`);
}
function characterFormHtml(d, submitLabel) {
    return `<form id="character-form"><div class="form-grid">
      <label class="field span2"><span>角色名</span><input name="name" maxlength="20" value="${e(d.name)}" required autocomplete="off"></label>
      <label class="field"><span>种族</span><select name="ancestry">${ANCESTRIES.map((a) => `<option ${a === d.ancestry ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="field"><span>职业</span><select name="className">${Object.keys(CLASS_META).map((c) => `<option ${c === d.className ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <div class="field span2"><span>属性</span><div class="stat-inputs">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<label>${k.toUpperCase()}<input type="number" name="${k}" min="8" max="18" value="${d.stats[k]}"></label>`).join('')}</div></div>
      <label class="field span2"><span>背景（可选）</span><textarea name="background" maxlength="500" rows="4">${e(d.background)}</textarea></label>
    </div><div class="preview" id="char-preview">${previewHtml(d)}</div><div class="form-actions"><a class="btn ghost" href="/characters" data-link>取消</a><button class="btn primary" type="submit">${e(submitLabel)}</button></div></form>`;
}
function readCharacterForm() {
    const f = $('#character-form');
    const data = { name: f.name.value.trim(), ancestry: f.ancestry.value, className: f.className.value, background: f.background.value, stats: {}, portrait: { icon: CLASS_META[f.className.value].icon, color: CLASS_META[f.className.value].color } };
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) data.stats[k] = Number(f[k].value);
    return data;
}
function wireCharacterForm(onSubmit) {
    const form = $('#character-form');
    if (!form) return;
    const update = () => { const d = readCharacterForm(); $('#char-preview').innerHTML = previewHtml(d); };
    form.addEventListener('input', update);
    form.addEventListener('submit', async (ev) => { ev.preventDefault(); try { await onSubmit(readCharacterForm()); } catch (err) { toast(err.message); } });
}
function pageCharacterNew() {
    setChrome('characters', `<a href="/characters" data-link>角色</a> ${icon('chevron')} <b>新建</b>`, '');
    view(`${pageHead('角色', '新建角色', '角色卡只决定创建战役时的初始数值与能力。')}${characterFormHtml(defaultDraft(), '创建角色').replace('<form id="character-form">', '<form id="character-form" class="panel" style="padding:20px">')}`);
    wireCharacterForm(async (data) => { const ch = await api('/api/characters', { method: 'POST', body: data }); toast('角色已创建。'); location.href = '/characters/' + ch.id; });
}
async function pageCharacterSheet(id) {
    let ch;
    try { ch = await api('/api/characters/' + id); } catch { notFound('找不到这个角色。'); return; }
    const d = ch.data;
    const p = derivePreview(d);
    setChrome('characters', `<a href="/characters" data-link>角色</a> ${icon('chevron')} <b>${e(d.name)}</b>`, `<a class="btn small ghost" href="/characters" data-link>${icon('arrow')} 返回</a>`);
    view(`${pageHead('角色', d.name, `${d.ancestry} · ${d.className} · 创建于 ${fmtDate(ch.createdAt)}`)}
      <div class="dash-grid"><div class="panel"><div class="panel-body">
        <div class="preview"><div><strong>${p.hp}</strong><small>生命值</small></div><div><strong>${p.ac}</strong><small>护甲</small></div><div><strong>+${p.attack}</strong><small>攻击 · ${p.damage}</small></div></div>
        <div class="stat-inputs" style="margin-top:18px">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<div class="stat"><strong>${d.stats[k]}</strong><small>${k.toUpperCase()}</small></div>`).join('')}</div>
        <p class="muted" style="margin-top:18px">${d.background ? e(d.background) : '还没有背景故事。'}</p>
        <div class="detail-actions"><a class="btn ghost" href="/characters/${id}/edit" data-link>${icon('edit')} 编辑</a><button class="btn danger" data-action="delete-character" data-id="${id}">${icon('trash')} 删除角色</button></div>
      </div></div><aside class="stack"><section class="panel"><div class="panel-head"><h2>用途</h2></div><div class="panel-body faint" style="font-size:12px;line-height:1.9">创建战役时，这里的数值会复制成玩家角色。<br>修改此卡不会回写已开始的战役。<br>删除角色不会影响已有战役存档。</div></section></aside></div>`);
}
async function pageCharacterEdit(id) {
    let ch;
    try { ch = await api('/api/characters/' + id); } catch { notFound('找不到这个角色。'); return; }
    setChrome('characters', `<a href="/characters" data-link>角色</a> ${icon('chevron')} <b>编辑</b>`, '');
    view(`${pageHead('角色', '编辑角色', ch.data.name)}${characterFormHtml(ch.data, '保存修改')}`);
    wireCharacterForm(async (data) => { await api('/api/characters/' + id, { method: 'PATCH', body: data }); toast('角色已更新。'); location.href = '/characters/' + id; });
}

/* ── Worlds / Library ──────────────────────────────────────── */
function worldCard(w) {
    return `<article class="world-card" style="--world-accent:${w.theme.accent};--world-tint:${w.theme.tint}">
      <a href="/worlds/${w.id}" data-link class="cover" style="background-image:url('${e(w.cover || '')}')"></a>
      <div class="body"><div class="hero-meta" style="margin:0 0 8px"><span>${worldTag(w.id)}</span><span>${e(w.genre)}</span><span>${e(w.system)}</span></div>
      <h3><a href="/worlds/${w.id}" data-link>${e(w.title)}</a></h3><p>${e(w.tagline)}</p>
      <div class="detail-actions"><a class="btn small ghost" href="/worlds/${w.id}" data-link>世界详情</a><a class="btn small primary" href="/campaigns/new?world=${w.id}" data-link>用这个世界开始</a></div></div>
    </article>`;
}
function pageWorlds() {
    setChrome('worlds', '<b>世界</b>', '');
    const list = state.data.worlds;
    view(`${pageHead('世界', '世界', '世界提供地图、NPC、任务、默认同伴与视觉主题。旧剧本已移除，新剧本包上线后会出现在这里。')}
      ${list.length ? `<div class="world-grid">${list.map(worldCard).join('')}</div>` : '<div class="panel"><div class="empty"><h3>还没有世界</h3><p>旧剧本已移除；新的可直接游玩的剧本正在制作中。</p><a class="btn primary" href="/games" data-link>查看游戏厅</a></div></div>'}`);
}
async function pageWorldDetail(id) {
    let detail;
    try { detail = await api('/api/worlds/' + id); } catch { notFound('找不到这个世界。'); return; }
    const w = detail.world;
    setChrome('worlds', `<a href="/worlds" data-link>世界</a> ${icon('chevron')} <b>${e(w.title)}</b>`, `<a class="btn small ghost" href="/worlds" data-link>${icon('arrow')} 返回</a>`);
    view(`${pageHead('世界', w.title, w.tagline)}
      <div class="detail-head"><div class="detail-cover" style="background-image:url('${e(w.cover || '')}')"></div><div class="info" style="flex:1">
        <div class="hero-meta" style="margin:0 0 12px"><span>${e(w.genre)}</span><span>${e(w.system)}</span><span>${icon('map')} ${w.rooms} 个地点</span></div>
        <p class="muted">${e(w.description)}</p>
        <div class="detail-actions"><a class="btn primary" href="/campaigns/new?world=${w.id}" data-link>${icon('plus')} 用这个世界新建战役</a></div>
      </div></div>
      <div class="section-title"><h2>公开世界书</h2><span class="faint">主持人的秘密不会显示在这里</span></div>
      <div class="card-grid">${(detail.book?.entries || []).map((entry) => `<article class="lib-item"><h3>${e(entry.title)}</h3><p>${e(entry.text)}</p></article>`).join('')}</div>`);
}
async function pageLibrary() {
    setChrome('library', '<b>内容库</b>', '');
    let lib;
    try { lib = await api('/api/library'); } catch (err) { view(`<div class="panel"><div class="empty"><h3>内容库读取失败</h3><p>${e(err.message)}</p></div></div>`); return; }
    const tabs = [['monsters', '怪物'], ['npcs', 'NPC'], ['items', '道具'], ['maps', '地图']];
    const body = {
        monsters: () => lib.monsters.map((m) => `<article class="lib-item"><h3>${e(m.name)}</h3><p>${e(m.role)} · ${e(m.room)}</p><div class="stats"><span>HP ${m.hp}</span><span>AC ${m.ac}</span><span>攻击 +${m.attack}</span><span>${e(m.damage)}</span><span>射程 ${m.range}</span></div></article>`).join(''),
        npcs: () => lib.npcs.map((n) => `<article class="lib-item"><h3>${e(n.name)}</h3><p>${e(n.description)}</p><div class="stats"><span>${e(n.room)}</span></div></article>`).join(''),
        items: () => lib.items.map((i) => `<article class="lib-item"><h3>${e(i.name)}</h3><p>${e(i.kind)} · ${e(i.effect)}</p><div class="stats"><span>${e(i.source)}</span></div></article>`).join(''),
        maps: () => lib.maps.map((m) => `<article class="lib-item"><h3>${e(m.name)}</h3><p>${e(m.subtitle)}</p><p class="faint" style="margin-top:6px">${e(m.description)}</p></article>`).join(''),
    };
    view(`${pageHead('内容库', '内容库', '旧剧本内容已移除；新剧本包上线后这里会显示怪物、NPC、道具与地图。')}
      <div class="tabs">${tabs.map(([id, label]) => `<button class="${state.libTab === id ? 'active' : ''}" data-action="lib-tab" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="lib-grid">${body[state.libTab]() || '<p class="faint">暂无条目。</p>'}</div>`, (el) => {
        el.querySelectorAll('[data-action="lib-tab"]').forEach((b) => b.addEventListener('click', () => { state.libTab = b.dataset.tab; pageLibrary(); }));
    });
}

/* ── Settings ──────────────────────────────────────────────── */
async function pageSettings() {
    setChrome('settings', '<b>设置</b>', '');
    let c;
    try { c = await api('/api/settings'); } catch (err) { view(`<div class="panel"><div class="empty"><h3>设置读取失败</h3><p>${e(err.message)}</p></div></div>`); return; }
    view(`${pageHead('设置', '设置', '模型连接、运行模式与本地档案信息。密钥只保存在服务端。')}
      <div class="dash-grid"><section class="panel"><div class="panel-body">
        <form id="settings-form"><div class="form-grid">
          <label class="field"><span>运行模式</span><select name="mode"><option value="mock" ${c.mode === 'mock' ? 'selected' : ''}>规则演示 · 不请求模型</option><option value="openai" ${c.mode === 'openai' ? 'selected' : ''}>OpenAI 兼容接口</option></select></label>
          <label class="field"><span>JSON 约束</span><select name="jsonMode"><option value="off" ${c.jsonMode === 'off' ? 'selected' : ''}>仅提示词约束</option><option value="json_object" ${c.jsonMode === 'json_object' ? 'selected' : ''}>response_format: json_object</option></select></label>
          <label class="field span2"><span>API Base URL</span><input name="baseUrl" value="${e(c.baseUrl)}" placeholder="http://127.0.0.1:8000/v1"></label>
          <label class="field span2"><span>模型 ID</span><input name="model" value="${e(c.model)}" placeholder="与 /v1/models 返回值完全一致"></label>
          <label class="field span2"><span>API Key（本地服务可留空）</span><input name="apiKey" type="password" autocomplete="new-password" placeholder="${c.hasApiKey ? '已保存，留空保持原值' : '可留空'}"></label>
          <label class="field"><span>超时（毫秒）</span><input name="timeoutMs" type="number" min="3000" max="180000" value="${c.timeoutMs}"></label>
          <label class="field"><span>最大输出 tokens</span><input name="maxTokens" type="number" min="128" max="4096" value="${c.maxTokens}"></label>
          <label class="field span2"><span>上下文字符预算</span><input name="contextChars" type="number" min="8000" max="120000" value="${c.contextChars}"></label>
          <label class="field span2"><span>额外请求参数 JSON（可选）</span><textarea name="extraBody" rows="3" spellcheck="false">${e(JSON.stringify(c.extraBody || {}, null, 2))}</textarea></label>
        </div><div class="form-actions"><button class="btn ghost" type="button" data-action="ping-settings">保存并测试连接</button><button class="btn primary" type="submit">保存配置</button></div><div id="ping-result" class="faint" style="margin-top:12px"></div></form>
      </div></section>
      <aside class="stack"><section class="panel"><div class="panel-head"><h2>本地档案</h2></div><div class="panel-body faint" style="font-size:12px;line-height:1.9">
        <div>版本：0.2.0</div><div>服务只监听 127.0.0.1</div><div>存档：SQLite（data/sagas.sqlite）</div><div>导出包含完整剧情，分享前确认剧透范围。</div><div>运行中的 .sqlite 不应单独复制，优先使用网页导出。</div>
      </div></section><section class="panel"><div class="panel-head"><h2>模型说明</h2></div><div class="panel-body faint" style="font-size:12px;line-height:1.9">模型只提交行动意图，不决定伤害、DC、骰子或奖励。<br>计划格式失败会重试一次；仍失败则本回合不执行。<br>叙事中断可重试，不会重掷骰子。</div></section></aside></div>`);
    const form = $('#settings-form');
    const collect = () => {
        const fd = new FormData(form);
        let extraBody = {};
        const rawExtra = String(fd.get('extraBody') || '').trim();
        if (rawExtra) extraBody = JSON.parse(rawExtra);
        const body = {
            mode: fd.get('mode'), jsonMode: fd.get('jsonMode'), baseUrl: String(fd.get('baseUrl') || '').trim(),
            model: String(fd.get('model') || '').trim(), timeoutMs: Number(fd.get('timeoutMs')),
            maxTokens: Number(fd.get('maxTokens')), contextChars: Number(fd.get('contextChars')), extraBody,
        };
        const key = String(fd.get('apiKey') || '').trim();
        if (key) body.apiKey = key;
        return body;
    };
    form.addEventListener('submit', async (ev) => { ev.preventDefault(); try { await api('/api/settings', { method: 'POST', body: collect() }); toast('设置已保存。'); state.data.provider = (await api('/api/settings')); setChrome('settings', '<b>设置</b>', ''); } catch (err) { toast(err.message); } });
    $('[data-action="ping-settings"]', form)?.addEventListener('click', async () => {
        const out = $('#ping-result');
        try { await api('/api/settings', { method: 'POST', body: collect() }); const r = await api('/api/ai/ping', { method: 'POST', body: {} }); out.textContent = `连接成功 · ${r.mode} · ${r.models?.length ? '模型：' + r.models.join(', ') : r.message}`; }
        catch (err) { out.textContent = '连接失败：' + err.message; }
    });
}

/* ── Level-one game hall ───────────────────────────────────── */
async function pageGames() {
    setChrome('games', '<b>游戏厅</b>', '');
    let listing;
    try { listing = await api('/api/games'); }
    catch (err) { view('<div class="panel"><div class="empty"><h3>游戏厅加载失败</h3><p>' + e(err.message) + '</p></div></div>'); return; }
    const cards = listing.games.map(g => {
        const isLegacy = g.id === 'graylight-d20';
        const href = g.creationRoute;
        return '<article class="lib-item" style="padding:24px;display:flex;flex-direction:column;gap:12px">' +
          '<div><span class="tag">' + e(g.phase === 'experimental' ? '实验模块' : '可玩版本') + '</span> <span class="faint">' + e(g.rulesetId) + '</span></div>' +
          '<div><h2 style="margin:0 0 5px">' + e(g.name) + '</h2><p class="muted" style="margin:0">' + e(g.subtitle) + '</p></div>' +
          '<p>' + e(g.description) + '</p>' +
          '<p class="faint">' + g.features.map(v => e(v)).join(' · ') + '</p>' +
          (g.disclaimer ? '<p class="faint" style="font-size:12px">' + e(g.disclaimer) + '</p>' : '') +
          '<div style="margin-top:auto"><a class="btn primary" href="' + e(href) + '"' + (isLegacy ? ' data-link' : '') + '>进入游戏 →</a></div>' +
        '</article>';
    }).join('');
    view(pageHead('游戏厅', '游戏厅', '第一级只管理游戏；每个二级模块自己管理规则、角色、战斗与存档。') +
      (cards ? '<div class="card-grid">' + cards + '</div>' : '<div class="panel"><div class="empty"><h3>游戏厅还空着</h3><p>旧剧本已移除。新的“点开即玩”剧本包正在制作中；届时这里会直接出现可进入的剧本。</p><a class="btn ghost" href="/characters/new" data-link>先创建角色</a></div></div>'));
}

/* ── Shared actions ────────────────────────────────────────── */
function notFound(message) {
    setChrome('', '<b>未找到</b>', '');
    view(`<div class="panel"><div class="empty"><h3>${e(message)}</h3><p><a href="/" data-link>返回工作台</a></p></div></div>`);
}
async function refresh() { state.data = await api('/api/platform'); await render(); }
function go(path) {
    if (location.pathname + location.search === path) return;
    history.pushState({}, '', path);
    render();
}
function importSave(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const payload = JSON.parse(String(reader.result));
            const res = await api('/api/campaigns/import', { method: 'POST', body: payload });
            toast('存档已导入。');
            await refresh();
            go('/campaigns/' + res.state.id);
        } catch (err) { toast('导入失败：' + err.message); }
    };
    reader.readAsText(file);
}
async function archiveCampaign(id, archived) {
    try { await api('/api/campaigns/' + id, { method: 'PATCH', body: { lifecycle: archived ? 'archived' : 'active' } }); toast(archived ? '战役已归档。' : '战役已恢复。'); await refresh(); }
    catch (err) { toast(err.message); }
}
async function deleteCampaign(id) {
    const ok = await confirmDialog('删除战役', '这会永久删除该战役的存档、回合与事件记录，无法撤销。确定继续吗？', { confirmLabel: '永久删除', danger: true });
    if (!ok) return;
    try { await api(`/api/campaigns/${id}?confirm=1`, { method: 'DELETE' }); toast('战役已删除。'); await refresh(); go('/campaigns'); }
    catch (err) { toast(err.message); }
}
function renameCampaign(id) {
    const meta = state.data.campaigns.find((c) => c.id === id);
    modal('重命名战役', `<label class="field"><span>新名称</span><input id="rename-input" maxlength="60" value="${e(meta?.title || '')}"></label>`, {
        footer: '<button class="btn ghost" data-action="close-modal">取消</button><button class="btn primary" id="rename-save">保存</button>',
    });
    $('#rename-save')?.addEventListener('click', async () => {
        const title = $('#rename-input')?.value.trim();
        if (!title) return toast('名称不能为空。');
        try { await api('/api/campaigns/' + id, { method: 'PATCH', body: { title } }); closeModal(); toast('已重命名。'); await refresh(); }
        catch (err) { toast(err.message); }
    });
}
async function deleteCharacter(id) {
    const ok = await confirmDialog('删除角色', '只删除名册中的角色卡，不影响已经开始的战役。', { confirmLabel: '删除', danger: true });
    if (!ok) return;
    try { await api('/api/characters/' + id, { method: 'DELETE' }); toast('角色已删除。'); await refresh(); }
    catch (err) { toast(err.message); }
}

document.addEventListener('click', (ev) => {
    const link = ev.target.closest('a[data-link]');
    if (link && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey) {
        ev.preventDefault();
        const href = link.getAttribute('href');
        if (href && href.startsWith('/')) go(href);
        return;
    }
    const btn = ev.target.closest('[data-action]');
    if (!btn) {
        if (ev.target.matches('[data-modal-backdrop]')) closeModal();
        return;
    }
    const { action, id, tab } = btn.dataset;
    switch (action) {
        case 'close-modal': closeModal(); break;
        case 'import': $('#import-file')?.click(); break;
        case 'archive': archiveCampaign(id, true); break;
        case 'restore': archiveCampaign(id, false); break;
        case 'delete': deleteCampaign(id); break;
        case 'rename': renameCampaign(id); break;
        case 'delete-character': deleteCharacter(id); break;
        case 'lib-tab': state.libTab = tab; pageLibrary(); break;
        case 'wizard-world': state.wizard.packId = id; state.wizard.step = 2; pageWizard(); break;
        case 'wizard-mode': state.wizard.mode = btn.dataset.mode; pageWizard(); break;
        case 'wizard-roster': state.wizard.rosterId = id; pageWizard(); break;
        case 'wizard-prev': state.wizard.step = Math.max(1, state.wizard.step - 1); pageWizard(); break;
        case 'wizard-next': wizardNext(); break;
        case 'wizard-create': wizardCreate(); break;
        default: break;
    }
});
window.addEventListener('popstate', () => render());

async function render() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    let m;
    if (path === '/') return pageDashboard();
    if (path === '/games') return pageGames();
    if (path === '/campaigns') return pageCampaigns();
    if (path === '/campaigns/new') { const params = new URLSearchParams(location.search); return pageWizard(params.get('world') || undefined); }
    if ((m = /^\/campaigns\/([a-f0-9-]{36})$/.exec(path))) return pageCampaignDetail(m[1]);
    if (path === '/characters') return pageCharacters();
    if (path === '/characters/new') return pageCharacterNew();
    if ((m = /^\/characters\/([a-f0-9-]{36})$/.exec(path))) return pageCharacterSheet(m[1]);
    if ((m = /^\/characters\/([a-f0-9-]{36})\/edit$/.exec(path))) return pageCharacterEdit(m[1]);
    if (path === '/worlds') return pageWorlds();
    if ((m = /^\/worlds\/([a-z0-9-]{1,64})$/.exec(path))) return pageWorldDetail(m[1]);
    if (path === '/library') return pageLibrary();
    if (path === '/settings') return pageSettings();
    return notFound('页面不存在。');
}

async function boot() {
    try {
        state.data = await api('/api/platform');
        await render();
    } catch (err) {
        $('#view').innerHTML = `<div class="panel"><div class="empty"><h3>无法读取本地档案</h3><p>${e(err.message)}</p><p class="faint">请确认服务已启动，地址为 127.0.0.1。</p></div></div>`;
    }
}
boot();
