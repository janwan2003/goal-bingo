// Browser helpers: API calls, per-group tokens in localStorage, toasts.
export async function api(method, url, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-token'] = token;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error(data.error || `Something went wrong (${res.status}).`);
    e.status = res.status;
    throw e;
  }
  return data;
}

const KEY = (id) => `gb:${id}`;
export function loadGroupAuth(id) {
  try { return JSON.parse(localStorage.getItem(KEY(id)) || 'null'); } catch { return null; }
}
export function saveGroup(id, data) {
  try {
    const cur = loadGroupAuth(id) || {};
    localStorage.setItem(KEY(id), JSON.stringify({ ...cur, ...data }));
    const list = listGroups().filter((g) => g.id !== id);
    list.unshift({ id, name: data.name || cur.name || '' });
    localStorage.setItem('gb:list', JSON.stringify(list.slice(0, 30)));
  } catch {}
}
export function forgetGroup(id) {
  try {
    localStorage.removeItem(KEY(id));
    localStorage.setItem('gb:list', JSON.stringify(listGroups().filter((g) => g.id !== id)));
  } catch {}
}
export function listGroups() {
  try { return JSON.parse(localStorage.getItem('gb:list') || '[]'); } catch { return []; }
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid);
  return e;
}

// Shrinks each square's text until whole words fit inside it (squares are fixed-size, text length varies).
// A ResizeObserver refits a card whenever it changes size, including when it first appears inside a dialog.
function fitCell(cell) {
  const t = cell.querySelector('.t');
  if (!t || !t.textContent) return;
  cell.style.fontSize = '';
  cell.classList.remove('squeeze');
  const cs = getComputedStyle(cell);
  const base = parseFloat(cs.fontSize);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const by = cell.querySelector('.by');
  const fits = () => {
    const h = cell.clientHeight - padY - (by ? by.offsetHeight + 1 : 0);
    return t.scrollHeight <= h + 0.5 && t.scrollWidth <= cell.clientWidth - padX + 0.5;
  };
  if (fits()) return;
  let lo = 7, hi = base;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    cell.style.fontSize = mid + 'px';
    if (fits()) lo = mid; else hi = mid;
  }
  cell.style.fontSize = lo + 'px';
  if (!fits()) cell.classList.add('squeeze');
}
const fitObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => { for (const e of entries) e.target.querySelectorAll('.cell').forEach(fitCell); })
  : null;
export function fitCard(card) {
  if (fitObserver) fitObserver.observe(card);
  else requestAnimationFrame(() => card.querySelectorAll('.cell').forEach(fitCell));
}
