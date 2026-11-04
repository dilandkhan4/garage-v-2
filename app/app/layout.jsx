import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q1 } from '@/lib/db';
import { unreadTotal } from '@/lib/chat';
import { getT } from '@/lib/i18n';
import { NAV } from '@/lib/nav';
import { ROLE_LABEL } from '@/lib/util';
import { logout } from '@/actions/auth';
import LangSwitch from '@/components/LangSwitch';
import NavLinks from '@/components/NavLinks';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }) {
  const user = await requireUser();
  const t = await getT(user);
  const unread = (await q1('select count(*)::int c from notifications where user_id=$1 and read_at is null', [user.id])).c;
  const chatUnread = await unreadTotal(user.id);
  const branch = user.branch_id ? await q1('select name from branches where id=$1', [user.branch_id]) : null;
  const items = NAV.filter(([, , roles]) => roles.includes(user.role)).map(([href, label]) => ({ href, label: t(label), badge: href === '/app/notifications' ? unread : href === '/app/chat' ? chatUnread : 0 }));
  return (
    <>
      <input type="checkbox" id="nav" />
      <header className="top"><div className="wrap" style={{ maxWidth: 'none' }}>
        <label htmlFor="nav" className="menu-btn" aria-label="Menu">☰</label>
        <Link href="/app" className="brand">Auto<span>Care</span></Link>
        <span className="grow" />
        <span className="mute" style={{ color: '#fff' }}>{user.full_name} · {t(ROLE_LABEL[user.role])}{branch ? ` · ${branch.name}` : ''}</span>
        <LangSwitch locale={t.locale} path="/app" />
        <form action={logout}><button className="btn sm ghost">{t('Log out')}</button></form>
      </div></header>
      <div className="shell">
        <aside className="side"><NavLinks items={items} /></aside>
        <main className="main">{children}</main>
      </div>
    </>
  );
}
