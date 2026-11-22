#!/bin/sh
# Prints aggregate counts from production for VENTURE.md ## Metrics. Needs STATS_KEY in this venture's .env
# (gitignored; the same value is the Pages secret STATS_KEY of pb-goal-bingo).
cd "$(dirname "$0")/.." && . ./.env && curl -s -H "x-stats-key: $STATS_KEY" "${BASE:-https://pb-goal-bingo.pages.dev}/api/stats"; echo
