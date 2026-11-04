'use server';
import { redirect } from 'next/navigation';
import { q, q1, tx } from '@/lib/db';
import { requireUser, ownsBranch, isAdmin, hashPassword, createSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, guard } from '@/lib/guard';
import { str, int, back, randomPassword } from '@/lib/util';
import { notify } from '@/lib/notify';
import { progressOf, recomputeLevel } from '@/lib/training';
import crypto from 'node:crypto';

const TEACH = ['instructor', 'manager', 'admin'];
const MGR = ['manager', 'admin'];

// ---------- programs & skills ----------
export async function saveProgram(fd) {
  const u = await requireUser(MGR);
  const id = int(fd, 'id'); const v = [str(fd, 'name'), str(fd, 'name_fr') || null, str(fd, 'description') || null, int(fd, 'duration_weeks', 12), int(fd, 'real_work_level', 3)];
  if (!v[0]) redirect(back('/app/training/programs', 'err', 'Program name is required.'));
  if (id) await q('update programs set name=$2,name_fr=$3,description=$4,duration_weeks=$5,real_work_level=$6,active=$7 where id=$1', [id, ...v, fd.get('active') === 'on']);
  else await q('insert into programs(name,name_fr,description,duration_weeks,real_work_level,created_by) values ($1,$2,$3,$4,$5,$6)', [...v, u.id]);
  await audit(u.id, 'program_saved', 'program', id, { name: v[0], weeks: v[3] });
  redirect(back('/app/training/programs', 'ok', 'Program saved.'));
}
export async function addSkill(fd) {
  const u = await requireUser(MGR);
  const pid = int(fd, 'program_id');
  if (!str(fd, 'name')) redirect('/app/training/programs');
  const pos = (await q1('select coalesce(max(position),0)+1 p from skills where program_id=$1', [pid])).p;
  await q('insert into skills(program_id,name,name_fr,level,position) values ($1,$2,$3,$4,$5)', [pid, str(fd, 'name'), str(fd, 'name_fr') || null, int(fd, 'level', 1), pos]);
  await audit(u.id, 'skill_added', 'program', pid, { name: str(fd, 'name') });
  redirect(back('/app/training/programs', 'ok', 'Skill added.'));
}
export async function removeSkill(fd) {
  const u = await requireUser(MGR);
  const sid = int(fd, 'id');
  if ((await q1('select count(*)::int c from skill_signoffs where skill_id=$1', [sid])).c) redirect(back('/app/training/programs', 'err', 'This skill already has sign-offs and cannot be deleted.'));
  await q('delete from skills where id=$1', [sid]); await audit(u.id, 'skill_removed', 'skill', sid);
  redirect(back('/app/training/programs', 'ok', 'Skill removed.'));
}

// ---------- applications & school registration ----------
async function schoolLimitOk(db, schoolId, branchId, adding) {
  if (!schoolId) return;
  const lim = await db.q1('select max_students from school_branch_limits where school_id=$1 and branch_id=$2', [schoolId, branchId]);
  const max = lim?.max_students ?? 0;
  const used = (await db.q1(`select count(*)::int c from enrollments where school_id=$1 and branch_id=$2 and status in ('applied','active')`, [schoolId, branchId])).c;
  if (used + adding > max) fail(`This school's limit at this branch is ${max} students (${used} already enrolled). Ask the branch to raise the limit.`);
}

