'use server';
import { redirect } from 'next/navigation';
import { q1, tx } from '@/lib/db';
import { requireUser, ownsBranch, isAdmin } from '@/lib/auth';
import { fail, guard } from '@/lib/guard';
import { int, str, back } from '@/lib/util';
import { applyChange } from '@/lib/changes';
import { notify } from '@/lib/notify';

export async function decideApproval(fd) {
  const u = await requireUser(['manager', 'admin']);
  const id = int(fd, 'id'); const approve = str(fd, 'act') === 'approve';
  await guard('/app/approvals', () => tx(async (db) => {
    const a = await db.q1("select * from approvals where id=$1 and status='pending' for update", [id]);
    if (!a) fail('Already decided.');
    if (a.kind === 'manager_change' && !isAdmin(u)) fail('Only the admin can approve manager changes.');
    if (a.kind === 'cross_branch_write' && !(isAdmin(u) || ownsBranch(u, a.branch_id))) fail('Only the owning branch manager or admin can approve this.');
    if (a.requested_by === u.id && !isAdmin(u)) fail('You cannot approve your own request.');
    if (approve) {
      if (a.kind === 'manager_change') await applyChange(db, a.payload);
      if (a.kind === 'cross_branch_write') await db.q('insert into job_notes(job_id,author_id,branch_id,body) values ($1,$2,$3,$4)', [a.payload.job_id, a.requested_by, a.payload.from_branch ?? null, `[Added from another branch, approved] ${a.payload.body}`]);
    }
    await db.q('update approvals set status=$2, decided_by=$3, decided_at=now() where id=$1', [id, approve ? 'approved' : 'rejected', u.id]);
    await db.q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)', [u.id, approve ? 'approval_granted' : 'approval_rejected', 'approval', id, JSON.stringify({ kind: a.kind, title: a.title })]);
    if (a.requested_by) await db.q(`insert into notifications(user_id,kind,subject,body,link) values ($1,'approval',$2,$3,'/app/approvals')`, [a.requested_by, `Request ${approve ? 'approved' : 'rejected'}`, a.title]);
  }));
  redirect(back('/app/approvals', 'ok', approve ? 'Approved.' : 'Rejected.'));
}
