import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { saveProgram, addSkill, removeSkill } from '@/actions/training';
export const metadata = { title: 'Training programs' };
export default async function Programs({ searchParams }) {
  const user = await requireUser(['manager', 'admin']); const t = await getT(user); const sp = await searchParams;
  const programs = await q('select * from programs order by id');
  const skills = await q('select * from skills order by program_id, level, position');
  const Form = ({ p }) => (<form action={saveProgram} className="f">{p && <input type="hidden" name="id" value={p.id} />}
    <div className="grid g2"><input name="name" placeholder={t('Program name')} defaultValue={p?.name} required /><input name="name_fr" placeholder={t('Name (French)')} defaultValue={p?.name_fr || ''} /></div><textarea name="description" placeholder={t('Description')} defaultValue={p?.description || ''} />
    <div className="grid g3"><label>{t('Duration (weeks)')}<input name="duration_weeks" type="number" min="1" defaultValue={p?.duration_weeks || 12} /></label><label>{t('Level needed to work on client cars')}<input name="real_work_level" type="number" min="1" defaultValue={p?.real_work_level || 3} /></label>
      {p && <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="active" defaultChecked={p.active} /> {t('Open for applications')}</label>}</div><button className="btn sm">{p ? t('Save') : t('Add program')}</button></form>);
  return (<><h1>{t('Programs & skills')}</h1><Flash sp={sp} t={t} />
    <div className="card"><h3>{t('Add a program')}</h3><Form /></div>
    {programs.map((p) => (<div className="card" key={p.id}><h3>{p.name} <span className="mute">· {p.duration_weeks} {t('weeks')}{!p.active && ` · ${t('closed')}`}</span></h3>
      <table><tbody>{skills.filter((s) => s.program_id === p.id).map((s) => (<tr key={s.id}><td style={{ width: 70 }}>L{s.level}</td><td>{s.name}</td><td><form action={removeSkill}><input type="hidden" name="id" value={s.id} /><button className="btn sm ghost">{t('Remove')}</button></form></td></tr>))}</tbody></table>
      <form action={addSkill} className="row" style={{ marginTop: 8 }}><input type="hidden" name="program_id" value={p.id} /><input className="grow" name="name" placeholder={t('New skill')} required /><input name="name_fr" placeholder={t('French name')} /><input name="level" type="number" min="1" defaultValue="1" style={{ width: 80 }} title={t('Level')} /><button className="btn sm">{t('Add skill')}</button></form>
      <details style={{ marginTop: 8 }}><summary className="mute">{t('Edit program')}</summary><Form p={p} /></details></div>))}</>);
}
