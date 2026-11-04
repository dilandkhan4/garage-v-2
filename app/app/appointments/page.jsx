import { q } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdt } from '@/lib/util';
import Flash from '@/components/Flash';
import { bookAppointment, cancelAppointment, checkInAppointment } from '@/actions/jobs';
export const metadata = { title: 'Appointments' };
export default async function Appointments({ searchParams }) {
  const user = await requireUser(['client', 'receptionist', 'mechanic', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const client = user.role === 'client';
  const vehicles = client ? await q('select id, plate, make, model from vehicles where owner_id=$1 and active', [user.id])
    : await q('select v.id, v.plate, v.make, v.model, u.full_name owner from vehicles v join users u on u.id=v.owner_id where v.active order by v.plate limit 500');
  const branches = await q('select id,name from branches where active order by id');
  const rows = await q(`select a.*, v.plate, v.make, v.model, b.name branch, u.full_name client from appointments a join vehicles v on v.id=a.vehicle_id join branches b on b.id=a.branch_id join users u on u.id=a.client_id
    where a.status='booked' and ($1::int is null or a.client_id=$1) and a.scheduled_at > now() - interval '1 day' order by a.scheduled_at`, [client ? user.id : null]);
  const types = ['General service', 'Oil & filter service', 'Brakes', 'Engine & electrical diagnostics', 'Tyres, alignment & suspension', 'Battery & electrics', 'Bodywork', 'Towing', 'Roadside assistance', 'Vehicle pickup & delivery'];
  return (<><h1>{t('Appointments')}</h1><Flash sp={sp} t={t} />
    {user.role !== 'mechanic' && (<form className="card f" action={bookAppointment} style={{ maxWidth: 620 }}><h3>{t('Book a visit')}</h3>
      <label>{t('Vehicle')}<select name="vehicle_id" defaultValue={sp.vehicle || ''} required><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model}{v.owner ? ` · ${v.owner}` : ''}</option>)}</select></label>
      <div className="grid g2"><label>{t('Branch')}<select name="branch_id" defaultValue={user.branch_id || ''}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>{t('Date and time')}<input type="datetime-local" name="scheduled_at" required /></label></div>
      <label>{t('Service')}<select name="service_type">{types.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
      {!client && <label>{t('Booked via')}<select name="source"><option value="desk">{t('At the desk')}</option><option value="phone">{t('Phone')}</option></select></label>}
      <label>{t('Notes')}<textarea name="notes" /></label>
      <button className="btn alt">{t('Book')}</button></form>)}
    <h2>{t('Upcoming')}</h2>
    <div className="card tw"><table><thead><tr><th>{t('When')}</th><th>{t('Vehicle')}</th>{!client && <th>{t('Client')}</th>}<th>{t('Branch')}</th><th>{t('Service')}</th><th /></tr></thead>
      <tbody>{rows.map((a) => (<tr key={a.id}><td>{fdt(a.scheduled_at)}</td><td>{a.plate} {a.make} {a.model}</td>{!client && <td>{a.client}</td>}<td>{a.branch}</td><td>{t(a.service_type)}<div className="mute">{a.notes}</div></td>
        <td><div className="row">
          {!client && ['receptionist', 'manager', 'admin'].includes(user.role) && ownsBranch(user, a.branch_id) && (<form action={checkInAppointment} className="row"><input type="hidden" name="id" value={a.id} /><input name="mileage" type="number" placeholder="km" style={{ width: 90 }} /><button className="btn sm ok">{t('Check in')}</button></form>)}
          {user.role !== 'mechanic' && <form action={cancelAppointment}><input type="hidden" name="id" value={a.id} /><button className="btn sm ghost">{t('Cancel')}</button></form>}</div></td></tr>))}
        {rows.length === 0 && <tr><td colSpan="6" className="mute">{t('No upcoming appointments.')}</td></tr>}</tbody></table></div></>);
}
