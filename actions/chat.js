'use server';
import { redirect } from 'next/navigation';
import { q1 } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { int } from '@/lib/util';
import { CHAT_ROLES, ensureChat } from '@/lib/chat';

// Anyone on staff can write privately to any other staff member; only the two people are members of that conversation.
export async function startDm(fd) {
  const u = await requireUser(CHAT_ROLES);
  const other = int(fd, 'user_id');
  const target = await q1('select id from users where id=$1 and active and role = any($2) and id<>$3', [other, CHAT_ROLES, u.id]);
  if (!target) redirect('/app/chat');
  await ensureChat(u);
  let ch = await q1(`select c.id from chat_channels c join chat_members a on a.channel_id=c.id and a.user_id=$1 join chat_members b on b.channel_id=c.id and b.user_id=$2 where c.kind='dm' limit 1`, [u.id, target.id]);
  if (!ch) {
    ch = await q1("insert into chat_channels(kind) values ('dm') returning id");
    await q1('insert into chat_members(channel_id,user_id) values ($1,$2) returning 1', [ch.id, u.id]);
    await q1('insert into chat_members(channel_id,user_id) values ($1,$2) returning 1', [ch.id, target.id]);
  }
  redirect(`/app/chat?c=${ch.id}`);
}
