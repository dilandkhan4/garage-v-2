import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdt, fdate } from '@/lib/util';
import { providerMode } from '@/lib/providers';
import Flash from '@/components/Flash';
import { recordPayment, simulateConfirm, cancelPayment, sendInvoice } from '@/actions/billing';
export default async function InvoiceDetail({ params, searchParams }) {
  const user = await requireUser(['client', 'cashier', 'receptionist', 'manager', 'admin']);
  const { id } = await params; const sp = await searchParams; const t = await getT(user);
  const inv = await q1('select i.*, b.name branch from invoices i join branches b on b.id=i.branch_id where i.id=$1', [id]);
  if (!inv || (user.role === 'client' ? inv.client_id !== user.id : !ownsBranch(user, inv.branch_id))) notFound();
  const lines = inv.job_id
    ? await q('select description, qty::float qty, unit_price from job_items where job_id=$1 and superseded_by is null order by id', [inv.job_id])
    : await q(`select p.name description, oi.qty::float qty, oi.unit_price from order_items oi join parts p on p.id=oi.part_id where oi.order_id=$1 union all select 'Delivery', 1, delivery_fee from orders where id=$1 and delivery_fee>0`, [inv.order_id]);
  const pays = await q('select p.*, r.number rno from payments p left join receipts r on r.payment_id=p.id where invoice_id=$1 order by p.id', [inv.id]);
  const paid = pays.filter((p) => p.status === 'succeeded').reduce((s, p) => s + p.amount, 0);
  const due = inv.total - paid;
  const staff = user.role !== 'client';
  const test = providerMode() === 'test';
  return (<>
    <div className="row"><h1 className="grow">{t('Invoice')} {inv.number}</h1><span className={`badge ${inv.status === 'paid' ? 'ok' : 'warn'}`}>{t(inv.status)}</span>
      {inv.job_id && <Link className="btn sm ghost" href={`/app/jobs/${inv.job_id}`}>{t('Job')} #{inv.job_id}</Link>}
      {inv.order_id && <Link className="btn sm ghost" href={`/app/orders/${inv.order_id}`}>{t('Order')} #{inv.order_id}</Link>}
      </div>
    <Flash sp={sp} t={t} />
    <div className="card"><div className="row"><div className="grow"><b>{inv.customer_name}</b><div className="mute">{inv.branch} · {fdate(inv.issued_at)}</div></div>{staff && <form action={sendInvoice}><input type="hidden" name="id" value={inv.id} /><button className="btn sm ghost">{t('Send to client')}</button></form>}</div>
      <table><thead><tr><th>{t('Item')}</th><th>{t('Qty')}</th><th>{t('Unit price')}</th><th>{t('Total')}</th></tr></thead><tbody>
        {lines.map((l, i) => <tr key={i}><td>{l.description}</td><td>{l.qty}</td><td>{fmt(l.unit_price)}</td><td>{fmt(Math.round(l.qty * l.unit_price))}</td></tr>)}
        <tr><td colSpan="3" className="mute">{t('Subtotal')}</td><td>{fmt(inv.subtotal)}</td></tr><tr><td colSpan="3" className="mute">{t('Tax')} ({Number(inv.tax_rate)}%)</td><td>{fmt(inv.tax)}</td></tr>
        <tr><th colSpan="3">{t('Total')}</th><th>{fmt(inv.total)}</th></tr><tr><td colSpan="3" className="mute">{t('Paid')}</td><td>{fmt(paid)}</td></tr><tr><th colSpan="3">{t('Balance due')}</th><th>{fmt(due)}</th></tr></tbody></table></div>
    <h2>{t('Payments')}</h2>
    <div className="card tw"><table><thead><tr><th>{t('Date')}</th><th>{t('Method')}</th><th>{t('Amount')}</th><th>{t('Status')}</th><th>{t('Receipt')}</th><th /></tr></thead><tbody>
      {pays.map((p) => (<tr key={p.id}><td>{fdt(p.created_at)}</td><td>{{ cash: 'Cash', momo: 'MTN MoMo', orange: 'Orange Money', card: 'Card' }[p.method]}{p.payer_phone ? ` · ${p.payer_phone}` : ''}</td><td>{fmt(p.amount)}</td>
        <td><span className={`badge ${p.status === 'succeeded' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}`}>{t(p.status)}</span></td><td>{p.rno ? <Link href={`/app/receipts/${p.rno}`}>{p.rno}</Link> : '—'}</td>
        <td>{p.status === 'pending' && (<div className="row">{test && <form action={simulateConfirm}><input type="hidden" name="payment_id" value={p.id} /><button className="btn sm ok">{t('Simulate customer confirmation (test mode)')}</button></form>}
          <form action={cancelPayment}><input type="hidden" name="payment_id" value={p.id} /><button className="btn sm ghost">{t('Cancel')}</button></form></div>)}</td></tr>))}
      {pays.length === 0 && <tr><td colSpan="6" className="mute">{t('No payments yet.')}</td></tr>}</tbody></table></div>
    {due > 0 && inv.status !== 'void' && (<form action={recordPayment} className="card f" style={{ maxWidth: 520 }}><input type="hidden" name="invoice_id" value={inv.id} /><h3>{staff ? t('Take a payment') : t('Pay this invoice')}</h3>
      <label>{t('Method')}<select name="method">{staff && <option value="cash">{t('Cash (in store)')}</option>}<option value="momo">MTN MoMo</option><option value="orange">Orange Money</option><option value="card">{t('Card')}</option></select></label>
      <label>{t('Mobile money number')}<input name="phone" placeholder="+237 6XX XXX XXX" /></label>
      <label>{t('Amount (XAF)')}<input name="amount" type="number" min="1" max={due} defaultValue={due} /></label>
      <button className="btn alt">{t('Pay')}</button>{test && <div className="mute">{t('Test mode: no real money moves. Add provider keys to go live.')}</div>}</form>)}
  </>);
}
