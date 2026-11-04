import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdate } from '@/lib/util';
export const metadata = { title: 'Invoices & payments' };
export default async function Invoices({ searchParams }) {
  const user = await requireUser(['client', 'cashier', 'receptionist', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const status = sp.status || 'all';
  const params = []; const where = [];
  if (user.role === 'client') { params.push(user.id); where.push(`i.client_id=$${params.length}`); }
  else if (user.role !== 'admin') { params.push(user.branchIds); where.push(`i.branch_id = any($${params.length})`); }
  if (status !== 'all') { params.push(status); where.push(`i.status=$${params.length}`); }
  const rows = await q(`select i.*, b.name branch, coalesce((select sum(amount) from payments p where p.invoice_id=i.id and p.status='succeeded'),0)::int paid
    from invoices i join branches b on b.id=i.branch_id ${where.length ? 'where ' + where.join(' and ') : ''} order by i.id desc limit 200`, params);
  return (<><h1>{t('Invoices & payments')}</h1>
    <form className="card row"><select name="status" defaultValue={status}><option value="all">{t('All')}</option><option value="issued">{t('issued')}</option><option value="partial">{t('partial')}</option><option value="paid">{t('paid')}</option></select><button className="btn sm">{t('Filter')}</button></form>
    <div className="card tw"><table><thead><tr><th>{t('Invoice')}</th><th>{t('Date')}</th><th>{t('Customer')}</th><th>{t('Branch')}</th><th>{t('Total')}</th><th>{t('Paid')}</th><th>{t('Status')}</th></tr></thead>
      <tbody>{rows.map((i) => (<tr key={i.id}><td><Link href={`/app/invoices/${i.id}`}>{i.number}</Link></td><td>{fdate(i.issued_at)}</td><td>{i.customer_name}</td><td>{i.branch}</td><td>{fmt(i.total)}</td><td>{fmt(i.paid)}</td>
        <td><span className={`badge ${i.status === 'paid' ? 'ok' : i.status === 'partial' ? 'warn' : ''}`}>{t(i.status)}</span></td></tr>))}
        {rows.length === 0 && <tr><td colSpan="7" className="mute">{t('No invoices.')}</td></tr>}</tbody></table></div></>);
}
