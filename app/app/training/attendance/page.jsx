import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { saveAttendance } from '@/actions/training';
export const metadata = { title: 'Attendance' };
export default async function Attendance({ searchParams }) {
  const user = await requireUser(['instructor', 'manager', 'admin']); const t = await getT(user); const sp = await searchParams;
  const day = sp.day || new Date().toISOString().slice(0, 10);
  const rows = await q(`select e.id, u.full_name, p.name program, b.name branch, a.status from enrollments e join users u on u.id=e.student_id join programs p on p.id=e.program_id join branches b on b.id=e.branch_id
     left join attendance a on a.enrollment_id=e.id and a.day=$1 where e.status='active' and ($2::int[] is null or e.branch_id = any($2)) order by b.name, p.name, u.full_name`, [day, user.role === 'admin' ? null : user.branchIds]);
  return (<><h1>{t('Attendance')}</h1><Flash sp={sp} t={t} />
    <form className="card row"><input type="date" name="day" defaultValue={day} /><button className="btn sm">{t('Show')}</button></form>
    <form action={saveAttendance}><input type="hidden" name="day" value={day} /><div className="card tw"><table><thead><tr><th>{t('Student')}</th><th>{t('Program')}</th><th>{t('Branch')}</th><th>{t('Present')}</th><th>{t('Late')}</th><th>{t('Absent')}</th></tr></thead><tbody>
      {rows.map((r) => (<tr key={r.id}><td>{r.full_name}</td><td>{r.program}</td><td>{r.branch}</td>{['present', 'late', 'absent'].map((s) => <td key={s}><input type="radio" name={`att_${r.id}`} value={s} defaultChecked={r.status === s} /></td>)}</tr>))}
      {rows.length === 0 && <tr><td colSpan="6" className="mute">{t('No active students.')}</td></tr>}</tbody></table></div><button className="btn alt">{t('Save attendance')}</button></form></>);
}
