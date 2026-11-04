import { q } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdate, fmt } from '@/lib/util';
import Flash from '@/components/Flash';
import { saveSupplier, createPO, receivePO, cancelPO } from '@/actions/inventory';
export const metadata = { title: 'Purchasing' };
export default async function Purchasing({ searchParams }) {
  const user = await requireUser(['storekeeper', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const branches = (await q('select id,name from branches where active order by id')).filter((b) => ownsBranch(user, b.id));
  const suppliers = await q('select * from suppliers order by name');
  const parts = await q('select id,name,sku from parts where active order by name');
  const pos = await q(`select po.*, b.name branch, s.name supplier, (select string_agg(p.name||' ×'||i.qty, ', ') from po_items i join parts p on p.id=i.part_id where i.po_id=po.id) lines,
      (select sum(i.qty*i.unit_cost)::int from po_items i where i.po_id=po.id) cost from purchase_orders po join branches b on b.id=po.branch_id left join suppliers s on s.id=po.supplier_id
      where ($1::int[] is null or po.branch_id = any($1)) order by po.id desc limit 50`, [user.role === 'admin' ? null : user.branchIds]);
  const PartSel = ({ n }) => (<div className="grid g3"><select name={`part${n}`}><option value="">{t('Part')} {n}</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input name={`qty${n}`} type="number" min="0" placeholder={t('Qty')} /><input name={`cost${n}`} type="number" min="0" placeholder={t('Unit cost (XAF)')} /></div>);
  return (<><h1>{t('Purchasing')}</h1><Flash sp={sp} t={t} />
    <div className="grid g2"><form action={createPO} className="card f"><h3>{t('New purchase order')}</h3>
      <div className="grid g2"><label>{t('Branch')}<select name="branch_id" defaultValue={user.branch_id || ''}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>{t('Supplier')}<select name="supplier_id"><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
      <PartSel n={1} /><PartSel n={2} /><PartSel n={3} /><button className="btn">{t('Create order')}</button></form>
      <form action={saveSupplier} className="card f"><h3>{t('Add a supplier')}</h3><input name="name" placeholder={t('Name')} required /><input name="phone" placeholder={t('Phone')} /><input name="email" type="email" placeholder="Email" /><button className="btn sm">{t('Add supplier')}</button></form></div>
    <div className="card tw"><table><thead><tr><th>#</th><th>{t('Date')}</th><th>{t('Branch')}</th><th>{t('Supplier')}</th><th>{t('Lines')}</th><th>{t('Cost')}</th><th>{t('Status')}</th><th /></tr></thead><tbody>
      {pos.map((p) => (<tr key={p.id}><td>{p.id}</td><td>{fdate(p.created_at)}</td><td>{p.branch}</td><td>{p.supplier || '—'}</td><td>{p.lines}</td><td>{fmt(p.cost)}</td><td><span className={`badge ${p.status === 'received' ? 'ok' : p.status === 'cancelled' ? 'bad' : 'warn'}`}>{t(p.status)}</span></td>
        <td>{p.status === 'ordered' && ownsBranch(user, p.branch_id) && (<div className="row"><form action={receivePO}><input type="hidden" name="id" value={p.id} /><button className="btn sm ok">{t('Receive into stock')}</button></form><form action={cancelPO}><input type="hidden" name="id" value={p.id} /><button className="btn sm ghost">{t('Cancel')}</button></form></div>)}</td></tr>))}
      {pos.length === 0 && <tr><td colSpan="8" className="mute">{t('No purchase orders.')}</td></tr>}</tbody></table></div></>);
}