export async function applyForTraining(fd) {
  const email = str(fd, 'email').toLowerCase(); const pw = str(fd, 'password'); const minor = fd.get('is_minor') === 'on';
  const err = (m) => redirect(back('/training', 'err', m) + '#apply');
  if (!email.includes('@') || pw.length < 8 || !str(fd, 'full_name')) err('Please fill name, email and a password of at least 8 characters.');
  if (fd.get('terms') !== 'on') err('You must accept the terms, including appearing on the graduates page after you graduate.');
  if (minor && (!str(fd, 'guardian_name') || !str(fd, 'guardian_phone') || fd.get('guardian_consent') !== 'on')) err('For students under 18, a parent or guardian’s name, phone and consent are required.');
  if (await q1('select 1 from users where lower(email)=$1', [email])) err('This email already has an account. Log in to apply from your account.');
  const u = await tx(async (db) => {
    const nu = await db.q1(`insert into users(email,phone,password_hash,full_name,role,branch_id) values ($1,$2,$3,$4,'student',$5) returning id`, [email, str(fd, 'phone'), hashPassword(pw), str(fd, 'full_name'), int(fd, 'branch_id')]);
    await db.q(`insert into enrollments(student_id,program_id,branch_id,status,is_minor,guardian_name,guardian_phone,guardian_consent,terms_accepted_at) values ($1,$2,$3,'applied',$4,$5,$6,$7,now())`,
      [nu.id, int(fd, 'program_id'), int(fd, 'branch_id'), minor, str(fd, 'guardian_name') || null, str(fd, 'guardian_phone') || null, minor]);
    return nu;
  });
  await audit(u.id, 'training_application', 'user', u.id);
  const mgrs = await q("select id from users where active and role in ('manager','admin') and (role='admin' or branch_id=$1)", [int(fd, 'branch_id')]);
  for (const m of mgrs) await notify(m.id, { kind: 'training', subject: 'New training application', body: `${str(fd, 'full_name')} applied for a training program.`, link: '/app/training', channels: ['inapp'] });
  await createSession(u.id);
  redirect('/app/training');
}

export async function registerSchoolStudents(fd) {
  const u = await requireUser(['school_rep']);
  const branch = int(fd, 'branch_id'), program = int(fd, 'program_id'); const path = '/app/training';
  const lines = str(fd, 'students').split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((r) => r[0] && r[1]);
  if (!lines.length) redirect(back(path, 'err', 'Add one student per line: full name, email, phone, under18 (yes/no), guardian name, guardian phone.'));
  if (fd.get('confirm') !== 'on') redirect(back(path, 'err', 'Confirm that the students agreed to the terms and parents of under-18 students gave consent.'));
  const creds = await guard(path, () => tx(async (db) => {
    await schoolLimitOk(db, u.school_id, branch, lines.length);
    const out = [];
    for (const [name, email, phone, minorRaw, gname, gphone] of lines) {
      const em = email.toLowerCase();
      if (await db.q1('select 1 from users where lower(email)=$1', [em])) fail(`The email ${em} already has an account.`);
      const minor = /^(y|yes|oui|true|1)/i.test(minorRaw || '');
      if (minor && (!gname || !gphone)) fail(`${name} is under 18: add guardian name and phone.`);
      const pw = randomPassword();
      const nu = await db.q1(`insert into users(email,phone,password_hash,full_name,role,branch_id,school_id) values ($1,$2,$3,$4,'student',$5,$6) returning id`, [em, phone || null, hashPassword(pw), name, branch, u.school_id]);
      await db.q(`insert into enrollments(student_id,program_id,branch_id,school_id,status,is_minor,guardian_name,guardian_phone,guardian_consent,terms_accepted_at) values ($1,$2,$3,$4,'applied',$5,$6,$7,$8,now())`, [nu.id, program, branch, u.school_id, minor, gname || null, gphone || null, minor]);
      out.push(`${em}:${pw}`);
    }
    return out;
  }));
  await audit(u.id, 'school_students_registered', 'school', u.school_id, { count: creds.length });
  redirect(back(path, 'ok', `${creds.length} students registered. The branch will admit them.`, `&creds=${encodeURIComponent(creds.join(';'))}`));
}

export async function decideAdmission(fd) {
  const u = await requireUser(MGR);
  const id = int(fd, 'id'); const admit = str(fd, 'act') === 'admit';
  await guard('/app/training', () => tx(async (db) => {
    const e = await db.q1("select * from enrollments where id=$1 and status='applied' for update", [id]);
    if (!e || !ownsBranch(u, e.branch_id)) fail('Not allowed.');
    if (admit) await schoolLimitOk(db, e.school_id, e.branch_id, 0);
    await db.q('update enrollments set status=$2, start_date=current_date, exit_note=$3 where id=$1', [id, admit ? 'active' : 'dropped', admit ? null : 'Application declined']);
    await db.q(`insert into notifications(user_id,kind,subject,body,link) values ($1,'training',$2,$3,'/app/training')`, [e.student_id, admit ? 'Welcome to the training program' : 'Application update', admit ? 'Your application was accepted. Your progress tracker is now open.' : 'Your application was not accepted this time.']);
  }));
  await audit(u.id, admit ? 'admitted' : 'application_declined', 'enrollment', id);
  redirect(back('/app/training', 'ok', admit ? 'Student admitted.' : 'Application declined.'));
}

