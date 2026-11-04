import Link from 'next/link';
import { registerClient } from '@/actions/auth';
import { getT } from '@/lib/i18n';
export const metadata = { title: 'Register' };
export default async function Register({ searchParams }) {
  const sp = await searchParams; const t = await getT();
  return (<div className="wrap" style={{ maxWidth: 480, paddingTop: 32 }}><h1>{t('Create your account')}</h1>
    {sp.err === 'exists' && <div className="alert bad">{t('This email already has an account.')}</div>}
    {sp.err === 'invalid' && <div className="alert bad">{t('Please fill every field. The password needs at least 8 characters.')}</div>}
    <form className="card f" action={registerClient}>
      <label>{t('Full name')}<input name="full_name" required /></label>
      <label>{t('Email')}<input name="email" type="email" required /></label>
      <label>{t('Phone (WhatsApp / SMS)')}<input name="phone" placeholder="+237 6XX XXX XXX" /></label>
      <label>{t('Company or fleet name (optional)')}<input name="company_name" /></label>
      <label>{t('Password')}<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
      <button className="btn alt">{t('Register')}</button>
      <div className="mute">{t('Already registered?')} <Link href="/login">{t('Log in')}</Link></div>
    </form></div>);
}
