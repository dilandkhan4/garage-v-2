import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { createJob } from '@/actions/jobs';
export const metadata = { title: 'Check in a vehicle' };
export default async function NewJob({ searchParams }) {
  const user = await requireUser(['receptionist', 'mechanic', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const vehicles = await q('select v.id, v.plate, v.make, v.model, v.mileage, u.full_name owner from vehicles v join users u on u.id=v.owner_id where v.active order by v.plate');
  const branches = await q('select id,name from branches where active order by id');
  return (<><h1>{t('Check in a vehicle')}</h1><Flash sp={sp} t={t} />
    <form className="card f" action={createJob} style={{ maxWidth: 620 }}>
      <label>{t('Vehicle')}<select name="vehicle_id" defaultValue={sp.vehicle || ''} required><option value="">—</option>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model} · {v.owner}</option>)}</select></label>
      <div className="mute">{t('Not registered yet?')} <a href="/app/vehicles/new">{t('Register the vehicle first')}</a>.</div>
      {(user.role === 'admin' || user.branchIds.length > 1) && <label>{t('Branch')}<select name="branch_id" defaultValue={user.branch_id || ''}>{branches.filter((b) => user.role === 'admin' || user.branchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
      <label>{t('Odometer reading (km)')}<input name="mileage" type="number" min="0" /></label>
      <label>{t('Service needed')}<select name="service_type">{['General service', 'Oil & filter service', 'Brakes', 'Engine & electrical diagnostics', 'Tyres, alignment & suspension', 'Battery & electrics', 'Bodywork', 'Other'].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
      <label>{t('Extra service')}<select name="extra_service"><option value="">{t('None')}</option><option value="Towing">{t('Towing')}</option><option value="Roadside assistance">{t('Roadside assistance')}</option><option value="Vehicle pickup & delivery">{t('Vehicle pickup & delivery')}</option></select></label>
      <label>{t('Client’s complaint / notes')}<textarea name="complaint" /></label>
      <button className="btn alt">{t('Check in')}</button></form></>);
}
