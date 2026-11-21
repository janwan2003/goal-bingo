// Shared helpers for the Functions.
export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
export const err = (status, message) => json({ error: message }, status);
export const now = () => Math.floor(Date.now() / 1000);
export const ID_RE = /^[A-Za-z0-9]{10,16}$/;

export function randomId(len = 12) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function loadGroup(env, id) {
  if (!ID_RE.test(id)) return null;
  return env.DB.prepare('SELECT * FROM groups WHERE id = ?1').bind(id).first();
}

export async function loadMembers(env, id) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, token_hash, bingo_at, created_at FROM members WHERE group_id = ?1 ORDER BY created_at, id'
  ).bind(id).all();
  return results || [];
}

export async function loadSquares(env, id) {
  const { results } = await env.DB.prepare(
    'SELECT owner_id, pos, author_id, text, state, done_at, created_at FROM squares WHERE group_id = ?1'
  ).bind(id).all();
  return results || [];
}
