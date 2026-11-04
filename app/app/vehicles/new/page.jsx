import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { registerVehicle } from '@/actions/vehicles';
export const metadata = { title: 'Register a vehicle' };
export default async function NewVehicle({ searchParams }) {
  const user = await requireUser(['client', 'admin', 'manager', 'receptionist', 'mechanic']);
  const t = await getT(user); const sp = await searchParams;
  const branches = await q('select id,name from branches where active order by id');
  const staff = user.role !== 'client';
  return (<><h1>{t('Register a vehicle')}</h1><Flash sp={sp} t={t} />
    <form className="card f" action={registerVehicle} style={{ maxWidth: 620 }}>
      {staff && <>
        <label>{t('Owner email')}<input name="owner_email" type="email" required /></label>
        <div className="grid g2"><label>{t('Owner name (if new client)')}<input name="owner_name" /></label><label>{t('Owner phone (if new client)')}<input name="owner_phone" /></label></div>
        <label>{t('Company / fleet name (optional)')}<input name="company_name" /></label></>}
      <div className="grid g2"><label>{t('Plate number')}<input name="plate" required /></label><label>{t('Chassis / VIN')}<input name="vin" /></label></div>
      <div className="grid g3"><label>{t('Make')}<input name="make" required placeholder="Toyota" /></label><label>{t('Model')}<input name="model" required placeholder="Corolla" /></label><label>{t('Year')}<input name="year" type="number" min="1970" max="2100" /></label></div>
      <div className="grid g3"><label>{t('Current mileage (km)')}<input name="mileage" type="number" min="0" defaultValue="0" /></label><label>{t('Colour')}<input name="color" /></label>
        {!staff || !user.branch_id ? <label>{t('Preferred branch')}<select name="branch_id">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label> : <span />}</div>
      <label>{t('Photo link (optional)')}<input name="photo_url" /></label>
      <label>{t('Registration papers reference (optional)')}<input name="papers_ref" /></label>
      <button className="btn alt">{t('Register vehicle')}</button>
    </form></>);
}
