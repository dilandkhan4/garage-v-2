import { notFound } from 'next/navigation';
import { q1 } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdt } from '@/lib/util';
import PrintButton from '@/components/PrintButton';
export default async function Receipt({ params }) {
  const user = await requireUser(); const t = await getT(user); const { no } = await params;
  const r = await q1(`select r.*, p.branch_id, i.client_id from receipts r join payments p on p.id=r.payment_id join invoices i on i.id=p.invoice_id where r.number=$1`, [no]);
  if (!r || (user.role === 'client' ? r.client_id !== user.id : !ownsBranch(user, r.branch_id))) notFound();
  const s = r.snapshot;
  return (<div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
    <h2 style={{ marginTop: 0 }}>{t('Payment receipt')}</h2><div className="mute">{s.branch}</div>
    <table><tbody>
      <tr><th>{t('Receipt no.')}</th><td>{r.number}</td></tr><tr><th>{t('Invoice')}</th><td>{s.invoice}</td></tr><tr><th>{t('Customer')}</th><td>{s.customer}</td></tr>
      <tr><th>{t('Date')}</th><td>{fdt(s.paid_at)}</td></tr><tr><th>{t('Method')}</th><td>{s.method}</td></tr><tr><th>{t('Amount received')}</th><td><b>{fmt(s.amount)}</b></td></tr>
      <tr><th>{t('Invoice total')}</th><td>{fmt(s.total)} ({t('tax')} {fmt(s.tax)})</td></tr></tbody></table>
    <p className="noprint" style={{ marginTop: 14 }}><PrintButton label={t('Print')} /></p>
    <p className="mute">{t('A copy of this receipt is stored in the system.')}</p></div>);
}
