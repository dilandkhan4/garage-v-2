'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, q1, tx } from '@/lib/db';
import { requireUser, ownsBranch, isAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, guard } from '@/lib/guard';
import { str, int, num, back, addMonths, iso } from '@/lib/util';
import { notify, ALL_CHANNELS } from '@/lib/notify';
import { findInterval } from '@/lib/intervals';
import { getSetting } from '@/lib/settings';

const jobPath = (id) => `/app/jobs/${id}`;
const WORKERS = ['mechanic', 'manager', 'admin'];
const FRONT = ['receptionist', 'manager', 'admin'];
const canDecide = (u, branchId) => isAdmin(u) || (u.role === 'manager' && ownsBranch(u, branchId));

async function loadJob(id, db = { q1 }) { const j = await db.q1('select * from jobs where id=$1', [id]); if (!j) redirect('/app/jobs'); return j; }

// ---------- appointments ----------
export async function bookAppointment(fd) {
  const u = await requireUser(['client', 'receptionist', 'manager', 'admin']);
  const vehicleId = int(fd, 'vehicle_id');
  const v = await q1('select * from vehicles where id=$1', [vehicleId]);
  if (!v || (u.role === 'client' && v.owner_id !== u.id)) redirect('/app/appointments');
  const when = str(fd, 'scheduled_at');
  if (!when || new Date(when) < new Date(Date.now() - 3600e3)) redirect(back('/app/appointments', 'err', 'Choose a date and time in the future.'));
  await q(`insert into appointments(vehicle_id,client_id,branch_id,scheduled_at,service_type,notes,source) values ($1,$2,$3,$4,$5,$6,$7)`,
    [v.id, v.owner_id, int(fd, 'branch_id'), when, str(fd, 'service_type') || 'General service', str(fd, 'notes') || null, u.role === 'client' ? 'online' : (str(fd, 'source') || 'desk')]);
  await audit(u.id, 'appointment_booked', 'vehicle', v.id);
  redirect(back('/app/appointments', 'ok', 'Appointment booked.'));
}
export async function cancelAppointment(fd) {
  const u = await requireUser(['client', 'receptionist', 'manager', 'admin']);
  const a = await q1('select * from appointments where id=$1', [int(fd, 'id')]);
  if (a && (u.role !== 'client' || a.client_id === u.id)) await q("update appointments set status='cancelled' where id=$1 and status='booked'", [a.id]);
  redirect(back('/app/appointments', 'ok', 'Appointment cancelled.'));
}
export async function checkInAppointment(fd) {
  const u = await requireUser(FRONT);
  const a = await q1("select * from appointments where id=$1 and status='booked'", [int(fd, 'id')]);
  if (!a || !ownsBranch(u, a.branch_id)) redirect('/app/appointments');
  const job = await createJobRow({ vehicleId: a.vehicle_id, branchId: a.branch_id, mileage: int(fd, 'mileage'), service: a.service_type, appointmentId: a.id, by: u.id, complaint: a.notes });
  await q("update appointments set status='checked_in' where id=$1", [a.id]);
  redirect(back(jobPath(job.id), 'ok', 'Vehicle checked in.'));
}

