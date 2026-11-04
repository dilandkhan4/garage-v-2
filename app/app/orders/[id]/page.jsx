import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdt } from '@/lib/util';
import Flash from '@/components/Flash';
import { updateOrderStatus, processReturn } from '@/actions/shop';
import ActBtn from '@/components/ActBtn';
export default async function OrderDetail({ params, searchParams }) {
  const user = await requireUser(['client', 'receptionist', 'storekeeper', 'cashier', 'manager', 'admin']);
  const { id } = await params; const sp = await searchParams; const t = await getT(user);
  const o = await q1(`select o.*, b.name branch, coalesce(u.full_name,o.guest_name,'Walk-in') customer from orders o join branches b on b.id=o.branch_id left join users u on u.id=o.client_id where o.id=$1`, [id]);
  if (!o || (user.role === 'client' ? o.client_id !== user.id : !ownsBranch(user, o.branch_id))) notFound();
  const client = user.role === 'client';
  const items = await q(`select oi.*, p.name, sb.name source from order_items oi join parts p on p.id=oi.part_id left join branches sb on sb.id=oi.source_branch_id where order_id=$1 order by oi.id`, [o.id]);
  const inv = await q1('select * from invoices where order_id=$1 order by id desc limit 1', [o.id]);
  const pendingTr = await q1("select count(*)::int c from stock_transfers where order_id=$1 and status='requested'", [o.id]);
  const rets = await q('select r.*, p.name from returns r join order_items oi on oi.id=r.order_item_id join parts p on p.id=oi.part_id where oi.order_id=$1 order by r.id desc', [o.id]);
  const next = { placed: ['confirmed'], confirmed: ['packed'], packed: o.delivery ? ['out_for_delivery'] : ['delivered'], out_for_delivery: ['delivered'] }[o.status] || [];
  return (<><div className="row"><h1 className="grow">{t('Order')} #{o.id}</h1><span className="badge info">{t(o.status.replaceAll('_', ' '))}</span>{inv && <Link className="btn sm" href={`/app/invoices/${inv.id}`}>{t('Invoice')} {inv.number} · {t(inv.status)}</Link>}</div>
    <Flash sp={sp} t={t} />
    <div className="card"><table><tbody><tr><th>{t('Customer')}</th><td>{o.customer} {!client && <span className="mute">{o.guest_phone}</span>}</td></tr><tr><th>{t('Branch')}</th><td>{o.branch}</td></tr><tr><th>{t('Placed')}</th><td>{fdt(o.created_at)} · {o.channel === 'online' ? t('Online') : t('In store')}</td></tr>
      {o.delivery && <tr><th>{t('Delivery')}</th><td>{o.delivery_address} ({fmt(o.delivery_fee)})</td></tr>}</tbody></table></div>
    {pendingTr.c > 0 && <div className="alert">{t('Waiting for another branch to approve releasing stock for this order.')} <Link href="/app/transfers">{t('Transfers')}</Link></div>}
    <div className="card tw"><table><thead><tr><th>{t('Part')}</th><th>{t('Qty')}</th><th>{t('Unit price')}</th><th>{t('Total')}</th><th>{t('Returned')}</th><th>{t('Source')}</th><th /></tr></thead><tbody>
      {items.map((i) => (<tr key={i.id}><td>{i.name}</td><td>{i.qty}</td><td>{fmt(i.unit_price)}</td><td>{fmt(i.qty * i.unit_price)}</td><td>{i.returned_qty}</td><td>{i.source}</td>
        <td>{!client && i.qty - i.returned_qty > 0 && o.status !== 'cancelled' && (<details><summary className="mute">{t('Return')}</summary><form action={processReturn} className="f" style={{ minWidth: 200 }}><input type="hidden" name="item_id" value={i.id} />
          <input name="qty" type="number" min="1" max={i.qty - i.returned_qty} defaultValue="1" /><input name="reason" placeholder={t('Reason')} /><label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="restock" defaultChecked /> {t('Put back in stock')}</label><button className="btn sm">{t('Record return')}</button></form></details>)}</td></tr>))}</tbody></table></div>
    {!client && !['delivered', 'cancelled'].includes(o.status) && (<div className="row">{next.map((n) => (<form action={updateOrderStatus} key={n}><input type="hidden" name="id" value={o.id} /><ActBtn className="btn ok" name="to" value={n}>{t('Mark')} {t(n.replaceAll('_', ' '))}</ActBtn></form>))}
      <form action={updateOrderStatus}><input type="hidden" name="id" value={o.id} /><ActBtn className="btn ghost" name="to" value="cancelled">{t('Cancel order')}</ActBtn></form></div>)}
    {rets.length > 0 && (<><h2>{t('Returns')}</h2><div className="card"><table><tbody>{rets.map((r) => <tr key={r.id}><td>{r.name} × {r.qty}</td><td>{r.reason}</td><td>{t('Refund')} {fmt(r.refund_amount)}</td><td className="mute">{fdt(r.created_at)}</td></tr>)}</tbody></table></div></>)}</>);
}
