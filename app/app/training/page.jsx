import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdate } from '@/lib/util';
import { listEnrollments } from '@/lib/training';
import Flash from '@/components/Flash';
import PrintButton from '@/components/PrintButton';
import { decideAdmission, registerSchoolStudents, submitTask, saveMyProfile, setListing } from '@/actions/training';
import ActBtn from '@/components/ActBtn';
export const metadata = { title: 'Training' };
const stBadge = { applied: 'warn', active: 'info', graduated: 'ok', dropped: 'bad', failed: 'bad', transferred: '' };
export default async function Training({ searchParams }) {
  const user = await requireUser(['instructor', 'student', 'school_rep', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams; const role = user.role;
  const Bar = ({ e }) => (<div style={{ minWidth: 120 }}><div style={{ height: 8, background: 'var(--line)', borderRadius: 99 }}><div style={{ height: 8, width: `${e.total ? Math.round(100 * e.signed / e.total) : 0}%`, background: 'var(--ok)', borderRadius: 99 }} /></div><span className="mute">{e.signed}/{e.total} {t('skills')}</span></div>);
  const Table = ({ rows, school }) => (<div className="card tw"><table><thead><tr><th>{t('Student')}</th><th>{t('Program')}</th>{!school && <th>{t('Branch')}</th>}<th>{t('Progress')}</th><th>{t('Level')}</th><th>{t('Attendance')}</th><th>{t('Tasks')}</th><th>{t('Status')}</th></tr></thead><tbody>
    {rows.map((e) => (<tr key={e.id}><td>{school ? e.full_name : <Link href={`/app/training/${e.id}`}>{e.full_name}</Link>}{e.is_minor && <span className="badge" style={{ marginLeft: 6 }}>&lt;18</span>}</td><td>{e.program}</td>{!school && <td>{e.branch}</td>}<td><Bar e={e} /></td><td>L{e.level}</td><td>{e.att != null ? `${e.att}%` : '—'}</td><td>{e.tasks}</td>
      <td><span className={`badge ${stBadge[e.status]}`}>{t(e.status)}</span>{e.cert && <div><Link href={`/verify/${e.cert}`}>{t('Certificate')}</Link></div>}</td></tr>))}
    {rows.length === 0 && <tr><td colSpan="8" className="mute">{t('Nobody here yet.')}</td></tr>}</tbody></table></div>);

  if (role === 'student') {
    const mine = await listEnrollments('e.student_id=$1', [user.id]);
    const tasks = await q(`select t.*, e.status es, p.name program from student_tasks t join enrollments e on e.id=t.enrollment_id join programs p on p.id=e.program_id where e.student_id=$1 order by t.id desc`, [user.id]);
    const prof = await q('select * from graduate_profiles where user_id=$1', [user.id]);
    const gp = prof[0];
    return (<><h1>{t('My training')}</h1><Flash sp={sp} t={t} />
      {mine.map((e) => (<div className="card" key={e.id}><div className="row"><h3 className="grow" style={{ margin: 0 }}>{e.program} <span className="mute">· {e.branch}</span></h3><span className={`badge ${stBadge[e.status]}`}>{t(e.status)}</span></div>
        <div className="grid g4" style={{ marginTop: 10 }}><div><div className="stat">{e.total ? Math.round(100 * e.signed / e.total) : 0}%</div><div className="mute">{e.signed}/{e.total} {t('skills signed off')}</div></div><div><div className="stat">L{e.level}</div><div className="mute">{t('current level')}</div></div><div><div className="stat">{e.att != null ? `${e.att}%` : '—'}</div><div className="mute">{t('attendance')}</div></div><div><div className="stat">{e.tasks}</div><div className="mute">{t('tasks approved')}</div></div></div>
        <p><Link className="btn sm" href={`/app/training/${e.id}`}>{t('See what I still have to cover')}</Link> {e.cert && <Link className="btn sm alt" href={`/verify/${e.cert}`}>{t('My certificate')}</Link>}</p>
        {e.status === 'applied' && <div className="alert">{t('Your application is waiting for admission by the branch.')}</div>}
        {['dropped', 'failed', 'transferred'].includes(e.status) && <div className="alert">{t('This record is closed: {status}.', { status: t(e.status) })} {e.exit_note}</div>}</div>))}
      <h2>{t('My tasks')}</h2><div className="card tw"><table><thead><tr><th>{t('Task')}</th><th>{t('Due')}</th><th>{t('Status')}</th><th /></tr></thead><tbody>
        {tasks.map((k) => (<tr key={k.id}><td><b>{k.title}</b><div className="mute">{k.description}</div>{k.feedback && <div>{t('Feedback')}: {k.feedback}</div>}</td><td>{fdate(k.due_date)}</td><td><span className="badge">{t(k.status)}</span></td>
          <td>{['assigned', 'rework'].includes(k.status) && k.es === 'active' && (<form action={submitTask} className="row"><input type="hidden" name="id" value={k.id} /><input name="submission" placeholder={t('What you did / link')} /><button className="btn sm">{t('Submit')}</button></form>)}</td></tr>))}
        {tasks.length === 0 && <tr><td colSpan="4" className="mute">{t('No tasks yet.')}</td></tr>}</tbody></table></div>
      {mine.some((e) => e.status === 'graduated') && (<><h2>{t('My public graduate profile')}</h2><form action={saveMyProfile} className="card f" style={{ maxWidth: 560 }}>
        <input name="headline" placeholder={t('Headline, e.g. Engine and electrical technician')} defaultValue={gp?.headline || ''} /><textarea name="skills" placeholder={t('Skills')} defaultValue={gp?.skills || ''} /><input name="photo_url" placeholder={t('Photo link')} defaultValue={gp?.photo_url || ''} />
        <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="phone_public" defaultChecked={gp?.phone_public} /> {t('Show my phone number to employers')}</label><button className="btn sm">{t('Save profile')}</button></form>
        <form action={setListing} className="row"><input type="hidden" name="listed" value={gp?.listed ? '0' : '1'} /><button className="btn sm ghost">{gp?.listed ? t('Remove me from the graduates page') : t('List me on the graduates page')}</button></form></>)}</>);
  }

  if (role === 'school_rep') {
    const school = await q('select * from schools where id=$1', [user.school_id]); const sc = school[0];
    const rows = await listEnrollments('e.school_id=$1', [user.school_id]);
    const branches = await q(`select b.id, b.name, coalesce(l.max_students,0) max, (select count(*)::int from enrollments e where e.school_id=$1 and e.branch_id=b.id and e.status in ('applied','active')) used from branches b left join school_branch_limits l on l.branch_id=b.id and l.school_id=$1 where b.active order by b.id`, [user.school_id]);
    const programs = await q('select id,name from programs where active order by name');
    const creds = sp.creds ? sp.creds.split(';').map((c) => c.split(':')) : [];
    return (<><h1>{sc?.name || t('My school')}</h1><Flash sp={sp} t={t} />
      {creds.length > 0 && (<div className="alert"><b>{t('Temporary passwords (shown once). Give each student theirs.')}</b><table><tbody>{creds.map(([e, p]) => <tr key={e}><td>{e}</td><td><b>{p}</b></td></tr>)}</tbody></table></div>)}
      <div className="grid g3">{branches.map((b) => <div className="card" key={b.id}><b>{b.name}</b><div className="stat">{b.used}/{b.max}</div><div className="mute">{t('student places used')}</div></div>)}</div>
      <div className="row"><h2 className="grow">{t('Progress report')}</h2><PrintButton label={t('Print report')} /></div><Table rows={rows} school />
      <form action={registerSchoolStudents} className="card f noprint"><h3>{t('Register students')}</h3>
        <div className="grid g2"><label>{t('Branch')}<select name="branch_id">{branches.filter((b) => b.max > 0).map((b) => <option key={b.id} value={b.id}>{b.name} ({b.used}/{b.max})</option>)}</select></label><label>{t('Program')}<select name="program_id">{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
        <label>{t('One student per line: full name, email, phone, under 18? (yes/no), guardian name, guardian phone')}<textarea name="students" rows={6} placeholder={'Jean Mballa, jean@example.com, +237 6..., no\nAmina Bello, amina@example.com, +237 6..., yes, Mrs Bello, +237 6...'} /></label>
        <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="confirm" /> {t('I confirm these students accepted the terms (including appearing on the graduates page after graduating) and parents of under-18 students gave consent.')}</label>
        <button className="btn alt">{t('Register')}</button></form></>);
  }

  const branchWhere = role === 'admin' ? 'true' : 'e.branch_id = any($1)'; const bp = role === 'admin' ? [] : [user.branchIds];
  const applied = (role === 'manager' || role === 'admin') ? await listEnrollments(`${branchWhere} and e.status='applied'`, bp) : [];
  const active = await listEnrollments(`${branchWhere} and e.status='active'`, bp);
  const recent = await listEnrollments(`${branchWhere} and e.status in ('graduated','dropped','failed','transferred')`, bp);
  return (<><div className="row"><h1 className="grow">{t('Training')}</h1><Link className="btn" href="/app/training/attendance">{t('Take attendance')}</Link>{['manager', 'admin'].includes(role) && <Link className="btn" href="/app/training/programs">{t('Programs & skills')}</Link>}</div><Flash sp={sp} t={t} />
    {applied.length > 0 && (<><h2>{t('Applications waiting')}</h2><div className="card tw"><table><tbody>{applied.map((e) => (<tr key={e.id}><td><b>{e.full_name}</b> {e.is_minor && <span className="badge">&lt;18</span>}<div className="mute">{e.email}</div></td><td>{e.program} · {e.branch}</td><td>{e.school || t('Individual')}</td>
      <td><form action={decideAdmission} className="row"><input type="hidden" name="id" value={e.id} /><ActBtn className="btn sm ok" name="act" value="admit">{t('Admit')}</ActBtn><ActBtn className="btn sm ghost" name="act" value="decline">{t('Decline')}</ActBtn></form></td></tr>))}</tbody></table></div></>)}
    <h2>{t('Active students')}</h2><Table rows={active} />
    <h2>{t('Graduated and closed records')}</h2><Table rows={recent} /></>);
}