// ---------- progress ----------
async function openEnrollment(db, id) {
  const e = await db.q1('select * from enrollments where id=$1', [id]);
  if (!e) fail('Enrollment not found.');
  if (e.status !== 'active') fail('This record is closed and cannot be changed.');
  return e;
}
export async function signOffSkill(fd) {
  const u = await requireUser(TEACH); const id = int(fd, 'enrollment_id'); const path = `/app/training/${id}`;
  await guard(path, () => tx(async (db) => {
    const e = await openEnrollment(db, id);
    if (!ownsBranch(u, e.branch_id)) fail('Only instructors at the student’s branch can sign off.');
    const s = await db.q1('select * from skills where id=$1 and program_id=$2', [int(fd, 'skill_id'), e.program_id]);
    if (!s) fail('Unknown skill.');
    await db.q(`insert into skill_signoffs(enrollment_id,skill_id,signed_by,note) values ($1,$2,$3,$4) on conflict do nothing`, [id, s.id, u.id, str(fd, 'note') || null]);
    await recomputeLevel(id, db);
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, 'skill_signed', 'enrollment', id, JSON.stringify({ skill: s.name })]);
  }));
  redirect(back(path, 'ok', 'Skill signed off.'));
}
export async function saveAttendance(fd) {
  const u = await requireUser(TEACH); const day = str(fd, 'day') || new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('att_') || !['present', 'absent', 'late'].includes(v)) continue;
    const e = await q1("select * from enrollments where id=$1 and status='active'", [Number(k.slice(4))]);
    if (!e || !ownsBranch(u, e.branch_id)) continue;
    await q(`insert into attendance(enrollment_id,day,status,marked_by) values ($1,$2,$3,$4) on conflict (enrollment_id,day) do update set status=excluded.status, marked_by=excluded.marked_by`, [e.id, day, v, u.id]); n++;
  }
  await audit(u.id, 'attendance_taken', 'attendance', day, { count: n });
  redirect(back(`/app/training/attendance?day=${day}`, 'ok', `Attendance saved for ${n} students.`));
}
export async function assignTask(fd) {
  const u = await requireUser(TEACH); const id = int(fd, 'enrollment_id'); const path = `/app/training/${id}`;
  await guard(path, () => tx(async (db) => {
    const e = await openEnrollment(db, id);
    if (!ownsBranch(u, e.branch_id)) fail('Not allowed.');
    if (!str(fd, 'title')) fail('Give the task a title.');
    await db.q('insert into student_tasks(enrollment_id,title,description,due_date,assigned_by) values ($1,$2,$3,$4,$5)', [id, str(fd, 'title'), str(fd, 'description') || null, str(fd, 'due_date') || null, u.id]);
    await db.q(`insert into notifications(user_id,kind,subject,body,link) values ($1,'training','New task',$2,'/app/training')`, [e.student_id, str(fd, 'title')]);
  }));
  redirect(back(path, 'ok', 'Task assigned.'));
}
export async function submitTask(fd) {
  const u = await requireUser(['student']);
  const t = await q1('select t.*, e.student_id, e.status es from student_tasks t join enrollments e on e.id=t.enrollment_id where t.id=$1', [int(fd, 'id')]);
  if (!t || t.student_id !== u.id || t.es !== 'active') redirect('/app/training');
  await q("update student_tasks set status='submitted', submission=$2 where id=$1", [t.id, str(fd, 'submission') || null]);
  redirect(back('/app/training', 'ok', 'Task submitted.'));
}
export async function reviewTask(fd) {
  const u = await requireUser(TEACH);
  const t = await q1('select t.*, e.branch_id, e.status es from student_tasks t join enrollments e on e.id=t.enrollment_id where t.id=$1', [int(fd, 'id')]);
  if (!t || !ownsBranch(u, t.branch_id) || t.es !== 'active') redirect('/app/training');
  await q('update student_tasks set status=$2, feedback=$3 where id=$1', [t.id, str(fd, 'act') === 'approve' ? 'approved' : 'rework', str(fd, 'feedback') || null]);
  redirect(back(`/app/training/${t.enrollment_id}`, 'ok', 'Task reviewed.'));
}

