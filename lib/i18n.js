import { cookies } from 'next/headers';
import fr from './fr';
export async function getLocale(user) {
  const c = (await cookies()).get('lang')?.value;
  if (c === 'fr' || c === 'en') return c;
  return user?.locale === 'fr' ? 'fr' : 'en';
}
export async function getT(user) {
  const locale = await getLocale(user);
  const t = (s, vars) => {
    let out = locale === 'fr' ? (fr[s] ?? s) : s;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
    return out;
  };
  t.locale = locale;
  return t;
}
export const makeT = (locale) => (s, vars) => {
  let out = locale === 'fr' ? (fr[s] ?? s) : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  return out;
};
