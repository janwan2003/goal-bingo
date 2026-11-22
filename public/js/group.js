import { IDEAS, WILD_IDEAS, pickIdeas, ownCount, MAX_SQUARE } from './bingo.js';
import { api, loadGroupAuth, saveGroup, forgetGroup, toast, el, fitCard } from './common.js';
import { cardImage } from './cardimg.js';

const id = location.pathname.split('/')[2] || '';
const $ = (s) => document.querySelector(s);
const app = $('#app');
let V = null; // last view from the API
let auth = loadGroupAuth(id);

// A personal link (#k=<token>) signs this device in, then is removed from the address bar.
const hk = new URLSearchParams(location.hash.slice(1)).get('k');
if (hk && /^[A-Za-z0-9_-]{20,64}$/.test(hk)) {
  auth = { ...(auth || {}), token: hk };
  saveGroup(id, auth);
  history.replaceState(null, '', location.pathname + location.search);
}
const isNew = new URLSearchParams(location.search).get('new') === '1';
if (isNew) history.replaceState(null, '', location.pathname);
const token = () => (auth && auth.token) || null;

const fmtDate = (t) => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function listNames(names) {
  if (names.length <= 1) return names.join('');
  if (names.length <= 3) return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}
function untilText(sec) {
  if (sec <= 0) return 'now';
  const d = Math.floor(sec / 86400);
  if (d >= 2) return `in ${d} days`;
  const h = Math.floor(sec / 3600);
  if (h >= 2) return `in ${h} hours`;
  const m = Math.max(1, Math.ceil(sec / 60));
  return `in ${plural(m, 'minute', 'minutes')}`;
}
let clockSkew = 0; // server time minus local time
const serverNow = () => Math.floor(Date.now() / 1000) + clockSkew;

async function call(method, path, body) {
  const v = await api(method, `/api/groups/${id}${path}`, body, token());
  if (v && v.cards) setView(v);
  return v;
}

function setView(v) {
  V = v;
  clockSkew = v.now - Math.floor(Date.now() / 1000);
  render();
}

async function load() {
  try {
    setView(await api('GET', `/api/groups/${id}`, null, token()));
  } catch (e) {
    if (e.status === 404) {
      forgetGroup(id);
      app.replaceChildren(
        el('div', { class: 'panel', style: 'text-align:center' },
          el('h2', { text: 'This bingo does not exist' }),
          el('p', { class: 'muted', text: 'It may have been deleted, or the link is incomplete.' }),
          el('a', { class: 'btn', href: '/', text: 'Start a new bingo' }))
      );
    } else {
      app.replaceChildren(el('p', { class: 'error', text: e.message }), el('button', { class: 'btn ghost', onclick: load, text: 'Try again' }));
    }
  }
}

/* ---------- Rendering ---------- */

function cardEl(card, { mini = false, onCell = null, flip = false } = {}) {
  const n = V.size;
  const grid = el('div', { class: `card n${n}${onCell ? '' : ' readonly'}`, style: `--n:${n}` });
  for (const c of card.cells) {
    const cls = ['cell'];
    if (c.kind === 'friend') cls.push('friend');
    if (c.kind === 'free') cls.push('free');
    if (c.kind !== 'free' && !c.filled) cls.push('empty');
    if (c.hidden) cls.push('secret');
    if (c.state === 2) cls.push('done');
    if (c.state === 1) cls.push('waiting');
    if (flip && c.kind === 'friend' && c.filled) cls.push('flip');
    let label = c.text || '';
    if (c.kind === 'free') label = 'FREE';
    let aria = label;
    if (c.hidden) aria = 'Secret friend square';
    else if (c.kind === 'friend' && !c.filled) aria = 'Friend square, not written yet';
    else if (!c.filled && c.kind !== 'free') aria = 'Empty square';
    if (c.by) aria += `, from ${c.by}`;
    if (c.state === 2) aria += ', done';
    if (c.state === 1) aria += ', waiting for confirmation';
    const cell = el(mini ? 'div' : 'button', { class: cls.join(' '), type: mini ? undefined : 'button', 'aria-label': aria, 'data-pos': c.pos });
    if (flip) cell.style.animationDelay = `${(c.pos % 7) * 0.12}s`;
    cell.append(el('span', { class: 't', text: label }));
    if (c.by && !mini) cell.append(el('span', { class: 'by', text: `from ${c.by}` }));
    if (onCell && c.kind !== 'free') cell.addEventListener('click', () => onCell(c));
    grid.append(cell);
  }
  if (!mini) fitCard(grid);
  return grid;
}

