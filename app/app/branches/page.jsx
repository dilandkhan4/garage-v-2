import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { saveBranch } from '@/actions/admin';
export const metadata = { title: 'Branches' };
export default async function BranchesAdmin({ searchParams }) {
  const user = await requireUser(['admin']);
  const t = await getT(user); const sp = await searchParams;
  const rows = await q(`select b.*, (select count(*)::int from users u where u.branch_id=b.id and u.active) staff, (select count(*)::int from jobs j where j.branch_id=b.id and j.status not in ('picked_up','cancelled')) open_jobs from branches b order by id`);
  return (<><h1>{t('Branches')}</h1><Flash sp={sp} t={t} />
    <form action={saveBranch} className="card f" style={{ maxWidth: 620 }}><h3>{t('Add a branch')}</h3>
      <div className="grid g2"><input name="name" placeholder={t('Branch name')} required /><input name="city" placeholder={t('City')} /></div><div className="grid g2"><input name="address" placeholder={t('Address')} /><input name="phone" placeholder={t('Phone')} /></div>
      <button className="btn alt">{t('Add branch')}</button><div className="mute">{t('The new branch immediately shares client records, prices, parts and programs. Then assign staff to it.')}</div></form>
    <div className="card tw"><table><thead><tr><th>{t('Branch')}</th><th>{t('Staff')}</th><th>{t('Open jobs')}</th><th /></tr></thead><tbody>
      {rows.map((b) => (<tr key={b.id}><td><b>{b.name}</b> <span className="mute">{b.city}</span>{!b.active && <span className="badge bad" style={{ marginLeft: 6 }}>{t('inactive')}</span>}</td><td>{b.staff}</td><td>{b.open_jobs}</td>
        <td><details><summary className="mute">{t('Edit')}</summary><form action={saveBranch} className="f" style={{ minWidth: 260 }}><input type="hidden" name="id" value={b.id} /><input name="name" defaultValue={b.name} /><input name="city" defaultValue={b.city || ''} /><input name="address" defaultValue={b.address || ''} /><input name="phone" defaultValue={b.phone || ''} />
          <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="active" defaultChecked={b.active} /> {t('Active')}</label><button className="btn sm">{t('Save')}</button></form></details></td></tr>))}</tbody></table></div></>);
}
