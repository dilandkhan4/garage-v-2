import { q } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt } from '@/lib/util';
import Flash from '@/components/Flash';
import { adjustStock } from '@/actions/inventory';
export const metadata = { title: 'Stock' };
export default async function Inventory({ searchParams }) {
  const user = await requireUser(['storekeeper', 'receptionist', 'mechanic', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const branches = await q('select id,name from branches where active order by id');
  const branchId = Number(sp.branch) || user.branch_id || branches[0]?.id;
  const low = sp.low === '1'; const s = (sp.s || '').trim();
  const rows = await q(`select p.id, p.sku, p.name, p.category, p.price, coalesce(st.qty,0) qty, coalesce(st.reorder_level,5) reorder,
      (select coalesce(sum(qty),0)::int from stock o where o.part_id=p.id and o.branch_id<>$1) elsewhere
    from parts p left join stock st on st.part_id=p.id and st.branch_id=$1 where p.active and ($2='' or p.name ilike '%'||$2||'%' or p.sku ilike '%'||$2||'%')
    ${low ? 'and coalesce(st.qty,0) <= coalesce(st.reorder_level,5)' : ''} order by p.category, p.name`, [branchId, s]);
  const canEdit = ['storekeeper', 'manager', 'admin'].includes(user.role) && ownsBranch(user, branchId);
  return (<><h1>{t('Stock')}</h1><Flash sp={sp} t={t} />
    <form className="card row"><select name="branch" defaultValue={branchId}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <input className="grow" name="s" defaultValue={s} placeholder={t('Search')} /><label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="low" value="1" defaultChecked={low} /> {t('Low stock only')}</label><button className="btn sm">{t('Show')}</button></form>
    {!ownsBranch(user, branchId) && <div className="alert">{t('You are viewing another branch’s stock (read only). Use Transfers to request parts.')}</div>}
    <div className="card tw"><table><thead><tr><th>SKU</th><th>{t('Part')}</th><th>{t('Category')}</th><th>{t('Price')}</th><th>{t('In stock')}</th><th>{t('Other branches')}</th><th>{t('Reorder at')}</th>{canEdit && <th />}</tr></thead>
      <tbody>{rows.map((r) => (<tr key={r.id}><td>{r.sku}</td><td>{r.name}</td><td>{r.category}</td><td>{fmt(r.price)}</td>
        <td><span className={`badge ${r.qty === 0 ? 'bad' : r.qty <= r.reorder ? 'warn' : 'ok'}`}>{r.qty}</span></td><td>{r.elsewhere}</td>
        {canEdit ? (<td colSpan="2"><form action={adjustStock} className="row"><input type="hidden" name="branch_id" value={branchId} /><input type="hidden" name="part_id" value={r.id} />
          <input name="qty" type="number" min="0" defaultValue={r.qty} style={{ width: 80 }} title={t('Quantity')} /><input name="reorder_level" type="number" min="0" defaultValue={r.reorder} style={{ width: 70 }} title={t('Reorder at')} /><button className="btn sm">{t('Save')}</button></form></td>) : <td>{r.reorder}</td>}</tr>))}
        {rows.length === 0 && <tr><td colSpan="8" className="mute">{t('No parts.')}</td></tr>}</tbody></table></div></>);
}
