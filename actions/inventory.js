'use server';
import { redirect } from 'next/navigation';
import { q, q1, tx } from '@/lib/db';
import { requireUser, ownsBranch, isAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, guard } from '@/lib/guard';
import { str, int, num, back } from '@/lib/util';
import { applyChange } from '@/lib/changes';

const STORE = ['storekeeper', 'manager', 'admin'];

// ----- catalogue & intervals: admin applies directly; manager proposals need admin approval -----
async function proposeOrApply(u, title, payload, path) {
  if (isAdmin(u)) { await tx((db) => applyChange(db, payload)); await audit(u.id, 'config_changed', 'catalogue', null, payload); return redirect(back(path, 'ok', 'Saved.')); }
  await q(`insert into approvals(kind,title,payload,branch_id,requested_by) values ('manager_change',$1,$2,$3,$4)`, [title, JSON.stringify(payload), u.branch_id, u.id]);
  return redirect(back(path, 'ok', 'Sent to the admin for approval.'));
}
export async function savePart(fd) {
  const u = await requireUser(['manager', 'admin']);
  const id = int(fd, 'id');
  const p = { type: id ? 'update_part' : 'create_part', id, sku: str(fd, 'sku'), name: str(fd, 'name'), name_fr: str(fd, 'name_fr'), category: str(fd, 'category'), price: int(fd, 'price', 0),
    description: str(fd, 'description'), fitment: str(fd, 'fitment'), online: fd.get('online') === 'on', active: fd.get('active') !== 'off' };
  if (!p.name || !p.category || (!id && !p.sku)) redirect(back('/app/settings/parts', 'err', 'SKU, name and category are required.'));
  await proposeOrApply(u, `${id ? 'Change' : 'New'} part: ${p.name} (${p.price} XAF)`, p, '/app/settings/parts');
}
export async function saveInterval(fd) {
  const u = await requireUser(['manager', 'admin']);
  const p = { type: 'save_interval', category: str(fd, 'category'), make: str(fd, 'make') || null, model: str(fd, 'model') || null, months: int(fd, 'months'), km: int(fd, 'km') };
  if (!p.category || (!p.months && !p.km)) redirect(back('/app/settings/intervals', 'err', 'Give a category and a number of months and/or km.'));
  await proposeOrApply(u, `Service interval: ${p.category} ${p.make || ''} ${p.model || ''}`.trim(), p, '/app/settings/intervals');
}
export async function deleteInterval(fd) {
  const u = await requireUser(['admin']);
  await q('delete from service_intervals where id=$1', [int(fd, 'id')]);
  await audit(u.id, 'interval_deleted', 'service_interval', int(fd, 'id'));
  redirect(back('/app/settings/intervals', 'ok', 'Deleted.'));
}

// ----- stock -----
export async function adjustStock(fd) {
  const u = await requireUser(STORE);
  const branch = int(fd, 'branch_id'), part = int(fd, 'part_id');
  if (!ownsBranch(u, branch)) redirect('/app/inventory');
  const qty = int(fd, 'qty', 0), reorder = int(fd, 'reorder_level', 5);
  if (qty < 0) redirect(back(`/app/inventory?branch=${branch}`, 'err', 'Quantity cannot be negative.'));
  const before = await q1('select qty from stock where branch_id=$1 and part_id=$2', [branch, part]);
  await q(`insert into stock(branch_id,part_id,qty,reorder_level) values ($1,$2,$3,$4) on conflict (branch_id,part_id) do update set qty=excluded.qty, reorder_level=excluded.reorder_level`, [branch, part, qty, reorder]);
  await audit(u.id, 'stock_adjusted', 'stock', `${branch}:${part}`, { before: before?.qty ?? 0, after: qty });
  redirect(back(`/app/inventory?branch=${branch}`, 'ok', 'Stock updated.'));
}