async function createJobRow({ vehicleId, branchId, mileage, service, appointmentId = null, by, complaint = null, parent = null, warranty = false, extra = null }) {
  const v = await q1('select * from vehicles where id=$1', [vehicleId]);
  const km = mileage != null && mileage >= v.mileage ? mileage : v.mileage;
  if (km > v.mileage) await q('update vehicles set mileage=$2 where id=$1', [v.id, km]);
  const j = await q1(`insert into jobs(branch_id,vehicle_id,client_id,appointment_id,service_type,mileage_in,created_by,parent_job_id,warranty,extra_service)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [branchId, v.id, v.owner_id, appointmentId, service, km, by, parent, warranty, extra]);
  if (complaint) await q('insert into job_notes(job_id,author_id,branch_id,body) values ($1,$2,$3,$4)', [j.id, by, branchId, complaint]);
  await audit(by, 'job_created', 'job', j.id, { vehicle: v.plate });
  await notify(v.owner_id, { kind: 'job', subject: `Check-in: ${v.plate}`, body: `Your vehicle has been checked in (job #${j.id}).`, link: jobPath(j.id), channels: ['inapp', 'sms'] });
  return j;
}

export async function createJob(fd) {
  const u = await requireUser(['receptionist', 'manager', 'admin', 'mechanic']);
  const branchId = isAdmin(u) ? int(fd, 'branch_id') : (int(fd, 'branch_id') && u.branchIds.includes(int(fd, 'branch_id')) ? int(fd, 'branch_id') : u.branch_id);
  if (!branchId) redirect(back('/app/jobs/new', 'err', 'Choose a branch.'));
  const j = await createJobRow({ vehicleId: int(fd, 'vehicle_id'), branchId, mileage: int(fd, 'mileage'), service: str(fd, 'service_type') || 'General service',
    by: u.id, complaint: str(fd, 'complaint') || null, extra: str(fd, 'extra_service') || null });
  redirect(back(jobPath(j.id), 'ok', 'Vehicle checked in.'));
}

export async function createComeback(fd) {
  const u = await requireUser(['receptionist', 'manager', 'admin']);
  const old = await loadJob(int(fd, 'job_id'));
  const j = await createJobRow({ vehicleId: old.vehicle_id, branchId: ownsBranch(u, old.branch_id) ? old.branch_id : u.branch_id, mileage: null, service: `Warranty / comeback for job #${old.id}`,
    by: u.id, parent: old.id, warranty: true, complaint: str(fd, 'complaint') || null });
  redirect(back(jobPath(j.id), 'ok', 'Warranty job created and linked to the original job.'));
}

// ---------- job workflow ----------
export async function assignMechanic(fd) {
  const u = await requireUser(FRONT);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id)) redirect(jobPath(j.id));
  const m = await q1(`select id from users where id=$1 and role='mechanic' and active and (branch_id=$2 or exists(select 1 from user_branches where user_id=users.id and branch_id=$2))`, [int(fd, 'mechanic_id'), j.branch_id]);
  if (!m) redirect(back(jobPath(j.id), 'err', 'That mechanic does not work at this branch.'));
  await q('update jobs set mechanic_id=$2 where id=$1', [j.id, m.id]);
  await audit(u.id, 'mechanic_assigned', 'job', j.id, { mechanic: m.id });
  await notify(m.id, { kind: 'job', subject: `New job #${j.id}`, body: 'A job has been assigned to you.', link: jobPath(j.id), channels: ['inapp'] });
  redirect(back(jobPath(j.id), 'ok', 'Mechanic assigned.'));
}

export async function saveDiagnosis(fd) {
  const u = await requireUser(WORKERS);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id)) redirect(jobPath(j.id));
  await q("update jobs set diagnosis=$2, status=case when status='checked_in' then 'diagnosis' else status end, mechanic_id=coalesce(mechanic_id, case when $3='mechanic' then $4::int end) where id=$1",
    [j.id, str(fd, 'diagnosis'), u.role, u.id]);
  await audit(u.id, 'diagnosis_saved', 'job', j.id);
  redirect(back(jobPath(j.id), 'ok', 'Diagnosis saved.'));
}

