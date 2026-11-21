// pb-goal-bingo-db: one SQLite-backed Durable Object that stores every Goal Bingo group.
// The Pages Functions (functions/) forward /api/* and link-preview lookups here through a Durable Object binding.
// It has no public route of its own (workers_dev = false).
// (The account is at the free plan's 10 D1 databases, so this venture uses a Durable Object instead.)
import { DurableObject } from 'cloudflare:workers';
import { handle } from '../lib/api.js';
import { preview } from '../lib/preview.js';
import { SCHEMA } from '../lib/schema.js';

// D1-style shim over ctx.storage.sql, so lib/api.js reads like ordinary D1 code.
// Numbered parameters (?1, ?2) and plain ? are both supported.
class Stmt {
  constructor(db, q, args = []) {
    this.db = db;
    this.q = q;
    this.args = args;
  }
  bind(...args) {
    return new Stmt(this.db, this.q, args);
  }
  exec() {
    let vals;
    let q = this.q;
    if (/\?\d/.test(q)) {
      vals = [];
      q = q.replace(/\?(\d+)/g, (_, n) => {
        const v = this.args[Number(n) - 1];
        vals.push(v === undefined ? null : v);
        return '?';
      });
    } else vals = this.args.map((v) => (v === undefined ? null : v));
    const cur = this.db.sql.exec(q, ...vals);
    const results = cur.toArray();
    return { results, meta: { changes: cur.rowsWritten } };
  }
  async first() { return this.exec().results[0] ?? null; }
  async all() { return this.exec(); }
  async run() { return this.exec(); }
}
class ShimDB {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
  }
  prepare(q) { return new Stmt(this, q); }
  async batch(stmts) { return this.storage.transactionSync(() => stmts.map((s) => s.exec())); }
}

export class GoalBingoDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      for (const stmt of SCHEMA.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)) ctx.storage.sql.exec(stmt);
    });
    this.env = { DB: new ShimDB(ctx.storage) };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/__preview/')) {
      const out = await preview(this.env, decodeURIComponent(url.pathname.slice('/__preview/'.length)));
      return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
    }
    return handle(request, this.env);
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
};
