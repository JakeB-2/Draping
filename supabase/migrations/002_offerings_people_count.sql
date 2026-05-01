-- ============================================================
-- Migration 002 — offerings.people_count replaces pair_allowed
-- ============================================================
-- Each people-count is its own offering row (e.g. solo + pair are two
-- distinct offerings sharing the same service set). pair_allowed is
-- removed; pair_allowed=true rows are auto-cloned to a 2-person variant.
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Add people_count -----------------------------------------
alter table offerings
  add column if not exists people_count integer not null default 1
  check (people_count between 1 and 10);

-- 2. Clone pair_allowed=true rows as 2-person variants --------
-- Only runs if pair_allowed still exists on the table (guard for re-run).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'offerings'
      and column_name  = 'pair_allowed'
  ) then
    -- Clone each pair_allowed=true row, suffixing the name to keep it unique.
    insert into offerings (
      name, description, duration_minutes, price_amount,
      break_required, is_active, people_count
    )
    select
      o.name || ' (pair)',
      o.description,
      o.duration_minutes,
      o.price_amount,
      o.break_required,
      o.is_active,
      2
    from offerings o
    where o.pair_allowed = true
      and not exists (
        select 1 from offerings o2 where o2.name = o.name || ' (pair)'
      );

    -- Copy offering_services rows for the new clones.
    insert into offering_services (offering_id, service_id, sort_order)
    select new_o.id, os.service_id, os.sort_order
    from offerings old_o
    join offerings new_o on new_o.name = old_o.name || ' (pair)'
    join offering_services os on os.offering_id = old_o.id
    where old_o.pair_allowed = true
      and not exists (
        select 1 from offering_services os2
        where os2.offering_id = new_o.id and os2.service_id = os.service_id
      );

    -- Drop the column now that data has been migrated.
    alter table offerings drop column pair_allowed;
  end if;
end
$$;
