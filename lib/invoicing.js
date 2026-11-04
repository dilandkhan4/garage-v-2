import { getSetting } from './settings';

export async function issueInvoiceFor(db, { jobId = null, orderId = null, branchId, clientId, customer, subtotal }) {
  const taxRate = Number(await getSetting('tax_rate', db));
  const tax = Math.round((subtotal * taxRate) / 100);
  const n = await db.q1("select nextval('invoice_seq')::int n");
  const number = `INV-${new Date().getFullYear()}-${String(n.n).padStart(5, '0')}`;
  return db.q1(`insert into invoices(number,job_id,order_id,branch_id,client_id,customer_name,subtotal,tax_rate,tax,total) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [number, jobId, orderId, branchId, clientId, customer, subtotal, taxRate, tax, subtotal + tax]);
}

