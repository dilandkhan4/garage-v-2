-- Garage platform schema (PostgreSQL 14+). Idempotent.
create table if not exists branches (
  id serial primary key, name text not null, city text, address text, phone text,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists schools (
  id serial primary key, name text not null, contact text, phone text, email text,
  created_at timestamptz not null default now()
);
create table if not exists users (
  id serial primary key,
  email text unique not null, phone text, password_hash text not null,
  full_name text not null,
  role text not null check (role in ('admin','manager','receptionist','mechanic','storekeeper','cashier','instructor','student','school_rep','client')),
  locale text not null default 'en' check (locale in ('en','fr')),
  branch_id int references branches(id),
  school_id int references schools(id),
  company_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists user_branches (
  user_id int references users(id) on delete cascade,
  branch_id int references branches(id) on delete cascade,
  primary key (user_id, branch_id)
);
create table if not exists school_branch_limits (
  school_id int references schools(id) on delete cascade,
  branch_id int references branches(id) on delete cascade,
  max_students int not null default 10,
  primary key (school_id, branch_id)
);

-- vehicles
create table if not exists vehicles (
  id serial primary key,
  owner_id int not null references users(id),
  plate text unique not null, vin text, make text not null, model text not null,
  year int, mileage int not null default 0, color text, photo_url text, papers_ref text,
  branch_id int references branches(id), registered_by int references users(id),
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists vehicle_transfers (
  id serial primary key, vehicle_id int not null references vehicles(id),
  from_user int not null references users(id), to_email text not null, to_user int references users(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(), decided_at timestamptz
);

-- catalogue, intervals (manufacturer specifications), stock
create table if not exists parts (
  id serial primary key, sku text unique not null, name text not null, name_fr text,
  category text not null, price int not null default 0, description text, fitment text,
  online boolean not null default true, active boolean not null default true
);
create table if not exists service_intervals (
  id serial primary key, category text not null, make text, model text,
  months int, km int, unique (category, make, model)
);
create table if not exists stock (
  branch_id int references branches(id), part_id int references parts(id),
  qty int not null default 0 check (qty >= 0), reorder_level int not null default 5,
  primary key (branch_id, part_id)
);
create table if not exists suppliers (id serial primary key, name text not null, phone text, email text);
create table if not exists purchase_orders (
  id serial primary key, branch_id int not null references branches(id), supplier_id int references suppliers(id),
  status text not null default 'ordered' check (status in ('ordered','received','cancelled')),
  created_by int references users(id), created_at timestamptz not null default now(), received_at timestamptz
);
create table if not exists po_items (
  id serial primary key, po_id int not null references purchase_orders(id) on delete cascade,
  part_id int not null references parts(id), qty int not null, unit_cost int not null default 0
);
create table if not exists stock_transfers (
  id serial primary key, kind text not null default 'transfer' check (kind in ('transfer','sale')),
  part_id int not null references parts(id), from_branch int not null references branches(id), to_branch int not null references branches(id),
  qty int not null check (qty > 0), order_id int,
  status text not null default 'requested' check (status in ('requested','approved','received','rejected')),
  requested_by int references users(id), decided_by int references users(id),
  created_at timestamptz not null default now(), decided_at timestamptz
);

-- appointments, jobs
create table if not exists appointments (
  id serial primary key, vehicle_id int not null references vehicles(id), client_id int not null references users(id),
  branch_id int not null references branches(id), scheduled_at timestamptz not null,
  service_type text not null, notes text,
  source text not null default 'online' check (source in ('online','phone','desk','reminder')),
  status text not null default 'booked' check (status in ('booked','checked_in','cancelled','done')),
  created_at timestamptz not null default now()
);
create table if not exists jobs (
  id serial primary key, branch_id int not null references branches(id),
  vehicle_id int not null references vehicles(id), client_id int not null references users(id),
  appointment_id int references appointments(id),
  status text not null default 'checked_in' check (status in ('checked_in','diagnosis','quoted','approved','in_progress','quality_check','ready','invoiced','paid','picked_up','cancelled')),
  service_type text, mileage_in int, diagnosis text,
  mechanic_id int references users(id), student_id int references users(id), supervisor_id int references users(id),
  approval_method text check (approval_method in ('app','whatsapp','sms','verbal')),
  approved_at timestamptz, verbal_ticked_by int references users(id),
  parent_job_id int references jobs(id), warranty boolean not null default false,
  extra_service text, created_by int references users(id),
  created_at timestamptz not null default now(), closed_at timestamptz
);
create table if not exists job_items (
  id serial primary key, job_id int not null references jobs(id),
  kind text not null check (kind in ('part','labor')),
  part_id int references parts(id), description text not null,
  qty numeric(10,2) not null default 1, unit_price int not null default 0,
  mechanic_id int references users(id), logged_by int references users(id),
  corrects_item_id int references job_items(id), superseded_by int references job_items(id),
  created_at timestamptz not null default now()
);
create table if not exists job_notes (
  id serial primary key, job_id int not null references jobs(id), author_id int references users(id),
  branch_id int references branches(id), body text not null, created_at timestamptz not null default now()
);
create table if not exists job_corrections (
  id serial primary key, job_id int not null references jobs(id), item_id int references job_items(id),
  new_description text, new_qty numeric(10,2), new_unit_price int, reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by int references users(id), decided_by int references users(id),
  created_at timestamptz not null default now(), decided_at timestamptz
);
create table if not exists vehicle_parts (
  id serial primary key, vehicle_id int not null references vehicles(id), job_id int references jobs(id),
  part_id int references parts(id), name text not null, category text,
  installed_on date not null default current_date, mileage_at int,
  expires_on date, due_km int, branch_id int references branches(id), active boolean not null default true
);

-- notifications
create table if not exists notifications (
  id serial primary key, user_id int not null references users(id), kind text not null default 'system',
  subject text not null, body text not null, link text, vehicle_part_id int references vehicle_parts(id),
  read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists notification_deliveries (
  id serial primary key, notification_id int not null references notifications(id) on delete cascade,
  channel text not null check (channel in ('inapp','email','sms','whatsapp')),
  status text not null, provider text, provider_ref text, error text, created_at timestamptz not null default now()
);
create table if not exists reminder_log (
  id serial primary key, vehicle_part_id int not null references vehicle_parts(id),
  trigger text not null, due_key text not null, sent_at timestamptz not null default now(),
  unique (vehicle_part_id, trigger, due_key)
);

-- billing
create table if not exists orders (
  id serial primary key, client_id int references users(id), guest_name text, guest_phone text, guest_email text,
  branch_id int not null references branches(id), channel text not null default 'online' check (channel in ('online','instore')),
  delivery boolean not null default false, delivery_address text, delivery_fee int not null default 0,
  status text not null default 'placed' check (status in ('placed','confirmed','packed','out_for_delivery','delivered','cancelled')),
  created_by int references users(id), created_at timestamptz not null default now()
);
create table if not exists order_items (
  id serial primary key, order_id int not null references orders(id) on delete cascade,
  part_id int not null references parts(id), qty int not null check (qty > 0), unit_price int not null,
  source_branch_id int references branches(id), returned_qty int not null default 0
);
create table if not exists invoices (
  id serial primary key, number text unique not null, job_id int references jobs(id), order_id int references orders(id),
  branch_id int not null references branches(id), client_id int references users(id),
  customer_name text, subtotal int not null, tax_rate numeric(5,2) not null default 0, tax int not null default 0, total int not null,
  status text not null default 'issued' check (status in ('issued','partial','paid','void')),
  issued_at timestamptz not null default now(), sent_via text
);
create table if not exists payments (
  id serial primary key, invoice_id int not null references invoices(id), branch_id int not null references branches(id),
  amount int not null check (amount > 0), method text not null check (method in ('cash','momo','orange','card')),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  provider text, provider_ref text, payer_phone text, receipt_no text unique,
  received_by int references users(id), created_at timestamptz not null default now(), confirmed_at timestamptz
);
create table if not exists receipts (
  id serial primary key, payment_id int unique not null references payments(id), number text unique not null,
  snapshot jsonb not null, created_at timestamptz not null default now()
);
create table if not exists returns (
  id serial primary key, order_item_id int not null references order_items(id), qty int not null check (qty > 0),
  reason text, restock boolean not null default true, handled_by int references users(id),
  refund_amount int not null default 0, created_at timestamptz not null default now()
);
create table if not exists reviews (
  id serial primary key, job_id int unique not null references jobs(id), client_id int not null references users(id),
  branch_id int not null references branches(id), rating int not null check (rating between 1 and 5), comment text,
  created_at timestamptz not null default now(), edited_at timestamptz
);

-- training
create table if not exists programs (
  id serial primary key, name text not null, name_fr text, description text, duration_weeks int not null default 12,
  real_work_level int not null default 3, active boolean not null default true, created_by int references users(id)
);
create table if not exists skills (
  id serial primary key, program_id int not null references programs(id) on delete cascade,
  name text not null, name_fr text, level int not null default 1, position int not null default 0
);
create table if not exists enrollments (
  id serial primary key, student_id int not null references users(id), program_id int not null references programs(id),
  branch_id int not null references branches(id), school_id int references schools(id),
  status text not null default 'active' check (status in ('applied','active','graduated','dropped','failed','transferred')),
  start_date date not null default current_date, end_date date, level int not null default 1,
  exit_note text, exit_snapshot jsonb,
  is_minor boolean not null default false, guardian_name text, guardian_phone text, guardian_consent boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists skill_signoffs (
  id serial primary key, enrollment_id int not null references enrollments(id), skill_id int not null references skills(id),
  signed_by int not null references users(id), note text, signed_at timestamptz not null default now(),
  unique (enrollment_id, skill_id)
);
create table if not exists attendance (
  id serial primary key, enrollment_id int not null references enrollments(id), day date not null,
  status text not null check (status in ('present','absent','late')), marked_by int references users(id),
  unique (enrollment_id, day)
);
create table if not exists student_tasks (
  id serial primary key, enrollment_id int not null references enrollments(id), title text not null, description text,
  due_date date, status text not null default 'assigned' check (status in ('assigned','submitted','approved','rework')),
  submission text, feedback text, assigned_by int references users(id), created_at timestamptz not null default now()
);
create table if not exists certificates (
  id serial primary key, enrollment_id int unique not null references enrollments(id), code text unique not null,
  issued_by int references users(id), issued_at timestamptz not null default now(), revoked boolean not null default false
);
create table if not exists graduate_profiles (
  user_id int primary key references users(id), headline text, skills text, photo_url text, phone_public boolean not null default false,
  listed boolean not null default true, hired boolean not null default false
);
create table if not exists employer_requests (
  id serial primary key, company text not null, contact_name text not null, email text, phone text, message text,
  graduate_user_id int references users(id), status text not null default 'new' check (status in ('new','forwarded','closed')),
  created_at timestamptz not null default now()
);

-- chat
create table if not exists chat_channels (
  id serial primary key, kind text not null check (kind in ('department','dm')), name text, department text,
  created_at timestamptz not null default now()
);
create table if not exists chat_members (
  channel_id int references chat_channels(id) on delete cascade, user_id int references users(id) on delete cascade,
  last_read_id int not null default 0, primary key (channel_id, user_id)
);
create table if not exists chat_messages (
  id serial primary key, channel_id int not null references chat_channels(id) on delete cascade,
  sender_id int not null references users(id), body text not null, job_id int references jobs(id),
  created_at timestamptz not null default now()
);

-- governance
create table if not exists approvals (
  id serial primary key, kind text not null check (kind in ('manager_change','cross_branch_write')),
  title text not null, payload jsonb not null, branch_id int references branches(id),
  requested_by int references users(id), status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by int references users(id), decided_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists settings (key text primary key, value jsonb not null);
create table if not exists audit_log (
  id bigserial primary key, actor_id int, action text not null, entity text, entity_id text, data jsonb,
  created_at timestamptz not null default now()
);
create or replace function audit_log_immutable() returns trigger as $$
begin raise exception 'audit_log is append-only'; end $$ language plpgsql;
drop trigger if exists audit_log_no_change on audit_log;
create trigger audit_log_no_change before update or delete on audit_log for each row execute function audit_log_immutable();

create index if not exists idx_vehicles_owner on vehicles(owner_id);
create index if not exists idx_jobs_vehicle on jobs(vehicle_id);
create index if not exists idx_jobs_branch on jobs(branch_id, status);
create index if not exists idx_vp_expiry on vehicle_parts(expires_on) where active;
create index if not exists idx_msgs_channel on chat_messages(channel_id, id);
create index if not exists idx_notif_user on notifications(user_id, created_at desc);

alter table job_items add column if not exists applied boolean not null default false;
alter table enrollments drop constraint if exists enrollments_status_check;
alter table enrollments add constraint enrollments_status_check check (status in ('applied','active','graduated','dropped','failed','transferred'));
create sequence if not exists invoice_seq;
create sequence if not exists receipt_seq;
create sequence if not exists certificate_seq;
alter table enrollments add column if not exists terms_accepted_at timestamptz;
alter table enrollments add column if not exists note text;
