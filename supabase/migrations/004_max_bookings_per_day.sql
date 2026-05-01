-- ============================================================
-- Migration 004 — Per-day booking cap
-- ============================================================
-- Adds a per-day limit alongside the existing per-week +
-- consecutive-day caps. Enforced in app/book/actions.ts
-- getAvailableSlots(): days at or above the cap return zero
-- slots so the public flow never offers an over-cap booking.
-- Idempotent.
-- ============================================================

alter table booking_settings
  add column if not exists max_bookings_per_day integer;
