import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Branches' };
export default async function Branches() {
  const t = await getT(await getUser());
  const rows = await q('select * from branches where active order by id');
  return (<div className="wrap" style={{ paddingTop: 24 }}><h1>{t('Branches')}</h1>
    <p className="mute">{t('Your vehicle record is available at every branch.')}</p>
    <div className="grid g3">{rows.map((b) => (<div className="card" key={b.id}><h3>{b.name}</h3><div>{b.address}</div><div className="mute">{b.city}</div>{b.phone && <div>☎ {b.phone}</div>}</div>))}</div></div>);
}
