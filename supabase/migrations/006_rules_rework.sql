-- ============================================================
-- Migration 006 — Rules rework
-- ============================================================
-- 1. Drop unused global break rule columns (per-offering break_minutes
--    on `offerings` is the source of truth).
-- 2. Rename per-day cap from "count of bookings" to "total booked
--    minutes" — column renamed to reflect the new semantic.
-- 3. Rename per-week cap from "count of bookings" to "max distinct
--    days in a week with at least one booking".
-- Idempotent.
-- ============================================================

alter table booking_settings
  drop column if exists break_threshold_minutes,
  drop column if exists break_duration_minutes;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'booking_settings'
      and column_name  = 'max_bookings_per_day'
  ) then
    alter table booking_settings
      rename column max_bookings_per_day to max_booked_minutes_per_day;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'booking_settings'
      and column_name  = 'max_bookings_per_week'
  ) then
    alter table booking_settings
      rename column max_bookings_per_week to max_booking_days_per_week;
  end if;
end$$;
