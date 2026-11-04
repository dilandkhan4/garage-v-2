'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { q1 } from '@/lib/db';
import { checkPassword, hashPassword, createSession, destroySession, getUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { str } from '@/lib/util';

export async function login(fd) {
  const email = str(fd, 'email').toLowerCase();
  const u = await q1('select * from users where lower(email)=$1 and active', [email]);
  if (!u || !checkPassword(str(fd, 'password'), u.password_hash)) redirect('/login?err=1');
  await createSession(u.id);
  await audit(u.id, 'login', 'user', u.id);
  redirect(str(fd, 'next').startsWith('/app') ? str(fd, 'next') : '/app');
}
export async function logout() { await destroySession(); redirect('/'); }

export async function registerClient(fd) {
  const email = str(fd, 'email').toLowerCase();
  const pw = str(fd, 'password');
  if (!email.includes('@') || pw.length < 8 || !str(fd, 'full_name')) redirect('/register?err=invalid');
  if (await q1('select 1 from users where lower(email)=$1', [email])) redirect('/register?err=exists');
  const locale = (await cookies()).get('lang')?.value === 'fr' ? 'fr' : 'en';
  const u = await q1(
    `insert into users(email,phone,password_hash,full_name,role,locale,company_name) values ($1,$2,$3,$4,'client',$5,$6) returning id`,
    [email, str(fd, 'phone'), hashPassword(pw), str(fd, 'full_name'), locale, str(fd, 'company_name') || null]);
  await audit(u.id, 'register', 'user', u.id, { role: 'client' });
  await createSession(u.id);
  redirect('/app');
}

export async function setLang(fd) {
  const lang = str(fd, 'lang') === 'fr' ? 'fr' : 'en';
  (await cookies()).set('lang', lang, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  const u = await getUser();
  if (u) await (await import('@/lib/db')).q('update users set locale=$2 where id=$1', [u.id, lang]);
  const back = str(fd, 'path');
  redirect(back.startsWith('/') ? back : '/');
}
