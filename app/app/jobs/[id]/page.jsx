import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser, ownsBranch, seesMoney, isAdmin } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdt, STATUS_LABEL } from '@/lib/util';
import Flash from '@/components/Flash';
import * as A from '@/actions/jobs';
import { createInvoice } from '@/actions/billing';
import ActBtn from '@/components/ActBtn';

const ORDER = ['checked_in', 'diagnosis', 'quoted', 'approved', 'in_progress', 'quality_check', 'ready', 'invoiced', 'paid', 'picked_up'];
export default async function JobDetail({ params, searchParams }) {
  const user = await requireUser(['client', 'receptionist', 'mechanic', 'cashier', 'manager', 'admin', 'storekeeper']);
  const { id } = await params; const sp = await searchParams; const t = await getT(user);
  const j = await q1(`select j.*, v.plate, v.make, v.model, v.mileage, b.name branch, c.full_name client, c.phone client_phone, m.full_name mechanic, s.full_name student, sv.full_name supervisor, vb.full_name verbal_by
    from jobs j join vehicles v on v.id=j.vehicle_id join branches b on b.id=j.branch_id join users c on c.id=j.client_id
    left join users m on m.id=j.mechanic_id left join users s on s.id=j.student_id left join users sv on sv.id=j.supervisor_id left join users vb on vb.id=j.verbal_ticked_by where j.id=$1`, [id]);
  if (!j || (user.role === 'client' && j.client_id !== user.id)) notFound();
  const client = user.role === 'client';
  const own = !client && ownsBranch(user, j.branch_id);
  const money = seesMoney(user, j.branch_id);
  const role = user.role;
  const isWorker = own && ['mechanic', 'manager', 'admin'].includes(role);
  const isFront = own && ['receptionist', 'manager', 'admin'].includes(role);
  const items = await q('select ji.*, u.full_name by from job_items ji left join users u on u.id=ji.logged_by where job_id=$1 order by ji.id', [j.id]);
  const live = items.filter((i) => !i.superseded_by);
  const old = items.filter((i) => i.superseded_by);
  const total = live.reduce((s, i) => s + Math.round(Number(i.qty) * i.unit_price), 0);
  const notes = client ? [] : await q('select n.*, u.full_name, b.name branch from job_notes n left join users u on u.id=n.author_id left join branches b on b.id=n.branch_id where job_id=$1 order by n.id', [j.id]);
  const corrections = client ? [] : await q('select c.*, u.full_name by, ji.description orig from job_corrections c left join users u on u.id=c.requested_by join job_items ji on ji.id=c.item_id where c.job_id=$1 order by c.id desc', [j.id]);
  const invoice = await q1('select * from invoices where job_id=$1 and status<>$2 order by id desc limit 1', [j.id, 'void']);
  const review = client ? await q1('select * from reviews where job_id=$1', [j.id]) : null;
  const parts = isWorker && !['ready', 'invoiced', 'paid', 'picked_up', 'cancelled'].includes(j.status)
    ? await q(`select p.id, p.name, p.price, coalesce(s.qty,0) stock from parts p left join stock s on s.part_id=p.id and s.branch_id=$1 where p.active order by p.category, p.name`, [j.branch_id]) : [];
  const mechanics = isFront ? await q(`select id, full_name from users where role='mechanic' and active and (branch_id=$1 or exists(select 1 from user_branches ub where ub.user_id=users.id and ub.branch_id=$1)) order by full_name`, [j.branch_id]) : [];
  const students = own && ['mechanic', 'manager', 'admin', 'instructor'].includes(role) && !['picked_up', 'cancelled'].includes(j.status)
    ? await q(`select distinct u.id, u.full_name, e.level from enrollments e join users u on u.id=e.student_id join programs p on p.id=e.program_id where e.status='active' and e.branch_id=$1 and e.level>=p.real_work_level order by u.full_name`, [j.branch_id]) : [];
  const supervisors = students.length ? await q(`select id, full_name, role from users where role in ('mechanic','manager','instructor') and active and (branch_id=$1 or exists(select 1 from user_branches ub where ub.user_id=users.id and ub.branch_id=$1)) order by full_name`, [j.branch_id]) : [];
  const canDecide = isAdmin(user) || (role === 'manager' && own);
  const open = !['invoiced', 'paid', 'picked_up', 'cancelled', 'ready'].includes(j.status);
  const idx = ORDER.indexOf(j.status);
  const H = ({ name, value }) => <input type="hidden" name={name} value={value} />;
  return (<>
    <div className="row"><h1 className="grow">{t('Job')} #{j.id} <span className="mute">· <Link href={`/app/vehicles/${j.vehicle_id}`}>{j.plate}</Link> {j.make} {j.model}</span></h1>
      <span className="badge info">{j.status === 'cancelled' ? t('Cancelled') : t(STATUS_LABEL[j.status])}</span></div>
    <Flash sp={sp} t={t} />
    <div className="steps">{ORDER.map((s, i) => <span key={s} className={i < idx ? 'done' : i === idx ? 'cur' : ''}>{t(STATUS_LABEL[s])}</span>)}</div>
    <div className="grid g2">
      <div className="card"><table><tbody>
        <tr><th>{t('Client')}</th><td>{j.client}{!client && <div className="mute">{j.client_phone}</div>}</td></tr>
        <tr><th>{t('Branch')}</th><td>{j.branch}{!own && !client && <span className="badge warn" style={{ marginLeft: 6 }}>{t('Read only: other branch')}</span>}</td></tr>
        <tr><th>{t('Service')}</th><td>{j.service_type} {j.extra_service && <span className="badge">{t(j.extra_service)}</span>} {j.warranty && <span className="badge info">{t('Warranty')}</span>}{j.parent_job_id && <> · <Link href={`/app/jobs/${j.parent_job_id}`}>{t('original job')} #{j.parent_job_id}</Link></>}</td></tr>
        <tr><th>{t('Mechanic')}</th><td>{j.mechanic || '—'}</td></tr>
        <tr><th>{t('Mileage in')}</th><td>{j.mileage_in?.toLocaleString() ?? '—'} km</td></tr>
        <tr><th>{t('Opened')}</th><td>{fdt(j.created_at)}</td></tr>
        {j.approved_at && <tr><th>{t('Approved')}</th><td>{fdt(j.approved_at)} · {j.approval_method === 'verbal' ? t('verbally, recorded by {name}', { name: j.verbal_by }) : t(`via ${j.approval_method}`)}</td></tr>}
        {j.student && <tr><th>{t('Student working')}</th><td>{j.student} <span className="mute">{t('supervised by')} {j.supervisor}</span></td></tr>}
      </tbody></table></div>
      <div className="card"><h3>{t('Next step')}</h3>
        {isFront && !j.mechanic_id && mechanics.length > 0 && !['cancelled', 'picked_up'].includes(j.status) && (<form action={A.assignMechanic} className="row"><H name="job_id" value={j.id} /><select name="mechanic_id" className="grow" required><option value="">{t('Assign mechanic')}</option>{mechanics.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select><button className="btn sm">{t('Assign')}</button></form>)}
        {isFront && j.mechanic_id && !['cancelled', 'picked_up', 'invoiced', 'paid'].includes(j.status) && mechanics.length > 1 && (<form action={A.assignMechanic} className="row"><H name="job_id" value={j.id} /><select name="mechanic_id" className="grow" defaultValue={j.mechanic_id}>{mechanics.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select><button className="btn sm ghost">{t('Reassign')}</button></form>)}
        {['checked_in', 'diagnosis'].includes(j.status) && isWorker && (<form action={A.sendQuote}><H name="job_id" value={j.id} /><p className="mute">{t('Record the diagnosis, add parts and labor, then send the quote to the client.')}</p><button className="btn alt">{t('Send quote to client')}</button></form>)}
        {j.status === 'quoted' && client && (<div><p>{t('Please review the quote below.')}</p><form action={A.approveQuote} className="inline"><H name="job_id" value={j.id} /><button className="btn ok">{t('Approve quote')}</button></form>
          <form action={A.declineQuote} className="f" style={{ marginTop: 10 }}><H name="job_id" value={j.id} /><input name="reason" placeholder={t('What should change?')} /><button className="btn sm ghost">{t('Decline / ask for changes')}</button></form></div>)}
        {j.status === 'quoted' && isFront && (<form action={A.recordApproval} className="f"><H name="job_id" value={j.id} /><p className="mute">{t('Waiting for client approval. If the client approved by another channel, record it here.')}</p>
          <select name="method"><option value="verbal">{t('Verbally (in person or by phone)')}</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
          <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="confirmed" /> {t('I confirm the client approved this quote')}</label><button className="btn sm ok">{t('Record approval')}</button></form>)}
        {j.status === 'approved' && isWorker && (<form action={A.startWork}><H name="job_id" value={j.id} /><p className="mute">{t('Starting work deducts parts from this branch’s stock and records them on the vehicle.')}</p><button className="btn alt">{t('Start work')}</button></form>)}
        {j.status === 'in_progress' && isWorker && (<form action={A.toQuality}><H name="job_id" value={j.id} /><button className="btn alt">{t('Work finished: send to quality check')}</button></form>)}
        {j.status === 'quality_check' && own && ['manager', 'admin', 'mechanic'].includes(role) && (<form action={A.passQuality}><H name="job_id" value={j.id} /><p className="mute">{t('Checked by someone other than the mechanic who did the work.')}</p><button className="btn ok">{t('Pass quality check')}</button></form>)}
        {j.status === 'ready' && own && ['cashier', 'receptionist', 'manager', 'admin'].includes(role) && (<form action={createInvoice}><H name="job_id" value={j.id} /><button className="btn alt">{t('Create and send invoice')}</button></form>)}
        {invoice && money && <p><Link className="btn" href={`/app/invoices/${invoice.id}`}>{t('Invoice')} {invoice.number} · {t(invoice.status)}</Link></p>}
        {j.status === 'paid' && isFront && (<form action={A.markPickedUp}><H name="job_id" value={j.id} /><button className="btn ok">{t('Vehicle handed over to client')}</button></form>)}
        {j.status === 'picked_up' && isFront && (<form action={A.createComeback} className="f"><H name="job_id" value={j.id} /><input name="complaint" placeholder={t('What is the problem again?')} /><button className="btn sm ghost">{t('Open warranty / comeback job')}</button></form>)}
        {isFront && !['invoiced', 'paid', 'picked_up', 'cancelled'].includes(j.status) && (<form action={A.cancelJob} style={{ marginTop: 10 }}><H name="job_id" value={j.id} /><button className="btn sm bad">{t('Cancel job')}</button></form>)}
        {j.status === 'cancelled' && <p className="mute">{t('This job was cancelled.')}</p>}
      </div>
    </div>

    <h2>{t('Diagnosis')}</h2>
    <div className="card">{isWorker && open ? (<form action={A.saveDiagnosis} className="f"><H name="job_id" value={j.id} /><textarea name="diagnosis" defaultValue={j.diagnosis || ''} placeholder={t('Findings, faults, recommendations')} /><button className="btn sm">{t('Save diagnosis')}</button></form>) : <p>{j.diagnosis || <span className="mute">—</span>}</p>}</div>

    <h2>{t('Parts and labor')}</h2>
    <div className="card tw"><table><thead><tr><th>{t('Item')}</th><th>{t('Qty / hours')}</th>{money && <th>{t('Unit price')}</th>}{money && <th>{t('Line total')}</th>}<th>{t('Logged by')}</th><th /></tr></thead>
      <tbody>{live.map((i) => (<tr key={i.id}><td>{i.description} <span className="badge">{i.kind === 'part' ? t('Part') : t('Labor')}</span>{i.corrects_item_id && <span className="badge info" style={{ marginLeft: 4 }}>{t('corrected')}</span>}{i.kind === 'part' && !i.applied && <span className="badge warn" style={{ marginLeft: 4 }}>{t('planned')}</span>}</td>
        <td>{Number(i.qty)}</td>{money && <td>{fmt(i.unit_price)}</td>}{money && <td>{fmt(Math.round(Number(i.qty) * i.unit_price))}</td>}<td>{i.by}</td>
        <td>{own && !client && ['mechanic', 'manager', 'admin', 'receptionist'].includes(role) && !['cancelled'].includes(j.status) && (<details><summary className="mute">{t('Correct')}</summary>
          <form action={A.requestCorrection} className="f" style={{ minWidth: 220 }}><H name="item_id" value={i.id} /><input name="new_description" defaultValue={i.description} /><div className="row"><input name="new_qty" type="number" step="0.25" min="0" defaultValue={Number(i.qty)} style={{ width: 90 }} /><input name="new_unit_price" type="number" min="0" defaultValue={i.unit_price} style={{ width: 120 }} /></div>
            <input name="reason" required placeholder={t('Reason')} /><button className="btn sm">{t('Submit for approval')}</button></form></details>)}</td></tr>))}
        {live.length === 0 && <tr><td colSpan="6" className="mute">{t('Nothing added yet.')}</td></tr>}
        {money && live.length > 0 && <tr><th colSpan="3">{t('Total (before tax)')}</th><th colSpan="3">{fmt(total)}</th></tr>}</tbody></table></div>
    {isWorker && open && (<div className="grid g2">
      <form action={A.addItem} className="card f"><H name="job_id" value={j.id} /><H name="kind" value="part" /><h3>{t('Add a part')}</h3>
        <select name="part_id" required><option value="">—</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.name}{money ? ` · ${fmt(p.price)}` : ''} · {t('stock')} {p.stock}</option>)}</select>
        <input name="qty" type="number" min="1" defaultValue="1" /><button className="btn sm">{t('Add part')}</button></form>
      <form action={A.addItem} className="card f"><H name="job_id" value={j.id} /><H name="kind" value="labor" /><h3>{t('Log labor')}</h3>
        <input name="description" placeholder={t('What was done')} required /><input name="hours" type="number" step="0.25" min="0.25" placeholder={t('Hours')} required /><button className="btn sm">{t('Add labor')}</button></form></div>)}
    {old.length > 0 && (<details className="card"><summary><b>{t('Correction history (original entries are kept)')}</b></summary><table><tbody>{old.map((i) => (<tr key={i.id}><td style={{ textDecoration: 'line-through' }}>{i.description}</td><td>{Number(i.qty)}</td>{money && <td>{fmt(i.unit_price)}</td>}<td className="mute">{t('replaced by entry')} #{i.superseded_by}</td></tr>))}</tbody></table></details>)}

    {corrections.length > 0 && (<><h2>{t('Correction requests')}</h2><div className="card tw"><table><thead><tr><th>{t('Original')}</th><th>{t('Proposed')}</th><th>{t('Reason')}</th><th>{t('By')}</th><th>{t('Status')}</th><th /></tr></thead><tbody>
      {corrections.map((c) => (<tr key={c.id}><td>{c.orig}</td><td>{c.new_description} × {Number(c.new_qty)}{money ? ` @ ${fmt(c.new_unit_price)}` : ''}</td><td>{c.reason}</td><td>{c.by}</td><td><span className={`badge ${c.status === 'approved' ? 'ok' : c.status === 'rejected' ? 'bad' : 'warn'}`}>{t(c.status)}</span></td>
        <td>{c.status === 'pending' && canDecide && (<form action={A.decideCorrection} className="row"><H name="id" value={c.id} /><H name="from" value={`/app/jobs/${j.id}`} /><ActBtn className="btn sm ok" name="act" value="approve">{t('Approve')}</ActBtn><ActBtn className="btn sm ghost" name="act" value="reject">{t('Reject')}</ActBtn></form>)}</td></tr>))}</tbody></table></div></>)}

    {students.length > 0 && (<><h2>{t('Student on this job')}</h2><form action={A.assignStudent} className="card row"><H name="job_id" value={j.id} />
      <select name="student_id" required className="grow"><option value="">{t('Student (qualified level)')}</option>{students.map((s) => <option key={s.id} value={s.id}>{s.full_name} · L{s.level}</option>)}</select>
      <select name="supervisor_id" required className="grow"><option value="">{t('Supervisor')}</option>{supervisors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select><button className="btn sm">{t('Assign')}</button></form></>)}

    {!client && (<><h2>{t('Notes')}</h2><div className="card">{notes.map((n) => (<p key={n.id}><b>{n.full_name}</b> <span className="mute">{n.branch} · {fdt(n.created_at)}</span><br />{n.body}</p>))}
      {notes.length === 0 && <p className="mute">—</p>}
      <form action={A.addNote} className="f"><H name="job_id" value={j.id} /><textarea name="body" placeholder={own ? t('Add a note') : t('Propose an addition to this branch’s record')} required />
        <button className="btn sm">{own ? t('Add note') : t('Send for approval')}</button>{!own && <div className="mute">{t('This job belongs to another branch. Your addition is added only after that branch’s manager or the admin approves it. Past records cannot be edited.')}</div>}</form></div></>)}

    {client && ['ready', 'invoiced', 'paid', 'picked_up'].includes(j.status) && (<><h2>{t('Your review')}</h2><form action={A.submitReview} className="card f" style={{ maxWidth: 480 }}><H name="job_id" value={j.id} />
      <label>{t('Rating')}<select name="rating" defaultValue={review?.rating || 5}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select></label>
      <textarea name="comment" defaultValue={review?.comment || ''} placeholder={t('How was our service?')} /><button className="btn sm">{review ? t('Update review') : t('Submit review')}</button></form></>)}
  </>);
}