// ---------- graduation, exits, certificates ----------
export async function graduate(fd) {
  const u = await requireUser(TEACH); const id = int(fd, 'enrollment_id'); const path = `/app/training/${id}`;
  const code = await guard(path, () => tx(async (db) => {
    const e = await openEnrollment(db, id);
    if (!ownsBranch(u, e.branch_id)) fail('Not allowed.');
    const p = await progressOf(id, db);
    if (p.skills_signed < p.skills_total && !(MGR.includes(u.role) && fd.get('override') === 'on')) fail(`${p.skills_total - p.skills_signed} skills are still not signed off. A manager can override with a reason.`);
    const seq = (await db.q1("select nextval('certificate_seq')::int n")).n;
    const code = `AC-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await db.q("update enrollments set status='graduated', end_date=current_date, exit_snapshot=$2, note=$3 where id=$1", [id, JSON.stringify(p), str(fd, 'note') || null]);
    await db.q('insert into certificates(enrollment_id,code,issued_by) values ($1,$2,$3)', [id, code, u.id]);
    const names = (await db.q('select s.name from skill_signoffs so join skills s on s.id=so.skill_id where so.enrollment_id=$1 order by s.position', [id])).map((r) => r.name).join(', ');
    await db.q(`insert into graduate_profiles(user_id,skills) values ($1,$2) on conflict (user_id) do update set skills=excluded.skills`, [e.student_id, names]);
    await db.q(`insert into notifications(user_id,kind,subject,body,link) values ($1,'training','Congratulations, you graduated!','Your certificate is ready.',$2)`, [e.student_id, `/verify/${code}`]);
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, 'graduated', 'enrollment', id, JSON.stringify({ code })]);
    return code;
  }));
  redirect(back(path, 'ok', `Graduated. Certificate ${code} issued.`));
}
export async function exitStudent(fd) {
  const u = await requireUser(TEACH); const id = int(fd, 'enrollment_id'); const status = str(fd, 'status'); const path = `/app/training/${id}`;
  if (!['dropped', 'failed', 'transferred'].includes(status)) redirect(path);
  await guard(path, () => tx(async (db) => {
    const e = await openEnrollment(db, id);
    if (!ownsBranch(u, e.branch_id)) fail('Not allowed.');
    const p = await progressOf(id, db);
    await db.q('update enrollments set status=$2, end_date=current_date, exit_note=$3, exit_snapshot=$4 where id=$1', [id, status, str(fd, 'note') || null, JSON.stringify(p)]);
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, `student_${status}`, 'enrollment', id, JSON.stringify(p)]);
  }));
  redirect(back(path, 'ok', 'Record closed exactly as it stood and marked.'));
}
export async function revokeCertificate(fd) {
  const u = await requireUser(['admin']);
  await q('update certificates set revoked=not revoked where id=$1', [int(fd, 'id')]);
  await audit(u.id, 'certificate_revoke_toggled', 'certificate', int(fd, 'id'));
  redirect(back(str(fd, 'from') || '/app/graduates', 'ok', 'Certificate updated.'));
}

// ---------- graduates & hiring ----------
export async function saveMyProfile(fd) {
  const u = await requireUser(['student']);
  await q(`insert into graduate_profiles(user_id,headline,skills,photo_url,phone_public) values ($1,$2,$3,$4,$5) on conflict (user_id) do update set headline=excluded.headline, skills=excluded.skills, photo_url=excluded.photo_url, phone_public=excluded.phone_public`,
    [u.id, str(fd, 'headline') || null, str(fd, 'skills') || null, str(fd, 'photo_url') || null, fd.get('phone_public') === 'on']);
  redirect(back('/app/training', 'ok', 'Profile saved.'));
}
export async function setListing(fd) {
  const u = await requireUser(['student', 'manager', 'admin']);
  const uid = u.role === 'student' ? u.id : int(fd, 'user_id');
  await q('update graduate_profiles set listed=$2 where user_id=$1', [uid, fd.get('listed') === '1']);
  await audit(u.id, 'graduate_listing_changed', 'user', uid, { listed: fd.get('listed') === '1' });
  redirect(back(u.role === 'student' ? '/app/training' : '/app/graduates', 'ok', 'Listing updated.'));
}
export async function hireGraduate(fd) {
  const u = await requireUser(MGR);
  const uid = int(fd, 'user_id'); const role = str(fd, 'role');
  if (!['mechanic', 'receptionist', 'storekeeper', 'cashier', 'instructor'].includes(role)) redirect(back('/app/graduates', 'err', 'Choose the post.'));
  const s = await q1("select * from users where id=$1 and role='student'", [uid]);
  if (!s) redirect('/app/graduates');
  await tx(async (db) => {
    await db.q('update users set role=$2, branch_id=$3, school_id=null where id=$1', [uid, role, int(fd, 'branch_id') || u.branch_id]);
    await db.q('update graduate_profiles set hired=true, listed=false where user_id=$1', [uid]);
  });
  await audit(u.id, 'graduate_hired', 'user', uid, { role });
  await notify(uid, { kind: 'system', subject: 'Welcome to the team', body: `Your account is now a ${role} account. Log in again to see your new tools.`, channels: ['inapp', 'email'] });
  redirect(back('/app/graduates', 'ok', 'Student account converted to a worker account.'));
}
export async function submitEmployerRequest(fd) {
  const company = str(fd, 'company'), name = str(fd, 'contact_name');
  if (!company || !name || (!str(fd, 'email') && !str(fd, 'phone'))) redirect(back('/graduates', 'err', 'Company, contact name and an email or phone are required.'));
  await q('insert into employer_requests(company,contact_name,email,phone,message,graduate_user_id) values ($1,$2,$3,$4,$5,$6)', [company, name, str(fd, 'email') || null, str(fd, 'phone') || null, str(fd, 'message') || null, int(fd, 'graduate_user_id')]);
  const mgrs = await q("select id from users where active and role in ('manager','admin')");
  for (const m of mgrs) await notify(m.id, { kind: 'hiring', subject: 'New hiring request', body: `${company} asked about a graduate.`, link: '/app/graduates', channels: ['inapp'] });
  redirect(back('/graduates', 'ok', 'Thank you. We will contact you to arrange the introduction.'));
}
export async function updateEmployerRequest(fd) {
  await requireUser(MGR);
  await q('update employer_requests set status=$2 where id=$1', [int(fd, 'id'), str(fd, 'status')]);
  redirect(back('/app/graduates', 'ok', 'Updated.'));
}

// ---------- schools ----------
export async function saveSchool(fd) {
  const u = await requireUser(MGR);
  const id = int(fd, 'id');
  if (!str(fd, 'name')) redirect(back('/app/schools', 'err', 'School name is required.'));
  if (id) await q('update schools set name=$2, contact=$3, phone=$4, email=$5 where id=$1', [id, str(fd, 'name'), str(fd, 'contact'), str(fd, 'phone'), str(fd, 'email')]);
  else await q('insert into schools(name,contact,phone,email) values ($1,$2,$3,$4)', [str(fd, 'name'), str(fd, 'contact'), str(fd, 'phone'), str(fd, 'email')]);
  await audit(u.id, 'school_saved', 'school', id);
  redirect(back('/app/schools', 'ok', 'School saved.'));
}
export async function setSchoolLimit(fd) {
  const u = await requireUser(MGR);
  const branch = int(fd, 'branch_id');
  if (!ownsBranch(u, branch)) redirect(back('/app/schools', 'err', 'You can set limits for your own branch only.'));
  await q(`insert into school_branch_limits(school_id,branch_id,max_students) values ($1,$2,$3) on conflict (school_id,branch_id) do update set max_students=excluded.max_students`, [int(fd, 'school_id'), branch, int(fd, 'max', 0)]);
  await audit(u.id, 'school_limit_set', 'school', int(fd, 'school_id'), { branch, max: int(fd, 'max', 0) });
  redirect(back('/app/schools', 'ok', 'Limit saved.'));
}
