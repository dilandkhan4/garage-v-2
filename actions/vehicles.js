'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, q1 } from '@/lib/db';
import { requireUser, isGarageStaff, hashPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { str, int, back, randomPassword } from '@/lib/util';
import { notify } from '@/lib/notify';

const normPlate = (p) => p.toUpperCase().replace(/\s+/g, ' ').trim();

export async function registerVehicle(fd) {
  const u = await requireUser(['client', 'receptionist', 'manager', 'admin', 'mechanic']);
  let ownerId = u.id, tmp = '';
  if (u.role !== 'client') {
    const email = str(fd, 'owner_email').toLowerCase();
    if (!email) redirect(back('/app/vehicles/new', 'err', 'Owner email is required.'));
    let owner = await q1('select id, role from users where lower(email)=$1', [email]);
    if (owner && owner.role !== 'client') redirect(back('/app/vehicles/new', 'err', 'That email belongs to a staff or student account.'));
    if (!owner) {
      const pw = randomPassword();
      owner = await q1(`insert into users(email,phone,password_hash,full_name,role,company_name) values ($1,$2,$3,$4,'client',$5) returning id`,
        [email, str(fd, 'owner_phone'), hashPassword(pw), str(fd, 'owner_name') || email, str(fd, 'company_name') || null]);
      tmp = `&tmp=${encodeURIComponent(pw)}`;
      await audit(u.id, 'client_created_at_desk', 'user', owner.id);
    }
    ownerId = owner.id;
  }
  const plate = normPlate(str(fd, 'plate'));
  if (!plate || !str(fd, 'make') || !str(fd, 'model')) redirect(back('/app/vehicles/new', 'err', 'Plate, make and model are required.'));
  if (await q1('select 1 from vehicles where plate=$1', [plate])) redirect(back('/app/vehicles/new', 'err', 'A vehicle with this plate is already registered.'));
  const branch = u.role === 'client' ? int(fd, 'branch_id') : (u.branch_id ?? int(fd, 'branch_id'));
  const v = await q1(
    `insert into vehicles(owner_id,plate,vin,make,model,year,mileage,color,photo_url,papers_ref,branch_id,registered_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [ownerId, plate, str(fd, 'vin') || null, str(fd, 'make'), str(fd, 'model'), int(fd, 'year'), int(fd, 'mileage', 0), str(fd, 'color') || null,
      str(fd, 'photo_url') || null, str(fd, 'papers_ref') || null, branch, u.id]);
  await audit(u.id, 'vehicle_registered', 'vehicle', v.id, { plate });
  redirect(back(`/app/vehicles/${v.id}`, 'ok', 'Vehicle registered.', tmp));
}

export async function updateVehicle(fd) {
  const u = await requireUser(['receptionist', 'manager', 'admin', 'mechanic']);
  const id = int(fd, 'id');
  await q('update vehicles set vin=$2, color=$3, year=$4, make=$5, model=$6, photo_url=$7, papers_ref=$8 where id=$1',
    [id, str(fd, 'vin') || null, str(fd, 'color') || null, int(fd, 'year'), str(fd, 'make'), str(fd, 'model'), str(fd, 'photo_url') || null, str(fd, 'papers_ref') || null]);
  await audit(u.id, 'vehicle_updated', 'vehicle', id);
  revalidatePath(`/app/vehicles/${id}`);
  redirect(back(`/app/vehicles/${id}`, 'ok', 'Vehicle updated.'));
}

export async function updateMileage(fd) {
  const u = await requireUser();
  const id = int(fd, 'id'); const km = int(fd, 'mileage');
  const v = await q1('select * from vehicles where id=$1', [id]);
  if (!v || (u.role === 'client' && v.owner_id !== u.id)) redirect('/app/vehicles');
  if (km == null || km < v.mileage) redirect(back(`/app/vehicles/${id}`, 'err', 'Mileage cannot be lower than the last reading.'));
  await q('update vehicles set mileage=$2 where id=$1', [id, km]);
  await audit(u.id, 'mileage_updated', 'vehicle', id, { from: v.mileage, to: km });
  redirect(back(`/app/vehicles/${id}`, 'ok', 'Mileage updated.'));
}

export async function initiateTransfer(fd) {
  const u = await requireUser(['client', 'receptionist', 'manager', 'admin']);
  const id = int(fd, 'id'); const email = str(fd, 'to_email').toLowerCase();
  const v = await q1('select * from vehicles where id=$1', [id]);
  if (!v || (u.role === 'client' && v.owner_id !== u.id)) redirect('/app/vehicles');
  const to = await q1("select id from users where lower(email)=$1 and role='client'", [email]);
  if (!email.includes('@')) redirect(back(`/app/vehicles/${id}`, 'err', 'Enter the new owner’s email.'));
  await q("update vehicle_transfers set status='cancelled' where vehicle_id=$1 and status='pending'", [id]);
  await q('insert into vehicle_transfers(vehicle_id,from_user,to_email,to_user) values ($1,$2,$3,$4)', [id, v.owner_id, email, to?.id ?? null]);
  if (to) await notify(to.id, { kind: 'transfer', subject: `Vehicle transfer: ${v.plate}`, body: `${v.make} ${v.model} (${v.plate}) is being transferred to you. Accept it in your vehicles page.`, link: '/app/vehicles', channels: ['inapp', 'email', 'sms'] });
  await audit(u.id, 'transfer_started', 'vehicle', id, { to: email });
  redirect(back(`/app/vehicles/${id}`, 'ok', 'Transfer started. The new owner must accept it.'));
}

export async function respondTransfer(fd) {
  const u = await requireUser();
  const id = int(fd, 'transfer_id'); const act = str(fd, 'act');
  const tr = await q1('select * from vehicle_transfers where id=$1 and status=$2', [id, 'pending']);
  if (!tr) redirect('/app/vehicles');
  const v = await q1('select * from vehicles where id=$1', [tr.vehicle_id]);
  const isOwner = v.owner_id === u.id;
  const toUser = tr.to_user ?? (await q1("select id from users where lower(email)=$1 and role='client'", [tr.to_email]))?.id ?? null;
  const isRecipient = toUser === u.id;
  const staffOk = ['receptionist', 'manager', 'admin'].includes(u.role);
  if (act === 'cancel' && (isOwner || staffOk)) {
    await q("update vehicle_transfers set status='cancelled', decided_at=now() where id=$1", [id]);
  } else if (act === 'decline' && (isRecipient || staffOk)) {
    await q("update vehicle_transfers set status='declined', decided_at=now() where id=$1", [id]);
  } else if (act === 'accept' && (isRecipient || staffOk)) {
    if (!toUser) redirect(back(`/app/vehicles/${v.id}`, 'err', 'The new owner must register an account first.'));
    await q('update vehicles set owner_id=$2 where id=$1', [v.id, toUser]);
    await q("update vehicle_transfers set status='accepted', to_user=$2, decided_at=now() where id=$1", [id, toUser]);
    await q("update vehicle_transfers set status='cancelled' where vehicle_id=$1 and status='pending'", [v.id]);
    await notify(tr.from_user, { kind: 'transfer', subject: `Transfer complete: ${v.plate}`, body: 'Ownership has been transferred. The service history stays with the vehicle.', channels: ['inapp'] });
  } else redirect('/app/vehicles');
  await audit(u.id, `transfer_${act}`, 'vehicle', v.id, { transfer: id });
  redirect(back(u.role === 'client' && act !== 'accept' ? '/app/vehicles' : `/app/vehicles/${v.id}`, 'ok', 'Transfer updated.'));
}
