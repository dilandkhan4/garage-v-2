// Seeds base configuration. With DEMO=1 also adds demo branches, staff, parts, programs and a school.
// Admin account: ADMIN_EMAIL / ADMIN_PASSWORD (defaults below are for local testing only: change them!).
import pg from 'pg'; import bcrypt from 'bcryptjs';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5433/garage' }); await db.connect();
const q = (t, p) => db.query(t, p).then((r) => r.rows);
const hash = (p) => bcrypt.hashSync(p, 10);
const DEMO = process.env.DEMO === '1'; const PW = process.env.DEMO_PASSWORD || 'Demo1234!';
if ((await q('select 1 from users limit 1')).length && process.env.FORCE !== '1') { console.log('Database already has users; skipping (set FORCE=1 to seed anyway).'); process.exit(0); }

await q(`insert into settings(key,value) values ('tax_rate','19.25'),('labor_rate','5000'),('delivery_fee','2000'),('graduate_fields','["name","photo","headline","skills","certificate","branch"]') on conflict (key) do nothing`);
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@autocare.test').toLowerCase();
await q(`insert into users(email,password_hash,full_name,role) values ($1,$2,'System Admin','admin') on conflict (email) do nothing`, [adminEmail, hash(process.env.ADMIN_PASSWORD || PW)]);
if (!DEMO) { console.log(`Admin created: ${adminEmail}`); process.exit(0); }

