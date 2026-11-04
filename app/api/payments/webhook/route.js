import { q1 } from '@/lib/db';
import { confirmPayment } from '@/lib/payments';
import { q } from '@/lib/db';
// Aggregator callback. Body: { reference, status: 'success'|'failed' }. Protect with PAYMENT_WEBHOOK_SECRET.
export async function POST(req) {
  if (process.env.PAYMENT_WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== process.env.PAYMENT_WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
  const b = await req.json().catch(() => ({}));
  const p = await q1('select * from payments where provider_ref=$1 or provider_ref=$2', [b.reference, `TEST-${b.reference}`]);
  if (!p) return new Response('unknown', { status: 404 });
  if (b.status === 'success') await confirmPayment(p.id); else await q("update payments set status='failed' where id=$1 and status='pending'", [p.id]);
  return Response.json({ ok: true });
}