async function applyItem(db, job, item) {
  if (item.applied) return;
  if (item.kind === 'part' && item.part_id) {
    const n = Math.ceil(Number(item.qty));
    const s = await db.q1('select qty from stock where branch_id=$1 and part_id=$2 for update', [job.branch_id, item.part_id]);
    if (!s || s.qty < n) fail(`Not enough stock for "${item.description}" at this branch (available: ${s?.qty ?? 0}). Request a transfer from another branch.`);
    await db.q('update stock set qty=qty-$3 where branch_id=$1 and part_id=$2', [job.branch_id, item.part_id, n]);
    const part = await db.q1('select * from parts where id=$1', [item.part_id]);
    const v = await db.q1('select * from vehicles where id=$1', [job.vehicle_id]);
    const iv = await findInterval(part.category, v.make, v.model, db);
    const now = new Date();
    await db.q(`insert into vehicle_parts(vehicle_id,job_id,part_id,name,category,installed_on,mileage_at,expires_on,due_km,branch_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [v.id, job.id, part.id, part.name, part.category, iso(now), v.mileage, iv?.months ? iso(addMonths(now, iv.months)) : null, iv?.km ? v.mileage + iv.km : null, job.branch_id]);
  }
  await db.q('update job_items set applied=true where id=$1', [item.id]);
}

export async function addItem(fd) {
  const u = await requireUser(WORKERS);
  const id = int(fd, 'job_id'); const path = jobPath(id);
  await guard(path, () => tx(async (db) => {
    const j = await db.q1('select * from jobs where id=$1 for update', [id]);
    if (!j || !ownsBranch(u, j.branch_id)) fail('You can only add items to jobs at your own branch.');
    if (['invoiced', 'paid', 'picked_up', 'cancelled', 'ready'].includes(j.status)) fail('This job is closed for changes. Request a correction instead.');
    let item;
    if (str(fd, 'kind') === 'labor') {
      const hours = num(fd.get('hours'), 0); if (hours <= 0) fail('Enter the hours worked.');
      const rate = await getSetting('labor_rate', db);
      item = await db.q1(`insert into job_items(job_id,kind,description,qty,unit_price,mechanic_id,logged_by,applied) values ($1,'labor',$2,$3,$4,$5,$6,true) returning *`,
        [id, str(fd, 'description') || 'Labor', hours, rate, j.mechanic_id ?? (u.role === 'mechanic' ? u.id : null), u.id]);
    } else {
      const part = await db.q1('select * from parts where id=$1 and active', [int(fd, 'part_id')]);
      const qty = Math.max(1, int(fd, 'qty', 1));
      if (!part) fail('Choose a part.');
      item = await db.q1(`insert into job_items(job_id,kind,part_id,description,qty,unit_price,logged_by) values ($1,'part',$2,$3,$4,$5,$6) returning *`, [id, part.id, part.name, qty, part.price, u.id]);
      if (['in_progress', 'quality_check'].includes(j.status)) await applyItem(db, j, item);
    }
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, 'job_item_added', 'job', id, JSON.stringify({ item: item.id, desc: item.description })]);
  }));
  redirect(back(path, 'ok', 'Item added.'));
}

export async function sendQuote(fd) {
  const u = await requireUser(WORKERS);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id) || !['checked_in', 'diagnosis'].includes(j.status)) redirect(jobPath(j.id));
  const n = await q1('select count(*)::int c from job_items where job_id=$1 and superseded_by is null', [j.id]);
  if (!n.c) redirect(back(jobPath(j.id), 'err', 'Add at least one part or labor line before sending a quote.'));
  const total = (await q1('select coalesce(sum(qty*unit_price),0)::int s from job_items where job_id=$1 and superseded_by is null', [j.id])).s;
  await q("update jobs set status='quoted' where id=$1", [j.id]);
  await audit(u.id, 'quote_sent', 'job', j.id, { total });
  await notify(j.client_id, { kind: 'quote', subject: `Quote for job #${j.id}`, body: `Your quote is ready (${total} XAF). Please review and approve it in the app, or tell the front desk.`, link: jobPath(j.id), channels: ALL_CHANNELS });
  redirect(back(jobPath(j.id), 'ok', 'Quote sent to the client.'));
}

export async function approveQuote(fd) {
  const u = await requireUser(['client']);
  const j = await loadJob(int(fd, 'job_id'));
  if (j.client_id !== u.id || j.status !== 'quoted') redirect(jobPath(j.id));
  await q("update jobs set status='approved', approval_method='app', approved_at=now() where id=$1", [j.id]);
  await audit(u.id, 'quote_approved', 'job', j.id, { via: 'app' });
  redirect(back(jobPath(j.id), 'ok', 'Quote approved. Work can start.'));
}
export async function declineQuote(fd) {
  const u = await requireUser(['client']);
  const j = await loadJob(int(fd, 'job_id'));
  if (j.client_id !== u.id || j.status !== 'quoted') redirect(jobPath(j.id));
  await q("update jobs set status='diagnosis' where id=$1", [j.id]);
  await q('insert into job_notes(job_id,author_id,branch_id,body) values ($1,$2,$3,$4)', [j.id, u.id, j.branch_id, `Client declined the quote: ${str(fd, 'reason') || 'no reason given'}`]);
  redirect(back(jobPath(j.id), 'ok', 'The workshop has been told. They will revise the quote.'));
}
export async function recordApproval(fd) {
  const u = await requireUser(FRONT);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id) || j.status !== 'quoted') redirect(jobPath(j.id));
  const method = str(fd, 'method');
  if (!['whatsapp', 'sms', 'verbal'].includes(method) || fd.get('confirmed') !== 'on') redirect(back(jobPath(j.id), 'err', 'Choose how the client approved and tick the confirmation box.'));
  await q("update jobs set status='approved', approval_method=$2, approved_at=now(), verbal_ticked_by=$3 where id=$1", [j.id, method, u.id]);
  await audit(u.id, 'quote_approved', 'job', j.id, { via: method, recorded_by: u.id });
  redirect(back(jobPath(j.id), 'ok', 'Client approval recorded.'));
}