function revealPill() {
  if (V.revealed) return el('span', { class: 'pill live', text: '● Cards revealed' });
  if (!V.revealAt) return el('span', { class: 'pill', text: '🎁 Reveal: when the organiser presses it' });
  return el('span', { class: 'pill', id: 'countdown', text: `🎁 Reveal ${untilText(V.revealAt - serverNow())} · ${fmtDate(V.revealAt)}` });
}

function inviteEl(big) {
  const url = `${location.origin}/g/${id}`;
  const text = `Let’s do a bingo card together! Make yours and write a secret square on mine: ${url}`;
  const box = el('section', { class: big ? 'panel tint invite' : 'panel invite', id: 'invite' });
  box.append(
    el('h2', { text: big ? 'Now invite your friends' : 'Invite more friends' }),
    el('p', { class: 'muted', style: 'margin:0', text: big ? 'Your card needs them: each friend writes one secret square on it. Send the link to your group chat.' : 'Anyone with the link can join with just a name.' }),
    el('div', { class: 'link' },
      el('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Invite link', id: 'inviteLink', onfocus: (e) => e.target.select() }),
      el('button', { class: 'btn small ghost', type: 'button', id: 'copyLink', text: 'Copy', onclick: () => copy(url, 'Link copied') })),
    el('div', { class: 'btns' },
      navigator.share ? el('button', { class: 'btn', type: 'button', text: 'Share link', onclick: () => navigator.share({ title: V.name, text, url }).catch(() => {}) }) : null,
      el('a', { class: 'btn wa', href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener', text: 'WhatsApp' }))
  );
  return box;
}

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    const i = $('#inviteLink');
    if (i) { i.focus(); i.select(); }
    toast('Copy the link from the box');
  }
}

function joinView() {
  const names = V.cards.map((c) => c.name);
  const form = el('form', { class: 'panel', id: 'joinForm', novalidate: true },
    el('h2', { text: 'Join this bingo' }),
    el('p', { class: 'muted', style: 'margin-top:0', text: 'Type your name. Then write a secret square on each friend’s card and make your own.' }),
    el('div', { class: 'field' }, el('label', { for: 'joinName', text: 'Your name' }),
      el('input', { id: 'joinName', type: 'text', maxlength: '24', autocomplete: 'given-name', placeholder: 'What your friends call you' })),
    el('button', { class: 'btn block', type: 'submit', text: 'Join' }),
    el('p', { class: 'error', id: 'joinErr', role: 'alert' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#joinName').value.trim();
    if (!name) { $('#joinErr').textContent = 'Please enter your name.'; return; }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('POST', `/api/groups/${id}/join`, { name }, null);
      auth = { token: r.token, memberId: r.memberId, name: V.name };
      saveGroup(id, auth);
      await load();
      const f = $('#friends');
      if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) {
      $('#joinErr').textContent = ex.message;
      btn.disabled = false;
    }
  });
  app.replaceChildren(
    el('div', { class: 'ghead' }, revealPill(), el('h1', { text: V.name }),
      el('p', { class: 'lead', text: names.length ? `${listNames(names)} ${names.length === 1 ? 'is' : 'are'} making goal bingo cards. Join to make yours, and write a secret square on theirs.` : 'Make your goal bingo card and write a secret square on your friends’ cards.' })),
    form,
    boardEl()
  );
}

function myCard() { return V.cards.find((c) => c.isMe); }

