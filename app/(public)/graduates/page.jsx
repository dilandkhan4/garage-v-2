import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { getSetting } from '@/lib/settings';
import Flash from '@/components/Flash';
import { submitEmployerRequest } from '@/actions/training';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Graduates' };
export default async function GraduatesPublic({ searchParams }) {
  const t = await getT(await getUser()); const sp = await searchParams;
  const fields = await getSetting('graduate_fields');
  const rows = await q(`select g.*, u.full_name, u.phone, p.name program, b.name branch, c.code from graduate_profiles g join users u on u.id=g.user_id and u.role='student' join enrollments e on e.student_id=u.id and e.status='graduated'
     join programs p on p.id=e.program_id join branches b on b.id=e.branch_id join certificates c on c.enrollment_id=e.id and not c.revoked where g.listed and not g.hired order by e.end_date desc`);
  const has = (f) => fields.includes(f);
  return (<div className="wrap" style={{ paddingTop: 24 }}><h1>{t('Our graduates')}</h1>
    <p className="mute" style={{ maxWidth: 680 }}>{t('Trained and certified in our workshops. Employers contact us and we make the introduction.')}</p><Flash sp={sp} t={t} />
    <div className="grid g3">{rows.map((g) => (<div className="card" key={g.user_id}>
      {has('photo') && g.photo_url && <img src={g.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: 99, objectFit: 'cover' }} />}
      {has('name') && <h3 style={{ marginTop: 6 }}>{g.full_name}</h3>}{has('headline') && g.headline && <div><b>{g.headline}</b></div>}<div className="mute">{g.program}{has('branch') ? ` · ${g.branch}` : ''}</div>
      {has('skills') && g.skills && <p>{g.skills}</p>}{has('phone') && g.phone_public && g.phone && <div>☎ {g.phone}</div>}
      {has('certificate') && <a href={`/verify/${g.code}`}>{t('Verified certificate')} ✓</a>}
      <details style={{ marginTop: 8 }}><summary className="btn sm ghost" style={{ display: 'inline-block' }}>{t('Request an introduction')}</summary>
        <form action={submitEmployerRequest} className="f" style={{ marginTop: 8 }}><input type="hidden" name="graduate_user_id" value={g.user_id} /><input name="company" placeholder={t('Company')} required /><input name="contact_name" placeholder={t('Your name')} required /><input name="email" type="email" placeholder="Email" /><input name="phone" placeholder={t('Phone')} /><textarea name="message" placeholder={t('What role are you hiring for?')} /><button className="btn sm">{t('Send')}</button></form></details></div>))}
      {rows.length === 0 && <p className="mute">{t('Our first graduates will appear here.')}</p>}</div>
    <h2>{t('Looking to hire?')}</h2>
    <form action={submitEmployerRequest} className="card f" style={{ maxWidth: 520 }}><input name="company" placeholder={t('Company')} required /><input name="contact_name" placeholder={t('Your name')} required /><div className="grid g2"><input name="email" type="email" placeholder="Email" /><input name="phone" placeholder={t('Phone')} /></div><textarea name="message" placeholder={t('What roles are you hiring for?')} /><button className="btn alt">{t('Contact us')}</button></form></div>);
}
