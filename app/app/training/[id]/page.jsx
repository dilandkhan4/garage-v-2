import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdate } from '@/lib/util';
import { listEnrollments } from '@/lib/training';
import Flash from '@/components/Flash';
import * as A from '@/actions/training';
import ActBtn from '@/components/ActBtn';
export default async function EnrollmentDetail({ params, searchParams }) {
  const user = await requireUser(['instructor', 'student', 'manager', 'admin']);
  const { id } = await params; const sp = await searchParams; const t = await getT(user);
  const [e] = await listEnrollments('e.id=$1', [id]);
  if (!e || (user.role === 'student' && e.student_id !== user.id)) notFound();
  const teach = ['instructor', 'manager', 'admin'].includes(user.role) && ownsBranch(user, e.branch_id);
  const mgr = ['manager', 'admin'].includes(user.role);
  const open = e.status === 'active';
  const skills = await q(`select s.*, so.signed_at, u.full_name signer, so.note from skills s left join skill_signoffs so on so.skill_id=s.id and so.enrollment_id=$2 left join users u on u.id=so.signed_by where s.program_id=$1 order by s.level, s.position`, [e.program_id, e.id]);
  const att = await q('select * from attendance where enrollment_id=$1 order by day desc limit 30', [e.id]);
  const tasks = await q('select * from student_tasks where enrollment_id=$1 order by id desc', [e.id]);
  const cert = await q1('select * from certificates where enrollment_id=$1', [e.id]);
  const levels = [...new Set(skills.map((s) => s.level))];
  const H = ({ n, v }) => <input type="hidden" name={n} value={v} />;
  return (<>
    <div className="row"><h1 className="grow">{e.full_name} <span className="mute">· {e.program}</span></h1><span className="badge info">{t(e.status)}</span></div><Flash sp={sp} t={t} />
    <div className="grid g4"><div className="card"><div className="stat">{e.total ? Math.round(100 * e.signed / e.total) : 0}%</div><div className="mute">{e.signed}/{e.total} {t('skills')}</div></div><div className="card"><div className="stat">L{e.level}</div><div className="mute">{t('level')}</div></div>
      <div className="card"><div className="stat">{e.att != null ? `${e.att}%` : '—'}</div><div className="mute">{t('attendance')}</div></div><div className="card"><div className="stat">{e.tasks}</div><div className="mute">{t('tasks approved')}</div></div></div>
    <div className="card"><table><tbody><tr><th>{t('Branch')}</th><td>{e.branch}</td><th>{t('Started')}</th><td>{fdate(e.start_date)}</td><th>{t('Planned length')}</th><td>{e.duration_weeks} {t('weeks')}</td></tr>
      {teach && e.is_minor && <tr><th>{t('Guardian')}</th><td colSpan="5">{e.guardian_name} · {e.guardian_phone} · {e.guardian_consent ? t('consent recorded') : t('NO consent')}</td></tr>}
      {e.school && <tr><th>{t('School')}</th><td colSpan="5">{e.school}</td></tr>}{e.exit_note && <tr><th>{t('Note')}</th><td colSpan="5">{e.exit_note}</td></tr>}</tbody></table>
      {cert && <p><Link className="btn alt" href={`/verify/${cert.code}`}>{t('Certificate')} {cert.code}</Link> {cert.revoked && <span className="badge bad">{t('revoked')}</span>}</p>}</div>
    <h2>{t('Skills to cover')}</h2>
    {levels.map((lv) => (<div className="card" key={lv}><h3>{t('Level')} {lv}</h3><table><tbody>{skills.filter((s) => s.level === lv).map((s) => (<tr key={s.id}>
      <td style={{ width: 28 }}>{s.signed_at ? '✅' : '⬜'}</td><td>{t.locale === 'fr' && s.name_fr ? s.name_fr : s.name}{s.note && <div className="mute">{s.note}</div>}</td>
      <td className="mute">{s.signed_at ? `${s.signer} · ${fdate(s.signed_at)}` : t('not yet signed off')}</td>
      <td>{teach && open && !s.signed_at && (<form action={A.signOffSkill} className="row"><H n="enrollment_id" v={e.id} /><H n="skill_id" v={s.id} /><input name="note" placeholder={t('Note (optional)')} style={{ width: 160 }} /><button className="btn sm ok">{t('Sign off')}</button></form>)}</td></tr>))}</tbody></table></div>))}
    {skills.length === 0 && <div className="card mute">{t('This program has no skills yet.')}</div>}
    <h2>{t('Tasks')}</h2>
    <div className="card tw"><table><tbody>{tasks.map((k) => (<tr key={k.id}><td><b>{k.title}</b><div className="mute">{k.description}</div>{k.submission && <div>{t('Submitted')}: {k.submission}</div>}{k.feedback && <div>{t('Feedback')}: {k.feedback}</div>}</td><td>{fdate(k.due_date)}</td><td><span className="badge">{t(k.status)}</span></td>
      <td>{teach && open && k.status === 'submitted' && (<form action={A.reviewTask} className="row"><H n="id" v={k.id} /><input name="feedback" placeholder={t('Feedback')} /><ActBtn className="btn sm ok" name="act" value="approve">{t('Approve')}</ActBtn><ActBtn className="btn sm ghost" name="act" value="rework">{t('Rework')}</ActBtn></form>)}</td></tr>))}
      {tasks.length === 0 && <tr><td className="mute">{t('No tasks yet.')}</td></tr>}</tbody></table>
      {teach && open && (<form action={A.assignTask} className="f" style={{ marginTop: 10 }}><H n="enrollment_id" v={e.id} /><div className="grid g3"><input name="title" placeholder={t('Task title')} required /><input name="description" placeholder={t('Instructions')} /><input name="due_date" type="date" /></div><button className="btn sm">{t('Assign task')}</button></form>)}</div>
    <h2>{t('Attendance')}</h2><div className="card">{att.length ? att.map((a) => <span key={a.id} className={`badge ${a.status === 'present' ? 'ok' : a.status === 'late' ? 'warn' : 'bad'}`} style={{ margin: 2 }}>{fdate(a.day)} · {t(a.status)}</span>) : <span className="mute">—</span>}</div>
    {teach && open && (<><h2>{t('Close this record')}</h2><div className="grid g2">
      <form action={A.graduate} className="card f"><H n="enrollment_id" v={e.id} /><h3>{t('Graduate and issue certificate')}</h3><input name="note" placeholder={t('Note (optional)')} />
        {mgr && <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="override" /> {t('Manager override: graduate even if skills remain')}</label>}<button className="btn ok">{t('Graduate')}</button></form>
      <form action={A.exitStudent} className="card f"><H n="enrollment_id" v={e.id} /><h3>{t('Student leaves')}</h3><select name="status"><option value="dropped">{t('Dropped out')}</option><option value="failed">{t('Did not pass')}</option><option value="transferred">{t('Transferred')}</option></select><input name="note" placeholder={t('Reason')} />
        <button className="btn bad">{t('Close record as it stands')}</button><div className="mute">{t('The progress so far is kept exactly as it was and marked with the reason.')}</div></form></div></>)}
    {e.exit_snapshot && !open && (<><h2>{t('Record when closed')}</h2><div className="card mute">{JSON.stringify(e.exit_snapshot)}</div></>)}
  </>);
}
