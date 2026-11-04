import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { saveInterval, deleteInterval } from '@/actions/inventory';
export const metadata = { title: 'Service intervals' };
export default async function Intervals({ searchParams }) {
  const user = await requireUser(['manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const rows = await q('select * from service_intervals order by category, make nulls first, model nulls first');
  const cats = await q('select distinct category from parts order by 1');
  return (<><h1>{t('Service intervals (manufacturer specs)')}</h1><Flash sp={sp} t={t} />
    <p className="mute">{t('When a part is fitted, its expiry date and due mileage come from here. A rule for a specific make and model overrides a make-wide rule, which overrides the generic rule.')}</p>
    {user.role !== 'admin' && <div className="alert">{t('Your changes are sent to the admin for approval.')}</div>}
    <form action={saveInterval} className="card f"><h3>{t('Add or change an interval')}</h3><div className="grid g3"><label>{t('Part category')}<input name="category" list="c" required /></label><label>{t('Make (blank = all)')}<input name="make" /></label><label>{t('Model (blank = all)')}<input name="model" /></label></div>
      <datalist id="c">{cats.map((c) => <option key={c.category} value={c.category} />)}</datalist>
      <div className="grid g3"><label>{t('Months')}<input name="months" type="number" min="1" /></label><label>{t('Kilometres')}<input name="km" type="number" min="1" /></label><span /></div><button className="btn sm">{t('Save interval')}</button></form>
    <div className="card tw"><table><thead><tr><th>{t('Category')}</th><th>{t('Make')}</th><th>{t('Model')}</th><th>{t('Months')}</th><th>km</th>{user.role === 'admin' && <th />}</tr></thead><tbody>
      {rows.map((r) => (<tr key={r.id}><td>{r.category}</td><td>{r.make || t('all')}</td><td>{r.model || t('all')}</td><td>{r.months ?? '—'}</td><td>{r.km?.toLocaleString() ?? '—'}</td>{user.role === 'admin' && <td><form action={deleteInterval}><input type="hidden" name="id" value={r.id} /><button className="btn sm ghost">{t('Delete')}</button></form></td>}</tr>))}</tbody></table></div></>);
}
