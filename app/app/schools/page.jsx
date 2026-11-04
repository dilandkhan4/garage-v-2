import { q } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import Flash from '@/components/Flash';
import { saveSchool, setSchoolLimit } from '@/actions/training';
export const metadata = { title: 'Schools' };
export default async function Schools({ searchParams }) {
  const user = await requireUser(['manager', 'admin']); const t = await getT(user); const sp = await searchParams;
  const schools = await q(`select s.*, (select count(*)::int from enrollments e where e.school_id=s.id and e.status in ('applied','active')) students from schools s order by name`);
  const branches = (await q('select id,name from branches where active order by id')).filter((b) => ownsBranch(user, b.id));
  const limits = await q('select * from school_branch_limits');
  const reps = await q("select id, full_name, email, school_id from users where role='school_rep'");
  return (<><h1>{t('Schools')}</h1><Flash sp={sp} t={t} />
    <form action={saveSchool} className="card f"><h3>{t('Add a school')}</h3><div className="grid g2"><input name="name" placeholder={t('School name')} required /><input name="contact" placeholder={t('Contact person')} /></div><div className="grid g2"><input name="phone" placeholder={t('Phone')} /><input name="email" placeholder="Email" /></div><button className="btn sm">{t('Add school')}</button>
      <div className="mute">{t('Create the school representative’s login under People (role: school representative, linked to this school).')}</div></form>
    {schools.map((s) => (<div className="card" key={s.id}><h3>{s.name} <span className="mute">· {s.students} {t('students')}</span></h3><div className="mute">{s.contact} {s.phone} {s.email}</div>
      <div className="mute">{t('Representatives')}: {reps.filter((r) => r.school_id === s.id).map((r) => `${r.full_name} (${r.email})`).join(', ') || '—'}</div>
      <div className="row" style={{ marginTop: 8 }}>{branches.map((b) => { const l = limits.find((x) => x.school_id === s.id && x.branch_id === b.id);
        return (<form action={setSchoolLimit} className="row" key={b.id}><input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="branch_id" value={b.id} /><span>{b.name}:</span><input name="max" type="number" min="0" defaultValue={l?.max_students ?? 0} style={{ width: 80 }} /><button className="btn sm">{t('Set limit')}</button></form>); })}</div></div>))}</>);
}
