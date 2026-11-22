# Goal Bingo

A goal bingo card you make with friends: everyone makes a card, each friend writes one secret square on yours,
and the cards reveal on 1 January (or a date you pick, or when the organiser presses Reveal). Ticking a square a
friend wrote needs that friend to confirm. No app, no sign-up: one link in the group chat.

Live: https://pb-goal-bingo.pages.dev · Product/support page: https://janwan2003.github.io/goal-bingo/

## Stack
Cloudflare Pages (static `public/`, no build step) + Pages Functions (`functions/`). Data lives in one SQLite-backed
Durable Object in the Worker `pb-goal-bingo-db` (`worker/`), because the account is at the free plan's 10 D1
databases. `worker/index.js` wraps the object's SQL storage in a small D1-style shim, so `lib/api.js` is plain SQL.
`schema.sql` documents the tables; `lib/schema.js` is the copy the Worker runs. Game rules shared by browser and
server: `public/js/bingo.js`. Card image (1080x1350 PNG): `public/js/cardimg.js`.

## Develop
```
npx -y pnpm@9 install
(cd worker && npx wrangler dev --port 18943 --ip 127.0.0.1 --inspector-port 19243 --persist-to ../.wrangler/state) &
npx wrangler pages dev --port 18942 --ip 127.0.0.1 --inspector-port 19242 --persist-to .wrangler/state
node --test tests/unit/*.test.js
BASE=http://127.0.0.1:18942 node tests/e2e/run.mjs     # real Chromium, 4 people, phone + desktop, screenshots in shots/
BASE=http://127.0.0.1:18942 node tests/e2e/screens.mjs # dialogs, 3x3, settings, a11y names, phone + desktop
node tools/render-images.mjs                            # og.png + icons
```

## Deploy
```
set -a; . ../../.env; set +a
(cd worker && npx wrangler deploy)          # when lib/, worker/ or public/js/bingo.js changed
npx wrangler pages deploy --branch main
BASE=https://pb-goal-bingo.pages.dev SHOTS=shots-prod node tests/e2e/run.mjs   # deletes its own group
```

## Metrics
`scripts/stats.sh` prints aggregate counts from production (`GET /api/stats`, header `x-stats-key`). The key is the
Pages secret `STATS_KEY`; keep a copy as `STATS_KEY=...` in this directory's `.env` (gitignored). `e2eGroups` counts
groups left by failed test runs; subtract it.
