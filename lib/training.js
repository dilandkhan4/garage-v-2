import { q1, q } from './db';
// Progress snapshot used for dashboards, school reports and the frozen record when a student leaves.
export async function progressOf(enrollmentId, db = { q, q1 }) {
  const e = await db.q1('select * from enrollments where id=$1', [enrollmentId]);
  const total = (await db.q1('select count(*)::int c from skills where program_id=$1', [e.program_id])).c;
  const signed = (await db.q1('select count(*)::int c from skill_signoffs where enrollment_id=$1', [enrollmentId])).c;
  const att = await db.q1(`select count(*) filter (where status in ('present','late'))::int p, count(*)::int n from attendance where enrollment_id=$1`, [enrollmentId]);
  const tasks = await db.q1(`select count(*) filter (where status='approved')::int done, count(*)::int n from student_tasks where enrollment_id=$1`, [enrollmentId]);
  return { skills_total: total, skills_signed: signed, percent: total ? Math.round((signed / total) * 100) : 0, level: e.level,
    attendance_present: att.p, attendance_days: att.n, attendance_percent: att.n ? Math.round((att.p / att.n) * 100) : null, tasks_done: tasks.done, tasks_total: tasks.n };
}
// Level = 1 + number of consecutive fully signed-off levels.
export async function recomputeLevel(enrollmentId, db) {
  const e = await db.q1('select * from enrollments where id=$1', [enrollmentId]);
  const rows = await db.q(`select s.level, count(*)::int total, count(so.id)::int signed from skills s left join skill_signoffs so on so.skill_id=s.id and so.enrollment_id=$2 where s.program_id=$1 group by s.level order by s.level`, [e.program_id, enrollmentId]);
  let level = 1;
  for (const r of rows) { if (r.total === r.signed) level = r.level + 1; else break; }
  await db.q('update enrollments set level=$2 where id=$1', [enrollmentId, level]);
  return level;
}
export async function listEnrollments(where = 'true', params = []) {
  return q(`select e.*, u.full_name, u.email, p.name program, p.duration_weeks, b.name branch, sc.name school,
    (select count(*)::int from skills s where s.program_id=e.program_id) total,
    (select count(*)::int from skill_signoffs so where so.enrollment_id=e.id) signed,
    (select round(100.0*count(*) filter (where a.status in ('present','late'))/nullif(count(*),0))::int from attendance a where a.enrollment_id=e.id) att,
    (select count(*) filter (where t.status='approved')::int||'/'||count(*)::int from student_tasks t where t.enrollment_id=e.id) tasks,
    (select code from certificates c where c.enrollment_id=e.id and not c.revoked) cert
    from enrollments e join users u on u.id=e.student_id join programs p on p.id=e.program_id join branches b on b.id=e.branch_id left join schools sc on sc.id=e.school_id
    where ${where} order by e.id desc limit 300`, params);
}
