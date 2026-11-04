import Link from 'next/link';
import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt } from '@/lib/util';
import { getSetting } from '@/lib/settings';
import Flash from '@/components/Flash';
import { placeOnlineOrder } from '@/actions/shop';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Spare parts' };
export default async function Shop({ searchParams }) {
  const user = await getUser(); const t = await getT(user); const sp = await searchParams;
  const cat = sp.cat || ''; const s = (sp.s || '').trim();
  const parts = await q(`select p.*, coalesce(sum(st.qty),0)::int stock from parts p left join stock st on st.part_id=p.id
    where p.active and p.online and ($1='' or p.category=$1) and ($2='' or p.name ilike '%'||$2||'%' or p.fitment ilike '%'||$2||'%' or p.sku ilike '%'||$2||'%') group by p.id order by p.category, p.name`, [cat, s]);
  const cats = await q('select distinct category from parts where active and online order by 1');
  const branches = await q('select id,name from branches where active order by id');
  const fee = await getSetting('delivery_fee');
  const client = user?.role === 'client';
  const Table = () => (<div className="card tw"><table><thead><tr><th>{t('Part')}</th><th>{t('Category')}</th><th>{t('Fits')}</th><th>{t('Price')}</th><th>{t('Availability')}</th>{client && <th>{t('Qty')}</th>}</tr></thead><tbody>
    {parts.map((p) => (<tr key={p.id}><td><b>{t.locale === 'fr' && p.name_fr ? p.name_fr : p.name}</b><div className="mute">{p.sku}</div></td><td>{p.category}</td><td className="mute">{p.fitment || t('Universal')}</td><td>{fmt(p.price)}</td>
      <td>{p.stock > 0 ? <span className="badge ok">{t('In stock')}</span> : <span className="badge bad">{t('Out of stock')}</span>}</td>{client && <td><input type="number" min="0" max={p.stock} name={`qty_${p.id}`} defaultValue="0" style={{ width: 80 }} disabled={p.stock === 0} /></td>}</tr>))}
    {parts.length === 0 && <tr><td colSpan="6" className="mute">{t('No parts found.')}</td></tr>}</tbody></table></div>);
  return (<div className="wrap" style={{ paddingTop: 24 }}><h1>{t('Spare parts')}</h1><Flash sp={sp} t={t} />
    <form className="card row"><input className="grow" name="s" defaultValue={s} placeholder={t('Search by name, SKU or vehicle')} /><select name="cat" defaultValue={cat}><option value="">{t('All categories')}</option>{cats.map((c) => <option key={c.category}>{c.category}</option>)}</select><button className="btn">{t('Search')}</button></form>
    {client ? (<form action={placeOnlineOrder}><Table />
      <div className="card f" style={{ maxWidth: 520 }}><h3>{t('Your order')}</h3>
        <label>{t('Collect from / ship from')}<select name="branch_id">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="delivery" /> {t('Deliver to me')} ({fmt(fee)})</label>
        <label>{t('Delivery address')}<textarea name="address" /></label><button className="btn alt">{t('Place order')}</button>
        <div className="mute">{t('You will pay by MTN MoMo, Orange Money or card on the next page.')}</div></div></form>)
      : (<><Table /><div className="alert">{user ? t('Staff place sales from the dashboard.') : <>{t('To order online, please')} <Link href="/login">{t('log in')}</Link> {t('or')} <Link href="/register">{t('register')}</Link>.</>}</div></>)}
  </div>);
}
