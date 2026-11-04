import { q } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getT } from '@/lib/i18n';
import { fmt } from '@/lib/util';
export const metadata = { title: 'Reports' };
export default async function Reports({ searchParams }) {
  const user = await requireUser(['manager', 'admin', 'cashier']); const t = await getT(user); const sp = await searchParams;
  const to = sp.to || new Date().toISOString().slice(0, 10); const from = sp.from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const admin = user.role === 'admin'; const bIds = admin ? null : user.branchIds; const range = [from, to, bIds];
  const rev = await q(`select b.name, coalesce(sum(p.amount) filter (where p.status='succeeded'),0)::int total, coalesce(sum(p.amount) filter (where p.status='succeeded' and p.method='cash'),0)::int cash,
      coalesce(sum(p.amount) filter (where p.status='succeeded' and p.method='momo'),0)::int momo, coalesce(sum(p.amount) filter (where p.status='succeeded' and p.method='orange'),0)::int orange, coalesce(sum(p.amount) filter (where p.status='succeeded' and p.method='card'),0)::int card
      from branches b left join payments p on p.branch_id=b.id and p.confirmed_at::date between $1 and $2 where ($3::int[] is null or b.id = any($3)) group by b.id order by b.id`, range);
  const grand = rev.reduce((s, r) => s + r.total, 0);
  const jobs = await q(`select b.name, (count(j.*) filter (where j.status <> 'cancelled'))::int total, (count(j.*) filter (where j.status in ('picked_up','paid')))::int done, (count(j.*) filter (where j.status='cancelled'))::int cancelled
      from branches b left join jobs j on j.branch_id=b.id and j.created_at::date between $1 and $2 where ($3::int[] is null or b.id = any($3)) group by b.id order by b.id`, range);
  const mech = user.role === 'cashier' ? [] : await q(`select u.full_name, b.name branch, count(distinct j.id)::int jobs, coalesce(sum(ji.qty) filter (where ji.kind='labor' and ji.superseded_by is null),0)::numeric(10,1)::float hours from users u join branches b on b.id=u.branch_id left join jobs j on j.mechanic_id=u.id and j.created_at::date between $1 and $2 left join job_items ji on ji.job_id=j.id
      where u.role='mechanic' and ($3::int[] is null or u.branch_id = any($3)) group by u.id, b.name order by jobs desc`, range);
  const partsTop = await q(`select p.name, sum(x.qty)::int qty, sum(x.qty*x.price)::int revenue from (
      select oi.part_id, oi.qty, oi.unit_price price, o.branch_id from order_items oi join orders o on o.id=oi.order_id where o.status<>'cancelled' and o.created_at::date between $1 and $2
      union all select ji.part_id, ji.qty::int, ji.unit_price, j.branch_id from job_items ji join jobs j on j.id=ji.job_id where ji.kind='part' and ji.superseded_by is null and ji.applied and j.created_at::date between $1 and $2) x
      join parts p on p.id=x.part_id where ($3::int[] is null or x.branch_id = any($3)) group by p.id order by qty desc limit 10`, range);
  const reviews = await q(`select b.name, round(avg(r.rating),1)::float avg, count(r.*)::int n from branches b left join reviews r on r.branch_id=b.id and r.created_at::date between $1 and $2 where ($3::int[] is null or b.id = any($3)) group by b.id order by b.id`, range);
  const training = user.role === 'cashier' ? [] : await q(`select b.name, (count(e.*) filter (where e.status='active'))::int active, (count(e.*) filter (where e.status='graduated'))::int graduated, (count(e.*) filter (where e.status in ('dropped','failed')))::int left_ from branches b left join enrollments e on e.branch_id=b.id where ($1::int[] is null or b.id = any($1)) group by b.id order by b.id`, [bIds]);
  return (<><h1>{t('Reports')}</h1>
    <form className="card row"><label className="row" style={{ fontWeight: 400 }}>{t('From')} <input type="date" name="from" defaultValue={from} /></label><label className="row" style={{ fontWeight: 400 }}>{t('To')} <input type="date" name="to" defaultValue={to} /></label><button className="btn sm">{t('Apply')}</button>
      <a className="btn sm ghost" href={`/api/reports/csv?kind=payments&from=${from}&to=${to}`}>{t('Download payments (CSV)')}</a>{user.role !== 'cashier' && <a className="btn sm ghost" href={`/api/reports/csv?kind=jobs&from=${from}&to=${to}`}>{t('Download jobs (CSV)')}</a>}</form>
    <h2>{t('Revenue by branch')} {admin && <span className="mute">· {t('company total')} {fmt(grand)}</span>}</h2>
    <div className="card tw"><table><thead><tr><th>{t('Branch')}</th><th>{t('Total')}</th><th>{t('Cash')}</th><th>MoMo</th><th>Orange</th><th>{t('Card')}</th></tr></thead><tbody>{rev.map((r) => <tr key={r.name}><td>{r.name}</td><td><b>{fmt(r.total)}</b></td><td>{fmt(r.cash)}</td><td>{fmt(r.momo)}</td><td>{fmt(r.orange)}</td><td>{fmt(r.card)}</td></tr>)}</tbody></table></div>
    <h2>{t('Jobs')}</h2><div className="card tw"><table><thead><tr><th>{t('Branch')}</th><th>{t('Opened')}</th><th>{t('Completed')}</th><th>{t('Cancelled')}</th></tr></thead><tbody>{jobs.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.total}</td><td>{r.done}</td><td>{r.cancelled}</td></tr>)}</tbody></table></div>
    {mech.length > 0 && (<><h2>{t('Mechanics')}</h2><div className="card tw"><table><thead><tr><th>{t('Mechanic')}</th><th>{t('Branch')}</th><th>{t('Jobs')}</th><th>{t('Labor hours')}</th></tr></thead><tbody>{mech.map((m) => <tr key={m.full_name}><td>{m.full_name}</td><td>{m.branch}</td><td>{m.jobs}</td><td>{m.hours}</td></tr>)}</tbody></table></div></>)}
    <h2>{t('Top parts sold or fitted')}</h2><div className="card tw"><table><thead><tr><th>{t('Part')}</th><th>{t('Qty')}</th><th>{t('Value')}</th></tr></thead><tbody>{partsTop.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.qty}</td><td>{fmt(p.revenue)}</td></tr>)}{partsTop.length === 0 && <tr><td colSpan="3" className="mute">—</td></tr>}</tbody></table></div>
    <h2>{t('Client satisfaction')}</h2><div className="card tw"><table><tbody>{reviews.map((r) => <tr key={r.name}><td>{r.name}</td><td className="stars">{r.n ? '★'.repeat(Math.round(r.avg)) : ''}</td><td>{r.n ? `${r.avg} (${r.n})` : '—'}</td></tr>)}</tbody></table></div>
    {training.length > 0 && (<><h2>{t('Training')}</h2><div className="card tw"><table><thead><tr><th>{t('Branch')}</th><th>{t('Active')}</th><th>{t('Graduated')}</th><th>{t('Left')}</th></tr></thead><tbody>{training.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.active}</td><td>{r.graduated}</td><td>{r.left_}</td></tr>)}</tbody></table></div></>)}</>);
}