function friendsEl() {
  const me = myCard();
  const others = V.cards.filter((c) => !c.isMe);
  const box = el('section', { class: 'panel friends', id: 'friends' });
  box.append(el('h2', { text: 'Write on your friends’ cards' }));
  if (!others.length) {
    box.append(el('p', { class: 'muted', style: 'margin:0', text: 'Nobody else is here yet. Once friends join, you write one secret square on each of their cards.' }));
    return box;
  }
  box.append(el('p', { class: 'muted', style: 'margin-top:0', text: V.revealed ? 'Squares you write now show up straight away.' : `A dare, a wish, something they keep putting off. They see it at the reveal.` }));
  const list = el('div');
  const ideas = pickIdeas(4, [], String(me && me.id), WILD_IDEAS);
  for (const c of others) {
    const mine = c.cells.find((x) => x.mine);
    const row = el('div', { class: 'row', 'data-friend': c.id });
    row.append(el('div', { class: 'name', text: c.name }));
    if (mine) {
      const locked = V.revealed && mine.state > 0;
      const wrote = el('div', { class: 'wrote' }, el('span', {}, el('span', { class: 'muted small', text: 'You wrote: ' }), el('b', { text: mine.text })));
      if (!locked) wrote.append(el('button', { class: 'btn small ghost', type: 'button', text: 'Edit', onclick: () => editWild(row, c, mine.text) }));
      row.append(wrote);
    } else if (c.friendFilled >= c.friendSlots) {
      row.append(el('p', { class: 'muted small', style: 'margin:0', text: `${c.name}’s card already has all ${c.friendSlots} friend squares.` }));
    } else {
      editWild(row, c, '', ideas);
    }
    list.append(row);
  }
  box.append(list);
  return box;
}

function editWild(row, c, current, ideas) {
  row.querySelectorAll('.wrote, form, .chips').forEach((x) => x.remove());
  const input = el('input', { type: 'text', maxlength: String(MAX_SQUARE), value: current, placeholder: `For ${c.name}: e.g. Visit me`, 'aria-label': `Square for ${c.name}` });
  const form = el('form', { class: 'inline', novalidate: true }, input, el('button', { class: 'btn small', type: 'submit', text: current ? 'Save' : 'Add' }));
  const left = c.friendSlots - c.friendFilled;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text && !current) { input.focus(); return; }
    try {
      await call('PUT', '/wild', { to: c.id, text });
      toast(text ? `Added to ${c.name}’s card` : 'Removed');
    } catch (ex) { toast(ex.message); }
  });
  row.append(form);
  if (!current) {
    if (ideas) row.append(el('div', { class: 'chips' }, ...ideas.map((t) => el('button', { class: 'chip', type: 'button', text: t, onclick: () => { input.value = t; input.focus(); } }))));
    row.append(el('p', { class: 'muted small', style: 'margin:0', text: `${plural(left, 'friend square', 'friend squares')} left on ${c.name}’s card` }));
  } else {
    row.append(el('div', { class: 'chips' }, el('button', { class: 'chip', type: 'button', text: 'Remove my square', onclick: async () => {
      try { await call('PUT', '/wild', { to: c.id, text: '' }); toast('Removed'); } catch (ex) { toast(ex.message); }
    } })));
    input.focus();
  }
}

function confirmsEl() {
  const rows = [];
  for (const c of V.cards) {
    if (c.isMe) continue;
    for (const x of c.cells) if (x.mine && x.state === 1) rows.push([c, x]);
  }
  if (!rows.length) return null;
  const box = el('section', { class: 'panel tint', id: 'confirms' }, el('h2', { text: 'Did they really do it?' }));
  for (const [c, x] of rows) {
    box.append(el('div', { class: 'confirm-row' },
      el('span', {}, `${c.name} ticked your square `, el('b', { text: `“${x.text}”` })),
      el('span', { class: 'btns' },
        el('button', { class: 'btn small', type: 'button', text: 'Yes, confirm', onclick: () => doConfirm(c, x, true) }),
        el('button', { class: 'btn small ghost', type: 'button', text: 'Not yet', onclick: () => doConfirm(c, x, false) }))));
  }
  return box;
}
async function doConfirm(c, x, ok) {
  try { await call('POST', '/confirm', { owner: c.id, pos: x.pos, ok }); toast(ok ? `Confirmed for ${c.name}` : 'Sent back'); } catch (ex) { toast(ex.message); }
}

