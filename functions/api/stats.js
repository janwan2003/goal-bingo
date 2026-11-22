// GET /api/stats: aggregate counts for VENTURE.md ## Metrics (no names, no ids, no text).
// Guarded by the Pages secret STATS_KEY, sent as the x-stats-key header; scripts/stats.sh reads it from .env.
import { sha256 } from '../../lib/db.js';

export async function onRequestGet({ request, env }) {
  const given = request.headers.get('x-stats-key') || '';
  if (!env.STATS_KEY || (await sha256(given)) !== (await sha256(env.STATS_KEY))) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  const stub = env.BINGO.get(env.BINGO.idFromName('main'));
  return stub.fetch(new Request(new URL('/__stats', request.url)));
}
