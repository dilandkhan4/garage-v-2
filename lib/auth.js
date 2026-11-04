import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { q, q1 } from './db';

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET || 'dev-secret-change-me-please-32chars');
export const hashPassword = (p) => bcrypt.hashSync(p, 10);
export const checkPassword = (p, h) => bcrypt.compareSync(p, h);

export async function createSession(userId) {
  const token = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d').sign(secret());
  (await cookies()).set('session', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1' });
}
export async function destroySession() { (await cookies()).delete('session'); }

export async function getUser() {
  const token = (await cookies()).get('session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const u = await q1('select * from users where id=$1 and active', [payload.uid]);
    if (!u) return null;
    const extra = await q('select branch_id from user_branches where user_id=$1', [u.id]);
    u.branchIds = [...new Set([u.branch_id, ...extra.map((r) => r.branch_id)].filter(Boolean))];
    return u;
  } catch { return null; }
}
export async function requireUser(roles) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (roles && !roles.includes(u.role)) redirect('/app?denied=1');
  return u;
}
// Branch helpers
export const isAdmin = (u) => u.role === 'admin';
export const ownsBranch = (u, branchId) => isAdmin(u) || u.branchIds.includes(Number(branchId));
export const STAFF = ['admin', 'manager', 'receptionist', 'mechanic', 'storekeeper', 'cashier', 'instructor'];
export const GARAGE_STAFF = ['admin', 'manager', 'receptionist', 'mechanic', 'storekeeper', 'cashier'];
export const isStaff = (u) => STAFF.includes(u.role);
export const isGarageStaff = (u) => GARAGE_STAFF.includes(u.role);
export const isManagerUp = (u) => ['admin', 'manager'].includes(u.role);
// Money records (prices on jobs, invoices, payments, revenue) are visible only to the branch that owns them, plus admin.
export const seesMoney = (u, branchId) => u.role === 'client' || ownsBranch(u, branchId);