function myCardEl(flip) {
  const me = myCard();
  const box = el('section', { class: 'panel', id: 'mycard' });
  const own = ownCount(V.size);
  const head = el('div', { class: 'sectionhead' }, el('h2', { text: 'Your card' }));
  box.append(head);
  if (!V.revealed) {
    const left = own - me.ownFilled;
    box.append(el('p', { class: 'muted', style: 'margin:-4px 0 12px', text: left > 0 ? `Tap a square to write a goal. ${plural(left, 'square', 'squares')} to go; the 🎁 squares are for your friends.` : `All your squares are written. The 🎁 squares are your friends’: ${me.friendFilled} of ${me.friendSlots} written so far.` }));
  } else {
    box.append(el('p', { class: 'muted', style: 'margin:-4px 0 12px', text: me.lines ? `BINGO ×${me.lines}! Keep going.` : 'Tap a square when you have done it. Your friends confirm the squares they wrote.' }));
  }
  box.append(cardEl(me, { onCell: openSquare, flip }));
  const done = me.done;
  const total = V.size * V.size - (V.size === 5 ? 1 : 0);
  if (V.revealed) {
    box.append(el('div', { class: 'progress', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.round((done / total) * 100)}%` })));
    box.append(el('p', { class: 'muted small', style: 'margin:6px 0 0', text: `${done} of ${total} done · ${plural(me.lines, 'line', 'lines')}` }));
  }
  const btns = el('div', { class: 'btns', style: 'margin-top:14px' });
  if (me.ownFilled < own) btns.append(el('button', { class: 'btn soft', type: 'button', id: 'fillIdeas', text: '✨ Fill the rest with ideas', onclick: fillIdeas }));
  btns.append(el('button', { class: 'btn ghost', type: 'button', id: 'saveImg', text: 'Save as image', onclick: () => shareImage(me) }));
  box.append(btns);
  return box;
}

async function fillIdeas() {
  const me = myCard();
  const empties = me.cells.filter((c) => c.kind === 'own' && !c.filled);
  const ideas = pickIdeas(empties.length, me.cells.filter((c) => c.text).map((c) => c.text), String(Date.now()));
  try {
    await call('PUT', '/card', { squares: empties.map((c, i) => ({ pos: c.pos, text: ideas[i] })).filter((s) => s.text) });
    toast('Filled. Tap any square to change it.');
  } catch (ex) { toast(ex.message); }
}

function boardEl() {
  const box = el('section', { class: 'panel', id: 'board' });
  box.append(el('div', { class: 'sectionhead' }, el('h2', { text: V.revealed ? 'The race' : 'Everyone’s cards' }),
    el('span', { class: 'muted small', text: plural(V.cards.length, 'player', 'players') })));
  const firstAt = Math.min(...V.cards.map((c) => c.bingoAt || Infinity));
  const sorted = V.revealed ? [...V.cards].sort((a, b) => b.lines - a.lines || b.done - a.done || (a.bingoAt || 9e12) - (b.bingoAt || 9e12)) : V.cards;
  const grid = el('div', { class: 'board' });
  for (const c of sorted) {
    const filled = c.ownFilled + c.friendFilled;
    const total = V.size * V.size - (V.size === 5 ? 1 : 0);
    const stat = V.revealed ? `${c.done} done · ${plural(c.lines, 'line', 'lines')}` : `${filled} of ${total} squares written`;
    const badge = c.bingoAt ? el('span', { class: c.bingoAt === firstAt ? 'badge first' : 'badge', text: c.bingoAt === firstAt ? '👑 FIRST' : 'BINGO' }) : null;
    const b = el('button', { class: c.isMe ? 'mini me' : 'mini', type: 'button', 'data-card': c.id, 'aria-label': `${c.isMe ? 'Your card' : `${c.name}’s card`}: ${stat}`, onclick: () => openCard(c) },
      el('div', { class: 'who' }, el('span', { text: c.name }), badge),
      cardEl(c, { mini: true }),
      el('p', { class: 'stat', text: c.isMe ? `You · ${stat}` : stat }));
    grid.append(b);
  }
  box.append(grid);
  return box;
}

function openCard(c) {
  $('#cardTitle').textContent = c.isMe ? 'Your card' : `${c.name}’s card`;
  $('#cardSub').textContent = V.revealed
    ? `${c.done} done · ${plural(c.lines, 'line', 'lines')}`
    : `Friend squares (🎁) stay secret until the reveal. ${c.friendFilled} of ${c.friendSlots} written.`;
  $('#cardBody').replaceChildren(cardEl(c, {}), el('div', { class: 'btns', style: 'margin-top:14px' },
    el('button', { class: 'btn ghost small', type: 'button', text: 'Save as image', onclick: () => shareImage(c) })));
  $('#cardDlg').showModal();
}
$('#cardClose').addEventListener('click', () => $('#cardDlg').close());

function render() {
  if (!V) return;
  document.title = `${V.name} · Goal Bingo`;
  if (!V.me) {
    $('#settingsBtn').classList.add('hidden');
    return joinView();
  }
  saveGroup(id, { name: V.name });
  $('#settingsBtn').classList.remove('hidden');
  const me = myCard();
  const seenKey = `gb:seen:${id}`;
  let flip = false;
  let banner = null;
  if (V.revealed && !localStorage.getItem(seenKey)) {
    flip = true;
    localStorage.setItem(seenKey, '1');
    banner = el('div', { class: 'banner', id: 'revealBanner' }, el('h2', { text: '🎉 The cards are revealed!' }),
      el('p', { text: me.friendFilled ? `Your friends wrote ${plural(me.friendFilled, 'square', 'squares')} on your card. Go and look.` : 'See what everyone’s friends wrote.' }));
  } else if (V.revealed && me.lines) {
    const firstAt = Math.min(...V.cards.map((c) => c.bingoAt || Infinity));
    banner = el('div', { class: 'banner', id: 'bingoBanner' }, el('h2', { text: me.bingoAt === firstAt ? '👑 BINGO! You were first.' : '🎉 BINGO!' }),
      el('p', { text: `You have ${plural(me.lines, 'line', 'lines')}. Save your card and show it off.` }));
  }
  const othersCount = V.cards.length - 1;
  const bigInvite = isNew || othersCount < 2;
  const others = V.cards.filter((c) => !c.isMe);
  const pendingWild = others.some((c) => !c.cells.some((x) => x.mine) && c.friendFilled < c.friendSlots);
  const parts = [
    el('div', { class: 'ghead' }, revealPill(), el('h1', { text: V.name })),
    banner,
    confirmsEl(),
    bigInvite ? inviteEl(true) : null,
  ];
  if (!V.revealed && pendingWild) parts.push(friendsEl(), myCardEl(flip));
  else parts.push(myCardEl(flip), others.length && !V.revealed ? friendsEl() : null);
  parts.push(boardEl());
  if (V.revealed && others.length) parts.push(friendsEl());
  if (!bigInvite) parts.push(inviteEl(false));
  parts.push(el('section', { class: 'panel cta', id: 'another' },
    el('h2', { text: 'Start a bingo with another group' }),
    el('p', { class: 'muted', style: 'margin-top:0', text: 'Family, work team, the group from your course: one card per circle.' }),
    el('div', { class: 'chips' },
      el('a', { class: 'chip', href: `/?t=year&name=${encodeURIComponent(me.name)}#start`, text: '🎆 New Year' }),
      el('a', { class: 'chip', href: `/?t=summer&name=${encodeURIComponent(me.name)}#start`, text: '☀️ Summer' }),
      el('a', { class: 'chip', href: `/?t=trip&name=${encodeURIComponent(me.name)}#start`, text: '🧳 Trip' }),
      el('a', { class: 'chip', href: `/?t=term&name=${encodeURIComponent(me.name)}#start`, text: '🎓 Uni term' }))));
  app.replaceChildren(...parts.filter(Boolean));
}

