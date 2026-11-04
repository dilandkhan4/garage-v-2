import Link from 'next/link';
import { redirect } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdate, fdt, STATUS_LABEL } from '@/lib/util';
export const metadata = { title: 'Dashboard' };
export default async function Dashboard({ searchParams }) {
  const user = await requireUser(); const t = await getT(user); const sp = await searchParams; const role = user.role;
  if (['student', 'school_rep'].includes(role)) redirect('/app/training');
  const bIds = role === 'admin' ? null : user.branchIds;
  const Stat = ({ n, label, href, warn }) => { const c = (<div className="card" style={{ margin: 0 }}><div className="stat" style={warn && n > 0 ? { color: 'var(--warn)' } : undefined}>{n}</div><div className="mute">{label}</div></div>); return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{c}</Link> : c; };
  const count = async (sql, p = []) => (await q1(sql, p)).c;
  let body = null;

  if (role === 'client') {
    const due = await q(`select vp.name, vp.expires_on, vp.due_km, v.plate, v.id vid, v.mileage, (vp.expires_on - current_date) days from vehicle_parts vp join vehicles v on v.id=vp.vehicle_id where v.owner_id=$1 and vp.active and ((vp.expires_on is not null and vp.expires_on < current_date + 30) or (vp.due_km is not null and vp.due_km - v.mileage < 1000)) order by vp.expires_on nulls last limit 8`, [user.id]);
    const quotes = await q(`select j.id, v.plate from jobs j join vehicles v on v.id=j.vehicle_id where j.client_id=$1 and j.status='quoted'`, [user.id]);
    const unpaid = await q(`select id, number, total from invoices where client_id=$1 and status in ('issued','partial') order by id desc`, [user.id]);
    const veh = await count('select count(*)::int c from vehicles where owner_id=$1 and active', [user.id]);
    const open = await count("select count(*)::int c from jobs where client_id=$1 and status not in ('picked_up','cancelled')", [user.id]);
    body = (<><div className="grid g4"><Stat n={veh} label={t('My vehicles')} href="/app/vehicles" /><Stat n={open} label={t('Jobs in progress')} href="/app/jobs" /><Stat n={quotes.length} label={t('Quotes to approve')} href="/app/jobs" warn /><Stat n={unpaid.length} label={t('Unpaid invoices')} href="/app/invoices" warn /></div>
      {quotes.map((x) => <div className="alert" key={x.id}>{t('A quote for {plate} is waiting for your approval.', { plate: x.plate })} <Link href={`/app/jobs/${x.id}`}>{t('Review')}</Link></div>)}
      <h2>{t('Parts due soon')}</h2><div className="card tw"><table><tbody>{due.map((d, i) => (<tr key={i}><td><Link href={`/app/vehicles/${d.vid}`}>{d.plate}</Link></td><td>{d.name}</td><td>{d.expires_on ? `${fdate(d.expires_on)} (${d.days} ${t('days')})` : ''} {d.due_km != null ? `· ${t('at')} ${d.due_km.toLocaleString()} km` : ''}</td><td><Link className="btn sm" href="/app/appointments">{t('Book')}</Link></td></tr>))}
        {due.length === 0 && <tr><td className="mute">{t('Nothing due in the next 30 days.')}</td></tr>}</tbody></table></div></>);
  } else if (role === 'receptionist') {
    const appts = await q(`select a.*, v.plate, u.full_name client from appointments a join vehicles v on v.id=a.vehicle_id join users u on u.id=a.client_id where a.status='booked' and a.branch_id = any($1) and a.scheduled_at::date = current_date order by a.scheduled_at`, [bIds]);
    const inShop = await count("select count(*)::int c from jobs where branch_id = any($1) and status in ('checked_in','diagnosis','quoted','approved','in_progress','quality_check')", [bIds]);
    const waiting = await count("select count(*)::int c from jobs where branch_id = any($1) and status='quoted'", [bIds]);
    const ready = await count("select count(*)::int c from jobs where branch_id = any($1) and status in ('ready','invoiced','paid')", [bIds]);
    body = (<><div className="grid g4"><Stat n={appts.length} label={t('Appointments today')} href="/app/appointments" /><Stat n={inShop} label={t('Vehicles in the workshop')} href="/app/jobs" /><Stat n={waiting} label={t('Quotes awaiting approval')} href="/app/jobs?status=quoted" warn /><Stat n={ready} label={t('Ready / awaiting pickup')} href="/app/jobs" /></div>
      <h2>{t('Today')}</h2><div className="card tw"><table><tbody>{appts.map((a) => <tr key={a.id}><td>{fdt(a.scheduled_at)}</td><td>{a.plate}</td><td>{a.client}</td><td>{t(a.service_type)}</td></tr>)}{appts.length === 0 && <tr><td className="mute">{t('No appointments today.')}</td></tr>}</tbody></table></div></>);
  } else if (role === 'mechanic') {
    const jobs = await q(`select j.id, j.status, v.plate, v.make, v.model from jobs j join vehicles v on v.id=j.vehicle_id where j.mechanic_id=$1 and j.status in ('checked_in','diagnosis','quoted','approved','in_progress','quality_check') order by j.id`, [user.id]);
    const unassigned = await count("select count(*)::int c from jobs where branch_id = any($1) and mechanic_id is null and status in ('checked_in','diagnosis')", [bIds]);
    body = (<><div className="grid g4"><Stat n={jobs.length} label={t('My open jobs')} href="/app/jobs?scope=mine" /><Stat n={unassigned} label={t('Unassigned at my branch')} href="/app/jobs" /></div>
      <h2>{t('My jobs')}</h2><div className="card tw"><table><tbody>{jobs.map((j) => <tr key={j.id}><td><Link href={`/app/jobs/${j.id}`}>#{j.id}</Link></td><td>{j.plate} {j.make} {j.model}</td><td><span className="badge">{t(STATUS_LABEL[j.status])}</span></td></tr>)}{jobs.length === 0 && <tr><td className="mute">{t('No jobs assigned.')}</td></tr>}</tbody></table></div></>);
  } else if (role === 'storekeeper') {
    const low = await q(`select p.name, st.qty, st.reorder_level from stock st join parts p on p.id=st.part_id where st.branch_id = any($1) and st.qty <= st.reorder_level order by st.qty limit 10`, [bIds]);
    const tr = await count("select count(*)::int c from stock_transfers where status='requested' and from_branch = any($1)", [bIds]);
    const po = await count("select count(*)::int c from purchase_orders where status='ordered' and branch_id = any($1)", [bIds]);
    body = (<><div className="grid g4"><Stat n={low.length} label={t('Low-stock parts')} href="/app/inventory?low=1" warn /><Stat n={tr} label={t('Transfer requests to answer')} href="/app/transfers" warn /><Stat n={po} label={t('Purchase orders to receive')} href="/app/purchasing" /></div>
      <h2>{t('Running low')}</h2><div className="card tw"><table><tbody>{low.map((l, i) => <tr key={i}><td>{l.name}</td><td><span className="badge warn">{l.qty}</span></td><td className="mute">{t('reorder at')} {l.reorder_level}</td></tr>)}{low.length === 0 && <tr><td className="mute">{t('Stock levels are fine.')}</td></tr>}</tbody></table></div></>);
  } else if (role === 'cashier') {
    const unpaid = await q(`select i.id, i.number, i.total, i.customer_name from invoices i where i.branch_id = any($1) and i.status in ('issued','partial') order by i.id desc limit 10`, [bIds]);
    const today = await q1(`select coalesce(sum(amount),0)::int s from payments where status='succeeded' and branch_id = any($1) and confirmed_at::date = current_date`, [bIds]);
    const pend = await count("select count(*)::int c from payments where status='pending' and branch_id = any($1)", [bIds]);
    body = (<><div className="grid g4"><Stat n={fmt(today.s)} label={t('Collected today')} /><Stat n={unpaid.length} label={t('Unpaid invoices')} href="/app/invoices?status=issued" warn /><Stat n={pend} label={t('Payments waiting for confirmation')} warn /></div>
      <h2>{t('Waiting for payment')}</h2><div className="card tw"><table><tbody>{unpaid.map((i) => <tr key={i.id}><td><Link href={`/app/invoices/${i.id}`}>{i.number}</Link></td><td>{i.customer_name}</td><td>{fmt(i.total)}</td></tr>)}{unpaid.length === 0 && <tr><td className="mute">—</td></tr>}</tbody></table></div></>);
  } else if (role === 'instructor') {
    const mine = await q(`select count(*)::int c from enrollments where status='active' and branch_id = any($1)`, [bIds]);
    const review = await count(`select count(*)::int c from student_tasks t join enrollments e on e.id=t.enrollment_id where t.status='submitted' and e.branch_id = any($1)`, [bIds]);
    const att = await count(`select count(*)::int c from enrollments e where e.status='active' and e.branch_id = any($1) and not exists(select 1 from attendance a where a.enrollment_id=e.id and a.day=current_date)`, [bIds]);
    body = (<div className="grid g4"><Stat n={mine[0].c} label={t('Active students')} href="/app/training" /><Stat n={review} label={t('Tasks to review')} href="/app/training" warn /><Stat n={att} label={t('Attendance not taken today')} href="/app/training/attendance" warn /></div>);
  } else {
    const rev = await q1(`select coalesce(sum(amount),0)::int s from payments where status='succeeded' and ($1::int[] is null or branch_id = any($1)) and confirmed_at > now() - interval '30 days'`, [bIds]);
    const open = await count(`select count(*)::int c from jobs where status not in ('picked_up','cancelled') and ($1::int[] is null or branch_id = any($1))`, [bIds]);
    const appr = await count(`select (select count(*) from approvals where status='pending' and ($1::boolean or kind='cross_branch_write'))::int + (select count(*) from job_corrections where status='pending')::int c`, [role === 'admin']);
    const low = await count(`select count(*)::int c from stock where qty <= reorder_level and ($1::int[] is null or branch_id = any($1))`, [bIds]);
    const studs = await count(`select count(*)::int c from enrollments where status in ('active') and ($1::int[] is null or branch_id = any($1))`, [bIds]);
    const apps = await count(`select count(*)::int c from enrollments where status='applied' and ($1::int[] is null or branch_id = any($1))`, [bIds]);
    const per = role === 'admin' ? await q(`select b.name, (select coalesce(sum(p.amount),0)::int from payments p where p.branch_id=b.id and p.status='succeeded' and p.confirmed_at > now() - interval '30 days') revenue,
        (select count(*)::int from jobs j where j.branch_id=b.id and j.status not in ('picked_up','cancelled')) open_jobs, (select count(*)::int from enrollments e where e.branch_id=b.id and e.status='active') students from branches b where b.active order by b.id`) : [];
    body = (<><div className="grid g4"><Stat n={fmt(rev.s)} label={t('Revenue, last 30 days')} href="/app/reports" /><Stat n={open} label={t('Open jobs')} href="/app/jobs" /><Stat n={appr} label={t('Waiting for your approval')} href="/app/approvals" warn /><Stat n={low} label={t('Low-stock lines')} href="/app/inventory?low=1" warn /><Stat n={studs} label={t('Active students')} href="/app/training" /><Stat n={apps} label={t('Training applications')} href="/app/training" warn /></div>
      {per.length > 0 && (<><h2>{t('Branches (last 30 days)')}</h2><div className="card tw"><table><thead><tr><th>{t('Branch')}</th><th>{t('Revenue')}</th><th>{t('Open jobs')}</th><th>{t('Students')}</th></tr></thead><tbody>{per.map((b) => <tr key={b.name}><td>{b.name}</td><td>{fmt(b.revenue)}</td><td>{b.open_jobs}</td><td>{b.students}</td></tr>)}</tbody></table></div></>)}</>);
  }
  return (<><h1>{t('Welcome')}, {user.full_name.split(' ')[0]}</h1>
    {sp.denied && <div className="alert bad">{t('You do not have access to that page.')}</div>}{body}</>);
}
