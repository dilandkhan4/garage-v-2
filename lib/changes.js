// Manager-proposed changes are stored as approvals and applied only when the admin approves.
export async function applyChange(db, p) {
  switch (p.type) {
    case 'create_part':
      await db.q(`insert into parts(sku,name,name_fr,category,price,description,fitment,online) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (sku) do update set name=excluded.name, category=excluded.category, price=excluded.price`,
        [p.sku, p.name, p.name_fr || null, p.category, p.price, p.description || null, p.fitment || null, p.online !== false]); break;
    case 'update_part':
      await db.q('update parts set name=$2, name_fr=$3, category=$4, price=$5, description=$6, fitment=$7, online=$8, active=$9 where id=$1',
        [p.id, p.name, p.name_fr || null, p.category, p.price, p.description || null, p.fitment || null, p.online !== false, p.active !== false]); break;
    case 'save_interval':
      await db.q(`delete from service_intervals where category=$1 and make is not distinct from $2 and model is not distinct from $3`, [p.category, p.make || null, p.model || null]);
      await db.q('insert into service_intervals(category,make,model,months,km) values ($1,$2,$3,$4,$5)', [p.category, p.make || null, p.model || null, p.months, p.km]); break;
    case 'save_program':
      if (p.id) await db.q('update programs set name=$2, name_fr=$3, description=$4, duration_weeks=$5, real_work_level=$6, active=$7 where id=$1', [p.id, p.name, p.name_fr || null, p.description || null, p.duration_weeks, p.real_work_level, p.active !== false]);
      else await db.q('insert into programs(name,name_fr,description,duration_weeks,real_work_level) values ($1,$2,$3,$4,$5)', [p.name, p.name_fr || null, p.description || null, p.duration_weeks, p.real_work_level]);
      break;
    default: throw new Error(`Unknown change type ${p.type}`);
  }
}
