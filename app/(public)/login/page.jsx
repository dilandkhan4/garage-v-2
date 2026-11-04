import Link from 'next/link';
import { login } from '@/actions/auth';
import { getT } from '@/lib/i18n';
export const metadata = { title: 'Log in' };
export default async function Login({ searchParams }) {
  const sp = await searchParams; const t = await getT();
  return (<div className="wrap" style={{ maxWidth: 440, paddingTop: 32 }}><h1>{t('Log in')}</h1>
    {sp.err && <div className="alert bad">{t('Wrong email or password.')}</div>}
    <form className="card f" action={login}>
      <input type="hidden" name="next" value={sp.next || ''} />
      <label>{t('Email')}<input name="email" type="email" required autoComplete="username" /></label>
      <label>{t('Password')}<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="btn">{t('Log in')}</button>
      <div className="mute">{t('No account?')} <Link href="/register">{t('Register')}</Link></div>
    </form></div>);
}