// ----- transfers between branches (and cross-branch sales needing the holder's approval) -----
export async function requestTransfer(fd) {
  const u = await requireUser(STORE);
  const to = int(fd, 'to_branch'), from = int(fd, 'from_branch'), part = int(fd, 'part_id'), qty = int(fd, 'qty', 0);
  if (!ownsBranch(u, to) || from === to || qty <= 0 || !part) redirect(back('/app/transfers', 'err', 'Choose a part, a quantity and a different source branch.'));
  await q(`insert into stock_transfers(kind,part_id,from_branch,to_branch,qty,requested_by) values ('transfer',$1,$2,$3,$4,$5)`, [part, from, to, qty, u.id]);
  await audit(u.id, 'transfer_requested', 'part', part, { from, to, qty });
  redirect(back('/app/transfers', 'ok', 'Transfer requested. The other branch must approve it.'));
}
export async function decideTransfer(fd) {
  const u = await requireUser(STORE);
  const id = int(fd, 'id'); const approve = str(fd, 'act') === 'approve';
  await guard('/app/transfers', () => tx(async (db) => {
    const t = await db.q1("select * from stock_transfers where id=$1 and status='requested' for update", [id]);
    if (!t) fail('Already decided.');
    if (!ownsBranch(u, t.from_branch)) fail('Only the branch that holds the stock can approve.');
    if (approve) {
      const s = await db.q1('select qty from stock where branch_id=$1 and part_id=$2 for update', [t.from_branch, t.part_id]);
      if (!s || s.qty < t.qty) fail(`Not enough stock to release (have ${s?.qty ?? 0}).`);
      await db.q('update stock set qty=qty-$3 where branch_id=$1 and part_id=$2', [t.from_branch, t.part_id, t.qty]);
    }
    await db.q('update stock_transfers set status=$2, decided_by=$3, decided_at=now() where id=$1', [id, approve ? (t.kind === 'sale' ? 'received' : 'approved') : 'rejected', u.id]);
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, approve ? 'transfer_approved' : 'transfer_rejected', 'transfer', id, JSON.stringify({ kind: t.kind })]);
  }));
  redirect(back('/app/transfers', 'ok', approve ? 'Approved.' : 'Rejected.'));
}
export async function receiveTransfer(fd) {
  const u = await requireUser(STORE);
  const id = int(fd, 'id');
  await guard('/app/transfers', () => tx(async (db) => {
    const t = await db.q1("select * from stock_transfers where id=$1 and status='approved' and kind='transfer' for update", [id]);
    if (!t || !ownsBranch(u, t.to_branch)) fail('Not allowed.');
    await db.q(`insert into stock(branch_id,part_id,qty) values ($1,$2,$3) on conflict (branch_id,part_id) do update set qty=stock.qty+excluded.qty`, [t.to_branch, t.part_id, t.qty]);
    await db.q("update stock_transfers set status='received' where id=$1", [id]);
  }));
  await audit(u.id, 'transfer_received', 'transfer', id);
  redirect(back('/app/transfers', 'ok', 'Received into stock.'));
}

// ----- purchasing -----
export async function saveSupplier(fd) {
  const u = await requireUser(STORE);
  if (!str(fd, 'name')) redirect('/app/purchasing');
  await q('insert into suppliers(name,phone,email) values ($1,$2,$3)', [str(fd, 'name'), str(fd, 'phone') || null, str(fd, 'email') || null]);
  await audit(u.id, 'supplier_added', 'supplier', null, { name: str(fd, 'name') });
  redirect(back('/app/purchasing', 'ok', 'Supplier added.'));
}
export async function createPO(fd) {
  const u = await requireUser(STORE);
  const branch = int(fd, 'branch_id');
  if (!ownsBranch(u, branch)) redirect('/app/purchasing');
  const lines = [1, 2, 3].map((i) => ({ part: int(fd, `part${i}`), qty: int(fd, `qty${i}`, 0), cost: int(fd, `cost${i}`, 0) })).filter((l) => l.part && l.qty > 0);
  if (!lines.length) redirect(back('/app/purchasing', 'err', 'Add at least one line.'));
  const po = await tx(async (db) => {
    const p = await db.q1('insert into purchase_orders(branch_id,supplier_id,created_by) values ($1,$2,$3) returning id', [branch, int(fd, 'supplier_id'), u.id]);
    for (const l of lines) await db.q('insert into po_items(po_id,part_id,qty,unit_cost) values ($1,$2,$3,$4)', [p.id, l.part, l.qty, l.cost]);
    return p;
  });
  await audit(u.id, 'po_created', 'purchase_order', po.id);
  redirect(back('/app/purchasing', 'ok', 'Purchase order created.'));
}
export async function receivePO(fd) {
  const u = await requireUser(STORE);
  const id = int(fd, 'id');
  await guard('/app/purchasing', () => tx(async (db) => {
    const po = await db.q1("select * from purchase_orders where id=$1 and status='ordered' for update", [id]);
    if (!po || !ownsBranch(u, po.branch_id)) fail('Not allowed.');
    const items = await db.q('select * from po_items where po_id=$1', [id]);
    for (const i of items) await db.q(`insert into stock(branch_id,part_id,qty) values ($1,$2,$3) on conflict (branch_id,part_id) do update set qty=stock.qty+excluded.qty`, [po.branch_id, i.part_id, i.qty]);
    await db.q("update purchase_orders set status='received', received_at=now() where id=$1", [id]);
  }));
  await audit(u.id, 'po_received', 'purchase_order', id);
  redirect(back('/app/purchasing', 'ok', 'Goods received into stock.'));
}
export async function cancelPO(fd) {
  const u = await requireUser(STORE);
  await q("update purchase_orders set status='cancelled' where id=$1 and status='ordered'", [int(fd, 'id')]);
  redirect(back('/app/purchasing', 'ok', 'Cancelled.'));
}
