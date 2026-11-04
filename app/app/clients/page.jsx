import Link from 'next/link';
import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
export const metadata = { title: 'Clients' };
export default async function Clients({ searchParams }) {
  const user = await requireUser(['receptionist', 'manager', 'admin']);
  const t = await getT(user); const sp = await searchParams; const s = (sp.s || '').trim();
  const rows = await q(`select u.id, u.full_name, u.email, u.phone, u.company_name, (select count(*)::int from vehicles v where v.owner_id=u.id and v.active) vehicles,
      (select count(*)::int from jobs j where j.client_id=u.id) jobs from users u where u.role='client' and ($1='' or u.full_name ilike '%'||$1||'%' or u.email ilike '%'||$1||'%' or u.phone ilike '%'||$1||'%' or u.company_name ilike '%'||$1||'%') order by u.id desc limit 150`, [s]);
  return (<><div className="row"><h1 className="grow">{t('Clients')}</h1><Link className="btn alt" href="/app/vehicles/new">{t('Register client & vehicle')}</Link></div>
    <form className="card row"><input className="grow" name="s" defaultValue={s} placeholder={t('Search name, email, phone or company')} /><button className="btn">{t('Search')}</button></form>
    <div className="card tw"><table><thead><tr><th>{t('Name')}</th><th>{t('Contact')}</th><th>{t('Vehicles')}</th><th>{t('Jobs')}</th></tr></thead><tbody>
      {rows.map((c) => (<tr key={c.id}><td><b>{c.full_name}</b>{c.company_name && <div className="mute">{c.company_name}</div>}</td><td>{c.email}<div className="mute">{c.phone}</div></td><td><Link href={`/app/vehicles?s=${encodeURIComponent(c.email)}`}>{c.vehicles}</Link></td><td>{c.jobs}</td></tr>))}</tbody></table></div></>);
}
