import { q } from './db';
export async function audit(actorId, action, entity, entityId, data = {}) {
  await q('insert into audit_log(actor_id,action,entity,entity_id,data) values ($1,$2,$3,$4,$5)',
    [actorId ?? null, action, entity ?? null, entityId == null ? null : String(entityId), JSON.stringify(data)]);
}
