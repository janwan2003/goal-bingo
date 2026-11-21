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
