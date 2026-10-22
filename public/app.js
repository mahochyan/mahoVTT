const $ = s => document.querySelector(s);
function uuid() { if (typeof crypto.randomUUID === 'function')
    return crypto.randomUUID(); const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); }
const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = { grid: 'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z', shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z M8 12l3 3 5-6', bow: 'M5 3c15 1 15 17 0 18L16 12 5 3Z M3 12h18 M18 9l3 3-3 3', sun: 'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', book: 'M12 5C7 2 3 4 3 4v15s4-2 9 1c5-3 9-1 9-1V4s-4-2-9 1Z M12 5v15', gear: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0', die: 'M12 2 22 8v9l-10 6L2 17V8Z M2 8l10 6 10-6 M12 14v9 M7 7l10 6 M7 17h.01 M17 17h.01', save: 'M4 3h13l4 4v14H3V3Z M7 3v6h10V3 M7 21v-8h10v8', arrow: 'M4 12h16 M14 6l6 6-6 6', plus: 'M12 4v16 M4 12h16', back: 'M20 12H4 M10 6l-6 6 6 6', x: 'M6 6l12 12 M6 18 18 6', sword: 'M5 20 18 7l2-5-5 2L2 17 M3 13l8 8 M2 22l4-4', potion: 'M9 2h6 M10 2v6L5 18q-1 4 4 4h6q5 0 4-4L14 8V2 M7 16h10', key: 'M14 9a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M12 13l8 8 M16 17l3-3 M19 20l3-3', door: 'M4 21V3h16v18 M9 21V6h8v15 M13 13h1', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0', flag: 'M5 22V3 M5 3c5-3 9 4 15 0v10c-6 4-10-3-15 0', check: 'M4 12l5 5L20 6', map: 'M2 5l6-3 8 3 6-3v17l-6 3-8-3-6 3Z M8 2v17 M16 5v17', clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2', chat: 'M3 4h18v13H9l-6 4V4Z M7 9h10 M7 13h7', upload: 'M12 16V3 M7 8l5-5 5 5 M3 15v6h18v-6', flame: 'M13 2s1 6-4 9c-1-2-2-3-2-3s-6 10 1 13c7 3 13-4 9-10 0 4-3 5-3 5s3-8-1-14Z', tower: 'M5 22V10h14v12 M7 10V4h3v3h4V4h3v6 M10 22v-6h4v6' };
function icon(name, cls = '') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.shield}"/></svg>`; }
function applyPack(pack) {
    if (!pack) return;
    const r = document.documentElement;
    const theme = pack.theme || {};
    r.style.setProperty('--world-accent', theme.accent || '#c8a86b');
    r.style.setProperty('--world-tint', theme.tint || 'rgba(200,168,107,.12)');
    r.style.setProperty('--world-backdrop', theme.backdrop ? `url('${theme.backdrop}')` : 'none');
    r.style.setProperty('--gold', theme.accent || '#c8a86b');
}
function portraitFor(a) {
    if (!a) return null;
    if (a.id === 'pc') return `/art/tokens/pc_${a.role === '游侠' ? 'ranger' : a.role === '牧师' ? 'cleric' : 'fighter'}.webp`;
    if (a.id === 'ranger') return '/art/tokens/shen_yuan.webp';
    if (a.id === 'cleric') return '/art/tokens/luo_en.webp';
    if (a.id === 'guardian') return '/art/tokens/guardian.webp';
    if (['g1', 'g2', 'g3'].includes(a.id)) return '/art/tokens/goblin_melee.webp';
    if (['g4', 'g5'].includes(a.id)) return '/art/tokens/goblin_archer.webp';
    return null;
}
const ui = { fullMap: false, boot: null, data: null, cid: null, tab: 'story', draft: '', busy: false, streamingTurn: null, streamText: '', notice: '', pending: null, modal: null, lastSignature: '', pollBusy: false };
let toastTimer;
function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 4200); }
async function api(path, options = {}) { const res = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, ...(options.body && typeof options.body !== 'string' ? { body: JSON.stringify(options.body) } : {}) }); let data; try {
    data = await res.json();
}
catch {
    throw new Error('服务返回了无法读取的内容。');
} if (!res.ok) {
    const err = new Error(data.error?.message || `HTTP ${res.status}`);
    err.code = data.error?.code;
    throw err;
} return data; }
function header() { const p = ui.data?.provider || ui.boot?.provider, pack = ui.data?.pack; return `<header class="topbar play-topbar"><a class="brand" href="/" aria-label="返回工作台"><svg class="brand-mark" viewBox="0 0 40 46" fill="none"><path d="m20 2 17 10v22L20 44 3 34V12Z" stroke="currentColor" stroke-width="1.3"/><path d="m20 9 7 14-7 14-7-14Z" fill="currentColor"/><path d="M8 23h24" stroke="#0a0c10"/></svg><span><strong>GRAYLIGHT</strong><small>${pack ? e(pack.title) : '本地跑团'}</small></span></a><nav class="top-links"><button class="top-link" data-action="book">${icon('book')}<span>世界书</span></button><button class="top-link" data-action="rules">${icon('die')}<span>规则</span></button><button class="top-link" data-action="settings">${icon('gear')}<span>AI 设置</span></button><a class="top-link" href="/">${icon('grid')}<span>工作台</span></a><span class="status"><i class="dot ${p?.mode === 'openai' ? 'online' : ''}"></i>${p?.mode === 'openai' ? '自定义 AI 已配置' : '规则演示模式'}</span></nav></header>`; }
function towerArt() { return `<div class="hero-art" aria-hidden="true"><svg viewBox="0 0 500 350" fill="none"><defs><radialGradient id="moon"><stop stop-color="#8cabba" stop-opacity=".38"/><stop offset="1" stop-color="#8cabba" stop-opacity="0"/></radialGradient><linearGradient id="tower" x2="0" y2="1"><stop stop-color="#304655"/><stop offset="1" stop-color="#0f1b28"/></linearGradient><linearGradient id="lamp"><stop stop-color="#d2b67c" stop-opacity=".9"/><stop offset="1" stop-color="#d2b67c" stop-opacity=".1"/></linearGradient></defs><circle cx="290" cy="130" r="155" fill="url(#moon)"/><circle cx="306" cy="95" r="47" fill="#526976" opacity=".3"/><path d="m0 315 75-28 55 9 78-47 102 8 42 17 77-35 71 25v86H0Z" fill="#101e2b"/><path d="m185 275 10-178 25-18 9-38 15 13 10-25 12 20 17-9 5 47 20 14 12 174Z" fill="url(#tower)" stroke="#57707d" stroke-opacity=".3"/><path d="M197 97h106 M193 128h114 M190 196h122 M212 275l4-85 20-11 24 14 5 82" stroke="#57707d" stroke-opacity=".25"/><path d="M224 115q26-30 52 0v42h-52Z" fill="#0b1520"/><circle cx="250" cy="130" r="17" stroke="#a18c61" stroke-opacity=".55" stroke-width="2"/><path d="m250 115-1 16 10 6" stroke="#a18c61" stroke-opacity=".6"/><path d="M249 40 239 96l19 32-8 40 10 36-6 70" stroke="#07111b" stroke-width="4"/><path d="m230 276 1-49q11-18 22 0l2 49Z" fill="url(#lamp)" opacity=".8"/><path d="m160 322 71-46h24l85 46" fill="#c7ab7010"/><path d="M20 315h456 M65 325h388 M106 335h300" stroke="#648096" stroke-opacity=".13"/><g stroke="#70899b" stroke-opacity=".2"><path d="m83 30-4 20m42 30-4 20m35-52-4 20m220-15-4 20m43 44-4 20m-12 90-4 20m-300-40-4 20m-30 35-4 20m70-55-4 20m312-105-4 20"/></g><circle cx="140" cy="273" r="3" fill="#d0b57c" opacity=".7"/><path d="M140 276v20" stroke="#d0b57c" stroke-opacity=".4"/><path d="m95 298 35-2 4-18 10-2 10 23 18 8" stroke="#84939c" stroke-opacity=".3"/></svg><div class="art-caption">THE SILENT BELL<br>灰灯镇 · 北坡钟塔</div></div>`; }
function home() { const saves = ui.boot?.campaigns || []; return `${header()}<main class="home"><section class="hero"><div class="hero-copy"><div class="eyebrow">一段真正由你推进的冒险</div><h1>灰灯之下，<br><span>轮到你行动。</span></h1><p>钟塔已经三天没有报时。带上沈鸢与洛恩，循着铜管中的回声，找回一座小镇遗失的答案。</p><div class="hero-tags"><span class="tag gold">原创中文世界</span><span class="tag">五房间战术地图</span><span class="tag">两名 AI 同伴</span><span class="tag">本地自动存档</span></div></div>${towerArt()}</section><div class="home-grid"><section class="panel new-card"><div class="eyebrow">BEGIN YOUR CHRONICLE</div><h2>点亮一段新旅程</h2><p>你控制战士。AI 决策由规则引擎校验，骰子与存档不会听故事改口。</p><form id="create-form"><label class="field"><span>冒险者的名字</span><input id="player-name" name="playerName" maxlength="20" value="旅人" required autocomplete="off" aria-label="冒险者的名字"></label><label class="field"><span>战役名称</span><input name="name" maxlength="60" value="灰灯镇：无声钟塔" required aria-label="战役名称"></label><button class="btn primary full" type="submit">${icon('plus')} 开始冒险 ${icon('arrow')}</button></form><p class="fineprint">没有接入 AI 也能开始。演示模式使用规则队友与预写叙事；在右上角连接 DGX 后，启用模型决策和自由叙事。</p></section><section class="save-section"><div class="section-title"><span>你的冒险记录</span><button class="btn small ghost" data-action="import">${icon('upload')} 导入存档</button></div><div class="save-list">${saves.length ? saves.slice(0, 5).map(c => `<button class="save-card" data-action="open" data-id="${e(c.id)}"><div class="save-icon">${icon('tower')}</div><div class="save-name"><h3>${e(c.name)}</h3><p>${e(c.playerName)} · 已探索 ${c.rooms}/5 · ${c.gold} 金币 · ${e(new Date(c.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))}</p></div><span class="tag ${c.status === 'victory' ? 'gold' : ''}">${c.status === 'victory' ? '已完成' : c.status === 'defeat' ? '远征结束' : '继续冒险'}</span>${icon('arrow')}</button>`).join('') : '<div class="empty-saves">这里还没有脚印。创建第一份战役，已结算的每一步都会自动保存。</div>'}</div><div class="crew-preview"><div class="crew-mini"><span style="color:var(--gold)">${icon('shield', 'large')}</span><h3>你</h3><p>战士 · 决定前路</p></div><div class="crew-mini"><span style="color:var(--teal)">${icon('bow', 'large')}</span><h3>沈鸢</h3><p>游侠 · 寻找射线</p></div><div class="crew-mini"><span style="color:var(--blue)">${icon('sun', 'large')}</span><h3>洛恩</h3><p>牧师 · 守住灯火</p></div></div><p class="fineprint">存档在本机 SQLite 中，关闭浏览器不会清空进度。导出为独立 JSON 文件，密钥不会跟随存档导出。</p></section></div><footer class="footer-note">GRAYLIGHT 0.1.0 · 原创小型 d20 规则 · 非 D&D 完整规则实现</footer></main>`; }
function canAct() { const s = ui.data?.state; return !!s && !ui.busy && !ui.pending && s.status === 'playing' && (!s.combat || s.activeActorId === 'pc') && s.actors.find(a => a.id === 'pc')?.hp > 0; }
function leftRail(s) { const pc = s.actors.find(a => a.id === 'pc'); return `<aside class="left-rail"><section class="panel party-panel"><div class="section-title"><span>冒险小队</span><span class="tag">3 人</span></div>${s.actors.filter(a => a.faction === 'party').map(a => `<div class="party-card"><div class="party-top"><div class="portrait ${a.id}">${icon(a.id === 'pc' ? 'shield' : a.id === 'ranger' ? 'bow' : 'sun')}${portraitFor(a) ? `<img src="${portraitFor(a)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div><div class="party-info"><b>${e(a.name)}</b><small>${e(a.role)} · ${a.id === 'pc' ? '由你控制' : 'AI 同伴'}</small></div>${s.activeActorId === a.id ? '<span class="turn-indicator">●</span>' : ''}</div><div class="hp-row"><span>${a.hp === 0 ? '倒地' : '生命值'}</span><strong>${a.hp} <span class="dim">/ ${a.maxHp}</span></strong></div><div class="hp-bar ${a.hp / a.maxHp < .4 ? 'low' : ''}"><i style="width:${a.hp / a.maxHp * 100}%"></i></div><div class="party-resource"><span>护甲 ${a.ac}${a.id !== 'pc' ? ` <button data-action="ask-companion" data-target="${a.id}" style="color:var(--gold);font-size:10px;padding:0 3px" ${canAct() ? '' : 'disabled'}>交谈</button>` : ''}</span><span>${abilitySummary(a)}</span></div></div>`).join('')}</section><section class="panel stats-panel"><div class="section-title">你的战斗属性</div><div class="stat-grid"><div class="stat"><strong>${pc.ac}</strong><small>护甲等级</small></div><div class="stat"><strong>${pc.speed}</strong><small>移动格数</small></div><div class="stat"><strong>+${pc.attack}</strong><small>攻击加值</small></div></div></section><section class="panel inventory-panel"><div class="section-title"><span>你的背包</span>${icon('save')}</div><div class="item-row"><span class="item-icon">${icon('sword')}</span><span>${e(pc.weapon)}</span><span class="dim">${e(pc.damage)}</span></div><div class="item-row"><span class="item-icon">${icon('potion')}</span><span>治疗药水</span><span>${pc.inventory.potion || 0}</span></div>${pc.inventory.key ? `<div class="item-row"><span class="item-icon">${icon('key')}</span><span>调谐钥匙</span><span>1</span></div>` : ''}<div class="currency"><span>队伍金币 <strong>${s.gold}</strong></span><span>经验 ${s.xp}</span></div></section><p class="left-hint">${icon('save')} 自动存档 · 状态版本 v${s.version}<br>已确认的事实由服务端保存，模型无法直接改写。</p><button class="btn small ghost" data-action="edit-hp">人工修正角色卡</button></aside>`; }
function tileOpen(s, p) { return s.map.tiles[p.y]?.[p.x] === 1 && !s.objects.some(o => o.kind === 'door' && !o.open && o.x === p.x && o.y === p.y); }
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const ABILITY_UI = {
    second_wind: { name: '回气', icon: 'shield', cost: 'bonus', resource: 'secondWind', max: 1, target: 'self' },
    aimed_shot: { name: '瞄准射击', icon: 'bow', cost: 'action', target: 'enemy' },
    heal: { name: '疗愈术', icon: 'sun', cost: 'action', resource: 'heal', max: 4, target: 'ally', range: 6 },
    radiance: { name: '灯辉术', icon: 'sun', cost: 'action', target: 'enemy', range: 8 },
};
function abilitySummary(a) {
    const list = (a.abilityIds || []).map((id) => ABILITY_UI[id]).filter(Boolean);
    const withRes = list.filter((x) => x.resource);
    if (withRes.length) return withRes.map((x) => `${x.name} ${a.resources[x.resource] ?? 0}/${x.max}`).join(' · ');
    return `射程 ${a.range} 格`;
}
function getReach(s) { const pc = s.actors.find(a => a.id === 'pc'), budget = s.combat ? pc.speed - s.combat.movementUsed : pc.speed; const map = new Map([[`${pc.x},${pc.y}`, []]]); if (!canAct())
    return map; const q = [{ x: pc.x, y: pc.y, path: [] }]; for (let i = 0; i < q.length; i++) {
    const p = q[i];
    if (p.path.length >= budget)
        continue;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
        const n = { x: p.x + dx, y: p.y + dy }, key = `${n.x},${n.y}`;
        if (map.has(key) || !tileOpen(s, n))
            continue;
        if (dx && dy && (!tileOpen(s, { x: p.x, y: n.y }) || !tileOpen(s, { x: n.x, y: p.y })))
            continue;
        if (s.actors.some(a => a.hp > 0 && a.faction === 'hostile' && a.x === n.x && a.y === n.y))
            continue;
        const path = [...p.path, n];
        map.set(key, path);
        q.push({ ...n, path });
    }
} for (const a of s.actors)
    if (a.id !== 'pc' && a.hp > 0)
        map.delete(`${a.x},${a.y}`); return map; }
function mapSvg(s) {
    const C = 26, ox = 16, oy = 20, w = s.map.width * C + ox * 2, h = s.map.height * C + oy * 2, reach = getReach(s);
    let box = [0, 0, w, h];
    if (!ui.fullMap) {
        const tiles = [];
        for (let y = 0; y < s.map.height; y++)
            for (let x = 0; x < s.map.width; x++)
                if (s.map.tiles[y][x])
                    tiles.push({ x, y });
        const x0 = Math.max(0, Math.min(...tiles.map(p => p.x)) - 2), y0 = Math.max(0, Math.min(...tiles.map(p => p.y)) - 2), x1 = Math.min(s.map.width, Math.max(...tiles.map(p => p.x)) + 3), y1 = Math.min(s.map.height, Math.max(...tiles.map(p => p.y)) + 3);
        box = [x0 * C, y0 * C, (x1 - x0) * C + ox * 2, (y1 - y0) * C + oy * 2];
    }
    let svg = `<svg id="battle-map" viewBox="${box.join(' ')}" role="img" aria-label="钟塔战术地图，点击地面移动，点击敌人攻击"><defs><pattern id="fog" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0v26" fill="none" stroke="#1a1f26" stroke-width=".6"/></pattern><filter id="glow"><feGaussianBlur stdDeviation="2"/></filter></defs><rect width="${w}" height="${h}" fill="url(#fog)"/>`;
    for (let x = 0; x < s.map.width; x += 5)
        svg += `<text x="${ox + x * C + 13}" y="12" fill="#465b70" font-size="8" text-anchor="middle">${x}</text>`;
    for (let y = 0; y < s.map.height; y++)
        for (let x = 0; x < s.map.width; x++) {
            const t = s.map.tiles[y][x];
            if (!t)
                continue;
            const px = ox + x * C, py = oy + y * C;
            const open = reach.has(`${x},${y}`);
            svg += `<rect class="tile" data-x="${x}" data-y="${y}" x="${px}" y="${py}" width="${C}" height="${C}" rx="1" fill="${t === 2 ? '#383836' : open ? '#2a3833' : ((x + y) % 3 === 0 ? '#232a33' : '#1f262e')}" stroke="${open ? '#5f7a6a55' : '#333c47'}" stroke-width=".6"/>`;
            if (t === 2)
                svg += `<path d="M${px + 4} ${py + 4}h18v18H${px + 4}Z m0 0 18 18 m0-18-18 18" stroke="#6f6653" stroke-width="1" opacity=".7" pointer-events="none"/>`;
            for (const [dx, dy, side] of [[0, -1, 'top'], [1, 0, 'right'], [0, 1, 'bottom'], [-1, 0, 'left']]) {
                if (!s.map.tiles[y + dy]?.[x + dx]) {
                    const lines = { top: [px, py, px + C, py], right: [px + C, py, px + C, py + C], bottom: [px, py + C, px + C, py + C], left: [px, py, px, py + C] };
                    const [x1, y1, x2, y2] = lines[side];
                    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5d6772" stroke-width="3" opacity=".75" pointer-events="none"/>`;
                }
            }
        }
    for (const room of s.rooms) {
        const [x, y, w] = room.rect;
        svg += `<text x="${ox + (x + w / 2) * C}" y="${oy + y * C + 13}" fill="#9aa3ae" font-size="9" letter-spacing="1.5" text-anchor="middle" pointer-events="none" opacity=".75">${e(room.name)}</text>`;
    }
    for (const o of s.objects) {
        const x = ox + o.x * C + 13, y = oy + o.y * C + 13;
        let mark = '';
        if (o.kind === 'door') {
            const horizontal = tileOpen(s, { x: o.x - 1, y: o.y }) || tileOpen(s, { x: o.x + 1, y: o.y });
            mark = horizontal ? `<path d="M-3 -12v${o.open ? 6 : 24}${o.open ? ' M-3 6v6' : ''}" stroke="${o.open ? '#657d73' : '#c1a575'}" stroke-width="5"/>` : `<path d="M-12 -3h${o.open ? 6 : 24}${o.open ? ' M6 -3h6' : ''}" stroke="${o.open ? '#657d73' : '#c1a575'}" stroke-width="5"/>`;
            if (o.locked)
                mark += '<rect x="-3" y="-3" width="6" height="6" rx="1" fill="#ead2a2"/>';
        }
        else if (o.kind === 'npc')
            mark = `<circle r="10" fill="#302f29" stroke="#c1a575"/><text y="3.5" text-anchor="middle" fill="#e4d4ad" font-size="10">${o.id === 'ileya' ? '伊' : '米'}</text>`;
        else if (o.kind === 'chest')
            mark = `<rect x="-9" y="-6" width="18" height="13" rx="2" fill="${o.looted ? '#26323b' : '#605039'}" stroke="#9b825a" opacity="${o.looted ? .5 : 1}"/><path d="M-9-1H9 M-1-4v7" stroke="#c1a575" opacity="${o.looted ? .3 : 1}"/>`;
        else if (o.kind === 'altar')
            mark = `<circle r="12" fill="#41687b33"/><path d="m0-12 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="${o.looted ? '#4b5d68' : '#91c1d2'}" stroke="#afd9e4" stroke-width=".6"/>`;
        else if (o.kind === 'rest')
            mark = '<path d="m0-10 5 9 2 6-7 6-7-6 3-8 2 3Z" fill="#c8a46c" opacity=".9"/>';
        else
            mark = `<rect x="-7" y="-9" width="14" height="18" rx="1" fill="${o.looted ? '#3d4e57' : '#8e8970'}" stroke="#bdb391"/><path d="M-4-4h8 M-4 0h7 M-4 4h5" stroke="#293440"/>`;
        svg += `<g class="map-object" data-object="${e(o.id)}" transform="translate(${x} ${y})" style="cursor:pointer"><title>${e(o.name)} · ${e(o.description)}</title><rect x="-13" y="-13" width="26" height="26" fill="transparent"/>${mark}</g>`;
    }
    for (const a of s.actors) {
        const x = ox + a.x * C + 13, y = oy + a.y * C + 13, color = a.faction === 'hostile' ? '#e38b81' : a.id === 'pc' ? '#dec18a' : a.id === 'ranger' ? '#83cbb5' : '#95b9e1', glyph = a.hp === 0 ? '×' : a.id === 'pc' ? '◆' : a.id === 'ranger' ? '↗' : a.id === 'cleric' ? '✧' : a.id === 'guardian' ? '⬟' : '•';
        const portrait = portraitFor(a);
        svg += `<g class="token" data-actor="${e(a.id)}" transform="translate(${x} ${y})"><title>${e(a.name)} · HP ${a.hp}/${a.maxHp} · AC ${a.ac}</title>${s.activeActorId === a.id ? `<circle r="15" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="3 3"/>` : ''}<circle r="10.5" fill="${a.faction === 'hostile' ? '#432c30' : '#14252b'}" stroke="${color}" stroke-width="1.8" opacity="${a.hp === 0 ? .5 : 1}"/><text y="4" font-size="${a.faction === 'hostile' ? 20 : 14}" fill="${color}" text-anchor="middle" pointer-events="none">${glyph}</text>${portrait ? `<defs><clipPath id="tok-${e(a.id)}"><circle r="9.6"/></clipPath></defs><image href="${portrait}" x="-9.6" y="-9.6" width="19.2" height="19.2" clip-path="url(#tok-${e(a.id)})" preserveAspectRatio="xMidYMid slice" opacity="${a.hp === 0 ? .45 : 1}" pointer-events="none" onerror="this.remove()"/>` : ''}<rect x="-10" y="12" width="20" height="2.5" rx="1" fill="#111a23"/><rect x="-10" y="12" width="${20 * a.hp / a.maxHp}" height="2.5" rx="1" fill="${color}"/></g>`;
    }
    svg += `<text x="${w - 20}" y="${h - 8}" fill="#4f6578" font-size="8" text-anchor="end" letter-spacing="1.5">每格 5 尺 · 房间级迷雾</text></svg>`;
    return svg;
}
function nearby(s) {
    const pc = s.actors.find(a => a.id === 'pc'), disabled = canAct() ? '' : 'disabled';
    return s.objects.filter(o => dist(pc, o) <= 1).map(o => {
        let buttons = [];
        if (o.kind === 'door' && !o.open) {
            if (o.locked)
                buttons.push(['撬锁', 'pick_lock'], ['强推', 'force']);
            else
                buttons.push(['打开', 'open']);
        }
        else if (o.kind === 'door')
            return '';
        else if (o.kind === 'rest')
            buttons.push(['长休', 'rest']);
        else if (o.kind === 'altar' && !o.looted)
            buttons.push(['校准', 'calibrate'], ['取钥匙', 'take_key']);
        else if (o.kind === 'npc')
            buttons.push([o.id === 'ileya' ? (s.objectives.find(q => q.id === 'key').done ? '交付 / 交谈' : s.objectives[0].done ? '交谈' : '接受委托') : '交谈 / 救助', 'talk']);
        else if (o.kind === 'chest' && !o.looted)
            buttons.push(['拾取', 'loot']);
        else if (o.kind === 'clue')
            buttons.push([o.looted ? '重读' : '调查', 'read']);
        return buttons.map(([label, interaction]) => `<button class="btn small ghost" data-action="interact" data-target="${e(o.id)}" data-interaction="${interaction}" ${disabled}>${icon(o.kind === 'npc' ? 'chat' : o.kind === 'door' ? 'door' : o.kind === 'rest' ? 'flame' : 'eye')} ${e(o.name)} · ${label}</button>`).join('');
    }).join('');
}
function actionPanel(s) { const pc = s.actors.find(a => a.id === 'pc'), enabled = canAct(), combat = s.combat, active = s.actors.find(a => a.id === s.activeActorId); return `<section class="panel action-panel"><div class="action-head"><span>${combat ? (s.activeActorId === 'pc' ? '你的回合' : `${e(active?.name || '敌人')}正在行动`) : '探索 · 你带领队伍'}</span>${combat ? `<div class="action-resources"><span class="${combat.actionUsed ? 'resource-used' : ''}">● 动作</span><span class="${combat.bonusUsed ? 'resource-used' : ''}">● 附赠</span><span>${pc.speed - combat.movementUsed} 格移动</span></div>` : '<span class="tag teal">安全结算 · 自动保存</span>'}</div><div class="action-buttons"><button class="btn" data-action="move-help" ${enabled ? '' : 'disabled'}>${icon('map')} 移动</button><button class="btn" data-action="attack-help" ${enabled && !combat?.actionUsed ? '' : 'disabled'}>${icon('sword')} 攻击</button><button class="btn" data-action="potion" ${enabled && pc.inventory.potion > 0 && !combat?.bonusUsed ? '' : 'disabled'}>${icon('potion')} 药水 <small>×${pc.inventory.potion || 0}</small></button>${(pc.abilityIds || []).map((id) => ABILITY_UI[id]).filter(Boolean).map((ab) => { const res = ab.resource ? (pc.resources[ab.resource] || 0) : 1; const used = combat ? (ab.cost === 'bonus' ? combat.bonusUsed : combat.actionUsed) : false; const dis = !enabled || res <= 0 || used; return `<button class="btn" data-action="ability" data-id="${ab.id}" ${dis ? 'disabled' : ''}>${icon(ab.icon)} ${ab.name}${ab.resource ? ` <small>×${res}</small>` : ''}</button>`; }).join('')}<button class="btn" data-action="observe" ${enabled ? '' : 'disabled'}>${icon('eye')} 观察</button>${combat ? `<button class="btn primary end" data-action="end-turn" ${enabled ? '' : 'disabled'}>结束回合 ${icon('arrow')}</button>` : ''}</div>${!combat || enabled ? `<div class="nearby"><div class="nearby-label">相邻互动 · 先靠近，再行动</div><div class="nearby-buttons">${nearby(s) || '<span class="dim" style="font-size:11px">这里没有相邻的交互物。点击地图地面靠近门、人物或容器。</span>'}</div></div>` : ''}</section>`; }
function initiative(s) { if (!s.combat)
    return ''; return `<div class="round-strip"><span class="round-label">第 ${s.combat.round} 轮</span>${s.combat.order.map((id, i) => { const a = s.actors.find(a => a.id === id); return `<span class="initiative-chip ${i === s.combat.active ? 'current' : ''}">${e(a?.name || '已退场')}${a?.hp === 0 ? ' · 倒地' : ''}</span>`; }).join('')}</div>`; }
