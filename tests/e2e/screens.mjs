// Screenshots of the screens run.mjs does not cover, at phone (390px) and desktop (1280px) width:
// square dialog, settings dialog, a 3x3 card with long squares, "Your bingos" on home, missing group, privacy.
// Also checks: no console errors, no horizontal scroll, every button/link/input has an accessible name,
// and Escape closes dialogs. Deletes its group at the end.
// Usage: BASE=http://127.0.0.1:18942 node tests/e2e/screens.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:18942';
const SHOTS = process.env.SHOTS || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });
const root = path.join(os.homedir(), '.cache/ms-playwright');
const dir = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME || path.join(root, dir, 'chrome-linux64/chrome') });
const errors = [];
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 } };

async function open(opts, label) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}
async function audit(page, where) {
  const r = await page.evaluate(() => {
    const unnamed = [...document.querySelectorAll('button, a[href], input, textarea, select')]
      .filter((e) => e.offsetParent || e.closest('dialog[open]'))
      .filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim() || e.labels?.length || e.title || e.placeholder))
      .map((e) => e.outerHTML.slice(0, 80));
    return { unnamed, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.deepEqual(r.unnamed, [], `unnamed controls on ${where}`);
  assert.ok(r.overflow <= 0, `horizontal scroll on ${where}: ${r.overflow}px`);
}
const shot = async (page, name, full = true) => {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });
};

let gid, step = 'create';
const a = await open(PHONE, 'phone');
try {
  await a.page.goto(BASE + '/?t=trip');
  await a.page.fill('#you', 'Maximilian');
  await a.page.click('text=3 × 3');
  await a.page.click('#create button[type=submit]');
  await a.page.waitForURL(/\/g\/[A-Za-z0-9]+$/);
  gid = a.page.url().split('/g/')[1];
  await a.page.waitForSelector('#mycard');
  await audit(a.page, 'group phone');

  step = 'square dialog';
  await a.page.locator('#mycard .cell:not(.friend):not(.free)').nth(0).click();
  await a.page.waitForSelector('#sqDlg[open]');
  await a.page.fill('#sqText', 'Swim in a waterfall somewhere outrageously beautiful');
  await shot(a.page, 'x-square-dialog-phone', false);
  await a.page.click('#sqSave');
  await a.page.waitForFunction(() => !document.querySelector('#sqDlg').open);
  await a.page.locator('#mycard .cell:not(.friend):not(.free)').nth(1).click();
  await a.page.fill('#sqText', 'Unbelievably');
  await a.page.keyboard.press('Enter');
  await a.page.waitForFunction(() => !document.querySelector('#sqDlg').open);
  await a.page.locator('#mycard .cell:not(.friend):not(.free)').nth(2).click();
  await a.page.waitForSelector('#sqDlg[open]');
  await a.page.keyboard.press('Escape');
  await a.page.waitForFunction(() => !document.querySelector('#sqDlg').open);
  await shot(a.page, 'x-group-3x3-phone');

  step = 'settings';
  await a.page.click('#settingsBtn');
  await a.page.waitForSelector('#setDlg[open]');
  await audit(a.page, 'settings');
  await shot(a.page, 'x-settings-phone', false);
  await a.page.keyboard.press('Escape');

  step = 'home with your bingos';
  await a.page.goto(BASE + '/');
  await a.page.waitForSelector('#mine:not(.hidden)');
  await audit(a.page, 'home phone');
  await a.page.locator('#mine').scrollIntoViewIfNeeded();
  await shot(a.page, 'x-home-mine-phone', false);

  step = 'desktop group + missing + privacy';
  const d = await open(DESKTOP, 'desktop');
  await d.page.goto(`${BASE}/g/${gid}`);
  await d.page.waitForSelector('#joinForm');
  await audit(d.page, 'join desktop');
  await d.page.goto(`${BASE}/g/doesnotexist1`);
  await d.page.waitForSelector('text=This bingo does not exist');
  await shot(d.page, 'x-missing-desktop', false);
  await d.page.goto(`${BASE}/privacy`);
  await audit(d.page, 'privacy desktop');
  await shot(d.page, 'x-privacy-desktop', false);
  await a.page.goto(`${BASE}/privacy`);
  await audit(a.page, 'privacy phone');
  await d.ctx.close();

  assert.deepEqual(errors, [], 'console errors');
  console.log(`PASS (${BASE}) screens in ${SHOTS}/x-*.png`);
} catch (e) {
  console.error(`FAIL at step "${step}":`, e.message);
  process.exitCode = 1;
} finally {
  if (gid) {
    await a.page.goto(`${BASE}/g/${gid}`);
    const st = await a.page.evaluate(async (gid) => {
      const t = JSON.parse(localStorage.getItem('gb:' + gid) || '{}').token || '';
      return (await fetch(`/api/groups/${gid}`, { method: 'DELETE', headers: { 'x-token': t } })).status;
    }, gid);
    if (st !== 200) { console.error('cleanup failed', st); process.exitCode = 1; }
  }
  await browser.close();
}
