import { q1 } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { isMember } from '@/lib/chat';
export async function POST(req) {
  const u = await getUser(); if (!u) return new Response('unauthorized', { status: 401 });
  const b = await req.json().catch(() => ({}));
  const ch = Number(b.channel); const body = String(b.body || '').trim().slice(0, 4000);
  if (!body || !(await isMember(ch, u.id))) return new Response('forbidden', { status: 403 });
  const job = b.job_id ? await q1('select id from jobs where id=$1', [Number(b.job_id)]) : null;
  const m = await q1('insert into chat_messages(channel_id,sender_id,body,job_id) values ($1,$2,$3,$4) returning id', [ch, u.id, body, job?.id ?? null]);
  await q1('update chat_members set last_read_id=$3 where channel_id=$1 and user_id=$2 returning 1', [ch, u.id, m.id]);
  return Response.json({ ok: true, id: m.id });
}
