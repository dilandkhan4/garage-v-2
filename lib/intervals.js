import { q1 } from './db';
// Most specific manufacturer specification wins: make+model, then make, then generic.
export async function findInterval(category, make, model, db = { q1 }) {
  return db.q1(
    `select * from service_intervals where lower(category)=lower($1)
       and (make is null or lower(make)=lower($2)) and (model is null or lower(model)=lower($3))
     order by ((make is not null)::int + (model is not null)::int) desc limit 1`,
    [category, make || '', model || '']);
}
