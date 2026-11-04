import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt } from '@/lib/util';
import Flash from '@/components/Flash';
import { savePart } from '@/actions/inventory';
export const metadata = { title: 'Parts catalogue' };
export default async function PartsAdmin({ searchParams }) {
  const user = await requireUser(['manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const parts = await q('select * from parts order by category, name');
  const Form = ({ p }) => (<form action={savePart} className="f">{p && <input type="hidden" name="id" value={p.id} />}
    <div className="grid g3"><input name="sku" placeholder="SKU" defaultValue={p?.sku} required={!p} readOnly={!!p} /><input name="name" placeholder={t('Name')} defaultValue={p?.name} required /><input name="name_fr" placeholder={t('Name (French)')} defaultValue={p?.name_fr || ''} /></div>
    <div className="grid g3"><input name="category" placeholder={t('Category (e.g. Engine oil)')} defaultValue={p?.category} required list="cats" /><input name="price" type="number" min="0" placeholder={t('Price (XAF)')} defaultValue={p?.price} required /><input name="fitment" placeholder={t('Fits (makes/models)')} defaultValue={p?.fitment || ''} /></div>
    <input name="description" placeholder={t('Description')} defaultValue={p?.description || ''} />
    <div className="row"><label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="online" defaultChecked={p ? p.online : true} /> {t('Sell online')}</label>
      {p && <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="active" value="on" defaultChecked={p.active} /> {t('Active')}</label>}<button className="btn sm">{p ? t('Save') : t('Add part')}</button></div></form>);
  return (<><h1>{t('Parts catalogue & prices')}</h1><Flash sp={sp} t={t} />
    {user.role !== 'admin' && <div className="alert">{t('Your changes are sent to the admin for approval.')}</div>}
    <datalist id="cats">{[...new Set(parts.map((p) => p.category))].map((c) => <option key={c} value={c} />)}</datalist>
    <div className="card"><h3>{t('Add a part')}</h3><Form /></div>
    <div className="card tw"><table><thead><tr><th>SKU</th><th>{t('Part')}</th><th>{t('Category')}</th><th>{t('Price')}</th><th /></tr></thead><tbody>
      {parts.map((p) => (<tr key={p.id}><td>{p.sku}</td><td>{p.name}{!p.active && <span className="badge bad" style={{ marginLeft: 6 }}>{t('inactive')}</span>}</td><td>{p.category}</td><td>{fmt(p.price)}</td><td><details><summary className="mute">{t('Edit')}</summary><div style={{ minWidth: 300 }}><Form p={p} /></div></details></td></tr>))}</tbody></table></div></>);
}
