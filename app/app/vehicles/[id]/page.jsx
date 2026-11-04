import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import { requireUser, seesMoney, isGarageStaff } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt, fdate, STATUS_LABEL } from '@/lib/util';
import Flash from '@/components/Flash';
import { updateMileage, updateVehicle, initiateTransfer, respondTransfer } from '@/actions/vehicles';
import ActBtn from '@/components/ActBtn';

export default async function VehicleDetail({ params, searchParams }) {
  const user = await requireUser(['client', 'admin', 'manager', 'receptionist', 'mechanic', 'storekeeper', 'cashier']);
  const { id } = await params; const sp = await searchParams; const t = await getT(user);
  const v = await q1('select v.*, u.full_name owner, u.email owner_email, u.phone owner_phone, b.name branch from vehicles v join users u on u.id=v.owner_id left join branches b on b.id=v.branch_id where v.id=$1', [id]);
  if (!v || (user.role === 'client' && v.owner_id !== user.id)) notFound();
  const parts = await q(`select vp.*, (vp.expires_on - current_date) days_left, br.name branch_name from vehicle_parts vp left join branches br on br.id=vp.branch_id
      where vp.vehicle_id=$1 and vp.active order by vp.expires_on nulls last, vp.installed_on desc`, [v.id]);
  const jobs = await q(`select j.id, j.status, j.created_at, j.branch_id, j.service_type, j.warranty, b.name branch,
      (select coalesce(sum(qty*unit_price),0)::int from job_items where job_id=j.id and superseded_by is null) total
      from jobs j join branches b on b.id=j.branch_id where j.vehicle_id=$1 order by j.id desc`, [v.id]);
  const transfer = await q1("select * from vehicle_transfers where vehicle_id=$1 and status='pending' order by id desc limit 1", [v.id]);
  const staff = user.role !== 'client';
  const canEdit = ['receptionist', 'manager', 'admin', 'mechanic'].includes(user.role);
  const canTransfer = user.role === 'client' || ['receptionist', 'manager', 'admin'].includes(user.role);
  const badge = (p) => {
    const kmLeft = p.due_km != null ? p.due_km - v.mileage : null;
    if ((p.days_left != null && p.days_left < 0) || (kmLeft != null && kmLeft <= 0)) return <span className="badge bad">{t('Expired')}</span>;
    if ((p.days_left != null && p.days_left <= 7) || (kmLeft != null && kmLeft <= 500)) return <span className="badge warn">{t('Due soon')}</span>;
    return <span className="badge ok">{t('OK')}</span>;
  };
  return (<>
    <div className="row"><h1 className="grow">{v.plate} <span className="mute">{v.make} {v.model} {v.year || ''}</span></h1>
      {user.role === 'client' || user.role === 'receptionist' || user.role === 'manager' || user.role === 'admin'
        ? <Link className="btn" href={`/app/appointments?vehicle=${v.id}`}>{t('Book a visit')}</Link> : null}
      {isGarageStaff(user) && user.role !== 'storekeeper' && user.role !== 'cashier' && <Link className="btn alt" href={`/app/jobs/new?vehicle=${v.id}`}>{t('Check in / new job')}</Link>}</div>
    <Flash sp={sp} t={t} />
    <div className="grid g2">
      <div className="card"><h3>{t('Details')}</h3>
        <table><tbody>
          <tr><th>{t('Owner')}</th><td>{v.owner}{staff && <div className="mute">{v.owner_email} {v.owner_phone}</div>}</td></tr>
          <tr><th>VIN</th><td>{v.vin || '—'}</td></tr><tr><th>{t('Colour')}</th><td>{v.color || '—'}</td></tr>
          <tr><th>{t('Mileage')}</th><td>{v.mileage.toLocaleString()} km</td></tr><tr><th>{t('Registered at')}</th><td>{v.branch || '—'} · {fdate(v.created_at)}</td></tr>
        </tbody></table>
        <form action={updateMileage} className="row" style={{ marginTop: 10 }}><input type="hidden" name="id" value={v.id} />
          <input className="grow" name="mileage" type="number" min={v.mileage} placeholder={t('New odometer reading (km)')} required /><button className="btn sm">{t('Update mileage')}</button></form>
        <div className="mute">{t('Mileage-based reminders need an up-to-date odometer reading.')}</div>
      </div>
      <div className="card"><h3>{t('Ownership')}</h3>
        {transfer ? (<><p>{t('Transfer to {email} is pending.', { email: transfer.to_email })}</p>
          <form action={respondTransfer} className="row"><input type="hidden" name="transfer_id" value={transfer.id} />
            {(staff && user.role !== 'mechanic' && user.role !== 'storekeeper' && user.role !== 'cashier') && <ActBtn className="btn sm ok" name="act" value="accept">{t('Confirm on behalf of new owner')}</ActBtn>}
            <ActBtn className="btn sm ghost" name="act" value="cancel">{t('Cancel transfer')}</ActBtn></form></>)
          : canTransfer ? (<form action={initiateTransfer} className="f"><input type="hidden" name="id" value={v.id} />
            <label>{t('Transfer to (new owner’s email)')}<input name="to_email" type="email" required /></label>
            <button className="btn sm">{t('Start ownership transfer')}</button>
            <div className="mute">{t('The full service history stays with the vehicle.')}</div></form>) : <p className="mute">{t('Only the owner or front desk can transfer ownership.')}</p>}
      </div>
    </div>
    <h2>{t('Parts and expiry dates')}</h2>
    <div className="card tw"><table><thead><tr><th>{t('Part')}</th><th>{t('Fitted')}</th><th>{t('Expires')}</th><th>{t('Due at')}</th><th>{t('Status')}</th><th>{t('Branch')}</th></tr></thead>
      <tbody>{parts.map((p) => (<tr key={p.id}><td>{p.name}</td><td>{fdate(p.installed_on)}{p.mileage_at != null ? ` · ${p.mileage_at.toLocaleString()} km` : ''}</td>
        <td>{p.expires_on ? `${fdate(p.expires_on)} (${p.days_left} ${t('days')})` : '—'}</td><td>{p.due_km != null ? `${p.due_km.toLocaleString()} km` : '—'}</td><td>{badge(p)}</td><td>{p.branch_name}</td></tr>))}
        {parts.length === 0 && <tr><td colSpan="6" className="mute">{t('No parts recorded yet. Parts fitted during a job appear here automatically.')}</td></tr>}</tbody></table></div>
    <h2>{t('Service history')}</h2>
    <div className="card tw"><table><thead><tr><th>#</th><th>{t('Date')}</th><th>{t('Branch')}</th><th>{t('Service')}</th><th>{t('Status')}</th><th>{t('Total')}</th></tr></thead>
      <tbody>{jobs.map((j) => (<tr key={j.id}><td><Link href={`/app/jobs/${j.id}`}>#{j.id}</Link></td><td>{fdate(j.created_at)}</td><td>{j.branch}</td><td>{j.service_type || '—'} {j.warranty && <span className="badge info">{t('Warranty')}</span>}</td>
        <td><span className="badge">{t(STATUS_LABEL[j.status])}</span></td><td>{seesMoney(user, j.branch_id) ? fmt(j.total) : '—'}</td></tr>))}
        {jobs.length === 0 && <tr><td colSpan="6" className="mute">{t('No jobs yet.')}</td></tr>}</tbody></table></div>
    {canEdit && (<details className="card"><summary><b>{t('Edit vehicle details')}</b></summary>
      <form action={updateVehicle} className="f" style={{ marginTop: 10 }}><input type="hidden" name="id" value={v.id} />
        <div className="grid g3"><label>{t('Make')}<input name="make" defaultValue={v.make} required /></label><label>{t('Model')}<input name="model" defaultValue={v.model} required /></label><label>{t('Year')}<input name="year" type="number" defaultValue={v.year || ''} /></label></div>
        <div className="grid g2"><label>VIN<input name="vin" defaultValue={v.vin || ''} /></label><label>{t('Colour')}<input name="color" defaultValue={v.color || ''} /></label></div>
        <label>{t('Photo link (optional)')}<input name="photo_url" defaultValue={v.photo_url || ''} /></label>
        <label>{t('Registration papers reference (optional)')}<input name="papers_ref" defaultValue={v.papers_ref || ''} /></label>
        <button className="btn sm">{t('Save')}</button></form></details>)}
  </>);
}
