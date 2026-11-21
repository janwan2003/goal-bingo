// JSON API for Goal Bingo groups. Runs inside the GoalBingoDB Durable Object (worker/index.js);
// env.DB is a D1-style shim over the object's SQLite storage.
// Auth: each browser keeps a random token per group (localStorage); only its SHA-256 is stored.
// The creator's token is also the group's admin token.
import { json, err, now, randomId, sha256, loadGroup, loadMembers, loadSquares } from './db.js';
import { SIZES, cellKind, completedLines, clean, MAX_SQUARE, MAX_NAME } from '../public/js/bingo.js';

const MAX_MEMBERS = 30;
const INACTIVE_DAYS = 500;
const FAR = 4102444800; // 2100-01-01: "reveal when the organiser presses the button"
const LIMITS = { create: [20, 3600], join: [60, 3600], write: [900, 3600] };
// Friend squares are written by other people, so a short blocklist keeps the worst out;
// the card owner can also remove any friend square after the reveal.
const BLOCK = /\b(n[i1]gg|f[a@]gg?[o0]t|retard|kill yourself|kys|c[u\*]nt|wh[o0]re|sl[u\*]t|rape)/i;

async function rateLimited(env, request, action) {
  const [max, windowSec] = LIMITS[action];
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO rate (k, n, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN reset_at < ?3 THEN 1 ELSE n + 1 END,
       reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
     RETURNING n`
  ).bind(action + ':' + (await sha256('pb-gb:' + ip)).slice(0, 24), t + windowSec, t).first();
  return row && row.n > max;
}

async function cleanup(env) {
  const t = now();
  const old = t - INACTIVE_DAYS * 86400;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM squares WHERE group_id IN (SELECT id FROM groups WHERE last_active < ?1)').bind(old),
    env.DB.prepare('DELETE FROM members WHERE group_id IN (SELECT id FROM groups WHERE last_active < ?1)').bind(old),
    env.DB.prepare('DELETE FROM groups WHERE last_active < ?1').bind(old),
    env.DB.prepare('DELETE FROM rate WHERE reset_at < ?1').bind(t),
  ]);
}

async function tokenHash(request) {
  const t = request.headers.get('x-token') || '';
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  return sha256(t);
}

const newToken = () => randomId(32);
const revealed = (g) => g.reveal_at <= now();

function parseReveal(v) {
  if (v === 'manual' || v === null || v === undefined || v === '') return FAR;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const t = Math.floor(n);
  if (t < now() - 86400 * 400 || t > FAR) return null;
  return t;
}

// What a given viewer may see. Friend squares are hidden (text and author) until the reveal,
// except from the friend who wrote them.
function view(group, members, squares, meHash) {
  const me = members.find((m) => m.token_hash === meHash) || null;
  const isRevealed = revealed(group);
  const names = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const n = group.size * group.size;
  const cards = members.map((m) => {
    const mine = squares.filter((s) => s.owner_id === m.id);
    const byPos = Object.fromEntries(mine.map((s) => [s.pos, s]));
    const done = new Set(mine.filter((s) => s.state === 2).map((s) => s.pos));
    const cells = [];
    for (let pos = 0; pos < n; pos++) {
      const kind = cellKind(group.size, pos);
      const s = byPos[pos];
      const c = { pos, kind };
      if (kind === 'free') {
        c.state = 2;
      } else if (s) {
        const fromFriend = s.author_id !== m.id;
        const canSee = !fromFriend || isRevealed || (me && s.author_id === me.id);
        c.filled = true;
        c.state = s.state;
        if (canSee) {
          c.text = s.text;
          if (fromFriend) {
            c.by = names[s.author_id] || 'a friend';
            c.byId = s.author_id;
          }
        } else c.hidden = true;
        if (me && s.author_id === me.id && fromFriend) c.mine = true;
      } else c.state = 0;
      cells.push(c);
    }
    const lineCount = completedLines(group.size, done).length;
    const friendCells = cells.filter((c) => c.kind === 'friend');
    return {
      id: m.id,
      name: m.name,
      isMe: !!me && m.id === me.id,
      cells,
      done: done.size,
      lines: lineCount,
      bingoAt: m.bingo_at || null,
      ownFilled: cells.filter((c) => c.kind === 'own' && c.filled).length,
      friendFilled: friendCells.filter((c) => c.filled).length,
      friendSlots: friendCells.length,
    };
  });
  return {
    id: group.id,
    name: group.name,
    size: group.size,
    revealAt: group.reveal_at >= FAR ? null : group.reveal_at,
    revealed: isRevealed,
    now: now(),
    isAdmin: !!meHash && meHash === group.admin_hash,
    me: me ? me.id : null,
    cards,
  };
}

async function full(env, group, meHash) {
  const [members, squares] = await Promise.all([loadMembers(env, group.id), loadSquares(env, group.id)]);
  return { members, squares, me: members.find((m) => m.token_hash === meHash) || null };
}

async function touch(env, group) {
  if (now() - group.last_active > 86400) {
    await env.DB.prepare('UPDATE groups SET last_active = ?1 WHERE id = ?2').bind(now(), group.id).run();
  }
}

async function refreshBingo(env, group, ownerId) {
  const { results } = await env.DB.prepare('SELECT pos FROM squares WHERE owner_id = ?1 AND state = 2').bind(ownerId).all();
  const lines = completedLines(group.size, new Set((results || []).map((r) => r.pos))).length;
  if (lines > 0) {
    await env.DB.prepare('UPDATE members SET bingo_at = COALESCE(bingo_at, ?1) WHERE id = ?2').bind(now(), ownerId).run();
  } else {
    await env.DB.prepare('UPDATE members SET bingo_at = NULL WHERE id = ?1').bind(ownerId).run();
  }
}

async function body(request) {
  try {
    const b = await request.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
}

async function createGroup(env, request) {
  if (await rateLimited(env, request, 'create')) return err(429, 'Too many new groups from here. Try again in an hour.');
  const b = await body(request);
  const name = clean(b.name, 60) || 'Our bingo';
  const you = clean(b.you, MAX_NAME);
  if (!you) return err(400, 'Please enter your name.');
  const size = Number(b.size);
  if (!SIZES.includes(size)) return err(400, 'Pick a card size.');
  const revealAt = parseReveal(b.revealAt);
  if (revealAt === null) return err(400, 'That reveal date does not look right.');
  const id = randomId(12);
  const memberId = randomId(10);
  const token = newToken();
  const hash = await sha256(token);
  const t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO groups (id, name, size, reveal_at, admin_hash, created_at, last_active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)')
      .bind(id, name, size, revealAt, hash, t),
    env.DB.prepare('INSERT INTO members (id, group_id, name, token_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(memberId, id, you, hash, t),
  ]);
  if (Math.random() < 0.05) await cleanup(env);
  return json({ id, token, memberId }, 201);
}

async function join(env, request, group) {
  if (await rateLimited(env, request, 'join')) return err(429, 'Too many joins from here. Try again later.');
  const b = await body(request);
  const name = clean(b.name, MAX_NAME);
  if (!name) return err(400, 'Please enter your name.');
  const members = await loadMembers(env, group.id);
  if (members.length >= MAX_MEMBERS) return err(409, `This group is full (${MAX_MEMBERS} people).`);
  if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
    return err(409, `Someone called ${name} is already in. Add your surname initial?`);
  }
  const token = newToken();
  const memberId = randomId(10);
  await env.DB.prepare('INSERT INTO members (id, group_id, name, token_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(memberId, group.id, name, await sha256(token), now()).run();
  await touch(env, group);
  return json({ token, memberId }, 201);
}

// Your own card: [{pos, text}] (text '' clears). After the reveal you may also fill an empty
// friend square, or clear a friend square you do not want.
async function editCard(env, request, group, me, squares) {
  const b = await body(request);
  const items = Array.isArray(b.squares) ? b.squares.slice(0, 25) : [];
  if (!items.length) return err(400, 'Nothing to save.');
  const n = group.size * group.size;
  const mine = Object.fromEntries(squares.filter((s) => s.owner_id === me.id).map((s) => [s.pos, s]));
  const stmts = [];
  for (const it of items) {
    const pos = Number(it.pos);
    if (!Number.isInteger(pos) || pos < 0 || pos >= n) return err(400, 'Unknown square.');
    const kind = cellKind(group.size, pos);
    const text = clean(it.text, MAX_SQUARE);
    const cur = mine[pos];
    if (kind === 'free') return err(400, 'The centre is a free square.');
    if (kind === 'friend') {
      if (!revealed(group)) return err(403, 'Friend squares are written by your friends. You can fill empty ones after the reveal.');
      if (cur && cur.author_id !== me.id && text) return err(403, 'A friend wrote this square. You can remove it, not rewrite it.');
    }
    if (!text) {
      if (cur) stmts.push(env.DB.prepare('DELETE FROM squares WHERE owner_id = ?1 AND pos = ?2').bind(me.id, pos));
    } else if (cur) {
      stmts.push(env.DB.prepare('UPDATE squares SET text = ?1 WHERE owner_id = ?2 AND pos = ?3').bind(text, me.id, pos));
    } else {
      stmts.push(
        env.DB.prepare('INSERT INTO squares (group_id, owner_id, pos, author_id, text, created_at) VALUES (?1, ?2, ?3, ?2, ?4, ?5)')
          .bind(group.id, me.id, pos, text, now())
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await refreshBingo(env, group, me.id);
  return null;
}

// Write (or change, or remove with text '') your square on a friend's card. First come, first served.
async function writeWild(env, request, group, me, members, squares) {
  const b = await body(request);
  const to = members.find((m) => m.id === b.to);
  if (!to) return err(404, 'That person is not in this group.');
  if (to.id === me.id) return err(400, 'Friend squares are for your friends’ cards.');
  const text = clean(b.text, MAX_SQUARE);
  if (text && BLOCK.test(text)) return err(400, 'Let’s keep it kind. Try other words.');
  const theirs = squares.filter((s) => s.owner_id === to.id);
  const existing = theirs.find((s) => s.author_id === me.id);
  if (existing) {
    if (revealed(group) && existing.state > 0) return err(409, `${to.name} has already ticked that square.`);
    if (!text) await env.DB.prepare('DELETE FROM squares WHERE owner_id = ?1 AND pos = ?2').bind(to.id, existing.pos).run();
    else await env.DB.prepare('UPDATE squares SET text = ?1 WHERE owner_id = ?2 AND pos = ?3').bind(text, to.id, existing.pos).run();
    return null;
  }
  if (!text) return err(400, 'Write a few words first.');
  const taken = new Set(theirs.map((s) => s.pos));
  const free = [...Array(group.size * group.size).keys()].filter((p) => cellKind(group.size, p) === 'friend' && !taken.has(p));
  if (!free.length) return err(409, `${to.name}’s card is already full of friend squares.`);
  try {
    await env.DB.prepare('INSERT INTO squares (group_id, owner_id, pos, author_id, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(group.id, to.id, free[0], me.id, text, now()).run();
  } catch {
    return err(409, 'Someone just took that square. Try again.');
  }
  return null;
}

// Tick a square on your own card. A friend's square needs that friend to confirm.
async function tick(env, request, group, me, members, squares) {
  if (!revealed(group)) return err(409, 'Ticking starts at the reveal.');
  const b = await body(request);
  const pos = Number(b.pos);
  const s = squares.find((x) => x.owner_id === me.id && x.pos === pos);
  if (!s) return err(404, 'Write something in that square first.');
  const done = !!b.done;
  let state = 0;
  if (done) {
    const authorHere = s.author_id !== me.id && members.some((m) => m.id === s.author_id);
    state = authorHere ? 1 : 2;
  }
  await env.DB.prepare('UPDATE squares SET state = ?1, done_at = ?2 WHERE owner_id = ?3 AND pos = ?4')
    .bind(state, state === 2 ? now() : null, me.id, pos).run();
  await refreshBingo(env, group, me.id);
  return null;
}

// The friend who wrote a square confirms (or rejects) that it was done.
async function confirm(env, request, group, me, squares) {
  const b = await body(request);
  const pos = Number(b.pos);
  const s = squares.find((x) => x.owner_id === b.owner && x.pos === pos);
  if (!s || s.author_id !== me.id) return err(404, 'Only the friend who wrote that square can confirm it.');
  if (s.state !== 1) return err(409, 'Nothing to confirm there.');
  const ok = !!b.ok;
  await env.DB.prepare('UPDATE squares SET state = ?1, done_at = ?2 WHERE owner_id = ?3 AND pos = ?4')
    .bind(ok ? 2 : 0, ok ? now() : null, s.owner_id, pos).run();
  await refreshBingo(env, group, s.owner_id);
  return null;
}

async function updateGroup(env, request, group) {
  const b = await body(request);
  const sets = [];
  const vals = [];
  if (b.name !== undefined) {
    const name = clean(b.name, 60);
    if (!name) return err(400, 'Please enter a name.');
    sets.push('name = ?'); vals.push(name);
  }
  if (b.revealNow) {
    sets.push('reveal_at = ?'); vals.push(now());
  } else if (b.revealAt !== undefined) {
    const r = parseReveal(b.revealAt);
    if (r === null) return err(400, 'That reveal date does not look right.');
    if (revealed(group)) return err(409, 'The cards are already revealed.');
    sets.push('reveal_at = ?'); vals.push(r);
  }
  if (!sets.length) return err(400, 'Nothing to change.');
  await env.DB.prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, group.id).run();
  return null;
}

async function removeMember(env, group, memberId) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM squares WHERE group_id = ?1 AND (owner_id = ?2 OR author_id = ?2)').bind(group.id, memberId),
    env.DB.prepare('DELETE FROM members WHERE group_id = ?1 AND id = ?2').bind(group.id, memberId),
  ]);
}

export async function handle(request, env) {
  const parts = new URL(request.url).pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;
  try {
    if (parts[0] !== 'groups') return err(404, 'Not found');
    if (parts.length === 1) {
      if (method === 'POST') return createGroup(env, request);
      return err(405, 'Method not allowed');
    }
    const group = await loadGroup(env, parts[1]);
    if (!group) return err(404, 'This bingo does not exist (or was deleted).');
    const hash = await tokenHash(request);
    const sub = parts[2] || '';

    if (sub === '' && method === 'GET') {
      const d = await full(env, group, hash);
      if (d.me) await touch(env, group);
      return json(view(group, d.members, d.squares, hash));
    }
    if (sub === 'join' && method === 'POST') return join(env, request, group);

    if (method !== 'GET' && (await rateLimited(env, request, 'write'))) return err(429, 'Slow down a little and try again.');
    const d = await full(env, group, hash);
    const isAdmin = !!hash && hash === group.admin_hash;
    let out = null;
    if (sub === '' && method === 'PATCH') {
      if (!isAdmin) return err(403, 'Only the person who started this bingo can change it.');
      out = await updateGroup(env, request, group);
    } else if (sub === '' && method === 'DELETE') {
      if (!isAdmin) return err(403, 'Only the person who started this bingo can delete it.');
      await env.DB.batch([
        env.DB.prepare('DELETE FROM squares WHERE group_id = ?1').bind(group.id),
        env.DB.prepare('DELETE FROM members WHERE group_id = ?1').bind(group.id),
        env.DB.prepare('DELETE FROM groups WHERE id = ?1').bind(group.id),
      ]);
      return json({ deleted: true });
    } else if (sub === 'members' && method === 'DELETE') {
      const target = d.members.find((m) => m.id === parts[3]);
      if (!target) return err(404, 'Not in this group.');
      if (!(isAdmin || (d.me && d.me.id === target.id))) return err(403, 'You can only remove yourself.');
      if (target.token_hash === group.admin_hash) return err(400, 'The organiser cannot leave. Delete the bingo instead.');
      await removeMember(env, group, target.id);
    } else {
      if (!d.me) return err(403, 'Join this bingo first.');
      if (sub === 'card' && method === 'PUT') out = await editCard(env, request, group, d.me, d.squares);
      else if (sub === 'wild' && method === 'PUT') out = await writeWild(env, request, group, d.me, d.members, d.squares);
      else if (sub === 'tick' && method === 'POST') out = await tick(env, request, group, d.me, d.members, d.squares);
      else if (sub === 'confirm' && method === 'POST') out = await confirm(env, request, group, d.me, d.squares);
      else if (sub === 'me' && method === 'PATCH') {
        const name = clean((await body(request)).name, MAX_NAME);
        if (!name) return err(400, 'Please enter your name.');
        if (d.members.some((m) => m.id !== d.me.id && m.name.toLowerCase() === name.toLowerCase())) return err(409, 'Someone already has that name.');
        await env.DB.prepare('UPDATE members SET name = ?1 WHERE id = ?2').bind(name, d.me.id).run();
      } else return err(404, 'Not found');
    }
    if (out) return out;
    const fresh = await loadGroup(env, group.id);
    const d2 = await full(env, fresh, hash);
    return json(view(fresh, d2.members, d2.squares, hash));
  } catch (e) {
    console.error(e);
    return err(500, 'Something went wrong. Please try again.');
  }
}
