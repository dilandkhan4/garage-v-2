import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdate } from '@/lib/util';
export const metadata = { title: 'Orders' };
export default async function Orders() {
  const user = await requireUser(['client', 'receptionist', 'storekeeper', 'cashier', 'manager', 'admin']);
  const t = await getT(user);
  const client = user.role === 'client';
  const rows = await q(`select o.*, b.name branch, coalesce(u.full_name,o.guest_name,'Walk-in') customer, i.total, i.status istatus from orders o join branches b on b.id=o.branch_id left join users u on u.id=o.client_id left join invoices i on i.order_id=o.id
    where ($1::int is null or o.client_id=$1) and ($2::int[] is null or o.branch_id = any($2)) order by o.id desc limit 200`, [client ? user.id : null, client || user.role === 'admin' ? null : user.branchIds]);
  return (<><div className="row"><h1 className="grow">{t('Orders')}</h1>{!client && <Link className="btn alt" href="/app/orders/new">{t('New in-store sale')}</Link>}{client && <Link className="btn alt" href="/shop">{t('Shop for parts')}</Link>}</div>
    <div className="card tw"><table><thead><tr><th>#</th><th>{t('Date')}</th><th>{t('Customer')}</th><th>{t('Branch')}</th><th>{t('Channel')}</th><th>{t('Status')}</th><th>{t('Total')}</th><th>{t('Payment')}</th></tr></thead><tbody>
      {rows.map((o) => (<tr key={o.id}><td><Link href={`/app/orders/${o.id}`}>#{o.id}</Link></td><td>{fdate(o.created_at)}</td><td>{o.customer}</td><td>{o.branch}</td><td>{o.channel === 'online' ? t('Online') : t('In store')}{o.delivery ? ` · ${t('delivery')}` : ''}</td>
        <td><span className="badge">{t(o.status.replaceAll('_', ' '))}</span></td><td>{fmt(o.total)}</td><td><span className={`badge ${o.istatus === 'paid' ? 'ok' : 'warn'}`}>{t(o.istatus || '—')}</span></td></tr>))}
      {rows.length === 0 && <tr><td colSpan="8" className="mute">{t('No orders.')}</td></tr>}</tbody></table></div></>);
}
