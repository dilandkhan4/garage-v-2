import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser, seesMoney } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdate, STATUS_LABEL } from '@/lib/util';
export const metadata = { title: 'Jobs' };
const OPEN = ['checked_in', 'diagnosis', 'quoted', 'approved', 'in_progress', 'quality_check', 'ready', 'invoiced', 'paid'];
export default async function Jobs({ searchParams }) {
  const user = await requireUser(['client', 'receptionist', 'mechanic', 'cashier', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const branches = await q('select id,name from branches order by id');
  const scope = sp.scope || (user.role === 'mechanic' ? 'mine' : 'branch');
  const status = sp.status || 'open';
  const params = []; const where = [];
  if (user.role === 'client') { params.push(user.id); where.push(`j.client_id=$${params.length}`); }
  else if (scope === 'mine') { params.push(user.id); where.push(`j.mechanic_id=$${params.length}`); }
  else if (scope === 'branch' && user.role !== 'admin') { params.push(user.branchIds); where.push(`j.branch_id = any($${params.length})`); }
  else if (/^\d+$/.test(scope)) { params.push(Number(scope)); where.push(`j.branch_id=$${params.length}`); }
  if (status === 'open') where.push(`j.status = any('{${OPEN.join(',')}}')`); else if (status !== 'all') { params.push(status); where.push(`j.status=$${params.length}`); }
  const rows = await q(`select j.*, v.plate, v.make, v.model, b.name branch, u.full_name client, m.full_name mechanic,
      (select coalesce(sum(qty*unit_price),0)::int from job_items where job_id=j.id and superseded_by is null) total
      from jobs j join vehicles v on v.id=j.vehicle_id join branches b on b.id=j.branch_id join users u on u.id=j.client_id left join users m on m.id=j.mechanic_id
      ${where.length ? 'where ' + where.join(' and ') : ''} order by j.id desc limit 200`, params);
  return (<>
    <div className="row"><h1 className="grow">{t('Jobs')}</h1>
      {['receptionist', 'mechanic', 'manager', 'admin'].includes(user.role) && <Link className="btn alt" href="/app/jobs/new">{t('Check in a vehicle')}</Link>}</div>
    {user.role !== 'client' && (<form className="card row">
      <select name="scope" defaultValue={scope}><option value="branch">{t('My branch')}</option>{user.role === 'mechanic' && <option value="mine">{t('Assigned to me')}</option>}<option value="all">{t('All branches (read only)')}</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select name="status" defaultValue={status}><option value="open">{t('Open jobs')}</option><option value="all">{t('All')}</option>{Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}</select>
      <button className="btn sm">{t('Filter')}</button></form>)}
    <div className="card tw"><table><thead><tr><th>#</th><th>{t('Vehicle')}</th><th>{t('Client')}</th><th>{t('Branch')}</th><th>{t('Mechanic')}</th><th>{t('Status')}</th><th>{t('Opened')}</th><th>{t('Total')}</th></tr></thead>
      <tbody>{rows.map((j) => (<tr key={j.id}><td><Link href={`/app/jobs/${j.id}`}>#{j.id}</Link></td><td>{j.plate} <span className="mute">{j.make} {j.model}</span></td><td>{j.client}</td><td>{j.branch}</td><td>{j.mechanic || '—'}</td>
        <td><span className="badge">{t(STATUS_LABEL[j.status])}</span></td><td>{fdate(j.created_at)}</td><td>{seesMoney(user, j.branch_id) ? fmt(j.total) : '—'}</td></tr>))}
        {rows.length === 0 && <tr><td colSpan="8" className="mute">{t('No jobs found.')}</td></tr>}</tbody></table></div></>);
}
