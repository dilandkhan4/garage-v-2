import { tx } from './db';
import { notify } from './notify';

// Marks a payment successful, issues + stores a receipt, updates the invoice. Idempotent.
export async function confirmPayment(paymentId) {
  return tx(async ({ q, q1 }) => {
    const p = await q1('select * from payments where id=$1 for update', [paymentId]);
    if (!p || p.status === 'succeeded') return p;
    const inv = await q1('select * from invoices where id=$1 for update', [p.invoice_id]);
    const seq = await q1("select nextval('receipt_seq')::int n");
    const no = `R${String(p.branch_id).padStart(2, '0')}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(seq.n).padStart(5, '0')}`;
    await q("update payments set status='succeeded', confirmed_at=now(), receipt_no=$2 where id=$1", [p.id, no]);
    const branch = await q1('select name from branches where id=$1', [p.branch_id]);
    await q('insert into receipts(payment_id,number,snapshot) values ($1,$2,$3)', [p.id, no, JSON.stringify({
      invoice: inv.number, amount: p.amount, method: p.method, branch: branch?.name, customer: inv.customer_name, paid_at: new Date().toISOString(),
      subtotal: inv.subtotal, tax: inv.tax, total: inv.total })]);
    const paid = (await q1("select coalesce(sum(amount),0)::int s from payments where invoice_id=$1 and status='succeeded'", [inv.id])).s;
    const status = paid >= inv.total ? 'paid' : 'partial';
    await q('update invoices set status=$2 where id=$1', [inv.id, status]);
    if (status === 'paid' && inv.job_id) await q("update jobs set status='paid' where id=$1 and status in ('invoiced','ready')", [inv.job_id]);
    if (inv.client_id) await notify(inv.client_id, { kind: 'payment', subject: `Receipt ${no}`, body: `We received ${p.amount} XAF (${p.method}). Invoice ${inv.number}.`, link: `/app/invoices/${inv.id}`, channels: ['inapp', 'email'] });
    return { ...p, status: 'succeeded', receipt_no: no };
  });
}
