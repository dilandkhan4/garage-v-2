import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import LangSwitch from '@/components/LangSwitch';
export default async function PublicLayout({ children }) {
  const user = await getUser();
  const t = await getT(user);
  return (
    <>
      <header className="top"><div className="wrap">
        <Link href="/" className="brand">Auto<span>Care</span></Link>
        <nav className="pubnav">
          <Link href="/services">{t('Services')}</Link><Link href="/branches">{t('Branches')}</Link>
          <Link href="/shop">{t('Spare parts')}</Link><Link href="/training">{t('Training')}</Link><Link href="/graduates">{t('Graduates')}</Link>
        </nav>
        <span className="grow" />
        <LangSwitch locale={t.locale} />
        {user ? <Link className="btn sm alt" href="/app">{t('My account')}</Link>
          : <><Link className="btn sm ghost" href="/login">{t('Log in')}</Link><Link className="btn sm alt" href="/register">{t('Register')}</Link></>}
      </div></header>
      {children}
      <footer><div className="wrap">© AutoCare Garage Network · {t('Repair, parts and technical training')}</div></footer>
    </>
  );
}
