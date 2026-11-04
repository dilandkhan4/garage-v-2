import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/util';
import Flash from '@/components/Flash';
import { createUser, updateUser, resetPassword } from '@/actions/admin';
export const metadata = { title: 'People' };
export default async function Staff({ searchParams }) {
  const user = await requireUser(['manager', 'admin']);
  const t = await getT(user); const sp = await searchParams;
  const admin = user.role === 'admin';
  const roleFilter = sp.role || '';
  const branches = await q('select id,name from branches where active order by id');
  const schools = await q('select id,name from schools order by name');
  const users = await q(`select u.*, b.name branch, coalesce((select array_agg(branch_id) from user_branches ub where ub.user_id=u.id),'{}') extra from users u left join branches b on b.id=u.branch_id
     where u.role<>'client' and ($1='' or u.role=$1) and ($2::int[] is null or u.branch_id = any($2) or exists(select 1 from user_branches ub where ub.user_id=u.id and ub.branch_id = any($2))) order by u.role, u.full_name limit 300`, [roleFilter, admin ? null : user.branchIds]);
  const RoleOpts = () => Object.keys(ROLE_LABEL).filter((r) => r !== 'client').map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>);
  return (<><h1>{t('People')}</h1><Flash sp={sp} t={t} />
    {admin && (<form action={createUser} className="card f"><h3>{t('Create an account')}</h3>
      <div className="grid g3"><input name="full_name" placeholder={t('Full name')} required /><input name="email" type="email" placeholder="Email" required /><input name="phone" placeholder={t('Phone')} /></div>
      <div className="grid g3"><label>{t('Role')}<select name="role"><RoleOpts /></select></label><label>{t('Home branch')}<select name="branch_id"><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>{t('School (school representatives)')}<select name="school_id"><option value="">—</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
      <fieldset style={{ border: 0, padding: 0 }}><div className="mute">{t('Also works at (mechanics and others who rotate between branches)')}</div><div className="row">{branches.map((b) => <label key={b.id} className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="extra_branches" value={b.id} /> {b.name}</label>)}</div></fieldset>
      <button className="btn alt">{t('Create account')}</button><div className="mute">{t('A temporary password is shown once after creation.')}</div></form>)}
    <form className="card row"><select name="role" defaultValue={roleFilter}><option value="">{t('All roles')}</option><RoleOpts /></select><button className="btn sm">{t('Filter')}</button></form>
    <div className="card tw"><table><thead><tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Branch')}</th><th>{t('Contact')}</th>{admin && <th />}</tr></thead><tbody>
      {users.map((u) => (<tr key={u.id}><td>{u.full_name}{!u.active && <span className="badge bad" style={{ marginLeft: 6 }}>{t('inactive')}</span>}</td><td>{t(ROLE_LABEL[u.role])}</td><td>{u.branch || '—'}{u.extra.length > 0 && <span className="mute"> +{u.extra.length}</span>}</td><td className="mute">{u.email}<br />{u.phone}</td>
        {admin && <td><details><summary className="mute">{t('Edit')}</summary><form action={updateUser} className="f" style={{ minWidth: 280 }}><input type="hidden" name="id" value={u.id} />
          <input name="full_name" defaultValue={u.full_name} /><input name="phone" defaultValue={u.phone || ''} />
          <select name="role" defaultValue={u.role}>{Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}</select>
          <select name="branch_id" defaultValue={u.branch_id || ''}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select name="school_id" defaultValue={u.school_id || ''}><option value="">—</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <div className="row">{branches.map((b) => <label key={b.id} className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="extra_branches" value={b.id} defaultChecked={u.extra.includes(b.id)} /> {b.name}</label>)}</div>
          <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="active" defaultChecked={u.active} /> {t('Active')}</label><button className="btn sm">{t('Save')}</button></form>
          <form action={resetPassword} style={{ marginTop: 6 }}><input type="hidden" name="id" value={u.id} /><button className="btn sm ghost">{t('Reset password')}</button></form></details></td>}</tr>))}</tbody></table></div></>);
}
