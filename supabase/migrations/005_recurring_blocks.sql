-- ============================================================
-- Migration 005 — recurring_blocks
-- ============================================================
-- The recurring_blocks table was defined in supabase/schema.sql
-- but never migrated to the live database. The bookings options
-- page reads from it for lunch / break / recurring-commitment
-- windows; without this table the page errors with PGRST205.
-- Idempotent.
-- ============================================================

create table if not exists recurring_blocks (
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

-- Nudge PostgREST to reload its schema cache so the table is queryable
-- without waiting for the next periodic refresh.
notify pgrst, 'reload schema';