function storyFeed(s) { const turns = ui.data.turns; return `<div class="chat-intro"><div class="chapter-marker">第一幕 · 灯下委托</div>${e(s.journal[0])}</div>${turns.map((t, index) => { const facts = t.facts || [], actor = facts.find(f => f.actorId)?.actorId, a = s.actors.find(a => a.id === actor), narrative = t.id === ui.streamingTurn ? ui.streamText : t.narrative; return `<article class="turn-entry" id="turn-${e(t.id)}">${t.source === 'player' ? `<div class="speaker player">${icon('shield')} ${e(s.playerName)}</div><div class="player-line">${e(t.input)}</div>` : `<div class="speaker">${icon(a?.faction === 'hostile' ? 'sword' : a?.id === 'ranger' ? 'bow' : 'sun')} ${e(a?.name || '战场')} <span class="tag">${t.model === 'rules-engine' ? '规则行动' : '同伴回合'}</span></div>`}${t.source === 'player' && narrative ? '<div class="speaker">' + icon('book') + ' 主持人</div>' : ''}<div class="narrative" id="narrative-${e(t.id)}">${e(narrative)}</div>${t.resolutionStatus === 'pending' ? '<div class="planning"><i class="spinner"></i>正在理解行动，尚未结算…</div>' : ''}${facts.length ? `<details class="facts" ${index === turns.length - 1 ? 'open' : ''}><summary>已确认事实 · ${facts.length} 项</summary><div class="facts-body">${facts.map(f => `<div class="fact-line">${e(f.text)}</div>`).join('')}</div></details>` : ''}${t.error ? `<p class="error-line">${e(t.error)}</p>` : ''}${t.resolutionStatus === 'resolved' && t.narrationStatus === 'failed' ? `<button class="retry-btn" data-action="retry-narrative" data-id="${e(t.id)}" ${ui.busy ? 'disabled' : ''}>↻ 重试叙事，不重新掷骰</button>` : ''}</article>`; }).join('')}${ui.busy && !turns.some(t => t.id === ui.streamingTurn) ? '<div class="planning"><i class="spinner"></i>正在处理你的行动…</div>' : ''}${ui.data.autoRunning ? '<div class="planning"><i class="spinner"></i>队友与敌人正在依次行动…</div>' : ''}`; }
function tabContent(s) {
    if (ui.tab === 'story')
        return storyFeed(s);
    if (ui.tab === 'quest')
        return `<div class="eyebrow">THE SILENT BELL</div><h2 class="quest-title">无声钟塔</h2><p class="quest-description">取回祭坛上的调谐钥匙，交给守灯人伊蕾娅。你的发现将影响最终的答案。</p>${s.objectives.map((q, i) => `<div class="quest-item ${q.done ? 'done' : ''} ${i > 2 ? 'optional' : ''}"><span class="quest-check">${q.done ? '✓' : i < 3 ? i + 1 : '·'}</span><span>${e(q.title)}</span></div>`).join('')}<p class="quest-note">任务报酬：60 金币、50 经验。<br>可选目标不妨碍完成主线。</p><div class="section-title" style="margin-top:25px">规范事实 · 不依赖模型记忆</div><p class="quest-description">${e(s.facts.join('\n'))}</p>`;
    if (ui.tab === 'dice')
        return `<div class="section-title">服务端骰史</div><form id="dice-form" class="dice-form"><input name="expr" value="d20" maxlength="30" aria-label="骰子表达式"><button class="btn" type="submit">掷骰</button></form><p class="quest-note" style="margin:0 0 15px">自由骰只记录结果，不会自动造成伤害或推进任务。</p>${ui.data.dice.slice().reverse().map(d => `<div class="dice-card"><div class="dice-number">${d.total}</div><div class="dice-meta">${e(d.purpose)}<small>${e(d.expr)} · [${d.rolls.join(', ')}] ${d.modifier >= 0 ? '+' : ''}${d.modifier}${d.mode !== 'normal' ? ' · ' + d.mode : ''}</small></div></div>`).join('') || '<p class="dim">尚未掷骰。</p>'}`;
    return `<div class="section-title">事件日志 · 当前 v${s.version}</div>${ui.data.events.slice().reverse().map(ev => `<div class="log-event"><small>#${ev.seq} · 状态 v${ev.stateVersion}</small>${e(ev.text)}</div>`).join('') || '<p class="dim">你的第一个行动将在这里留下记录。</p>'}`;
}
function game() { const s = ui.data.state; const hours = Math.floor(s.worldTime / 3600), minutes = Math.floor(s.worldTime % 3600 / 60); return `${header()}<div class="campaign-head"><div><div class="breadcrumbs">${e(ui.data?.pack?.genre || '本地战役')} / ${e((s.rooms || []).at(-1)?.name || '冒险')} / ${s.status === 'victory' ? '冒险完成' : s.status === 'defeat' ? '远征结束' : '进行中'}</div><h1>${e(s.name)}</h1></div><div class="campaign-meta"><small>${icon('clock')} 已历 ${hours}时${minutes}分</small><span class="tag">${s.discovered.length}/5 地点</span><button class="btn small ghost" data-action="export">${icon('save')} 导出存档</button><button class="btn small ghost" data-action="home">${icon('back')} 返回</button></div></div>${ui.notice ? `<div class="notice-bar"><span>${e(ui.notice)}</span>${ui.pending ? '<button data-action="recover">查询恢复</button>' : '<button data-action="dismiss-notice">关闭</button>'}</div>` : ''}<main class="workspace">${leftRail(s)}<section class="map-column">${s.status !== 'playing' ? `<div class="outcome"><div class="eyebrow">${s.status === 'victory' ? 'CHRONICLE COMPLETE' : 'EXPEDITION ENDED'}</div><h2>${s.status === 'victory' ? '你带回了一个答案。' : '灯火暂时熄灭。'}</h2><p>${e(s.ending || '全队倒地。这份远征记录已经保存，你可以导出它，或从首页创建新的冒险。')}</p><button class="btn" data-action="home">返回战役列表 ${icon('arrow')}</button></div>` : ''}${initiative(s)}<div class="panel map-panel"><div class="map-top"><span class="map-title">${icon('map')} 冒险地图 <small>${s.rooms.length} 个已发现地点</small></span><span style="display:flex;gap:8px;align-items:center"><button class="btn small ghost" data-action="map-zoom">${ui.fullMap ? '聚焦探索' : '查看全图'}</button><span class="tag ${s.combat ? 'red' : 'teal'}">${s.combat ? '战术战斗' : '自由探索'}</span></span></div><div class="map-stage">${mapSvg(s)}</div><div class="map-footer"><div class="map-legend"><span><i class="legend-dot"></i>你</span><span><i class="legend-dot ally"></i>同伴</span><span><i class="legend-dot hostile"></i>敌人</span></div><span>点击地面移动 · 点击敌人攻击</span></div></div>${s.status === 'playing' ? actionPanel(s) : ''}<div class="hint-strip">${icon('flag')}<span>${s.status === 'victory' ? '主线已完成。任务与世界书保留你的发现。' : s.combat ? (s.activeActorId === 'pc' ? '可以移动、攻击，再使用药水或回气。完成后点击「结束回合」。' : '队友串行决策，敌人使用规则策略。回合会自动返回给你。') : s.objectives.find(q => !q.done && ['accept', 'key', 'return'].includes(q.id))?.title || '探索尚未读完的线索。'}</span></div></section><aside class="panel chat-panel"><div class="chat-tabs">${[['story', '剧情'], ['quest', '任务'], ['dice', '骰史'], ['log', '记录']].map(([id, label]) => `<button class="chat-tab ${ui.tab === id ? 'active' : ''}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}</div><div class="chat-feed" id="chat-feed">${tabContent(s)}</div><form class="compose" id="chat-form"><textarea id="chat-input" name="input" maxlength="2000" rows="2" placeholder="描述一个行动，或问问身边的人…" aria-label="描述你的行动" ${canAct() ? '' : 'disabled'}>${e(ui.draft)}</textarea><div class="compose-bottom"><small>${ui.data.provider.mode === 'mock' ? '演示模式：建议使用地图和动作按钮' : 'AI 只提案 · 引擎作结算'}<br>Enter 发送 · Shift+Enter 换行 · /r d20</small><button class="btn primary composer-send" type="submit" ${canAct() ? '' : 'disabled'}>${icon('arrow')} 发送</button></div></form></aside></main>`; }
function render() { const focus = document.activeElement, focusId = focus?.id, selection = focus instanceof HTMLTextAreaElement ? focus.selectionStart : null; const feed = $('#chat-feed'), nearBottom = feed ? feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100 : true, scroll = feed?.scrollTop || 0; $('#app').innerHTML = ui.cid && ui.data ? game() : home(); if (focusId && $('#' + focusId)) {
    const el = $('#' + focusId);
    el.focus({ preventScroll: true });
    if (selection !== null && el instanceof HTMLTextAreaElement)
        el.setSelectionRange(selection, selection);
} const next = $('#chat-feed'); if (next) {
    if (ui.tab === 'story' && nearBottom)
        next.scrollTop = next.scrollHeight;
    else
        next.scrollTop = scroll;
} }
async function bootstrap() { ui.boot = await api('/api/bootstrap'); const m = /^\/c\/([a-f0-9-]{36})/.exec(location.pathname); if (m) {
    try {
        await openCampaign(m[1], false);
    }
    catch (err) {
        toast(err.message);
        history.replaceState({}, '', '/');
        render();
    }
}
else
    render(); }
async function openCampaign(id, push = true) { ui.cid = id; ui.data = await api('/api/campaigns/' + id); applyPack(ui.data.pack); ui.tab = 'story'; ui.draft = ''; ui.notice = ''; ui.pending = null; ui.lastSignature = ''; if (push)
    history.pushState({}, '', `/c/${id}`); try {
    const p = JSON.parse(sessionStorage.getItem('graylight.pending') || 'null');
    if (p?.campaignId === id) {
        ui.pending = p;
        ui.notice = '发现一条尚未确认的请求。先查询恢复，避免重复行动。';
    }
}
catch { } render(); await api(`/api/campaigns/${id}/resume`, { method: 'POST', body: {} }).catch(() => { }); }
async function goHome() { if (ui.busy) {
    toast('当前请求仍在处理；已提交的事实会自动保存。');
    return;
}
location.href = '/'; }
function savePending(p) { ui.pending = p; if (p)
    sessionStorage.setItem('graylight.pending', JSON.stringify(p));
else
    sessionStorage.removeItem('graylight.pending'); }
async function consumeStream(res, handler) { if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || '请求失败。');
} if (!res.body)
    throw new Error('浏览器未收到流式响应。'); const reader = res.body.getReader(), decoder = new TextDecoder(); let buffer = ''; try {
    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        buffer = buffer.replace(/\r\n/g, '\n');
        let at;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, at);
            buffer = buffer.slice(at + 2);
            const type = block.split('\n').find(x => x.startsWith('event:'))?.slice(6).trim() || 'message';
            const raw = block.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trimStart()).join('\n');
            if (raw)
                handler(type, JSON.parse(raw));
        }
        if (done)
            break;
    }
}
finally {
    reader.releaseLock();
} }
function streamHandler(type, data) { if (type === 'meta') {
    ui.streamingTurn = data.turnId;
    if (ui.pending) {
        ui.pending.turnId = data.turnId;
        savePending(ui.pending);
    }
    render();
}
else if (type === 'state') {
    if (!ui.data || data.state.version >= ui.data.state.version)
        ui.data = data;
    render();
}
else if (type === 'narration') {
    ui.streamingTurn = data.turnId;
    ui.streamText = '';
}
else if (type === 'delta') {
    if (data.turnId !== ui.streamingTurn)
        return;
    ui.streamText += data.text;
    const node = $('#narrative-' + data.turnId);
    if (node) {
        node.textContent = ui.streamText;
        const f = $('#chat-feed');
        if (f && f.scrollHeight - f.scrollTop - f.clientHeight < 180)
            f.scrollTop = f.scrollHeight;
    }
    else
        render();
}
else if (type === 'error') {
    ui.notice = data.resolved ? '行动已经结算；叙事暂未完成，可在剧情卡片中重试。' : data.message;
    toast(data.message);
}
else if (type === 'done') {
    if (!data.pending)
        savePending(null);
} }
async function perform(payload, existing = null) { if (ui.busy)
    return; if (!existing && !canAct()) {
    toast('请等待当前角色回合结束。');
    return;
} const campaignId = ui.cid, request = existing?.request || { requestId: uuid(), baseVersion: ui.data.state.version, ...payload }; ui.busy = true; ui.streamText = ''; ui.streamingTurn = null; ui.notice = ''; savePending(existing || { campaignId, request }); ui.tab = 'story'; render(); let connectionFailed = false; try {
    const res = await fetch(`/api/campaigns/${campaignId}/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    if (!res.ok) {
        const d = await res.json();
        savePending(null);
        throw new Error(d.error?.message || '请求被拒绝。');
    }
    await consumeStream(res, streamHandler);
    if (ui.pending?.turnId) {
        const t = await api(`/api/campaigns/${campaignId}/turns/${ui.pending.turnId}`);
        if (t.resolutionStatus !== 'pending') {
            savePending(null);
            if (t.resolutionStatus === 'resolved')
                ui.draft = '';
        }
    }
    else if (!ui.pending)
        ui.draft = '';
}
catch (err) {
    connectionFailed = !!ui.pending;
    ui.notice = connectionFailed ? '连接中断。先查询原请求，已经提交的动作不会重做。' : err.message;
    toast(err.message);
}
finally {
    ui.busy = false;
    ui.streamingTurn = null;
    if (ui.cid === campaignId) {
        try {
            ui.data = await api('/api/campaigns/' + campaignId);
        }
        catch { }
        render();
    }
} }
async function refresh() { if (!ui.cid || ui.pollBusy || document.hidden)
    return; const id = ui.cid; ui.pollBusy = true; try {
    const d = await api('/api/campaigns/' + id);
    if (ui.cid !== id)
        return;
    const last = d.turns.at(-1);
    const sig = [d.state.version, d.autoRunning, last?.id, last?.resolutionStatus, last?.narrationStatus, last?.narrative?.length].join(':');
    if (sig !== ui.lastSignature) {
        ui.lastSignature = sig;
        ui.data = d;
        render();
    }
}
catch { }
finally {
    ui.pollBusy = false;
} }
async function recover() { if (!ui.pending)
    return; const p = ui.pending; if (p.turnId) {
    try {
        const t = await api(`/api/campaigns/${p.campaignId}/turns/${p.turnId}`);
        if (t.resolutionStatus === 'pending') {
            toast('服务仍在处理同一个请求，请勿重新发送。');
            await api(`/api/campaigns/${p.campaignId}/resume`, { method: 'POST', body: {} });
            return;
        }
        savePending(null);
        ui.notice = t.resolutionStatus === 'resolved' ? '已找回原回合。骰子与状态没有重复结算。' : '原动作未提交。输入保留，你可以明确重新尝试。';
        await refresh();
        render();
    }
    catch (err) {
        toast(err.message);
    }
}
else {
    ui.pending = null;
    await perform({}, p);
} }
async function retryNarrative(id) { if (ui.busy)
    return; ui.busy = true; ui.notice = ''; ui.streamText = ''; ui.streamingTurn = id; ui.tab = 'story'; render(); try {
    const res = await fetch(`/api/campaigns/${ui.cid}/turns/${id}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await consumeStream(res, streamHandler);
}
catch (err) {
    toast(err.message);
}
finally {
    ui.busy = false;
    ui.streamingTurn = null;
    ui.data = await api('/api/campaigns/' + ui.cid);
    render();
} }
function modal(title, content, wide = false) { ui.modal = true; $('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${e(title)}"><header class="modal-header"><h2>${e(title)}</h2><button class="close-modal" data-action="close-modal" aria-label="关闭弹窗">${icon('x')}</button></header><div class="modal-body">${content}</div></section></div>`; setTimeout(() => $('#modal-root input')?.focus(), 50); }
function closeModal() { ui.modal = false; $('#modal-root').innerHTML = ''; }
function showBook() { const b = ui.boot.book; modal('世界书 · 余辉之地', `<div class="eyebrow">${e(b.title)}</div><p class="book-intro">${e(b.premise)}<br><br><span class="tag gold">玩家已知背景</span> 主持人的秘密与结局条件不会在这里提前揭露。</p><div class="book-grid">${b.entries.map(x => `<article class="book-entry"><h3>${e(x.title)}</h3><p>${e(x.text)}</p></article>`).join('')}</div>`, true); }
function showRules() { const rules = [['规则边界', '原创通用 d20，不是完整 D&D。状态以事实卡、角色面板和存档为准，叙事不直接改变游戏。'], ['探索与移动', '一格五尺。每次最多移动六格；探索中同伴按可通行路径跟随。战斗时六格是整回合预算，可分段移动。斜行算一格，但不能穿墙角。'], ['行动经济', '每个战斗回合一个动作、一个附赠动作，移动独立计数。点击结束回合后，队友与敌人自动行动。'], ['攻击', 'd20 + 攻击加值 ≥ AC 命中。天然 20 必中且伤害骰翻倍，修正值不翻倍；天然 1 必失。未命中仍消耗动作。短剑一格，短弓十二格；墙和关闭的门阻挡视线。'], ['药水与回气', '药水是附赠动作，恢复 2d4+2 HP。回气是战士附赠动作，恢复 1d10+3，每次长休恢复一次。满血时不会浪费药水。'], ['洛恩的能力', '疗愈术：一个动作，六格内可见同伴恢复 1d8+4，每次长休四次。灯辉术：一个动作，八格远程攻击，伤害 1d8+3。'], ['倒地与胜负', 'HP 为零时倒地，跳过行动；治疗后可以再行动，不做死亡豁免。敌人被击败后退出战斗。全队倒地则远征结束。战斗胜利后，如仍有倒地同伴，队伍花十分钟急救，使其恢复到 1 HP，避免探索阶段无法行动。'], ['门与交互', '靠近到相邻格，再点击互动。开未上锁的门、拾取、对话消耗附赠动作。撬锁 DC12，强推 DC10，消耗一个动作；失败也花费动作和时间，可以重试或绕行。'], ['休整与奖励', '入口营地非战斗时可长休，恢复生命与职业能力，不补药水。宝箱、敌人经验和任务奖励只结算一次。'], ['模型与存档', '模型只提交行动意图，不能提供伤害、HP 或奖励。队友 AI 不可用时使用明确标记的规则策略，不会卡住整个回合。断流后先查询原请求；重试叙事不会重掷骰。'], ['自由骰', '输入 /r d20 或在骰史页掷骰。自由骰仅记录，不会自动结算伤害或任务。'], ['本作地图', '使用房间级揭示，非精细动态光照。战斗攻击另行检查距离和视线。交互物不占据角色格子；活着的角色不能重叠。']]; modal('桌面规则 · v1', `<p class="book-intro">规则不需要庞大，但每一步必须说得清楚。</p><table class="rule-table"><tbody>${rules.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table>`, true); }
async function showSettings() { const c = await api('/api/settings'); modal('接入你的 AI', `<div class="settings-note">填入 DGX 的 <b>OpenAI 兼容地址</b>与 <b>/v1/models 中的确切模型 ID</b>。请求由服务端发送；浏览器不会拿到已保存密钥。此版本只开放本机网页，不需要配置浏览器跨域。</div><form id="settings-form"><div class="form-grid"><label class="field"><span>运行模式</span><select name="mode"><option value="mock" ${c.mode === 'mock' ? 'selected' : ''}>规则演示 · 不请求模型</option><option value="openai" ${c.mode === 'openai' ? 'selected' : ''}>OpenAI 兼容接口 · 本地或云端</option></select></label><label class="field"><span>JSON 约束</span><select name="jsonMode"><option value="off" ${c.jsonMode === 'off' ? 'selected' : ''}>仅提示词约束（兼容优先）</option><option value="json_object" ${c.jsonMode === 'json_object' ? 'selected' : ''}>response_format: json_object</option></select></label><label class="field span2"><span>API Base URL</span><input name="baseUrl" value="${e(c.baseUrl)}" placeholder="http://你的DGX地址:8000/v1" required><small>包含 /v1，不要填写 /chat/completions。TensorFold 使用它自己实际开放的端口。</small></label><label class="field span2"><span>模型 ID</span><input name="model" value="${e(c.model)}" list="model-list" placeholder="与 /v1/models 返回值完全一致"><datalist id="model-list"></datalist></label><label class="field span2"><span>API Key（本地服务可留空）</span><input name="apiKey" type="password" autocomplete="new-password" placeholder="${c.hasApiKey ? '已保存，留空保持原值' : '可留空；若服务要求，填写你的密钥'}"><small>通过网页保存的配置位于 data/settings.json，请勿公开该文件。</small></label><label class="field"><span>请求超时（毫秒）</span><input name="timeoutMs" type="number" min="3000" max="180000" value="${c.timeoutMs}"></label><label class="field"><span>每次最大输出 tokens</span><input name="maxTokens" type="number" min="128" max="4096" value="${c.maxTokens}"></label><label class="field span2"><span>上下文字符预算（不是精确 token 数）</span><input name="contextChars" type="number" min="8000" max="120000" value="${c.contextChars}"></label><label class="field span2"><span>额外请求参数 JSON（仅在你的后端需要时设置）</span><textarea name="extraBody" rows="3" spellcheck="false">${e(JSON.stringify(c.extraBody, null, 2))}</textarea><small>例如后端明确支持时使用 {"chat_template_kwargs":{"enable_thinking":false}}。不同服务并不保证兼容。</small></label></div><div class="modal-footer"><button type="button" class="btn ghost" data-action="clear-key">清除已存密钥</button><button class="btn" type="button" data-action="save-ping">保存并测试连接</button><button class="btn primary" type="submit">保存配置</button></div><div id="ping-result" class="ping-result"></div></form>`); }
async function saveSettings(ping = false) { const form = $('#settings-form'); if (!form.reportValidity())
    return; const b = Object.fromEntries(new FormData(form)); for (const k of ['timeoutMs', 'maxTokens', 'contextChars'])
    b[k] = Number(b[k]); try {
    const p = await api('/api/settings', { method: 'POST', body: b });
    ui.boot.provider = p;
    if (ui.data)
        ui.data.provider = p;
    render();
    if (!ping) {
        closeModal();
        toast('配置已保存。下一次模型调用使用新配置。');
        return;
    }
    const result = $('#ping-result');
    result.style.display = 'block';
    result.textContent = '正在请求模型列表…';
    const data = await api('/api/ai/ping', { method: 'POST', body: {} });
    result.textContent = data.message + (data.latencyMs !== undefined ? `\n请求耗时：${data.latencyMs} ms` : '') + '\n模型：' + data.models.join('\n');
    $('#model-list').innerHTML = data.models.map(m => `<option value="${e(m)}"></option>`).join('');
    if (!form.elements.model.value && data.models.length === 1 && p.mode === 'openai') {
        form.elements.model.value = data.models[0];
        const chosen = await api('/api/settings', { method: 'POST', body: { model: data.models[0] } });
        ui.boot.provider = chosen;
        if (ui.data)
            ui.data.provider = chosen;
        result.textContent += '\n已自动保存唯一模型 ID。';
        render();
    }
}
catch (err) {
    const r = $('#ping-result');
    if (r) {
        r.style.display = 'block';
        r.textContent = err.message;
    }
    toast(err.message);
} }
function showEdit() { const s = ui.data.state; if (s.combat) {
    toast('人工修正只允许在非战斗阶段使用。');
    return;
} modal('人工修正 · 记录审计', `<p class="book-intro">此工具用于纠正测试或主持误操作，不是 AI 的能力。保存时检查状态版本，不会覆盖新回合。</p><form id="hp-form" data-version="${s.version}"><label class="field"><span>角色</span><select name="actorId">${s.actors.filter(a => a.faction === 'party').map(a => `<option value="${e(a.id)}">${e(a.name)}（当前 ${a.hp}/${a.maxHp}）</option>`).join('')}</select></label><label class="field"><span>新的 HP</span><input type="number" name="hp" min="0" max="36" value="${s.actors.find(a => a.id === 'pc').hp}" required></label><div class="modal-footer"><button class="btn primary" type="submit">保存修正</button></div></form>`); }
async function importSave() { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.onchange = async () => { const file = input.files?.[0]; if (!file)
    return; if (file.size > 10 * 1024 * 1024) {
    toast('存档超过 10 MB 上限。');
    return;
} try {
    const data = JSON.parse(await file.text());
    const result = await api('/api/campaigns/import', { method: 'POST', body: data });
    await openCampaign(result.state.id);
    toast('已导入为新的独立战役，原存档未覆盖。');
}
catch (err) {
    toast(err.message);
} }; input.click(); }
async function freeRoll(expr) { try {
    const d = await api(`/api/campaigns/${ui.cid}/roll`, { method: 'POST', body: { expr } });
    toast(`${d.expr} → ${d.total}（自由骰不自动改变状态）`);
    ui.tab = 'dice';
    ui.draft = '';
    ui.data = await api('/api/campaigns/' + ui.cid);
    render();
}
catch (err) {
    toast(err.message);
} }
document.addEventListener('submit', async (ev) => { const form = ev.target; if (!(form instanceof HTMLFormElement))
    return; ev.preventDefault(); try {
    if (form.id === 'create-form') {
        const b = Object.fromEntries(new FormData(form));
        const result = await api('/api/campaigns', { method: 'POST', body: b });
        await openCampaign(result.state.id);
    }
    else if (form.id === 'chat-form') {
        const input = ui.draft.trim();
        if (!input)
            return;
        if (input.startsWith('/r '))
            await freeRoll(input.slice(3).trim());
        else
            await perform({ input });
    }
    else if (form.id === 'dice-form')
        await freeRoll(new FormData(form).get('expr'));
    else if (form.id === 'settings-form')
        await saveSettings(false);
    else if (form.id === 'hp-form') {
        const b = Object.fromEntries(new FormData(form));
        await api(`/api/campaigns/${ui.cid}/character`, { method: 'PATCH', body: { actorId: b.actorId, hp: Number(b.hp), baseVersion: Number(form.dataset.version) } });
        closeModal();
        ui.data = await api('/api/campaigns/' + ui.cid);
        render();
        toast('角色卡已修正，并写入审计记录。');
    }
}
catch (err) {
    toast(err.message);
} });
document.addEventListener('input', ev => { if (ev.target.id === 'chat-input')
    ui.draft = ev.target.value; });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ui.modal)
    closeModal(); if (ev.target.id === 'chat-input' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    $('#chat-form')?.requestSubmit();
} });
document.addEventListener('click', async (ev) => {
    const action = ev.target.closest('[data-action]');
    try {
        if (action) {
            const a = action.dataset.action;
            if (action.disabled)
                return;
            if (a === 'ask-companion') {
                const actor = ui.data.state.actors.find(x => x.id === action.dataset.target);
                await perform({ input: `与${actor.name}交谈，问她或他对当前行动有什么建议。` });
            }
            else if (a === 'map-zoom') {
                ui.fullMap = !ui.fullMap;
                render();
            }
            else if (a === 'home')
                await goHome();
            else if (a === 'open')
                await openCampaign(action.dataset.id);
            else if (a === 'book')
                showBook();
            else if (a === 'rules')
                showRules();
            else if (a === 'settings')
                await showSettings();
            else if (a === 'close-modal')
                closeModal();
            else if (a === 'tab') {
                ui.tab = action.dataset.tab;
                render();
                const f = $('#chat-feed');
                if (f)
                    f.scrollTop = ui.tab === 'story' ? f.scrollHeight : 0;
            }
            else if (a === 'dismiss-notice') {
                ui.notice = '';
                render();
            }
            else if (a === 'recover')
                await recover();
            else if (a === 'import')
                await importSave();
            else if (a === 'export')
                window.location.assign(`/api/campaigns/${ui.cid}/export`);
            else if (a === 'retry-narrative')
                await retryNarrative(action.dataset.id);
            else if (a === 'edit-hp')
                showEdit();
            else if (a === 'save-ping')
                await saveSettings(true);
            else if (a === 'clear-key') {
                await api('/api/settings', { method: 'POST', body: { clearApiKey: true } });
                toast('已清除服务端保存的密钥。');
            }
            else if (a === 'move-help')
                toast('浅色格子是当前可到达的位置。点击格子移动；门必须先在相邻处打开。');
            else if (a === 'attack-help')
                toast('点击地图中的红色敌人棋子攻击。短剑需要相邻，且不能隔墙。');
            else if (a === 'end-turn')
                await perform({ command: { type: 'end_turn', actorId: 'pc' } });
            else if (a === 'potion')
                await perform({ command: { type: 'use_item', actorId: 'pc', itemId: 'potion', targetId: 'pc' } });
            else if (a === 'ability') {
                const id = action.dataset.id, def = ABILITY_UI[id];
                if (!def) return;
                let targetId;
                if (def.target === 'ally') {
                    const s = ui.data.state, pc = s.actors.find((x) => x.id === 'pc');
                    const t = s.actors.filter((x) => x.faction === 'party' && x.hp > 0 && x.hp < x.maxHp && (x.id === 'pc' || dist(pc, x) <= (def.range || 1))).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
                    if (!t) return toast('没有需要治疗的同伴。');
                    targetId = t.id;
                } else if (def.target === 'enemy') {
                    const s = ui.data.state, pc = s.actors.find((x) => x.id === 'pc');
                    const t = s.actors.filter((x) => x.faction === 'hostile' && x.hp > 0 && dist(pc, x) <= (def.range || pc.range)).sort((x, y) => dist(pc, x) - dist(pc, y))[0];
                    if (!t) return toast('射程内没有可攻击的敌人。');
                    targetId = t.id;
                }
                await perform({ command: { type: 'use_ability', actorId: 'pc', abilityId: id, ...(targetId ? { targetId } : {}) } });
            }
            else if (a === 'observe')
                await perform({ command: { type: 'interact', actorId: 'pc', targetId: 'scene' } });
            else if (a === 'interact') {
                const o = ui.data.state.objects.find(o => o.id === action.dataset.target);
                await perform({ command: { type: o?.kind === 'npc' ? 'talk' : 'interact', actorId: 'pc', targetId: action.dataset.target, interactionId: action.dataset.interaction } });
            }
            return;
        }
        const actor = ev.target.closest('[data-actor]');
        if (actor && ui.data) {
            const a = ui.data.state.actors.find(a => a.id === actor.dataset.actor);
            if (a.faction === 'hostile') {
                if (!canAct())
                    return toast('等待你的回合后再选择目标。');
                await perform({ command: { type: 'attack', actorId: 'pc', targetId: a.id } });
            }
            else
                toast(`${a.name} · ${a.role} · HP ${a.hp}/${a.maxHp} · 护甲 ${a.ac}`);
            return;
        }
        const object = ev.target.closest('[data-object]');
        if (object && ui.data) {
            const o = ui.data.state.objects.find(o => o.id === object.dataset.object), pc = ui.data.state.actors.find(a => a.id === 'pc');
            if (dist(pc, o) > 1)
                return toast(`${o.name}：请移动到相邻格再交互。`);
            if (o.kind === 'altar') {
                toast('在地图下方选择「校准」或「取钥匙」。');
                return;
            }
            if (!canAct())
                return;
            await perform({ command: { type: o.kind === 'npc' ? 'talk' : 'interact', actorId: 'pc', targetId: o.id } });
            return;
        }
        const tile = ev.target.closest('[data-x][data-y]');
        if (tile && ui.data) {
            if (!canAct())
                return;
            const x = Number(tile.dataset.x), y = Number(tile.dataset.y), path = getReach(ui.data.state).get(`${x},${y}`);
            if (!path?.length)
                return toast('这个格子目前不可到达。请选高亮范围内的空格。');
            await perform({ command: { type: 'move', actorId: 'pc', path } });
        }
    }
    catch (err) {
        toast(err.message);
    }
});
window.addEventListener('popstate', () => bootstrap().catch(err => toast(err.message)));
setInterval(refresh, 1200);
bootstrap().catch(err => { $('#app').innerHTML = `<div class="loading-screen"><h1>尚未连上本地服务</h1><p>${e(err.message)}</p><p>请使用启动脚本运行项目，再打开 http://127.0.0.1:3000。</p></div>`; });
