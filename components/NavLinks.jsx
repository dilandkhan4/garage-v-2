'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export default function NavLinks({ items }) {
  const p = usePathname();
  return items.map((i) => {
    const on = i.href === '/app' ? p === '/app' : p.startsWith(i.href);
    return <Link key={i.href} href={i.href} className={on ? 'on' : ''} onClick={() => { const c = document.getElementById('nav'); if (c) c.checked = false; }}>
      {i.label}{i.badge ? ` (${i.badge})` : ''}</Link>;
  });
}