export async function startWork(fd) {
  const u = await requireUser(WORKERS);
  const id = int(fd, 'job_id');
  await guard(jobPath(id), () => tx(async (db) => {
    const j = await db.q1('select * from jobs where id=$1 for update', [id]);
    if (!j || !ownsBranch(u, j.branch_id) || j.status !== 'approved') fail('The job must be approved first.');
    if (!j.mechanic_id && u.role !== 'mechanic') fail('Assign a mechanic first.');
    const items = await db.q('select * from job_items where job_id=$1 and superseded_by is null and not applied order by id', [id]);
    for (const it of items) await applyItem(db, j, it);
    await db.q("update jobs set status='in_progress', mechanic_id=coalesce(mechanic_id,$2) where id=$1", [id, u.role === 'mechanic' ? u.id : null]);
  }));
  await audit(u.id, 'work_started', 'job', id);
  redirect(back(jobPath(id), 'ok', 'Work started. Parts used were deducted from stock and recorded on the vehicle.'));
}
export async function toQuality(fd) {
  const u = await requireUser(WORKERS);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id) || j.status !== 'in_progress') redirect(jobPath(j.id));
  await q("update jobs set status='quality_check' where id=$1", [j.id]);
  redirect(back(jobPath(j.id), 'ok', 'Sent to quality check.'));
}
export async function passQuality(fd) {
  const u = await requireUser(['manager', 'admin', 'mechanic']);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id) || j.status !== 'quality_check') redirect(jobPath(j.id));
  if (u.role === 'mechanic' && u.id === j.mechanic_id) redirect(back(jobPath(j.id), 'err', 'The quality check must be done by someone other than the mechanic who did the work.'));
  await q("update jobs set status='ready' where id=$1", [j.id]);
  await audit(u.id, 'quality_passed', 'job', j.id);
  await notify(j.client_id, { kind: 'job', subject: `Vehicle ready (job #${j.id})`, body: 'Your vehicle is ready. We will send the invoice shortly.', link: jobPath(j.id), channels: ALL_CHANNELS });
  redirect(back(jobPath(j.id), 'ok', 'Quality check passed. Vehicle is ready.'));
}
export async function markPickedUp(fd) {
  const u = await requireUser(FRONT);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id) || j.status !== 'paid') redirect(back(jobPath(j.id), 'err', 'The invoice must be paid before pickup.'));
  await q("update jobs set status='picked_up', closed_at=now() where id=$1", [j.id]);
  await audit(u.id, 'picked_up', 'job', j.id);
  redirect(back(jobPath(j.id), 'ok', 'Vehicle handed over.'));
}
export async function cancelJob(fd) {
  const u = await requireUser(FRONT);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id) || ['invoiced', 'paid', 'picked_up', 'cancelled'].includes(j.status)) redirect(jobPath(j.id));
  await q("update jobs set status='cancelled', closed_at=now() where id=$1", [j.id]);
  await audit(u.id, 'job_cancelled', 'job', j.id);
  redirect(back(jobPath(j.id), 'ok', 'Job cancelled.'));
}

export async function assignStudent(fd) {
  const u = await requireUser(['mechanic', 'manager', 'admin', 'instructor']);
  const j = await loadJob(int(fd, 'job_id'));
  if (!ownsBranch(u, j.branch_id)) redirect(jobPath(j.id));
  const sid = int(fd, 'student_id');
  const ok = await q1(`select e.id from enrollments e join programs p on p.id=e.program_id where e.student_id=$1 and e.status='active' and e.branch_id=$2 and e.level >= p.real_work_level limit 1`, [sid, j.branch_id]);
  if (!ok) redirect(back(jobPath(j.id), 'err', 'This student has not reached the level needed to work on client vehicles at this branch.'));
  const sup = await q1("select id from users where id=$1 and role in ('mechanic','manager','instructor') and active", [int(fd, 'supervisor_id')]);
  if (!sup) redirect(back(jobPath(j.id), 'err', 'Choose a supervisor.'));
  await q('update jobs set student_id=$2, supervisor_id=$3 where id=$1', [j.id, sid, sup.id]);
  await audit(u.id, 'student_assigned', 'job', j.id, { student: sid, supervisor: sup.id });
  redirect(back(jobPath(j.id), 'ok', 'Student assigned under supervision.'));
}

// ---------- notes, cross-branch additions, corrections ----------
export async function addNote(fd) {
  const u = await requireUser(['receptionist', 'mechanic', 'manager', 'admin', 'cashier', 'storekeeper']);
  const j = await loadJob(int(fd, 'job_id')); const body = str(fd, 'body');
  if (!body) redirect(jobPath(j.id));
  if (ownsBranch(u, j.branch_id)) {
    await q('insert into job_notes(job_id,author_id,branch_id,body) values ($1,$2,$3,$4)', [j.id, u.id, u.branch_id ?? j.branch_id, body]);
    redirect(back(jobPath(j.id), 'ok', 'Note added.'));
  }
  // another branch: a new record may be proposed, never edited in place; the owning branch manager or admin approves it
  await q(`insert into approvals(kind,title,payload,branch_id,requested_by) values ('cross_branch_write',$1,$2,$3,$4)`,
    [`Addition to job #${j.id} from another branch`, JSON.stringify({ job_id: j.id, body, from_branch: u.branch_id }), j.branch_id, u.id]);
  redirect(back(jobPath(j.id), 'ok', 'Sent for approval by the branch that owns this job.'));
}

