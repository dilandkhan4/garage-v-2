import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdt } from '@/lib/util';
import Flash from '@/components/Flash';
import { setListing, hireGraduate, updateEmployerRequest, revokeCertificate } from '@/actions/training';
import ActBtn from '@/components/ActBtn';
export const metadata = { title: 'Graduates & hiring' };
export default async function GraduatesAdmin({ searchParams }) {
  const user = await requireUser(['manager', 'admin']); const t = await getT(user); const sp = await searchParams;
  const grads = await q(`select g.*, u.full_name, u.email, u.role, c.id cid, c.code, c.revoked, p.name program, b.name branch from graduate_profiles g join users u on u.id=g.user_id left join enrollments e on e.student_id=u.id and e.status='graduated'
    left join certificates c on c.enrollment_id=e.id left join programs p on p.id=e.program_id left join branches b on b.id=e.branch_id order by g.user_id desc`);
  const reqs = await q('select r.*, u.full_name grad from employer_requests r left join users u on u.id=r.graduate_user_id order by r.id desc limit 50');
  const branches = await q('select id,name from branches where active order by id');
  return (<><h1>{t('Graduates & hiring')}</h1><Flash sp={sp} t={t} />
    <h2>{t('Hiring requests from companies')}</h2><div className="card tw"><table><tbody>{reqs.map((r) => (<tr key={r.id}><td><b>{r.company}</b><div className="mute">{r.contact_name} · {r.email} {r.phone}</div></td><td>{r.message}{r.grad && <div className="mute">{t('About')}: {r.grad}</div>}</td><td className="mute">{fdt(r.created_at)}</td>
      <td><form action={updateEmployerRequest} className="row"><input type="hidden" name="id" value={r.id} /><select name="status" defaultValue={r.status}><option value="new">{t('new')}</option><option value="forwarded">{t('forwarded')}</option><option value="closed">{t('closed')}</option></select><button className="btn sm">{t('Save')}</button></form></td></tr>))}
      {reqs.length === 0 && <tr><td className="mute">{t('No requests yet.')}</td></tr>}</tbody></table></div>
    <h2>{t('Graduates')}</h2><div className="card tw"><table><thead><tr><th>{t('Graduate')}</th><th>{t('Program')}</th><th>{t('Certificate')}</th><th>{t('Public page')}</th><th>{t('Hire')}</th></tr></thead><tbody>
      {grads.map((g) => (<tr key={g.user_id}><td><b>{g.full_name}</b><div className="mute">{g.email}</div>{g.hired && <span className="badge ok">{t('hired')} · {t(g.role)}</span>}</td><td>{g.program}<div className="mute">{g.branch}</div></td>
        <td>{g.code ? <><Link href={`/verify/${g.code}`}>{g.code}</Link>{g.revoked && <span className="badge bad">{t('revoked')}</span>}{user.role === 'admin' && <form action={revokeCertificate}><input type="hidden" name="id" value={g.cid} /><button className="btn sm ghost">{g.revoked ? t('Restore') : t('Revoke')}</button></form>}</> : '—'}</td>
        <td><form action={setListing}><input type="hidden" name="user_id" value={g.user_id} /><ActBtn className="btn sm ghost" name="listed" value={g.listed ? '0' : '1'}>{g.listed ? t('Listed: remove') : t('Hidden: list')}</ActBtn></form></td>
        <td>{!g.hired && g.role === 'student' && (<form action={hireGraduate} className="row"><input type="hidden" name="user_id" value={g.user_id} /><select name="role">{['mechanic', 'receptionist', 'storekeeper', 'cashier', 'instructor'].map((r) => <option key={r} value={r}>{t(r)}</option>)}</select>
          <select name="branch_id">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="btn sm ok">{t('Convert to worker account')}</button></form>)}</td></tr>))}
      {grads.length === 0 && <tr><td colSpan="5" className="mute">{t('No graduates yet.')}</td></tr>}</tbody></table></div></>);
}
