'use server';
import { redirect } from 'next/navigation';
import { q, q1, tx } from '@/lib/db';
import { requireUser, ownsBranch } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, guard } from '@/lib/guard';
import { str, int, back } from '@/lib/util';
import { getSetting } from '@/lib/settings';
import { issueInvoiceFor } from '@/lib/invoicing';
import { notify } from '@/lib/notify';

const SELLERS = ['receptionist', 'storekeeper', 'cashier', 'manager', 'admin'];

function parseLines(fd) {
  const lines = [];
  for (const [k, v] of fd.entries()) if (k.startsWith('qty_')) { const n = parseInt(v, 10); if (n > 0) lines.push({ part_id: Number(k.slice(4)), qty: n }); }
  return lines;
}

async function createOrderCore(db, { clientId, guest, branchId, channel, delivery, address, lines, by }) {
  if (!lines.length) fail('Add at least one item.');
  const fee = delivery ? Number(await getSetting('delivery_fee', db)) : 0;
  if (delivery && !address) fail('Enter a delivery address.');
  const order = await db.q1(`insert into orders(client_id,guest_name,guest_phone,guest_email,branch_id,channel,delivery,delivery_address,delivery_fee,created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [clientId, guest?.name || null, guest?.phone || null, guest?.email || null, branchId, channel, !!delivery, address || null, fee, by]);
  let subtotal = 0; const remote = [];
  for (const l of lines) {
    const part = await db.q1('select * from parts where id=$1 and active', [l.part_id]);
    if (!part) fail('A selected part is no longer available.');
    const here = await db.q1('select qty from stock where branch_id=$1 and part_id=$2 for update', [branchId, part.id]);
    let source = branchId;
    if (here && here.qty >= l.qty) {
      await db.q('update stock set qty=qty-$3 where branch_id=$1 and part_id=$2', [branchId, part.id, l.qty]);
    } else {
      const other = await db.q1('select branch_id from stock where part_id=$1 and branch_id<>$2 and qty>=$3 order by qty desc limit 1', [part.id, branchId, l.qty]);
      if (!other) fail(`Not enough stock of "${part.name}" in any branch.`);
      source = other.branch_id;
      await db.q(`insert into stock_transfers(kind,part_id,from_branch,to_branch,qty,order_id,requested_by) values ('sale',$1,$2,$3,$4,$5,$6)`, [part.id, source, branchId, l.qty, order.id, by]);
      remote.push({ source, part });
    }
    await db.q('insert into order_items(order_id,part_id,qty,unit_price,source_branch_id) values ($1,$2,$3,$4,$5)', [order.id, part.id, l.qty, part.price, source]);
    subtotal += part.price * l.qty;
  }
  const customer = clientId ? (await db.q1('select full_name from users where id=$1', [clientId])).full_name : guest?.name || 'Walk-in customer';
  const inv = await issueInvoiceFor(db, { orderId: order.id, branchId, clientId, customer, subtotal: subtotal + fee });
  return { order, inv, remote };
}

async function notifyHolders(remote, orderId) {
  for (const r of remote) {
    const staff = await q("select id from users where active and role in ('storekeeper','manager') and (branch_id=$1 or exists(select 1 from user_branches where user_id=users.id and branch_id=$1))", [r.source]);
    for (const s of staff) await notify(s.id, { kind: 'transfer', subject: 'Approval needed: part requested for a sale', body: `${r.part.name} is requested by another branch for order #${orderId}.`, link: '/app/transfers', channels: ['inapp'] });
  }
}

export async function placeOnlineOrder(fd) {
  const u = await requireUser(['client']);
  const path = '/shop';
  const res = await guard(path, () => tx((db) => createOrderCore(db, { clientId: u.id, branchId: int(fd, 'branch_id'), channel: 'online', delivery: fd.get('delivery') === 'on', address: str(fd, 'address'), lines: parseLines(fd), by: u.id })));
  await notifyHolders(res.remote, res.order.id);
  await audit(u.id, 'order_placed', 'order', res.order.id, { invoice: res.inv.number });
  redirect(back(`/app/invoices/${res.inv.id}`, 'ok', 'Order placed. Pay below to confirm it.'));
}