/* ---------- Square dialog ---------- */

let sqCell = null;
function openSquare(c, forceEdit = false) {
  sqCell = c;
  const dlg = $('#sqDlg');
  const edit = $('#sqEdit');
  const show = $('#sqShow');
  const btns = $('#sqBtns');
  $('#sqErr').textContent = '';
  btns.replaceChildren();
  const fromFriend = c.kind === 'friend' && c.filled;
  if (!V.revealed && c.kind === 'friend') {
    toast(c.filled ? 'A friend has written this one. It stays secret until the reveal 🎁' : 'A friend writes this square. You will see it at the reveal 🎁');
    return;
  }
  const editing = forceEdit || !c.filled || (!V.revealed && !fromFriend);
  if (editing) {
    $('#sqTitle').textContent = c.filled ? 'Edit your square' : 'Write a goal';
    $('#sqHint').textContent = 'Something you want to do this year. Short is best.';
    edit.classList.remove('hidden');
    show.classList.add('hidden');
    $('#sqText').value = c.text || '';
    const me = myCard();
    const ideas = pickIdeas(6, me.cells.filter((x) => x.text).map((x) => x.text), `${c.pos}-${Date.now() >> 14}`, IDEAS);
    $('#sqIdeas').replaceChildren(...ideas.map((t) => el('button', { class: 'chip', type: 'button', text: t, onclick: () => { $('#sqText').value = t; $('#sqText').focus(); } })));
    btns.append(el('button', { class: 'btn', type: 'button', id: 'sqSave', text: 'Save', onclick: () => saveSquare($('#sqText').value) }));
    if (c.filled) btns.append(el('button', { class: 'btn ghost', type: 'button', text: 'Clear', onclick: () => saveSquare('') }));
  } else {
    edit.classList.add('hidden');
    show.classList.remove('hidden');
    show.textContent = c.text;
    $('#sqTitle').textContent = fromFriend ? `From ${c.by}` : 'Your square';
    $('#sqHint').textContent = c.state === 2 ? 'Done! 🎉' : c.state === 1 ? `Waiting for ${c.by} to confirm.` : fromFriend ? `${c.by} will be asked to confirm when you tick it.` : '';
    if (c.state === 0) btns.append(el('button', { class: 'btn', type: 'button', id: 'sqDone', text: '✓ I did it', onclick: () => doTick(true) }));
    else btns.append(el('button', { class: 'btn ghost', type: 'button', id: 'sqUndo', text: c.state === 1 ? 'Cancel' : 'Not done after all', onclick: () => doTick(false) }));
    if (!fromFriend) btns.append(el('button', { class: 'btn ghost', type: 'button', text: 'Edit', onclick: () => openSquare(c, true) }));
    else if (c.state === 0) btns.append(el('button', { class: 'btn danger', type: 'button', text: 'Remove', onclick: () => { if (confirm(`Remove ${c.by}’s square? You can write your own in its place.`)) saveSquare(''); } }));
  }
  if (!dlg.open) dlg.showModal();
  if (editing) setTimeout(() => $('#sqText').focus(), 30);
}
$('#sqText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveSquare($('#sqText').value); }
});
async function saveSquare(text) {
  try {
    await call('PUT', '/card', { squares: [{ pos: sqCell.pos, text: text.trim() }] });
    $('#sqDlg').close();
  } catch (ex) { $('#sqErr').textContent = ex.message; }
}
async function doTick(done) {
  try {
    const before = myCard().lines;
    await call('POST', '/tick', { pos: sqCell.pos, done });
    $('#sqDlg').close();
    const me = myCard();
    const cell = me.cells.find((x) => x.pos === sqCell.pos);
    if (done && cell.state === 1) toast(`Sent to ${cell.by} to confirm`);
    else if (done && me.lines > before) toast('BINGO! 🎉');
    else if (done) toast('Nice one!');
  } catch (ex) { $('#sqErr').textContent = ex.message; }
}

