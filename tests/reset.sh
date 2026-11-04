#!/bin/bash
cd "$(dirname "$0")/.."
psql -h localhost -p 5433 -U postgres -d garage -q -c "drop schema public cascade; create schema public;" >/dev/null 2>&1
node scripts/migrate.mjs >/dev/null && DEMO=1 node scripts/seed.mjs >/dev/null && echo reset
