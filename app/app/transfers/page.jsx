import { q } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdt } from '@/lib/util';
import Flash from '@/components/Flash';
import { requestTransfer, decideTransfer, receiveTransfer } from '@/actions/inventory';
import ActBtn from '@/components/ActBtn';
export const metadata = { title: 'Transfers' };
export default async function Transfers({ searchParams }) {
  const user = await requireUser(['storekeeper', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const branches = await q('select id,name from branches where active order by id');
  const parts = await q('select id,name,sku from parts where active order by name');
  const rows = await q(`select t.*, p.name part, fb.name from_name, tb.name to_name, u.full_name by, o.id oid from stock_transfers t join parts p on p.id=t.part_id join branches fb on fb.id=t.from_branch join branches tb on tb.id=t.to_branch
    left join users u on u.id=t.requested_by left join orders o on o.id=t.order_id where ($1::int[] is null or t.from_branch = any($1) or t.to_branch = any($1)) order by t.id desc limit 100`, [user.role === 'admin' ? null : user.branchIds]);
  const myBranch = user.branch_id || branches[0].id;
  return (<><h1>{t('Transfers between branches')}</h1><Flash sp={sp} t={t} />
    <form action={requestTransfer} className="card f" style={{ maxWidth: 620 }}><h3>{t('Request parts from another branch')}</h3>
      <div className="grid g2"><label>{t('To (receiving branch)')}<select name="to_branch" defaultValue={myBranch}>{branches.filter((b) => ownsBranch(user, b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>{t('From (branch that holds the stock)')}<select name="from_branch">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
      <div className="grid g2"><label>{t('Part')}<select name="part_id" required><option value="">—</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label><label>{t('Quantity')}<input name="qty" type="number" min="1" defaultValue="1" /></label></div>
      <button className="btn">{t('Request')}</button></form>
    <div className="card tw"><table><thead><tr><th>{t('When')}</th><th>{t('Type')}</th><th>{t('Part')}</th><th>{t('Qty')}</th><th>{t('From')}</th><th>{t('To')}</th><th>{t('Status')}</th><th /></tr></thead><tbody>
      {rows.map((r) => (<tr key={r.id}><td>{fdt(r.created_at)}</td><td>{r.kind === 'sale' ? `${t('Sale approval')} (#${r.oid})` : t('Transfer')}</td><td>{r.part}</td><td>{r.qty}</td><td>{r.from_name}</td><td>{r.to_name}</td>
        <td><span className={`badge ${r.status === 'received' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'}`}>{t(r.status)}</span></td>
        <td><div className="row">
          {r.status === 'requested' && ownsBranch(user, r.from_branch) && (<form action={decideTransfer} className="row"><input type="hidden" name="id" value={r.id} /><ActBtn className="btn sm ok" name="act" value="approve">{t('Approve')}</ActBtn><ActBtn className="btn sm ghost" name="act" value="reject">{t('Reject')}</ActBtn></form>)}
          {r.status === 'approved' && r.kind === 'transfer' && ownsBranch(user, r.to_branch) && (<form action={receiveTransfer}><input type="hidden" name="id" value={r.id} /><button className="btn sm">{t('Mark received')}</button></form>)}</div></td></tr>))}
      {rows.length === 0 && <tr><td colSpan="8" className="mute">{t('No transfers yet.')}</td></tr>}</tbody></table></div></>);
}
