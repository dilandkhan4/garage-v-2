import { q } from '@/lib/db';
import { requireUser, ownsBranch, isAdmin } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdt } from '@/lib/util';
import Flash from '@/components/Flash';
import { decideApproval } from '@/actions/approvals';
import { decideCorrection } from '@/actions/jobs';
import ActBtn from '@/components/ActBtn';
export const metadata = { title: 'Approvals' };
export default async function Approvals({ searchParams }) {
  const user = await requireUser(['manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const ap = await q(`select a.*, u.full_name by, b.name branch from approvals a left join users u on u.id=a.requested_by left join branches b on b.id=a.branch_id where a.status='pending' order by a.id`);
  const mine = ap.filter((a) => (a.kind === 'manager_change' ? isAdmin(user) : isAdmin(user) || ownsBranch(user, a.branch_id)));
  const cor = (await q(`select c.*, u.full_name by, ji.description orig, j.branch_id, v.plate from job_corrections c join jobs j on j.id=c.job_id join vehicles v on v.id=j.vehicle_id join job_items ji on ji.id=c.item_id left join users u on u.id=c.requested_by where c.status='pending' order by c.id`))
    .filter((c) => isAdmin(user) || ownsBranch(user, c.branch_id));
  const done = await q(`select a.*, u.full_name by, d.full_name decider from approvals a left join users u on u.id=a.requested_by left join users d on d.id=a.decided_by where a.status<>'pending' order by a.decided_at desc limit 15`);
  const Btns = ({ id, action }) => (<form action={action} className="row"><input type="hidden" name="id" value={id} /><ActBtn className="btn sm ok" name="act" value="approve">{t('Approve')}</ActBtn><ActBtn className="btn sm ghost" name="act" value="reject">{t('Reject')}</ActBtn></form>);
  return (<><h1>{t('Approvals')}</h1><Flash sp={sp} t={t} />
    <h2>{t('Job corrections')}</h2><div className="card tw"><table><thead><tr><th>{t('Job')}</th><th>{t('Original')}</th><th>{t('Proposed')}</th><th>{t('Reason')}</th><th>{t('By')}</th><th /></tr></thead><tbody>
      {cor.map((c) => (<tr key={c.id}><td><a href={`/app/jobs/${c.job_id}`}>#{c.job_id}</a> {c.plate}</td><td>{c.orig}</td><td>{c.new_description} × {Number(c.new_qty)} @ {c.new_unit_price}</td><td>{c.reason}</td><td>{c.by}</td><td><Btns id={c.id} action={decideCorrection} /></td></tr>))}
      {cor.length === 0 && <tr><td colSpan="6" className="mute">{t('Nothing waiting.')}</td></tr>}</tbody></table></div>
    <h2>{t('Other requests')}</h2><div className="card tw"><table><thead><tr><th>{t('Request')}</th><th>{t('Type')}</th><th>{t('From')}</th><th>{t('When')}</th><th /></tr></thead><tbody>
      {mine.map((a) => (<tr key={a.id}><td>{a.title}{a.kind === 'cross_branch_write' && <div className="mute">“{a.payload.body}”</div>}</td><td>{a.kind === 'manager_change' ? t('Manager change (admin only)') : t('Cross-branch addition')}</td><td>{a.by}</td><td>{fdt(a.created_at)}</td><td><Btns id={a.id} action={decideApproval} /></td></tr>))}
      {mine.length === 0 && <tr><td colSpan="5" className="mute">{t('Nothing waiting.')}</td></tr>}</tbody></table></div>
    <h2>{t('Recently decided')}</h2><div className="card tw"><table><tbody>{done.map((a) => (<tr key={a.id}><td>{a.title}</td><td>{a.by}</td><td><span className={`badge ${a.status === 'approved' ? 'ok' : 'bad'}`}>{t(a.status)}</span></td><td className="mute">{a.decider} · {fdt(a.decided_at)}</td></tr>))}</tbody></table></div></>);
}
