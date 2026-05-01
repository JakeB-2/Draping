-- ============================================================
-- Migration 001 — Refactor additions
-- ============================================================
-- Apply on top of the live schema in supabase/schema.sql.
-- Idempotent: safe to re-run if needed.
--
-- Changes:
--   1. bookings: lifecycle timestamps (updated_at, confirmed_at, cancelled_at)
--   2. booking_settings: timezone + studio + booking-rule + email columns
--   3. published_snapshots: powers fast public selection
--   4. documents + offering_documents: general document model
--   5. draping-images storage bucket: public marketing imagery only
--
-- RLS policies are intentionally NOT in this migration. They land in
-- a separate pre-prod migration. See plan: Phase 7.
-- ============================================================

-- 1. Booking lifecycle timestamps -----------------------------
alter table bookings
  add column if not exists updated_at   timestamptz not null default now(),
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

-- Auto-bump updated_at on any row change
create or replace function public.touch_bookings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bookings_updated_at on bookings;
create trigger bookings_updated_at
  before update on bookings
  for each row execute procedure public.touch_bookings_updated_at();

-- 2. booking_settings extensions ------------------------------
-- Studio identity (used in booking confirmations + public site).
-- Booking rules (buffer between, lead time, advance window).
-- Owner email used for ?test=1 sample sends from the template editor.
alter table booking_settings
  add column if not exists timezone          text    not null default 'America/Toronto',
  add column if not exists business_name     text,
  add column if not exists address           text,
  add column if not exists contact_email     text,
  add column if not exists phone             text,
  add column if not exists buffer_minutes    integer not null default 0,
  add column if not exists min_lead_hours    integer not null default 0,
  add column if not exists max_advance_days  integer not null default 60,
  add column if not exists owner_email       text;

-- 3. Published snapshots --------------------------------------
create table if not exists published_snapshots (
  id            uuid primary key default gen_random_uuid(),
  payload       jsonb not null,
  published_at  timestamptz not null default now(),
  published_by  uuid references users(id),
  is_active     boolean not null default true
);

-- Only one snapshot may be active at a time
create unique index if not exists one_active_snapshot
  on published_snapshots (is_active) where is_active;

-- 4. General document model -----------------------------------
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,
  file_name    text not null,
  content_type text,
  file_size    integer,
  title        text,
  description  text,
  created_at   timestamptz not null default now()
);

create table if not exists offering_documents (
  id          uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  sort_order  integer not null default 0,
  unique(offering_id, document_id)
);

-- 5. Public images bucket -------------------------------------
-- Marketing/showcase imagery only. Anything client-identifying must
-- stay in draping-documents (private bucket) — see plan bucket rules.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('draping-images', 'draping-images', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do nothing;
