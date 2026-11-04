import Link from 'next/link';
import { q, q1 } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { CHAT_ROLES, DEPT_NAMES, ensureChat, isMember } from '@/lib/chat';
import { ROLE_LABEL } from '@/lib/util';
import ChatPane from '@/components/ChatPane';
import { startDm } from '@/actions/chat';
export const metadata = { title: 'Chat' };
export default async function Chat({ searchParams }) {
  const user = await requireUser(CHAT_ROLES); const t = await getT(user); const sp = await searchParams;
  await ensureChat(user);
  const chans = await q(`select c.*, cm.last_read_id, (select count(*)::int from chat_messages m where m.channel_id=c.id and m.id>cm.last_read_id and m.sender_id<>$1) unread,
      (select u.full_name from chat_members o join users u on u.id=o.user_id where o.channel_id=c.id and o.user_id<>$1 and c.kind='dm' limit 1) other
      from chat_channels c join chat_members cm on cm.channel_id=c.id and cm.user_id=$1 order by c.kind, c.department nulls last, c.id`, [user.id]);
  const people = await q('select id, full_name, role from users where active and role = any($1) and id<>$2 order by full_name', [CHAT_ROLES, user.id]);
  const sel = chans.find((c) => c.id === Number(sp.c)) || chans[0];
  let initial = [];
  if (sel && await isMember(sel.id, user.id)) {
    initial = (await q(`select * from (select m.id, m.body, m.job_id, m.created_at, m.sender_id, s.full_name from chat_messages m join users s on s.id=m.sender_id where m.channel_id=$1 order by m.id desc limit 100) x order by id`, [sel.id])).map((r) => ({ ...r, created_at: r.created_at.toISOString(), mine: r.sender_id === user.id }));
    if (initial.length) await q('update chat_members set last_read_id=$3 where channel_id=$1 and user_id=$2 and last_read_id<$3', [sel.id, user.id, initial[initial.length - 1].id]);
  }
  const title = (c) => (c.kind === 'dm' ? c.other : t(DEPT_NAMES[c.department]));
  const labels = { you: t('You'), job: t('Job'), empty: t('No messages yet. Say hello!'), placeholder: t('Write a message'), jobPh: t('Job #'), send: t('Send'), error: t('Message not sent.') };
  return (<><h1>{t('Chat')}</h1>
    <div className="chat"><div className="card list" style={{ margin: 0 }}>
      <div className="mute">{t('Departments')}</div>{chans.filter((c) => c.kind === 'department').map((c) => <Link key={c.id} href={`/app/chat?c=${c.id}`} className={sel?.id === c.id ? 'on' : ''}># {title(c)}{c.unread ? ` (${c.unread})` : ''}</Link>)}
      <div className="mute" style={{ marginTop: 10 }}>{t('Private messages')}</div>{chans.filter((c) => c.kind === 'dm').map((c) => <Link key={c.id} href={`/app/chat?c=${c.id}`} className={sel?.id === c.id ? 'on' : ''}>{title(c)}{c.unread ? ` (${c.unread})` : ''}</Link>)}
      <form action={startDm} className="f" style={{ marginTop: 10 }}><select name="user_id" required><option value="">{t('New private message…')}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {t(ROLE_LABEL[p.role])}</option>)}</select><button className="btn sm">{t('Start')}</button></form></div>
      {sel ? <ChatPane key={sel.id} channel={sel.id} initial={initial} labels={labels} /> : <div className="card">{t('No conversations yet.')}</div>}</div></>);
}
