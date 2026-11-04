// Messaging and payment providers. PROVIDER_MODE=test (default) simulates every send/charge and records it.
// Set PROVIDER_MODE=live plus the keys below to use real accounts. Live adapters are generic HTTP
// adapters: confirm payloads against your chosen provider's documentation before go-live.
const live = () => process.env.PROVIDER_MODE === 'live';

export async function sendSMS(to, text) {
  if (!to) return { status: 'skipped', provider: 'sms', error: 'no phone number' };
  if (!live() || !process.env.SMS_API_URL) return { status: 'simulated', provider: 'test-sms', ref: `sim-${Date.now()}` };
  try {
    const r = await fetch(process.env.SMS_API_URL, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.SMS_API_KEY}` },
      body: JSON.stringify({ to, message: text, from: process.env.SMS_SENDER || 'GARAGE' }) });
    return r.ok ? { status: 'sent', provider: 'sms', ref: String((await r.json().catch(() => ({}))).id ?? '') }
      : { status: 'failed', provider: 'sms', error: `HTTP ${r.status}` };
  } catch (e) { return { status: 'failed', provider: 'sms', error: String(e.message) }; }
}

// WhatsApp Business Cloud API: business-initiated messages must use an approved template.
export async function sendWhatsApp(to, text, { template, params } = {}) {
  if (!to) return { status: 'skipped', provider: 'whatsapp', error: 'no phone number' };
  if (!live() || !process.env.WHATSAPP_TOKEN) return { status: 'simulated', provider: 'test-whatsapp', ref: `sim-${Date.now()}` };
  try {
    const body = template
      ? { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'template',
          template: { name: template, language: { code: process.env.WHATSAPP_LANG || 'en' },
            components: [{ type: 'body', parameters: (params || [text]).map((t) => ({ type: 'text', text: String(t) })) }] } }
      : { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body: text } };
    const r = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, body: JSON.stringify(body) });
    return r.ok ? { status: 'sent', provider: 'whatsapp' } : { status: 'failed', provider: 'whatsapp', error: `HTTP ${r.status}` };
  } catch (e) { return { status: 'failed', provider: 'whatsapp', error: String(e.message) }; }
}

export async function sendEmail(to, subject, text) {
  if (!to) return { status: 'skipped', provider: 'email', error: 'no email' };
  if (!live() || !process.env.EMAIL_API_URL) return { status: 'simulated', provider: 'test-email', ref: `sim-${Date.now()}` };
  try {
    const r = await fetch(process.env.EMAIL_API_URL, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.EMAIL_API_KEY}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }) });
    return r.ok ? { status: 'sent', provider: 'email' } : { status: 'failed', provider: 'email', error: `HTTP ${r.status}` };
  } catch (e) { return { status: 'failed', provider: 'email', error: String(e.message) }; }
}

// Mobile money / card collection through an aggregator (MTN MoMo, Orange Money, cards).
// Live mode posts to PAYMENT_API_URL and expects a webhook call to /api/payments/webhook when the customer confirms.
export async function startCharge({ method, amount, phone, reference }) {
  if (method === 'cash') return { status: 'succeeded', provider: 'cash', ref: reference };
  if (!live() || !process.env.PAYMENT_API_URL) return { status: 'pending', provider: `test-${method}`, ref: `TEST-${reference}` };
  try {
    const r = await fetch(process.env.PAYMENT_API_URL, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.PAYMENT_API_KEY}` },
      body: JSON.stringify({ method, amount, currency: 'XAF', phone, reference, callback_url: process.env.PAYMENT_CALLBACK_URL }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { status: 'pending', provider: method, ref: j.id || reference } : { status: 'failed', provider: method, error: `HTTP ${r.status}` };
  } catch (e) { return { status: 'failed', provider: method, error: String(e.message) }; }
}
export const providerMode = () => (live() ? 'live' : 'test');
