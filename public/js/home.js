import { TEMPLATES } from './bingo.js';
import { api, saveGroup, listGroups, toast, fitCard } from './common.js';

document.querySelectorAll('.card').forEach(fitCard);

const $ = (s) => document.querySelector(s);
const nextYear = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear() + (new Date().getMonth() === 0 && new Date().getDate() < 15 ? 0 : 1);
const nyMidnight = () => Math.floor(new Date(nextYear, 0, 1, 0, 0, 0).getTime() / 1000);
$('#gName').placeholder = `Uni friends ${nextYear}`;
$('#nyLabel').innerHTML = `1 Jan ${nextYear}<small>midnight</small>`;
document.title = document.title.replace(/20\d\d/, nextYear);

const params = new URLSearchParams(location.search);
function applyTemplate(key) {
  const t = TEMPLATES[key];
  if (!t) return;
  const label = key === 'year' ? `Our ${nextYear} bingo` : `Our ${t.label.toLowerCase()} bingo`;
  $('#gName').value = label;
  document.querySelector(`input[name=size][value="${t.size}"]`).checked = true;
  if (key !== 'year') document.querySelector('input[name=reveal][value=manual]').checked = true;
  syncReveal();
}
document.querySelectorAll('[data-tpl]').forEach((b) =>
  b.addEventListener('click', () => {
    applyTemplate(b.dataset.tpl);
    $('#start').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#you').focus({ preventScroll: true });
  })
);
if (params.get('t')) applyTemplate(params.get('t'));
if (params.get('name')) $('#you').value = params.get('name').slice(0, 24);

function syncReveal() {
  const v = document.querySelector('input[name=reveal]:checked').value;
  $('#revealDate').classList.toggle('hidden', v !== 'date');
}
document.querySelectorAll('input[name=reveal]').forEach((r) => r.addEventListener('change', syncReveal));
const d = new Date();
d.setDate(d.getDate() + 7);
$('#revealDate').value = d.toISOString().slice(0, 10);
$('#revealDate').min = new Date().toISOString().slice(0, 10);

$('#create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#createErr');
  errEl.textContent = '';
  const you = $('#you').value.trim();
  if (!you) {
    errEl.textContent = 'Please enter your name.';
    $('#you').focus();
    return;
  }
  const mode = document.querySelector('input[name=reveal]:checked').value;
  let revealAt = 'manual';
  if (mode === 'ny') revealAt = nyMidnight();
  if (mode === 'date') {
    const v = $('#revealDate').value;
    if (!v) { errEl.textContent = 'Pick a reveal date.'; return; }
    const [y, m, dd] = v.split('-').map(Number);
    revealAt = Math.floor(new Date(y, m - 1, dd, 0, 0, 0).getTime() / 1000);
  }
  const name = $('#gName').value.trim() || `Our ${nextYear} bingo`;
  const btn = e.submitter || $('#create button[type=submit]');
  btn.disabled = true;
  try {
    const r = await api('POST', '/api/groups', { name, you, size: Number(document.querySelector('input[name=size]:checked').value), revealAt });
    saveGroup(r.id, { token: r.token, memberId: r.memberId, name });
    location.href = `/g/${r.id}?new=1`;
  } catch (ex) {
    errEl.textContent = ex.message;
    btn.disabled = false;
  }
});

const mine = listGroups();
if (mine.length) {
  $('#mine').classList.remove('hidden');
  $('#mylist').innerHTML = '';
  for (const g of mine) {
    const a = document.createElement('a');
    a.href = `/g/${g.id}`;
    a.textContent = g.name || 'Bingo';
    const s = document.createElement('span');
    s.textContent = '→';
    s.className = 'muted';
    a.append(s);
    $('#mylist').append(a);
  }
}
window.toast = toast;
