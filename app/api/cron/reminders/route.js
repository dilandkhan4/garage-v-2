import { runReminders } from '@/lib/reminders';
export const dynamic = 'force-dynamic';
// Call once a day (cron / scheduler): GET /api/cron/reminders?key=$CRON_KEY
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (!process.env.CRON_KEY || key !== process.env.CRON_KEY) return new Response('forbidden', { status: 403 });
  return Response.json(await runReminders());
}
