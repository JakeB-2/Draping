-- ============================================================
-- Draping Booking App — Database Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. service_groups
-- ============================================================
create table service_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text
);

-- ============================================================
-- 2. services
-- ============================================================
create table services (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,
  description             text,
  time_requirement_minutes integer not null,
  service_group_id        uuid not null references service_groups(id),
  is_active               boolean not null default true
);

-- ============================================================
-- 3. images
-- Storage path in Supabase Storage bucket "draping-images".
-- alt_text for accessibility.
-- ============================================================
create table images (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,
  alt_text     text,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 4. service_images  (join: services ↔ images)
-- ============================================================
create table service_images (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  image_id   uuid not null references images(id) on delete cascade,
  sort_order integer not null default 0,
  unique(service_id, image_id)
);

-- ============================================================
-- 5. offerings
-- Admin-managed sellable combinations / packages.
-- ============================================================
create table offerings (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  description      text,
  duration_minutes integer not null,
  price_amount     numeric(10,2) not null,
  break_required   boolean not null default false,
  break_minutes    integer not null default 0 check (break_minutes between 0 and 180),
  buffer_minutes   integer not null default 0 check (buffer_minutes between 0 and 240 and buffer_minutes % 15 = 0),
  allowed_start_times time[] not null default '{}',
  people_count     integer not null default 1 check (people_count between 1 and 10),
  time_adjustment_minutes integer not null default 0 check (time_adjustment_minutes between -1440 and 1440),
  is_active        boolean not null default true
);

-- ============================================================
-- 6. offering_images  (join: offerings ↔ images)
-- ============================================================
create table offering_images (
  id          uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  image_id    uuid not null references images(id) on delete cascade,
  sort_order  integer not null default 0,
  unique(offering_id, image_id)
);

-- ============================================================
-- 7. offering_services  (join: offerings ↔ services)
-- ============================================================
create table offering_services (
  id          uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  service_id  uuid not null references services(id),
  sort_order  integer,
  unique(offering_id, service_id)
);

-- ============================================================
-- 8. clients
-- first_name + last_name instead of a single name column.
-- ============================================================
create table clients (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null,
  email         text unique,
  date_of_birth date,
  phone_number  text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 9. booking_settings  (singleton — one row)
-- ============================================================
create table booking_settings (
  id                           uuid primary key default gen_random_uuid(),
  day_start_time               time    not null default '09:00',
  day_end_time                 time    not null default '19:00',
  pair_extra_minutes           integer not null default 0,
  tax_rate_percent             numeric(5,2) not null default 0 check (tax_rate_percent between 0 and 100),
  max_booked_minutes_per_day   integer,
  max_booking_days_per_week    integer,
  max_consecutive_booking_days integer
);

-- ============================================================
-- 10. weekly_schedule  (one row per weekday, 0=Sunday … 6=Saturday)
-- ============================================================
create table weekly_schedule (
  id             uuid primary key default gen_random_uuid(),
  weekday_number integer not null,
  is_open        boolean not null default true,
  start_time     time,
  end_time       time,
  unique(weekday_number)
);

-- Seed with all 7 days (closed by default, owner enables them)
insert into weekly_schedule (weekday_number, is_open) values
  (0, false),
  (1, true),
  (2, true),
  (3, true),
  (4, true),
  (5, true),
  (6, false);

-- ============================================================
-- 11. blocked_periods
-- ============================================================
create table blocked_periods (
  id       uuid primary key default gen_random_uuid(),
  start_at timestamptz not null,
  end_at   timestamptz not null,
  reason   text
);

-- ============================================================
-- 12. bookings
-- Stores frozen operational values at booking time.
-- ============================================================
create table bookings (
  id               uuid primary key default gen_random_uuid(),
  offering_id      uuid references offerings(id),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text not null default 'pending',
  booked_as_pair   boolean not null default false,
  includes_break   boolean not null default false,
  buffer_minutes   integer not null default 0 check (buffer_minutes between 0 and 240 and buffer_minutes % 15 = 0),
  price_amount     numeric(10,2) not null,
  subtotal_amount  numeric(10,2) not null,
  tax_rate_percent numeric(5,2) not null default 0,
  tax_amount       numeric(10,2) not null default 0,
  total_amount     numeric(10,2) not null,
  duration_minutes integer not null,
  notes            text,
  is_waitlist      boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint bookings_status_check check (
    status in ('draft', 'pending', 'confirmed', 'cancelled', 'completed')
  )
);

-- ============================================================
-- 13. booking_clients  (join: bookings ↔ clients)
-- Allows 1 or 2 clients per booking (pair bookings).
-- ============================================================
create table booking_clients (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  client_id   uuid not null references clients(id),
  client_role text,
  unique(booking_id, client_id)
);

-- ============================================================
-- 14. users  (links Supabase auth users to this app)
-- auth.users is managed by Supabase — this table just mirrors
-- the two known users so we can reference them by app-level id.
-- ============================================================
create table users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique
);

-- Auto-populate email from auth.users on insert
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 15. email_templates
-- Admin-authored templates for transactional emails.
-- Body is raw HTML. Variables use {{double_brace}} syntax and
-- are substituted at send time (e.g. {{client_first_name}}).
-- Storage bucket for attachments: "draping-documents"
-- ============================================================
create table email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  subject     text not null default '',
  to_address  text,
  cc_address  text,
  bcc_address text,
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 16. email_template_attachments
-- Files uploaded to Supabase Storage and attached to a template.
-- Sent as email attachments whenever the template is used.
-- ============================================================
-- ============================================================
-- 17. recurring_blocks
-- Recurring time windows to block from booking (e.g. lunch break).
-- weekdays: array of integers 0=Sun … 6=Sat
-- valid_from / valid_until: optional date boundaries (null = unbounded)
-- ============================================================
create table recurring_blocks (
  id          uuid primary key default gen_random_uuid(),
  label       text,
  weekdays    integer[] not null,
  start_time  time not null,
  end_time    time not null,
  valid_from  date,
  valid_until date,
  created_at  timestamptz not null default now(),
  constraint recurring_blocks_time_order   check (start_time < end_time),
  constraint recurring_blocks_date_order   check (valid_from is null or valid_until is null or valid_from <= valid_until),
  constraint recurring_blocks_has_weekdays check (cardinality(weekdays) > 0)
);

-- Add timezone to booking_settings (run separately if table already exists):
-- alter table booking_settings add column if not exists timezone text not null default 'Australia/Melbourne';

create table email_template_attachments (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references email_templates(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  content_type text not null,
  file_size    integer,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 18. booking_action_triggers
-- Links booking lifecycle events to email templates.
-- When a booking transitions to a status, if a trigger exists
-- and is active, the linked template is sent automatically.
-- Variables in subject/body/to_address use {{double_brace}} syntax.
-- ============================================================
create table booking_action_triggers (
  id          uuid primary key default gen_random_uuid(),
  action      text not null unique,
  label       text not null,
  sort_order  integer not null default 0,
  template_id uuid references email_templates(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into booking_action_triggers (action, label, sort_order) values
  ('booking.requested', 'Request Submitted', 1),
  ('booking.confirmed', 'Booking Confirm',   2),
  ('booking.updated',   'Booking Update',    3),
  ('booking.cancelled', 'Booking Cancel',    4),
  ('client.followup',   'Client Follow Up',  5);

insert into email_templates (name, subject, to_address, body)
values (
  'Booking Request Received',
  'We received your booking request · {{booking_date}}',
  '{{client_email}}',
  '<p>Hello {{client_first_name}},</p><h1>Your request is in.</h1><p>Your selected time for {{offering_name}} on {{booking_date}} at {{booking_start_time}} is being held as a pending request. We will send a separate confirmation email when it is approved.</p><p><strong>{{booking_price}}</strong> · Reference {{booking_reference}}</p>'
)
on conflict (name) do nothing;

update booking_action_triggers
set template_id = (select id from email_templates where name = 'Booking Request Received')
where action = 'booking.requested'
  and template_id is null;

-- ============================================================
-- Storage buckets
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('draping-documents', 'draping-documents', false, 52428800, null)
on conflict (id) do nothing;
