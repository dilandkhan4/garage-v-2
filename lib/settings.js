import { q1 } from './db';
export const DEFAULTS = { tax_rate: 19.25, labor_rate: 5000, delivery_fee: 2000, graduate_fields: ['name', 'photo', 'skills', 'certificate'], reminder_days: [7, 3] };
export async function getSetting(key, db = { q1 }) {
  const r = await db.q1('select value from settings where key=$1', [key]);
  return r ? r.value : DEFAULTS[key];
}
