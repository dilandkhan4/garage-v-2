#!/bin/bash
# usage: tests/server.sh restart  (production build must exist)
cd "$(dirname "$0")/.."
if [ -f /tmp/garage.pid ]; then kill "$(cat /tmp/garage.pid)" 2>/dev/null; sleep 1; fi
INSECURE_COOKIES=1 CRON_KEY=testkey BASE_URL=http://localhost:3000 nohup node node_modules/next/dist/bin/next start -p 3000 > /home/claude/server.log 2>&1 &
echo $! > /tmp/garage.pid
sleep 4; curl -s -o /dev/null -w "server %{http_code}\n" localhost:3000/login
