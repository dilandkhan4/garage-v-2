import { q, q1 } from './db';
import { sendSMS, sendWhatsApp, sendEmail } from './providers';

export async function notify(userId, { kind = 'system', subject, body, link = null, vehiclePartId = null, channels = ['inapp'] }) {
  const n = await q1('insert into notifications(user_id,kind,subject,body,link,vehicle_part_id) values ($1,$2,$3,$4,$5,$6) returning id',
    [userId, kind, subject, body, link, vehiclePartId]);
  const u = await q1('select email, phone from users where id=$1', [userId]);
  for (const ch of channels) {
    let res;
    if (ch === 'inapp') res = { status: 'delivered', provider: 'app' };
    else if (ch === 'sms') res = await sendSMS(u?.phone, `${subject}: ${body}`);
    else if (ch === 'whatsapp') res = await sendWhatsApp(u?.phone, `${subject}: ${body}`, { template: process.env.WHATSAPP_TEMPLATE_REMINDER, params: [subject, body] });
    else if (ch === 'email') res = await sendEmail(u?.email, subject, body);
    else continue;
    await q('insert into notification_deliveries(notification_id,channel,status,provider,provider_ref,error) values ($1,$2,$3,$4,$5,$6)',
      [n.id, ch, res.status, res.provider ?? null, res.ref ?? null, res.error ?? null]);
  }
  return n.id;
}
export const ALL_CHANNELS = ['inapp', 'email', 'sms', 'whatsapp'];
