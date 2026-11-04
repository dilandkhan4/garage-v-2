// Calls the reminder endpoint of the running app. Schedule it once a day (see README).
const base = process.env.BASE_URL || 'http://localhost:3000';
const key = process.env.CRON_KEY;
if (!key) { console.error('Set CRON_KEY'); process.exit(1); }
const r = await fetch(`${base}/api/cron/reminders?key=${encodeURIComponent(key)}`);
console.log(r.status, await r.text());
process.exit(r.ok ? 0 : 1);