export async function placeStoreSale(fd) {
  const u = await requireUser(SELLERS);
  const path = '/app/orders/new';
  const branchId = u.role === 'admin' ? int(fd, 'branch_id') : u.branch_id;
  if (!branchId || !ownsBranch(u, branchId)) redirect(back(path, 'err', 'Choose your branch.'));
  const email = str(fd, 'customer_email').toLowerCase();
  const client = email ? await q1("select id from users where lower(email)=$1 and role='client'", [email]) : null;
  const res = await guard(path, () => tx((db) => createOrderCore(db, { clientId: client?.id ?? null, guest: { name: str(fd, 'guest_name') || 'Walk-in customer', phone: str(fd, 'guest_phone'), email }, branchId, channel: 'instore', delivery: fd.get('delivery') === 'on', address: str(fd, 'address'), lines: parseLines(fd), by: u.id })));
  await notifyHolders(res.remote, res.order.id);
  await audit(u.id, 'store_sale_created', 'order', res.order.id, { invoice: res.inv.number });
  redirect(back(`/app/invoices/${res.inv.id}`, 'ok', 'Sale recorded. Take payment below.'));
}

export async function updateOrderStatus(fd) {
  const u = await requireUser(SELLERS);
  const id = int(fd, 'id'); const to = str(fd, 'to'); const path = `/app/orders/${id}`;
  await guard(path, () => tx(async (db) => {
    const o = await db.q1('select * from orders where id=$1 for update', [id]);
    if (!o || !ownsBranch(u, o.branch_id)) fail('Not allowed.');
    if (['delivered', 'cancelled'].includes(o.status)) fail('This order is closed.');
    if (to === 'cancelled') {
      const items = await db.q('select * from order_items where order_id=$1', [id]);
      for (const it of items) {
        const tr = await db.q1("select * from stock_transfers where order_id=$1 and part_id=$2 and kind='sale' order by id desc limit 1", [id, it.part_id]);
        if (tr && tr.status === 'requested') await db.q("update stock_transfers set status='rejected' where id=$1", [tr.id]);
        else await db.q(`insert into stock(branch_id,part_id,qty) values ($1,$2,$3) on conflict (branch_id,part_id) do update set qty=stock.qty+excluded.qty`, [it.source_branch_id ?? o.branch_id, it.part_id, it.qty - it.returned_qty]);
      }
      await db.q("update invoices set status='void' where order_id=$1 and status='issued'", [id]);
    }
    if (to === 'confirmed') {
      const pending = await db.q1("select count(*)::int c from stock_transfers where order_id=$1 and status='requested'", [id]);
      if (pending.c) fail('Waiting for the other branch to approve releasing its stock.');
    }
    if (to === 'out_for_delivery' && !o.delivery) fail('This is not a delivery order.');
    await db.q('update orders set status=$2 where id=$1', [id, to]);
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, 'order_status', 'order', id, JSON.stringify({ to })]);
    if (o.client_id) await db.q(`insert into notifications(user_id,kind,subject,body,link) values ($1,'order',$2,$3,$4)`, [o.client_id, `Order #${id}: ${to.replaceAll('_', ' ')}`, `Your order status is now "${to.replaceAll('_', ' ')}".`, `/app/orders/${id}`]);
  }));
  redirect(back(path, 'ok', 'Order updated.'));
}

export async function processReturn(fd) {
  const u = await requireUser(SELLERS);
  const itemId = int(fd, 'item_id');
  const it = await q1('select oi.*, o.branch_id, o.id oid from order_items oi join orders o on o.id=oi.order_id where oi.id=$1', [itemId]);
  if (!it || !ownsBranch(u, it.branch_id)) redirect('/app/orders');
  const path = `/app/orders/${it.oid}`;
  const qty = int(fd, 'qty', 0);
  await guard(path, () => tx(async (db) => {
    const row = await db.q1('select * from order_items where id=$1 for update', [itemId]);
    if (qty <= 0 || qty > row.qty - row.returned_qty) fail('Invalid quantity to return.');
    const rate = Number((await db.q1('select tax_rate from invoices where order_id=$1 limit 1', [row.order_id]))?.tax_rate ?? 0);
    const refund = Math.round(row.unit_price * qty * (1 + rate / 100));
    const restock = fd.get('restock') === 'on';
    await db.q('insert into returns(order_item_id,qty,reason,restock,handled_by,refund_amount) values ($1,$2,$3,$4,$5,$6)', [itemId, qty, str(fd, 'reason') || null, restock, u.id, refund]);
    await db.q('update order_items set returned_qty=returned_qty+$2 where id=$1', [itemId, qty]);
    if (restock) await db.q(`insert into stock(branch_id,part_id,qty) values ($1,$2,$3) on conflict (branch_id,part_id) do update set qty=stock.qty+excluded.qty`, [it.branch_id, row.part_id, qty]);
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, 'return_processed', 'order', row.order_id, JSON.stringify({ item: itemId, qty, refund })]);
  }));
  redirect(back(path, 'ok', 'Return recorded. Refund the customer from the cashier.'));
}
