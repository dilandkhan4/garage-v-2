import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { respondTransfer } from '@/actions/vehicles';
import ActBtn from '@/components/ActBtn';
export const metadata = { title: 'Vehicles' };
export default async function Vehicles({ searchParams }) {
  const user = await requireUser(['client', 'admin', 'manager', 'receptionist', 'mechanic', 'storekeeper', 'cashier']);
  const t = await getT(user); const sp = await searchParams;
  const isClient = user.role === 'client';
  const s = (sp.s || '').trim();
  const rows = isClient
    ? await q('select v.*, u.full_name owner from vehicles v join users u on u.id=v.owner_id where v.owner_id=$1 and v.active order by v.plate', [user.id])
    : await q(`select v.*, u.full_name owner, b.name branch from vehicles v join users u on u.id=v.owner_id left join branches b on b.id=v.branch_id
        where v.active and ($1='' or v.plate ilike '%'||$1||'%' or u.full_name ilike '%'||$1||'%' or u.email ilike '%'||$1||'%' or v.vin ilike '%'||$1||'%') order by v.id desc limit 100`, [s]);
  const incoming = isClient ? await q(`select tr.*, v.plate, v.make, v.model from vehicle_transfers tr join vehicles v on v.id=tr.vehicle_id
      where tr.status='pending' and (tr.to_user=$1 or lower(tr.to_email)=lower($2))`, [user.id, user.email]) : [];
  return (<>
    <div className="row"><h1 className="grow">{t('Vehicles')}</h1><Link className="btn alt" href="/app/vehicles/new">{t('Register a vehicle')}</Link></div>
    <Flash sp={sp} t={t} />
    {incoming.map((tr) => (<div className="card" key={tr.id}><b>{tr.make} {tr.model} ({tr.plate})</b> {t('is being transferred to you.')}
      <form action={respondTransfer} className="row" style={{ marginTop: 8 }}><input type="hidden" name="transfer_id" value={tr.id} />
        <ActBtn className="btn sm ok" name="act" value="accept">{t('Accept')}</ActBtn><ActBtn className="btn sm ghost" name="act" value="decline">{t('Decline')}</ActBtn></form></div>))}
    {!isClient && <form className="row card"><input className="grow" name="s" defaultValue={s} placeholder={t('Search plate, owner, email or VIN')} /><button className="btn">{t('Search')}</button></form>}
    <div className="card tw"><table><thead><tr><th>{t('Plate')}</th><th>{t('Vehicle')}</th><th>{t('Owner')}</th><th>{t('Mileage')}</th>{!isClient && <th>{t('Registered at')}</th>}</tr></thead>
      <tbody>{rows.map((v) => (<tr key={v.id}><td><Link href={`/app/vehicles/${v.id}`}><b>{v.plate}</b></Link></td><td>{v.make} {v.model} {v.year || ''}</td><td>{v.owner}</td><td>{v.mileage.toLocaleString()} km</td>{!isClient && <td>{v.branch}</td>}</tr>))}
        {rows.length === 0 && <tr><td colSpan="5" className="mute">{t('No vehicles yet.')}</td></tr>}</tbody></table></div>
  </>);
}
