'use server';
import { redirect } from 'next/navigation';
import { q, q1, tx } from '@/lib/db';
import { requireUser, hashPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { str, int, num, back, randomPassword } from '@/lib/util';

const ROLES = ['admin', 'manager', 'receptionist', 'mechanic', 'storekeeper', 'cashier', 'instructor', 'student', 'school_rep', 'client'];

export async function saveBranch(fd) {
  const u = await requireUser(['admin']);
  const id = int(fd, 'id');
  if (!str(fd, 'name')) redirect(back('/app/branches', 'err', 'Branch name is required.'));
  if (id) await q('update branches set name=$2, city=$3, address=$4, phone=$5, active=$6 where id=$1', [id, str(fd, 'name'), str(fd, 'city'), str(fd, 'address'), str(fd, 'phone'), fd.get('active') === 'on']);
  else {
    const b = await q1('insert into branches(name,city,address,phone) values ($1,$2,$3,$4) returning id', [str(fd, 'name'), str(fd, 'city'), str(fd, 'address'), str(fd, 'phone')]);
    // new branch starts with zero stock for every part so it appears in stock lists immediately
    await q('insert into stock(branch_id,part_id,qty) select $1, id, 0 from parts on conflict do nothing', [b.id]);
    await audit(u.id, 'branch_added', 'branch', b.id, { name: str(fd, 'name') });
    redirect(back('/app/branches', 'ok', 'Branch added. It already shares prices, parts, intervals and programs; assign staff to it next.'));
  }
  await audit(u.id, 'branch_updated', 'branch', id);
  redirect(back('/app/branches', 'ok', 'Branch saved.'));
}

export async function createUser(fd) {
  const u = await requireUser(['admin']);
  const email = str(fd, 'email').toLowerCase(); const role = str(fd, 'role');
  if (!email.includes('@') || !str(fd, 'full_name') || !ROLES.includes(role)) redirect(back('/app/staff', 'err', 'Name, valid email and role are required.'));
  if (await q1('select 1 from users where lower(email)=$1', [email])) redirect(back('/app/staff', 'err', 'This email is already used.'));
  const pw = randomPassword();
  const created = await tx(async (db) => {
    const nu = await db.q1(`insert into users(email,phone,password_hash,full_name,role,branch_id,school_id,locale) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [email, str(fd, 'phone'), hashPassword(pw), str(fd, 'full_name'), role, int(fd, 'branch_id'), int(fd, 'school_id'), str(fd, 'locale') === 'fr' ? 'fr' : 'en']);
    for (const b of fd.getAll('extra_branches')) await db.q('insert into user_branches(user_id,branch_id) values ($1,$2) on conflict do nothing', [nu.id, Number(b)]);
    return nu;
  });
  await audit(u.id, 'user_created', 'user', created.id, { role });
  redirect(back('/app/staff', 'ok', 'Account created.', `&tmp=${encodeURIComponent(pw)}`));
}

export async function updateUser(fd) {
  const u = await requireUser(['admin']);
  const id = int(fd, 'id'); const role = str(fd, 'role');
  if (!ROLES.includes(role)) redirect('/app/staff');
  if (id === u.id && (role !== 'admin' || fd.get('active') !== 'on')) redirect(back('/app/staff', 'err', 'You cannot remove your own admin access.'));
  await tx(async (db) => {
    await db.q('update users set full_name=$2, phone=$3, role=$4, branch_id=$5, school_id=$6, active=$7 where id=$1', [id, str(fd, 'full_name'), str(fd, 'phone'), role, int(fd, 'branch_id'), int(fd, 'school_id'), fd.get('active') === 'on']);
    await db.q('delete from user_branches where user_id=$1', [id]);
    for (const b of fd.getAll('extra_branches')) await db.q('insert into user_branches(user_id,branch_id) values ($1,$2) on conflict do nothing', [id, Number(b)]);
  });
  await audit(u.id, 'user_updated', 'user', id, { role });
  redirect(back('/app/staff', 'ok', 'Saved.'));
}

export async function resetPassword(fd) {
  const u = await requireUser(['admin']);
  const id = int(fd, 'id'); const pw = randomPassword();
  await q('update users set password_hash=$2 where id=$1', [id, hashPassword(pw)]);
  await audit(u.id, 'password_reset', 'user', id);
  redirect(back('/app/staff', 'ok', 'Password reset.', `&tmp=${encodeURIComponent(pw)}`));
}

export async function saveSettings(fd) {
  const u = await requireUser(['admin']);
  const set = (k, v) => q('insert into settings(key,value) values ($1,$2) on conflict (key) do update set value=excluded.value', [k, JSON.stringify(v)]);
  await set('tax_rate', num(fd.get('tax_rate'), 0)); await set('labor_rate', int(fd, 'labor_rate', 0)); await set('delivery_fee', int(fd, 'delivery_fee', 0));
  await set('graduate_fields', ['name', 'photo', 'skills', 'certificate', 'headline', 'branch', 'phone'].filter((f) => fd.get(`gf_${f}`) === 'on'));
  await audit(u.id, 'settings_saved', 'settings', null);
  redirect(back('/app/settings', 'ok', 'Settings saved.'));
}

export async function markNotificationsRead(fd) {
  const u = await requireUser();
  const id = int(fd, 'id');
  if (id) await q('update notifications set read_at=now() where id=$1 and user_id=$2', [id, u.id]);
  else await q('update notifications set read_at=now() where user_id=$1 and read_at is null', [u.id]);
  redirect('/app/notifications');
}
