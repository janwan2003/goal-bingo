// /g/<id> → the group page, with a link preview that shows the group's live state
// (the text is computed in the Durable Object, see lib/preview.js).
import { esc, ID_RE } from '../../lib/db.js';

export async function onRequestGet({ request, env, params }) {
  const parts = params.path || [];
  const id = String(parts[0] || '');
  if (parts.length !== 1) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new URL('/group', url.origin));
  let html = await asset.text();
  let p = { status: 200, title: 'Join our bingo · Goal Bingo', desc: 'Make your goal bingo card and write a secret square on your friends’ cards. No app, no sign-up.' };
  try {
    if (!ID_RE.test(id)) p = { status: 404, title: 'Bingo not found · Goal Bingo', desc: p.desc };
    else {
      const stub = env.BINGO.get(env.BINGO.idFromName('main'));
      const r = await stub.fetch(new Request(`https://db/__preview/${id}`));
      if (r.ok) p = await r.json();
    }
  } catch (e) {
    console.error(e);
  }
  const meta = `<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Goal Bingo">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${esc(url.origin + '/g/' + id)}">
<meta property="og:image" content="${url.origin}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">`;
  html = html.replace(/<!--META-->[\s\S]*?<!--\/META-->/, meta);
  return new Response(html, { status: p.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
export const onRequestHead = onRequestGet;
