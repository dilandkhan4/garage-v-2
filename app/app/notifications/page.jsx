import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdt } from '@/lib/util';
import { markNotificationsRead } from '@/actions/admin';
export const metadata = { title: 'Notifications' };
export default async function Notifications() {
  const user = await requireUser(); const t = await getT(user);
  const rows = await q(`select n.*, (select string_agg(channel||':'||status, ', ') from notification_deliveries d where d.notification_id=n.id) deliveries from notifications n where user_id=$1 order by id desc limit 100`, [user.id]);
  return (<><div className="row"><h1 className="grow">{t('Notifications')}</h1><form action={markNotificationsRead}><button className="btn sm ghost">{t('Mark all as read')}</button></form></div>
    {rows.map((n) => (<div className="card" key={n.id} style={{ opacity: n.read_at ? 0.7 : 1 }}><div className="row"><b className="grow">{n.subject}</b><span className="mute">{fdt(n.created_at)}</span></div><div>{n.body}</div>
      <div className="row mute">{n.deliveries && <span>{n.deliveries}</span>}{n.link && <Link href={n.link}>{t('Open')}</Link>}{!n.read_at && <form action={markNotificationsRead}><input type="hidden" name="id" value={n.id} /><button className="btn sm ghost">{t('Mark read')}</button></form>}</div></div>))}
    {rows.length === 0 && <p className="mute">{t('No notifications.')}</p>}</>);
}
