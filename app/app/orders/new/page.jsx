import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt } from '@/lib/util';
import Flash from '@/components/Flash';
import { placeStoreSale } from '@/actions/shop';
export const metadata = { title: 'New in-store sale' };
export default async function NewSale({ searchParams }) {
  const user = await requireUser(['receptionist', 'storekeeper', 'cashier', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const branches = await q('select id,name from branches where active order by id');
  const branchId = Number(sp.branch) || user.branch_id || branches[0].id;
  const parts = await q(`select p.id, p.name, p.sku, p.price, p.category, coalesce(st.qty,0) qty, (select coalesce(sum(qty),0)::int from stock o where o.part_id=p.id and o.branch_id<>$1) elsewhere
     from parts p left join stock st on st.part_id=p.id and st.branch_id=$1 where p.active order by p.category, p.name`, [branchId]);
  return (<><h1>{t('New in-store sale')}</h1><Flash sp={sp} t={t} />
    {user.role === 'admin' && <form className="card row"><select name="branch" defaultValue={branchId}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="btn sm">{t('Show')}</button></form>}
    <form action={placeStoreSale}>
      <input type="hidden" name="branch_id" value={branchId} />
      <div className="card f" style={{ maxWidth: 620 }}><h3>{t('Customer')}</h3><div className="mute">{t('Walk-ins and other garages can buy without an account. Add the email of a registered client to link the sale to them.')}</div>
        <div className="grid g3"><input name="guest_name" placeholder={t('Name / garage')} /><input name="guest_phone" placeholder={t('Phone')} /><input name="customer_email" type="email" placeholder={t('Client email (optional)')} /></div>
        <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="delivery" /> {t('Delivery')}</label><input name="address" placeholder={t('Delivery address')} /></div>
      <div className="card tw"><table><thead><tr><th>{t('Part')}</th><th>{t('Price')}</th><th>{t('Here')}</th><th>{t('Other branches')}</th><th>{t('Qty')}</th></tr></thead><tbody>
        {parts.map((p) => (<tr key={p.id}><td>{p.name}<div className="mute">{p.sku}</div></td><td>{fmt(p.price)}</td><td><span className={`badge ${p.qty ? 'ok' : 'bad'}`}>{p.qty}</span></td><td>{p.elsewhere}</td><td><input type="number" min="0" name={`qty_${p.id}`} defaultValue="0" style={{ width: 80 }} /></td></tr>))}</tbody></table></div>
      <div className="mute" style={{ marginBottom: 8 }}>{t('If this branch has too little stock, the part is requested from a branch that has it; that branch must approve before you confirm the order.')}</div>
      <button className="btn alt">{t('Create sale and invoice')}</button></form></>);
}
