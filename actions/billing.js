'use server';
import { redirect } from 'next/navigation';
import { q, q1, tx } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, guard } from '@/lib/guard';
import { int, str, back } from '@/lib/util';
import { notify } from '@/lib/notify';
import { getSetting } from '@/lib/settings';
import { startCharge, providerMode } from '@/lib/providers';
import { confirmPayment } from '@/lib/payments';
import { issueInvoiceFor } from '@/lib/invoicing';

const BILLERS = ['cashier', 'receptionist', 'manager', 'admin'];

export async function createInvoice(fd) {
  const u = await requireUser(BILLERS);
  const id = int(fd, 'job_id'); const path = `/app/jobs/${id}`;
  const inv = await guard(path, () => tx(async (db) => {
    const j = await db.q1('select j.*, u.full_name client from jobs j join users u on u.id=j.client_id where j.id=$1 for update', [id]);
    if (!j || !ownsBranch(u, j.branch_id)) fail('Not allowed.');
    if (j.status !== 'ready') fail('The vehicle must pass quality check before invoicing.');
    const s = (await db.q1('select coalesce(sum(round(qty*unit_price)),0)::int s from job_items where job_id=$1 and superseded_by is null', [id])).s;
    if (s <= 0) fail('Nothing to invoice.');
    const inv = await issueInvoiceFor(db, { jobId: id, branchId: j.branch_id, clientId: j.client_id, customer: j.client, subtotal: s });
    await db.q("update jobs set status='invoiced' where id=$1", [id]);
    return inv;
  }));
  await audit(u.id, 'invoice_issued', 'invoice', inv.id, { number: inv.number });
  await notify(inv.client_id, { kind: 'invoice', subject: `Invoice ${inv.number}`, body: `Your invoice of ${inv.total} XAF is ready. You can pay by MTN MoMo, Orange Money or card in the app, or at the branch.`, link: `/app/invoices/${inv.id}`, channels: ['inapp', 'email', 'whatsapp'] });
  await q('update invoices set sent_via=$2 where id=$1', [inv.id, 'inapp,email,whatsapp']);
  redirect(back(`/app/invoices/${inv.id}`, 'ok', 'Invoice issued and sent to the client.'));
}

export async function sendInvoice(fd) {
  const u = await requireUser(BILLERS);
  const inv = await q1('select * from invoices where id=$1', [int(fd, 'id')]);
  if (!inv || !ownsBranch(u, inv.branch_id) || !inv.client_id) redirect('/app/invoices');
  await notify(inv.client_id, { kind: 'invoice', subject: `Invoice ${inv.number}`, body: `Invoice ${inv.number}: ${inv.total} XAF (${inv.status}).`, link: `/app/invoices/${inv.id}`, channels: ['inapp', 'email', 'whatsapp'] });
  await q('update invoices set sent_via=$2 where id=$1', [inv.id, 'inapp,email,whatsapp']);
  redirect(back(`/app/invoices/${inv.id}`, 'ok', 'Invoice sent again.'));
}

export async function recordPayment(fd) {
  const u = await requireUser(['client', ...BILLERS]);
  const invId = int(fd, 'invoice_id'); const path = `/app/invoices/${invId}`;
  const method = str(fd, 'method');
  const payment = await guard(path, async () => {
    const inv = await q1('select * from invoices where id=$1', [invId]);
    if (!inv) fail('Invoice not found.');
    if (u.role === 'client' ? inv.client_id !== u.id : !ownsBranch(u, inv.branch_id)) fail('Not allowed.');
    if (!['cash', 'momo', 'orange', 'card'].includes(method)) fail('Choose a payment method.');
    if (method === 'cash' && u.role === 'client') fail('Cash is paid in store; ask the cashier.');
    if (inv.status === 'paid' || inv.status === 'void') fail('This invoice is already settled.');
    const paid = (await q1("select coalesce(sum(amount),0)::int s from payments where invoice_id=$1 and status='succeeded'", [inv.id])).s;
    const pending = (await q1("select coalesce(sum(amount),0)::int s from payments where invoice_id=$1 and status='pending'", [inv.id])).s;
    const amount = int(fd, 'amount', inv.total - paid);
    if (!amount || amount <= 0 || amount > inv.total - paid) fail(`Amount must be between 1 and ${inv.total - paid} XAF.`);
    if (['momo', 'orange'].includes(method) && !str(fd, 'phone')) fail('Enter the mobile money number.');
    const p = await q1(`insert into payments(invoice_id,branch_id,amount,method,payer_phone,received_by) values ($1,$2,$3,$4,$5,$6) returning *`,
      [inv.id, inv.branch_id, amount, method, str(fd, 'phone') || null, u.id]);
    const res = await startCharge({ method, amount, phone: str(fd, 'phone'), reference: `${inv.number}-${p.id}` });
    await q('update payments set provider=$2, provider_ref=$3, status=$4 where id=$1', [p.id, res.provider, res.ref ?? null, res.status === 'failed' ? 'failed' : 'pending']);
    if (res.status === 'failed') fail(`The payment provider rejected the request (${res.error}).`);
    if (res.status === 'succeeded') await confirmPayment(p.id);
    await audit(u.id, 'payment_started', 'payment', p.id, { method, amount });
    return { ...p, status: res.status, pending };
  });
  redirect(back(path, 'ok', payment.status === 'succeeded' ? 'Payment received. Receipt issued.' : 'Payment started. Confirm it on your phone; the receipt is issued once the provider confirms.'));
}

// Test mode only: stands in for the customer approving the prompt on their phone.
export async function simulateConfirm(fd) {
  const u = await requireUser(['client', ...BILLERS]);
  if (providerMode() !== 'test') redirect('/app/invoices');
  const p = await q1('select p.*, i.client_id from payments p join invoices i on i.id=p.invoice_id where p.id=$1', [int(fd, 'payment_id')]);
  if (!p || (u.role === 'client' ? p.client_id !== u.id : !ownsBranch(u, p.branch_id))) redirect('/app/invoices');
  await confirmPayment(p.id);
  await audit(u.id, 'payment_confirmed_test', 'payment', p.id);
  redirect(back(`/app/invoices/${p.invoice_id}`, 'ok', 'Payment confirmed (test mode). Receipt issued.'));
}
export async function cancelPayment(fd) {
  const u = await requireUser(['client', ...BILLERS]);
  const p = await q1('select p.*, i.client_id from payments p join invoices i on i.id=p.invoice_id where p.id=$1', [int(fd, 'payment_id')]);
  if (p && p.status === 'pending' && (u.role === 'client' ? p.client_id === u.id : ownsBranch(u, p.branch_id))) await q("update payments set status='failed' where id=$1", [p.id]);
  redirect(back(`/app/invoices/${p?.invoice_id ?? ''}`, 'ok', 'Payment cancelled.'));
}
