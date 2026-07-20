-- ============================================================
-- Migration 008 — offering time rules + checkout tax snapshots
-- ============================================================
-- Offering duration is calculated as:
--   (sum of selected service minutes * people_count)
--   + time_adjustment_minutes
--   + break_minutes (when a break is enabled)
--
-- Tax stays separate from the offering's catalog price and is frozen on
-- each booking so later settings changes do not alter existing requests.
-- ============================================================

alter table offerings
  add column if not exists time_adjustment_minutes integer not null default 0
  check (time_adjustment_minutes between -1440 and 1440);

with service_totals as (
  select os.offering_id, sum(s.time_requirement_minutes)::integer as minutes_per_person
  from offering_services os
  join services s on s.id = os.service_id
  group by os.offering_id
)
update offerings o
set duration_minutes = (st.minutes_per_person * o.people_count)
  + o.time_adjustment_minutes
  + case when o.break_required then o.break_minutes else 0 end
from service_totals st
where st.offering_id = o.id;

alter table booking_settings
  add column if not exists tax_rate_percent numeric(5,2) not null default 0
  check (tax_rate_percent between 0 and 100);

alter table bookings
  add column if not exists subtotal_amount numeric(10,2),
  add column if not exists tax_rate_percent numeric(5,2) not null default 0,
  add column if not exists tax_amount numeric(10,2) not null default 0,
  add column if not exists total_amount numeric(10,2);

update bookings
set subtotal_amount = price_amount
where subtotal_amount is null;

update bookings
set total_amount = price_amount + tax_amount
where total_amount is null;

alter table bookings
  alter column subtotal_amount set not null,
  alter column total_amount set not null;