/* ---------- Image ---------- */

async function shareImage(card) {
  try {
    const blob = await cardImage(card, V);
    const file = new File([blob], 'goal-bingo.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${card.name}’s bingo card` }).catch(() => {});
      return;
    }
    const a = el('a', { href: URL.createObjectURL(blob), download: `${V.name} - ${card.name}.png`.replace(/[\\/:*?"<>|]/g, '') });
    document.body.append(a);
    a.click();
    a.remove();
    toast('Image saved');
  } catch (ex) {
    console.warn(ex);
    toast('Could not make the image on this device');
  }
}

/* ---------- Settings ---------- */

$('#settingsBtn').addEventListener('click', () => {
  $('#adminSet').classList.toggle('hidden', !V.isAdmin);
  $('#deleteBtn').classList.toggle('hidden', !V.isAdmin);
  $('#leaveBtn').classList.toggle('hidden', V.isAdmin);
  $('#setRevealBox').classList.toggle('hidden', V.revealed);
  $('#setName').value = V.name;
  $('#setMe').value = myCard().name;
  $('#setErr').textContent = '';
  if (V.revealAt) {
    const d = new Date(V.revealAt * 1000);
    $('#setReveal').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } else $('#setReveal').value = '';
  $('#setDlg').showModal();
});
$('#setClose').addEventListener('click', () => $('#setDlg').close());
const setErr = (ex) => ($('#setErr').textContent = ex.message);
$('#setNameBtn').addEventListener('click', () => call('PATCH', '', { name: $('#setName').value }).then(() => toast('Saved'), setErr));
$('#setMeBtn').addEventListener('click', () => call('PATCH', '/me', { name: $('#setMe').value }).then(() => toast('Saved'), setErr));
$('#setRevealBtn').addEventListener('click', () => {
  const v = $('#setReveal').value;
  let revealAt = 'manual';
  if (v) { const [y, m, d] = v.split('-').map(Number); revealAt = Math.floor(new Date(y, m - 1, d).getTime() / 1000); }
  call('PATCH', '', { revealAt }).then(() => toast('Saved'), setErr);
});
$('#revealNow').addEventListener('click', () => {
  if (!confirm('Reveal every card now? Friend squares become visible to everyone.')) return;
  call('PATCH', '', { revealNow: true }).then(() => $('#setDlg').close(), setErr);
});
$('#copyKey').addEventListener('click', () => copy(`${location.origin}/g/${id}#k=${token()}`, 'Personal link copied'));
$('#deleteBtn').addEventListener('click', async () => {
  if (!confirm('Delete this bingo for everyone? This cannot be undone.')) return;
  try { await api('DELETE', `/api/groups/${id}`, null, token()); forgetGroup(id); location.href = '/'; } catch (ex) { setErr(ex); }
});
$('#leaveBtn').addEventListener('click', async () => {
  if (!confirm('Leave this bingo? Your card and the squares you wrote are removed.')) return;
  try { await api('DELETE', `/api/groups/${id}/members/${V.me}`, null, token()); forgetGroup(id); location.href = '/'; } catch (ex) { setErr(ex); }
});

/* ---------- Live updates ---------- */

setInterval(() => {
  if (!V) return;
  const cd = $('#countdown');
  if (cd && V.revealAt) {
    const left = V.revealAt - serverNow();
    if (left <= 0) return load();
    cd.textContent = `🎁 Reveal ${untilText(left)} · ${fmtDate(V.revealAt)}`;
  }
}, 15000);
setInterval(() => {
  if (document.hidden || !V) return;
  if (document.querySelector('dialog[open]')) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.value) return;
  load();
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && V && !document.querySelector('dialog[open]')) load(); });

load();
