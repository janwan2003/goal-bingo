// Draws a card as a 1080x1350 PNG (portrait, fits Instagram and WhatsApp stories),
// with friends' squares highlighted and named.
const W = 1080;
const H = 1350;
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCard(canvas, card, group) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#5b3df5');
  g.addColorStop(1, '#8a3df5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 64px ${FONT}`;
  const title = `${card.name}’s bingo`;
  ctx.fillText(wrap(ctx, title, W - 120, 1)[0], W / 2, 120);
  ctx.globalAlpha = 0.85;
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(wrap(ctx, group.name, W - 160, 1)[0], W / 2, 172);
  ctx.globalAlpha = 1;

  const n = group.size;
  const pad = 70;
  const top = 220;
  const size = W - pad * 2;
  const gap = n === 5 ? 12 : 16;
  ctx.fillStyle = '#1d1838';
  rr(ctx, pad - 14, top - 14, size + 28, size + 28, 34);
  ctx.fill();
  const cs = (size - gap * (n - 1)) / n;
  const fs = n === 5 ? 25 : n === 4 ? 31 : 40;
  for (const c of card.cells) {
    const x = pad + (c.pos % n) * (cs + gap);
    const y = top + Math.floor(c.pos / n) * (cs + gap);
    let bg = '#ffffff';
    let fg = '#1d1838';
    if (c.kind === 'friend') bg = c.hidden ? '#ffc53d' : '#fff3d1';
    if (c.kind === 'free') { bg = '#5b3df5'; fg = '#fff'; }
    if (!c.filled && c.kind !== 'free') bg = '#f4f0e8';
    ctx.fillStyle = bg;
    rr(ctx, x, y, cs, cs, 18);
    ctx.fill();
    if (c.state === 2 && c.kind !== 'free') {
      ctx.save();
      ctx.translate(x + cs / 2, y + cs / 2);
      ctx.rotate(-0.14);
      ctx.fillStyle = 'rgba(255,92,122,.22)';
      ctx.strokeStyle = 'rgba(255,92,122,.75)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, cs * 0.41, cs * 0.41, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let text = c.text || '';
    if (c.kind === 'free') text = '★ FREE';
    if (c.hidden) text = '🎁';
    const byH = c.by ? fs * 0.95 : 0;
    ctx.font = `700 ${fs}px ${FONT}`;
    const lines = text ? wrap(ctx, text, cs - 18, c.by ? 3 : 4) : [];
    const lh = fs * 1.18;
    const y0 = y + (cs - byH) / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x + cs / 2, y0 + i * lh));
    if (c.by) {
      ctx.fillStyle = '#8a5a00';
      ctx.font = `700 ${Math.round(fs * 0.72)}px ${FONT}`;
      ctx.fillText(wrap(ctx, `from ${c.by}`, cs - 14, 1)[0], x + cs / 2, y + cs - byH * 0.62);
    }
  }
  const by = top + size + 14;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `700 34px ${FONT}`;
  const friends = card.cells.filter((c) => c.by).length;
  const line = group.revealed
    ? `${card.done} done · ${card.lines} ${card.lines === 1 ? 'line' : 'lines'}${friends ? ` · ${friends} squares by friends` : ''}`
    : `${friends || card.friendFilled} squares by friends, secret until the reveal`;
  ctx.fillText(line, W / 2, by + 72);
  ctx.globalAlpha = 0.8;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText('Make yours with friends · Goal Bingo', W / 2, H - 46);
  ctx.globalAlpha = 1;
}

export function cardImage(card, group) {
  const canvas = document.createElement('canvas');
  drawCard(canvas, card, group);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}
