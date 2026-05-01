-- ============================================================
-- Migration 003 — break_minutes on offerings
-- ============================================================
-- Replaces the implicit "break_required is just informational" model with
-- an explicit break duration that's stored and rolled into the offering's
-- total duration.
--
-- Model:
--   service_time   = sum(offering_services.services.time_requirement_minutes)
--   break_minutes  = stored on offerings (only meaningful when break_required)
--   duration_minutes = service_time + (break_required ? break_minutes : 0)
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Add column ------------------------------------------------
alter table offerings
  add column if not exists break_minutes integer not null default 0;

-- 2. Constrain range -------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'offerings_break_minutes_range'
  ) then
    alter table offerings
      add constraint offerings_break_minutes_range
      check (break_minutes >= 0 and break_minutes <= 180);
  end if;
end
$$;

-- 3. Backfill: any break_required=true row that still has break_minutes=0
--    gets a sensible default (15 min). Owner can edit afterwards.
update offerings
set break_minutes = 15
where break_required = true and break_minutes = 0;

-- 4. Recompute duration_minutes from service sum + break ------
--    Pre-launch DB cleanup: bring stored duration in line with the new
--    derivation so existing rows match what the admin form will produce.
with svc_sums as (
  select os.offering_id, sum(s.time_requirement_minutes)::int as total
  from offering_services os
  join services s on s.id = os.service_id
  group by os.offering_id
)
update offerings o
set duration_minutes = coalesce(ss.total, 0)
                     + (case when o.break_required then o.break_minutes else 0 end)
from svc_sums ss
where ss.offering_id = o.id
  and coalesce(ss.total, 0) > 0;