const b1 = (await q(`insert into branches(name,city,address,phone) values ('AutoCare Douala','Douala','Rue Joss, Bonanjo','+237 600 000 001') returning id`))[0].id;
const b2 = (await q(`insert into branches(name,city,address,phone) values ('AutoCare Yaoundé','Yaoundé','Avenue Kennedy, Centre ville','+237 600 000 002') returning id`))[0].id;
const [school] = await q(`insert into schools(name,contact,phone,email) values ('Lycée Technique de Bonabéri','Mr. Etame','+237 677 000 000','lycee@example.com') returning id`);
const mk = async (email, name, role, branch, extra = {}) => (await q(`insert into users(email,password_hash,full_name,role,branch_id,school_id,phone,locale) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
  [email, hash(PW), name, role, branch ?? null, extra.school ?? null, extra.phone ?? '+237 670 000 000', extra.locale ?? 'en']))[0].id;
await mk('manager.douala@autocare.test', 'Marie Ngo', 'manager', b1);
await mk('manager.yaounde@autocare.test', 'Paul Essomba', 'manager', b2);
await mk('reception.douala@autocare.test', 'Aïcha Bello', 'receptionist', b1, { locale: 'fr' });
await mk('reception.yaounde@autocare.test', 'Linda Fotso', 'receptionist', b2);
const m1 = await mk('mech1@autocare.test', 'Samuel Tchamba', 'mechanic', b1);
await q('insert into user_branches values ($1,$2)', [m1, b2]); // rotates between both branches
await mk('mech2@autocare.test', 'Jean-Pierre Kamga', 'mechanic', b2);
await mk('store.douala@autocare.test', 'Grace Mbarga', 'storekeeper', b1);
await mk('store.yaounde@autocare.test', 'Ibrahim Moussa', 'storekeeper', b2);
await mk('cashier.douala@autocare.test', 'Nadine Eyenga', 'cashier', b1);
await mk('cashier.yaounde@autocare.test', 'Roger Nkou', 'cashier', b2);
await mk('instructor@autocare.test', 'Emmanuel Biya', 'instructor', b1);
await mk('school@autocare.test', 'Mr. Etame', 'school_rep', null, { school: school.id });
await mk('client1@autocare.test', 'Alice Nkeng', 'client', null, { locale: 'fr' });
await mk('client2@autocare.test', 'Fleet Transport SARL', 'client', null);
await q('insert into school_branch_limits values ($1,$2,5),($1,$3,3)', [school.id, b1, b2]);

const parts = [
  ['OIL-5W30', 'Engine oil 5W-30 (4 L)', 'Huile moteur 5W-30 (4 L)', 'Engine oil', 18000, 'Most petrol cars'],
  ['FLT-OIL', 'Oil filter', 'Filtre à huile', 'Oil filter', 4500, 'Toyota, Hyundai, Kia'],
  ['FLT-AIR', 'Air filter', 'Filtre à air', 'Air filter', 6000, 'Universal'],
  ['BRK-PAD-F', 'Front brake pads', 'Plaquettes de frein avant', 'Brake pads', 25000, 'Toyota Corolla, Camry'],
  ['BRK-FLD', 'Brake fluid DOT4', 'Liquide de frein DOT4', 'Brake fluid', 5000, 'Universal'],
  ['BAT-60', 'Battery 12V 60Ah', 'Batterie 12V 60Ah', 'Battery', 65000, 'Universal'],
  ['SPK-SET', 'Spark plug set', 'Jeu de bougies', 'Spark plugs', 12000, 'Petrol engines'],
  ['TIM-BELT', 'Timing belt kit', 'Kit de distribution', 'Timing belt', 45000, 'Toyota, Nissan'],
  ['COOLANT', 'Coolant (5 L)', 'Liquide de refroidissement (5 L)', 'Coolant', 7000, 'Universal'],
  ['TYRE-195', 'Tyre 195/65 R15', 'Pneu 195/65 R15', 'Tyre', 55000, 'Corolla, Elantra'],
  ['WIPER', 'Wiper blades (pair)', 'Balais d’essuie-glace (paire)', 'Wiper blades', 8000, 'Universal'],
  ['MOTO-CHAIN', 'Motorcycle chain kit', 'Kit chaîne moto', 'Drive chain', 22000, 'Motorcycles 125-200cc'],
];
for (const [sku, name, fr, cat, price, fit] of parts) {
  const [p] = await q('insert into parts(sku,name,name_fr,category,price,fitment) values ($1,$2,$3,$4,$5,$6) returning id', [sku, name, fr, cat, price, fit]);
  await q('insert into stock(branch_id,part_id,qty,reorder_level) values ($1,$3,$4,5),($2,$3,$5,5)', [b1, b2, p.id, sku === 'TIM-BELT' ? 0 : 20, sku === 'TIM-BELT' ? 6 : 10]);
}
const iv = [['Engine oil', 6, 5000], ['Oil filter', 6, 5000], ['Air filter', 12, 15000], ['Brake pads', 18, 30000], ['Brake fluid', 24, 40000], ['Battery', 36, null], ['Spark plugs', 24, 30000],
  ['Timing belt', 60, 100000], ['Coolant', 24, 40000], ['Tyre', 48, 50000], ['Wiper blades', 12, null], ['Drive chain', 12, 15000]];
for (const [c, m, k] of iv) await q('insert into service_intervals(category,months,km) values ($1,$2,$3)', [c, m, k]);
await q(`insert into service_intervals(category,make,model,months,km) values ('Engine oil','Toyota','Corolla',6,10000)`); // model-specific manufacturer rule overrides the generic one

const programs = [
  ['Automobile Mechanics', 'Mécanique automobile', 'Full apprenticeship covering servicing, brakes, suspension, engine and electrical diagnostics.', 24, 3, [
    [1, 'Workshop safety and tools'], [1, 'Vehicle inspection and fluid checks'], [1, 'Oil and filter service'], [2, 'Brake system repair'], [2, 'Suspension and steering'], [2, 'Tyres, balancing and alignment'],
    [3, 'Engine diagnostics'], [3, 'Electrical and battery systems'], [3, 'Cooling system'], [4, 'Timing belt and engine overhaul'], [4, 'Customer handover and quality check']]],
  ['Motorcycle Repair', 'Réparation de motos', 'Servicing and repair of 2-wheelers.', 16, 2, [[1, 'Workshop safety'], [1, 'Routine servicing'], [2, 'Chain, brakes and tyres'], [2, 'Engine tune-up'], [3, 'Electrical faults']]],
  ['Auto Electrics', 'Électricité auto', 'Wiring, batteries, alternators and diagnostics.', 12, 2, [[1, 'Electrical safety'], [1, 'Reading wiring diagrams'], [2, 'Charging and starting systems'], [2, 'Fault finding with a multimeter']]],
];
for (const [n, fr, d, w, lvl, sk] of programs) {
  const [p] = await q('insert into programs(name,name_fr,description,duration_weeks,real_work_level) values ($1,$2,$3,$4,$5) returning id', [n, fr, d, w, lvl]);
  let i = 0; for (const [l, s] of sk) await q('insert into skills(program_id,name,level,position) values ($1,$2,$3,$4)', [p.id, s, l, ++i]);
}
await q(`insert into suppliers(name,phone) values ('Auto Pièces Cameroun','+237 699 111 111')`);
console.log(`Demo data created. Log in with any *@autocare.test account, password ${PW}`);
await db.end();
