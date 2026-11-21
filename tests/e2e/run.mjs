// End-to-end test in real Chromium. Separate browser contexts play separate people:
// Anna creates a bingo on her phone and fills her card with ideas; Ben (desktop) and Cleo (phone) join and write
// secret squares on each other's cards; the secrets stay hidden (UI and API) until Anna presses "Reveal";
// then Anna ticks a row, Ben confirms the square he wrote, Anna gets the first bingo; link previews follow the state.
// Also: ticking before the reveal is refused, the word filter, leaving, deleting. Screenshots go to shots/.
// Usage: BASE=http://127.0.0.1:18942 node tests/e2e/run.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:18942';
const SHOTS = process.env.SHOTS || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 }, acceptDownloads: true };
const errors = [];
const browser = await chromium.launch({ executablePath: findChrome() });

async function person(label, opts, expected = []) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !expected.some((re) => re.test(m.text()))) errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return { label, ctx, page };
}
const shot = (p, name, fullPage = true) => p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage });
const preview = async (gid) => {
  const html = await (await fetch(`${BASE}/g/${gid}`)).text();
  return {
    title: html.match(/property="og:title" content="([^"]*)"/)[1],
    desc: html.match(/property="og:description" content="([^"]*)"/)[1].replace(/&#39;/g, "'"),
  };
};
// Calls the API from inside a page with that person's stored token.
const apiAs = (page, gid, method, sub, body) =>
  page.evaluate(async ([gid, method, sub, body]) => {
    const auth = JSON.parse(localStorage.getItem('gb:' + gid) || '{}');
    const r = await fetch(`/api/groups/${gid}${sub}`, { method, headers: { 'content-type': 'application/json', 'x-token': auth.token || '' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, text: await r.text() };
  }, [gid, method, sub, body]);

let step = 'start';
try {
  // Home page
  step = 'home';
  const anna = await person('Anna', PHONE);
  await anna.page.goto(BASE + '/');
  assert.match(await anna.page.title(), /Goal Bingo/);
  await shot(anna.page, 'home-phone');
  const desk = await person('Visitor', DESKTOP);
  await desk.page.goto(BASE + '/');
  await shot(desk.page, 'home-desktop', false);
  await desk.ctx.close();

  // Validation, then create
  step = 'create';
  await anna.page.click('#create button[type=submit]');
  assert.equal(await anna.page.textContent('#createErr'), 'Please enter your name.');
  await anna.page.fill('#gName', 'Uni friends 2027');
  await anna.page.fill('#you', 'Anna');
  await anna.page.click('text=I’ll press it');
  await anna.page.click('#create button[type=submit]');
  await anna.page.waitForURL(/\/g\/[A-Za-z0-9]+$/);
  const gid = anna.page.url().split('/g/')[1];
  await anna.page.waitForSelector('#mycard');
  assert.equal(await anna.page.textContent('h1'), 'Uni friends 2027');
  assert.match(await anna.page.textContent('.pill'), /when the organiser presses it/);
  assert.ok(await anna.page.isVisible('#invite.tint'), 'big invite after create');
  assert.equal(await anna.page.inputValue('#inviteLink'), `${BASE}/g/${gid}`);

  // Anna writes one square herself, then fills the rest with ideas
  step = 'fill card';
  await anna.page.click('#mycard .cell[data-pos="0"]');
  await anna.page.fill('#sqText', 'Run a half marathon');
  await anna.page.click('#sqSave');
  await anna.page.waitForSelector('#mycard .cell[data-pos="0"]:not(.empty)');
  assert.equal(await anna.page.textContent('#mycard .cell[data-pos="0"] .t'), 'Run a half marathon');
  await anna.page.click('#mycard .cell[data-pos="1"]'); // a friend square: only a toast
  await anna.page.waitForSelector('#toast.show');
  assert.match(await anna.page.textContent('#toast'), /friend writes this square/);
  assert.equal(await anna.page.isVisible('#sqDlg'), false);
  await anna.page.click('#fillIdeas');
  await anna.page.waitForFunction(() => !document.querySelector('#fillIdeas'));
  const own = await anna.page.$$eval('#mycard .cell:not(.friend):not(.free)', (els) => els.map((e) => e.textContent.trim()));
  assert.equal(own.length, 19);
  assert.ok(own.every(Boolean), 'all 19 own squares written');
  assert.equal(new Set(own).size, 19, 'no duplicate ideas');
  assert.equal(await anna.page.$$eval('#mycard .cell.friend.empty', (e) => e.length), 5);
  await shot(anna.page, 'card-before-friends-phone');

  // Link preview with one player
  step = 'preview 1';
  let p = await preview(gid);
  assert.equal(p.title, 'Uni friends 2027 · Goal Bingo');
  assert.match(p.desc, /^1 player so far: Anna\. .*when the organiser presses reveal/);

  // Ben joins on desktop and writes Anna's square first
  step = 'ben joins';
  const ben = await person('Ben', DESKTOP);
  await ben.page.goto(`${BASE}/g/${gid}`);
  await ben.page.waitForSelector('#joinForm');
  assert.match(await ben.page.textContent('.lead'), /Anna is making goal bingo cards/);
  await shot(ben.page, 'join-desktop', false);
  await ben.page.fill('#joinName', 'anna');
  await ben.page.click('#joinForm button');
  await ben.page.waitForSelector('#joinErr:not(:empty)');
  assert.match(await ben.page.textContent('#joinErr'), /already in/);
  await ben.page.fill('#joinName', 'Ben');
  await ben.page.click('#joinForm button');
  await ben.page.waitForSelector('#friends');
  const annaRow = ben.page.locator('#friends .row', { hasText: 'Anna' });
  await annaRow.locator('input').fill('Visit me in Lisbon');
  await annaRow.locator('button[type=submit]').click();
  await ben.page.waitForSelector('#friends .wrote');
  assert.match(await annaRow.textContent(), /You wrote: Visit me in Lisbon/);
  await ben.page.click('#mycard .cell[data-pos="0"]');
  await ben.page.locator('#sqIdeas .chip').first().click();
  await ben.page.click('#sqSave');
  await ben.page.waitForSelector('#mycard .cell[data-pos="0"]:not(.empty)');

  // Cleo joins on her phone; the word filter; she writes on Anna's and Ben's cards
  step = 'cleo joins';
  const cleo = await person('Cleo', PHONE);
  await cleo.page.goto(`${BASE}/g/${gid}`);
  await cleo.page.fill('#joinName', 'Cleo');
  await cleo.page.click('#joinForm button');
  await cleo.page.waitForSelector('#friends');
  const annaId = JSON.parse((await apiAs(cleo.page, gid, 'GET', '')).text).cards[0].id;
  const filtered = await apiAs(cleo.page, gid, 'PUT', '/wild', { to: annaId, text: 'kys lol' });
  assert.equal(filtered.status, 400);
  const cAnna = cleo.page.locator('#friends .row', { hasText: 'Anna' });
  await cAnna.locator('input').fill('Sing a full karaoke song');
  await cAnna.locator('button[type=submit]').click();
  await cleo.page.waitForFunction(() => document.querySelectorAll('#friends .wrote').length === 1);
  const cBen = cleo.page.locator('#friends .row', { hasText: 'Ben' });
  await cBen.locator('input').fill('Beat me at chess');
  await cBen.locator('button[type=submit]').click();
  await cleo.page.waitForFunction(() => document.querySelectorAll('#friends .wrote').length === 2);
  await shot(cleo.page, 'friends-written-phone');

  // Secrets are hidden: Anna sees two gift squares, the API gives her no text; Ben cannot see Cleo's square for Anna
  step = 'secrets hidden';
  await anna.page.reload();
  await anna.page.waitForSelector('#mycard');
  assert.equal(await anna.page.$$eval('#mycard .cell.friend.hidden', (e) => e.length), 2);
  const annaApi = (await apiAs(anna.page, gid, 'GET', '')).text;
  assert.ok(!annaApi.includes('Visit me in Lisbon') && !annaApi.includes('Sing a full karaoke song'), 'friend squares hidden from the owner');
  assert.ok(!/token_hash|admin_hash|author_id/.test(annaApi), 'no hashes or author ids in the API');
  const benApi = (await apiAs(ben.page, gid, 'GET', '')).text;
  assert.ok(benApi.includes('Visit me in Lisbon'), 'the writer sees their own square');
  assert.ok(!benApi.includes('Sing a full karaoke song'), 'other friends’ squares hidden');
  const early = await apiAs(anna.page, gid, 'POST', '/tick', { pos: 0, done: true });
  assert.equal(early.status, 409, 'no ticking before the reveal');
  const notAdmin = await apiAs(ben.page, gid, 'PATCH', '', { revealNow: true });
  assert.equal(notAdmin.status, 403, 'only the organiser reveals');

  // Anna writes on both friends' cards
  step = 'anna writes';
  for (const [who, text] of [['Ben', 'Cook a three-course dinner'], ['Cleo', 'Go to a gig with me']]) {
    const row = anna.page.locator('#friends .row', { hasText: who });
    await row.locator('input').fill(text);
    await row.locator('button[type=submit]').click();
    await anna.page.waitForSelector(`#friends .row:has-text("${who}") .wrote`);
  }
  p = await preview(gid);
  assert.match(p.desc, /^3 players so far: Anna, Ben and Cleo\./);
  await shot(anna.page, 'group-before-reveal-phone');

  // Reveal
  step = 'reveal';
  await anna.page.click('#settingsBtn');
  await anna.page.click('#revealNow');
  await anna.page.waitForSelector('#revealBanner');
  assert.match(await anna.page.textContent('#revealBanner'), /Your friends wrote 2 squares/);
  assert.equal(await anna.page.textContent('#mycard .cell[data-pos="1"] .t'), 'Visit me in Lisbon');
  assert.equal(await anna.page.textContent('#mycard .cell[data-pos="1"] .by'), 'from Ben');
  assert.equal(await anna.page.textContent('#mycard .cell[data-pos="8"] .by'), 'from Cleo');
  await anna.page.waitForTimeout(1200);
  await shot(anna.page, 'revealed-phone');

  // Anna ticks the top row: 4 of her own and Ben's square (which needs Ben)
  step = 'tick';
  for (const pos of [0, 2, 3, 4]) {
    await anna.page.click(`#mycard .cell[data-pos="${pos}"]`);
    await anna.page.click('#sqDone');
    await anna.page.waitForSelector(`#mycard .cell[data-pos="${pos}"].done`);
  }
  await anna.page.click('#mycard .cell[data-pos="1"]');
  assert.match(await anna.page.textContent('#sqHint'), /Ben will be asked to confirm/);
  await anna.page.click('#sqDone');
  await anna.page.waitForSelector('#mycard .cell[data-pos="1"].waiting');
  assert.match(await anna.page.textContent('#toast'), /Sent to Ben to confirm/);
  const cleoCannot = await apiAs(cleo.page, gid, 'POST', '/confirm', { owner: JSON.parse(annaApi).me, pos: 1, ok: true });
  assert.equal(cleoCannot.status, 404, 'only the writer confirms');

  // Ben confirms
  step = 'confirm';
  await ben.page.reload();
  await ben.page.waitForSelector('#confirms');
  assert.match(await ben.page.textContent('#confirms'), /Anna ticked your square “Visit me in Lisbon”/);
  await shot(ben.page, 'confirm-desktop');
  await ben.page.click('#confirms button:has-text("Yes, confirm")');
  await ben.page.waitForFunction(() => !document.querySelector('#confirms'));
  assert.match(await ben.page.textContent('#board .mini:has-text("Anna")'), /FIRST/);

  // Anna sees her bingo
  step = 'bingo';
  await anna.page.reload();
  await anna.page.waitForSelector('#bingoBanner');
  assert.match(await anna.page.textContent('#bingoBanner'), /BINGO! You were first/);
  assert.ok(await anna.page.isVisible('#mycard .cell[data-pos="1"].done'));
  await shot(anna.page, 'bingo-phone');
  p = await preview(gid);
  assert.match(p.desc, /^Anna got bingo first!/);

  // The board and a card dialog on desktop; the card image downloads
  step = 'board + image';
  await ben.page.reload();
  await ben.page.waitForSelector('#board');
  await ben.page.click('#board .mini:has-text("Anna")');
  await ben.page.waitForSelector('#cardDlg[open]');
  assert.match(await ben.page.textContent('#cardSub'), /5 done · 1 line/);
  await shot(ben.page, 'card-dialog-desktop', false);
  const [dl] = await Promise.all([ben.page.waitForEvent('download'), ben.page.click('#cardDlg button:has-text("Save as image")')]);
  const img = path.join(SHOTS, 'card-image.png');
  await dl.saveAs(img);
  assert.ok(fs.statSync(img).size > 20000, 'card image has content');
  await ben.page.click('#cardClose');
  await shot(ben.page, 'group-after-reveal-desktop');

  // Untick removes the bingo
  step = 'untick';
  await anna.page.click('#mycard .cell[data-pos="0"]');
  await anna.page.click('#sqUndo');
  await anna.page.waitForSelector('#mycard .cell[data-pos="0"]:not(.done)');
  assert.equal(JSON.parse((await apiAs(anna.page, gid, 'GET', '')).text).cards[0].bingoAt, null);

  // Personal link signs in a second device
  step = 'personal link';
  const benToken = await ben.page.evaluate((gid) => JSON.parse(localStorage.getItem('gb:' + gid)).token, gid);
  const ben2 = await person('Ben phone', PHONE);
  await ben2.page.goto(`${BASE}/g/${gid}#k=${benToken}`);
  await ben2.page.waitForSelector('#mycard');
  assert.ok(!ben2.page.url().includes('#k='), 'token stripped from the address bar');
  assert.match(await ben2.page.textContent('#board'), /Ben \(you\)/);

  // Cleo leaves: her card and her squares go
  step = 'leave';
  await cleo.page.reload();
  await cleo.page.click('#settingsBtn');
  await cleo.page.click('#leaveBtn');
  await cleo.page.waitForURL(BASE + '/');
  const after = JSON.parse((await apiAs(anna.page, gid, 'GET', '')).text);
  assert.equal(after.cards.length, 2);
  assert.ok(!JSON.stringify(after).includes('Sing a full karaoke song'));

  // Anna deletes the bingo
  step = 'delete';
  await anna.page.reload();
  await anna.page.click('#settingsBtn');
  await anna.page.click('#deleteBtn');
  await anna.page.waitForURL(BASE + '/');
  assert.equal((await fetch(`${BASE}/api/groups/${gid}`)).status, 404);
  await ben.page.goto(`${BASE}/g/${gid}`);
  await ben.page.waitForSelector('text=This bingo does not exist');

  // 404 page for a bad link, privacy page
  step = 'misc';
  assert.equal((await fetch(`${BASE}/g/nope`)).status, 404);
  assert.equal((await fetch(`${BASE}/privacy`)).status, 200);

  for (const pp of [anna, ben, cleo, ben2]) await pp.ctx.close().catch(() => {});
  // The test provokes 400/403/404/409 responses on purpose; the browser logs each as a console error.
  const real = errors.filter((e) => !/status of 40[0349]/.test(e));
  assert.deepEqual(real, [], 'console errors');
  console.log(`PASS (${BASE}) group ${gid}; screenshots in ${SHOTS}/`);
} catch (e) {
  console.error(`FAIL at step "${step}":`, e.message);
  if (errors.length) console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
