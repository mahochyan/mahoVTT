export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PATHS = {
  grid: 'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z',
  flag: 'M5 22V3 M5 3c5-3 9 4 15 0v10c-6 4-10-3-15 0',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M3 12h18 M12 3c3 3.5 3 14 0 18 M12 3c-3 3.5-3 14 0 18',
  library: 'M4 4h5v16H4Z M11 4h5v16h-5Z M18 4l3 1-1 15-3-1Z',
  gear: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  plus: 'M12 4v16 M4 12h16',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  play: 'M7 4l13 8-13 8Z',
  archive: 'M3 4h18v4H3Z M5 8h14v13H5Z M9 12h6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
  edit: 'M4 20h4L20 8l-4-4L4 16Z M14 6l4 4',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 19h16',
  upload: 'M12 21V9 M7 14l5-5 5 5 M4 3h16',
  book: 'M12 5C7 2 3 4 3 4v15s4-2 9 1c5-3 9-1 9-1V4s-4-2-9 1Z M12 5v15',
  die: 'M12 2 22 8v9l-10 6L2 17V8Z M2 8l10 6 10-6 M12 14v9',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M12 7v5l3 2',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12 M6 18 18 6',
  chevron: 'M9 6l6 6-6 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z M8 12l3 3 5-6',
  bow: 'M5 3c15 1 15 17 0 18L16 12 5 3Z M3 12h18',
  sun: 'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  sword: 'M5 20 18 7l2-5-5 2L2 17 M3 13l8 8 M2 22l4-4',
  potion: 'M9 2h6 M10 2v6L5 18q-1 4 4 4h6q5 0 4-4L14 8V2 M7 16h10',
  key: 'M14 9a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M12 13l8 8 M16 17l3-3 M19 20l3-3',
  skull: 'M12 2a8 8 0 0 0-8 8v5l3 2v5h10v-5l3-2v-5a8 8 0 0 0-8-8Z M9 11h.01 M15 11h.01 M10 18h4',
  map: 'M2 5l6-3 8 3 6-3v17l-6 3-8-3-6 3Z M8 2v17 M16 5v17',
  spark: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z',
  alert: 'M12 3 2 21h20Z M12 9v5 M12 18h.01',
  filter: 'M3 5h18 M6 12h12 M10 19h4',
};
export function icon(name, cls = '') {
  const d = PATHS[name] || PATHS.grid;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    ...(options.body && typeof options.body !== 'string' ? { body: JSON.stringify(options.body) } : {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
export function toast(text) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3800);
}

export function modal(title, body, { wide = false, footer = '' } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
    <section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${e(title)}">
      <header class="modal-head"><h2>${e(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="关闭">${icon('x')}</button></header>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </section>
  </div>`;
  setTimeout(() => $('#modal-root input, #modal-root textarea, #modal-root select')?.focus(), 40);
}

export function closeModal() { const root = $('#modal-root'); if (root) root.innerHTML = ''; }

export function confirmDialog(title, message, { confirmLabel = '确认', danger = false } = {}) {
  return new Promise((resolve) => {
    modal(title, `<p class="muted" style="margin:0">${e(message)}</p>`, {
      footer: `<button class="btn ghost" data-confirm="no">取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-confirm="yes">${e(confirmLabel)}</button>`,
    });
    const root = $('#modal-root');
    root.onclick = (ev) => {
      const btn = ev.target.closest('[data-confirm]');
      if (!btn) return;
      const yes = btn.dataset.confirm === 'yes';
      closeModal();
      resolve(yes);
    };
  });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function relTime(iso) {
  if (!iso) return '尚未游玩';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '尚未游玩';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return fmtDate(iso);
}
