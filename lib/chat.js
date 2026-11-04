import { q, q1 } from './db';
export const DEPT = { workshop: ['mechanic'], reception: ['receptionist'], stores: ['storekeeper'], accounts: ['cashier'], training: ['instructor'], management: ['manager', 'admin'] };
export const DEPT_NAMES = { workshop: 'Workshop', reception: 'Reception', stores: 'Stores & parts', accounts: 'Accounts & cashiers', training: 'Training & instructors', management: 'Management' };
export const CHAT_ROLES = ['admin', 'manager', 'receptionist', 'mechanic', 'storekeeper', 'cashier', 'instructor'];

// Creates department groups if missing and keeps this user's memberships in line with their role.
// Managers and the admin sit in every department group so they can follow and answer all teams.
export async function ensureChat(user) {
  if (!CHAT_ROLES.includes(user.role)) return;
  for (const [dept, roles] of Object.entries(DEPT)) {
    let ch = await q1("select id from chat_channels where kind='department' and department=$1", [dept]);
    if (!ch) ch = await q1("insert into chat_channels(kind,name,department) values ('department',$1,$1) returning id", [dept]);
    const member = roles.includes(user.role) || ['manager', 'admin'].includes(user.role);
    if (member) await q('insert into chat_members(channel_id,user_id) values ($1,$2) on conflict do nothing', [ch.id, user.id]);
    else await q('delete from chat_members where channel_id=$1 and user_id=$2', [ch.id, user.id]);
  }
}
export async function isMember(channelId, userId) { return !!(await q1('select 1 from chat_members where channel_id=$1 and user_id=$2', [channelId, userId])); }
export async function unreadTotal(userId) {
  return (await q1(`select count(*)::int c from chat_messages m join chat_members cm on cm.channel_id=m.channel_id and cm.user_id=$1 where m.id > cm.last_read_id and m.sender_id<>$1`, [userId])).c;
}