export async function requestCorrection(fd) {
  const u = await requireUser(['mechanic', 'manager', 'admin', 'receptionist']);
  const item = await q1('select ji.*, j.branch_id from job_items ji join jobs j on j.id=ji.job_id where ji.id=$1', [int(fd, 'item_id')]);
  if (!item || !ownsBranch(u, item.branch_id) || item.superseded_by) redirect('/app/jobs');
  if (!str(fd, 'reason')) redirect(back(jobPath(item.job_id), 'err', 'Give a reason for the correction.'));
  await q(`insert into job_corrections(job_id,item_id,new_description,new_qty,new_unit_price,reason,requested_by) values ($1,$2,$3,$4,$5,$6,$7)`,
    [item.job_id, item.id, str(fd, 'new_description') || item.description, fd.get('new_qty') ? num(fd.get('new_qty')) : item.qty, fd.get('new_unit_price') ? int(fd, 'new_unit_price') : item.unit_price, str(fd, 'reason'), u.id]);
  await audit(u.id, 'correction_requested', 'job', item.job_id, { item: item.id });
  redirect(back(jobPath(item.job_id), 'ok', 'Correction submitted. A manager or admin must approve it; the original entry is kept.'));
}

export async function decideCorrection(fd) {
  const u = await requireUser(['manager', 'admin']);
  const id = int(fd, 'id'); const approve = str(fd, 'act') === 'approve';
  const dest = str(fd, 'from') || '/app/approvals';
  await guard(dest, () => tx(async (db) => {
    const c = await db.q1("select * from job_corrections where id=$1 and status='pending' for update", [id]);
    if (!c) fail('Already decided.');
    const j = await db.q1('select * from jobs where id=$1', [c.job_id]);
    if (!canDecide(u, j.branch_id)) fail('Only the branch manager or admin can decide.');
    if (c.requested_by === u.id && !isAdmin(u)) fail('You cannot approve your own correction.');
    if (approve) {
      const old = await db.q1('select * from job_items where id=$1', [c.item_id]);
      const nu = await db.q1(`insert into job_items(job_id,kind,part_id,description,qty,unit_price,mechanic_id,logged_by,corrects_item_id,applied) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
        [old.job_id, old.kind, old.part_id, c.new_description, c.new_qty, c.new_unit_price, old.mechanic_id, c.requested_by, old.id, old.applied]);
      await db.q('update job_items set superseded_by=$2 where id=$1', [old.id, nu.id]);
      if (old.kind === 'part' && old.applied && old.part_id) {
        const delta = Math.ceil(Number(c.new_qty)) - Math.ceil(Number(old.qty));
        if (delta !== 0) {
          const s = await db.q1('select qty from stock where branch_id=$1 and part_id=$2 for update', [j.branch_id, old.part_id]);
          if (delta > 0 && (!s || s.qty < delta)) fail('Not enough stock to apply this correction.');
          await db.q('update stock set qty=qty-$3 where branch_id=$1 and part_id=$2', [j.branch_id, old.part_id, delta]);
        }
      }
    }
    await db.q('update job_corrections set status=$2, decided_by=$3, decided_at=now() where id=$1', [id, approve ? 'approved' : 'rejected', u.id]);
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, approve ? 'correction_approved' : 'correction_rejected', 'job', j.id, JSON.stringify({ correction: id })]);
  }));
  redirect(back(dest, 'ok', approve ? 'Correction approved and logged as a separate entry.' : 'Correction rejected.'));
}

export async function submitReview(fd) {
  const u = await requireUser(['client']);
  const j = await loadJob(int(fd, 'job_id'));
  if (j.client_id !== u.id || !['picked_up', 'paid', 'ready', 'invoiced'].includes(j.status)) redirect(jobPath(j.id));
  const rating = Math.min(5, Math.max(1, int(fd, 'rating', 5)));
  await q(`insert into reviews(job_id,client_id,branch_id,rating,comment) values ($1,$2,$3,$4,$5)
    on conflict (job_id) do update set rating=excluded.rating, comment=excluded.comment, edited_at=now()`, [j.id, u.id, j.branch_id, rating, str(fd, 'comment') || null]);
  redirect(back(jobPath(j.id), 'ok', 'Thank you for your review.'));
}
