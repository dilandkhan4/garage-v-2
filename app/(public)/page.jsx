import Link from 'next/link';
import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const t = await getT(await getUser());
  const branches = await q('select name, city from branches where active order by id');
  const reviews = await q(`select r.rating, r.comment, u.full_name, b.name branch from reviews r
     join users u on u.id=r.client_id join branches b on b.id=r.branch_id where r.comment is not null order by r.created_at desc limit 3`);
  return (
    <>
      <section className="hero"><div className="wrap">
        <h1>{t('Your vehicle’s full history, at every branch')}</h1>
        <p>{t('Register your vehicle once. Every part we fit is recorded with its expiry date, and we remind you before it is due, wherever you choose to visit us.')}</p>
        <div className="row"><Link className="btn alt" href="/register">{t('Register your vehicle')}</Link><Link className="btn ghost" style={{ color: '#fff', borderColor: '#fff6' }} href="/services">{t('See our services')}</Link></div>
      </div></section>
      <div className="wrap" style={{ paddingTop: 24 }}>
        <div className="grid g4">
          {[['Repair & maintenance', 'Skilled mechanics, transparent quotes you approve before work starts.'],
            ['Service reminders', 'Reminders by app, SMS, WhatsApp and email 7 and 3 days before a part is due.'],
            ['Genuine spare parts', 'Buy in store or online, with delivery.'],
            ['Technical training', 'Apprenticeships with certificates, open to schools and individuals.']].map(([h, p]) => (
            <div className="card" key={h}><h3>{t(h)}</h3><p className="mute">{t(p)}</p></div>))}
        </div>
        <h2>{t('Our branches')}</h2>
        <div className="grid g3">{branches.map((b) => <div className="card" key={b.name}><b>{b.name}</b><div className="mute">{b.city}</div></div>)}</div>
        {reviews.length > 0 && (<><h2>{t('What clients say')}</h2>
          <div className="grid g3">{reviews.map((r, i) => (<div className="card" key={i}><div className="stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div><p>“{r.comment}”</p><div className="mute">{r.full_name} · {r.branch}</div></div>))}</div></>)}
      </div>
    </>
  );
}
