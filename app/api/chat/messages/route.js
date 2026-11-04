import { q, q1 } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { isMember } from '@/lib/chat';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const u = await getUser(); if (!u) return new Response('unauthorized', { status: 401 });
  const sp = new URL(req.url).searchParams; const ch = Number(sp.get('channel')); const after = Number(sp.get('after') || 0);
  if (!(await isMember(ch, u.id))) return new Response('forbidden', { status: 403 });
  const rows = await q(`select m.id, m.body, m.job_id, m.created_at, m.sender_id, s.full_name from chat_messages m join users s on s.id=m.sender_id where m.channel_id=$1 and m.id>$2 order by m.id limit 200`, [ch, after]);
  if (rows.length) await q('update chat_members set last_read_id=$3 where channel_id=$1 and user_id=$2 and last_read_id<$3', [ch, u.id, rows[rows.length - 1].id]);
  return Response.json(rows.map((r) => ({ ...r, mine: r.sender_id === u.id })));
}
