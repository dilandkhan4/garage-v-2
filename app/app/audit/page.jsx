import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fdt } from '@/lib/util';
export const metadata = { title: 'Audit log' };
export default async function Audit({ searchParams }) {
  const user = await requireUser(['admin']); const t = await getT(user); const sp = await searchParams; const s = (sp.s || '').trim();
  const rows = await q(`select a.*, u.full_name from audit_log a left join users u on u.id=a.actor_id where ($1='' or a.action ilike '%'||$1||'%' or a.entity ilike '%'||$1||'%') order by a.id desc limit 200`, [s]);
  return (<><h1>{t('Audit log')}</h1><p className="mute">{t('Every change is recorded here and cannot be edited or deleted.')}</p>
    <form className="card row"><input className="grow" name="s" defaultValue={s} placeholder={t('Filter by action or record')} /><button className="btn sm">{t('Filter')}</button></form>
    <div className="card tw"><table><thead><tr><th>{t('When')}</th><th>{t('Who')}</th><th>{t('Action')}</th><th>{t('Record')}</th><th>{t('Details')}</th></tr></thead><tbody>
      {rows.map((r) => (<tr key={r.id}><td>{fdt(r.created_at)}</td><td>{r.full_name || '—'}</td><td>{r.action}</td><td>{r.entity} {r.entity_id}</td><td className="mute" style={{ maxWidth: 300, wordBreak: 'break-word' }}>{JSON.stringify(r.data)}</td></tr>))}</tbody></table></div></>);
}
