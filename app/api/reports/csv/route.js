import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
export const dynamic = 'force-dynamic';
const esc = (v) => { const s = v == null ? '' : String(v instanceof Date ? v.toISOString() : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function GET(req) {
  const u = await getUser();
  if (!u || !['admin', 'manager', 'cashier'].includes(u.role)) return new Response('forbidden', { status: 403 });
  const sp = new URL(req.url).searchParams; const from = sp.get('from') || '1970-01-01'; const to = sp.get('to') || '2999-01-01';
  const bIds = u.role === 'admin' ? null : u.branchIds;
  const rows = sp.get('kind') === 'jobs' && u.role !== 'cashier'
    ? await q(`select j.id, b.name branch, v.plate, c.full_name client, j.status, j.created_at from jobs j join branches b on b.id=j.branch_id join vehicles v on v.id=j.vehicle_id join users c on c.id=j.client_id where j.created_at::date between $1 and $2 and ($3::int[] is null or j.branch_id = any($3)) order by j.id`, [from, to, bIds])
    : await q(`select p.id, b.name branch, i.number invoice, p.method, p.amount, p.status, p.receipt_no, p.confirmed_at from payments p join branches b on b.id=p.branch_id join invoices i on i.id=p.invoice_id where p.created_at::date between $1 and $2 and ($3::int[] is null or p.branch_id = any($3)) order by p.id`, [from, to, bIds]);
  const head = rows[0] ? Object.keys(rows[0]) : [];
  const csv = [head.join(','), ...rows.map((r) => head.map((h) => esc(r[h])).join(','))].join('\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="report.csv"' } });
}
