import Link from 'next/link';
import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { applyForTraining } from '@/actions/training';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Training' };
export default async function TrainingPublic({ searchParams }) {
  const user = await getUser(); const t = await getT(user); const sp = await searchParams;
  const programs = await q(`select p.*, (select count(*)::int from skills s where s.program_id=p.id) skills from programs p where p.active order by id`);
  const branches = await q('select id,name from branches where active order by id');
  return (<div className="wrap" style={{ paddingTop: 24 }}><h1>{t('Technical training & apprenticeships')}</h1>
    <p className="mute" style={{ maxWidth: 680 }}>{t('Learn on real vehicles with experienced mechanics. Your progress is tracked skill by skill, and you graduate with a company certificate that employers can verify with a QR code. Schools can bring students for practical training.')}</p>
    <Flash sp={sp} t={t} />
    <div className="grid g3">{programs.map((p) => (<div className="card" key={p.id}><h3>{t.locale === 'fr' && p.name_fr ? p.name_fr : p.name}</h3><p className="mute">{p.description}</p><span className="badge info">{p.duration_weeks} {t('weeks')}</span> <span className="badge">{p.skills} {t('skills')}</span></div>))}</div>
    <h2 id="apply">{t('Apply')}</h2>
    {user ? <div className="alert">{user.role === 'student' ? <Link href="/app/training">{t('Open my training tracker')}</Link> : t('You are logged in with a non-student account. Use a different email to apply as a student.')}</div> : (
      <form action={applyForTraining} className="card f" style={{ maxWidth: 560 }}>
        <label>{t('Full name')}<input name="full_name" required /></label><div className="grid g2"><label>Email<input name="email" type="email" required /></label><label>{t('Phone')}<input name="phone" /></label></div>
        <label>{t('Create a password')}<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
        <div className="grid g2"><label>{t('Program')}<select name="program_id">{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{t('Branch')}<select name="branch_id">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
        <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="is_minor" /> {t('I am under 18')}</label>
        <div className="grid g2"><input name="guardian_name" placeholder={t('Parent / guardian name (if under 18)')} /><input name="guardian_phone" placeholder={t('Parent / guardian phone')} /></div>
        <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="guardian_consent" /> {t('My parent or guardian consents to my training and to the use of my data.')}</label>
        <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="terms" /> {t('I accept the terms, including that my name, skills and certificate may appear on the public graduates page once I graduate.')}</label>
        <button className="btn alt">{t('Submit application')}</button></form>)}
    <p className="mute">{t('Representing a school?')} {t('Contact your nearest branch to set up a school account.')}</p></div>);
}
