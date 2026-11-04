# AutoCare: garage, parts shop, training academy and staff chat (one web app)

Next.js 15 + PostgreSQL. Installable on phones (PWA). English and French.

## What it covers
Client and vehicle records with part expiry reminders (7 days, 3 days, after expiry, and by mileage), full job workflow (appointment, check-in, diagnosis, quote with approval, work, quality check, invoice, payment, pickup, review), parts shop (online, in-store, delivery, returns), stock with transfers between branches and purchasing, apprenticeship programs with skill sign-offs, attendance, tasks, QR-verified certificates, school partnerships with per-branch limits, public graduates page and hiring conversion, staff chat (department groups and private messages), approvals, audit log, reports with CSV, roles for admin, manager, receptionist, mechanic, storekeeper, cashier, instructor, student, school representative and client.

## Run it
1. PostgreSQL 14+ and Node 20+.
2. `cp .env.example .env` and fill it in (at least DATABASE_URL, SESSION_SECRET, CRON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, BASE_URL).
3. `npm install`
4. `npm run migrate` then `npm run seed` (creates settings and the admin). For a demo with two branches, staff, clients, parts and programs: `DEMO=1 npm run seed` (all demo accounts end in `@autocare.test`, password `Demo1234!`: admin@autocare.test, manager.douala@, reception.douala@, mech1@, store.douala@, cashier.douala@, instructor@, school@, client1@).
5. `npm run build && npm start` (port 3000). Put it behind HTTPS (required for the install-to-phone feature and secure cookies).

## Reminders
Schedule one daily call (for example 08:00): `npm run reminders`, or request `GET /api/cron/reminders?key=$CRON_KEY`. Each reminder is sent once per part and trigger.

## Going live with SMS, WhatsApp, email and Mobile Money / Orange Money
Everything is simulated while `PROVIDER_MODE=test` (messages are logged in the Notifications page, payments are confirmed with a button). Set `PROVIDER_MODE=live` and fill the provider variables. `lib/providers.js` holds generic HTTP adapters: adjust the request format there to match the provider you sign with (aggregator for MTN MoMo / Orange Money, SMS gateway, WhatsApp Business API, email service). Payment confirmations should call `/api/payments/webhook` signed with `PAYMENT_WEBHOOK_SECRET`. Test with the provider's sandbox before real money.

## Things to confirm before launch
- VAT/tax rate (Settings, default 19.25%), labour rate, delivery fee.
- Provider accounts and keys; WhatsApp message templates must be approved by Meta.
- Real values for SESSION_SECRET and CRON_KEY; HTTPS; daily database backups.
- Terms and privacy text (minors, parental consent, graduates page) reviewed locally.
- Open items from the requirements doc: meaning of "credit" payments, delivery staff role, offline use.

## Notes
- The audit log is append-only (enforced by a database trigger). Corrections are new entries; originals are kept.
- Money is visible only to the branch that earned it and to the admin. Other branches see non-financial data read-only.
- Manager changes to parts, intervals and prices go to the admin for approval.
- `tests/` has Playwright end-to-end scripts (reset with `tests/reset.sh`).
