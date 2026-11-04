import { q, q1 } from './db';
import { notify, ALL_CHANNELS } from './notify';
import { makeT } from './i18n';

// Sends: 7 days and 3 days before expiry, on the day after expiry, and by mileage (500 km / 200 km left).
export async function runReminders(today = new Date()) {
  const day = today.toISOString().slice(0, 10);
  const rows = await q(
    `select vp.*, v.plate, v.make, v.model, v.mileage, v.owner_id, u.locale
       from vehicle_parts vp join vehicles v on v.id=vp.vehicle_id join users u on u.id=v.owner_id
      where vp.active and v.active`);
  let sent = 0;
  const dayMs = 86400000;
  for (const r of rows) {
    const t = makeT(r.locale);
    const triggers = [];
    if (r.expires_on) {
      const exp = new Date(r.expires_on.toISOString ? r.expires_on.toISOString().slice(0, 10) : r.expires_on);
      const diff = Math.round((exp - new Date(day)) / dayMs);
      const key = exp.toISOString().slice(0, 10);
      if (diff === 7) triggers.push(['days7', key, t('is due in 7 days')]);
      if (diff === 3) triggers.push(['days3', key, t('is due in 3 days')]);
      if (diff < 0) triggers.push(['expired', key, t('has expired')]);
    }
    if (r.due_km != null) {
      const left = r.due_km - r.mileage;
      if (left <= 500 && left > 200) triggers.push(['km500', String(r.due_km), t('is due in about {km} km', { km: Math.max(left, 0) })]);
      if (left <= 200) triggers.push(['km200', String(r.due_km), left <= 0 ? t('has reached its mileage limit') : t('is due in about {km} km', { km: left })]);
    }
    for (const [trigger, dueKey, phrase] of triggers) {
      const ins = await q1(
        'insert into reminder_log(vehicle_part_id,trigger,due_key) values ($1,$2,$3) on conflict do nothing returning id',
        [r.id, trigger, dueKey]);
      if (!ins) continue;
      await notify(r.owner_id, {
        kind: 'reminder', vehiclePartId: r.id, channels: ALL_CHANNELS, link: `/app/vehicles/${r.vehicle_id}`,
        subject: t('Service reminder: {plate}', { plate: r.plate }),
        body: t('{part} on your {car} {phrase}. Book a visit at any branch.', { part: r.name, car: `${r.make} ${r.model}`, phrase }),
      });
      sent++;
    }
  }
  return { checked: rows.length, sent };
}
