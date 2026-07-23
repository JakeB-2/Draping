-- ============================================================
-- Migration 012 — Legacy booking backfill (Phase D, additive)
-- ============================================================
-- Materializes the participation model for bookings created before
-- migration 011 (plan §8.4–§8.5):
--
--   1. booking_participants from booking_clients — client_id links are
--      preserved on ALL rows, including secondary clients; roles come
--      from client_role where present, else the first client is primary.
--   2. booking_segments assuming every participant attended every
--      offering service, durations proportioned from the booking's
--      frozen duration_minutes (weights = the services' legacy
--      time_requirement_minutes; exact-sum rounding). A legacy
--      includes_break booking gets one break segment of the offering's
--      break_minutes placed mid-sequence.
--   3. Legacy booking-level totals are preserved VERBATIM:
--      base_package_amount := legacy price_amount, every backfilled
--      segment carries addon_amount = 0, and any residue between
--      base + addons and the frozen subtotal_amount becomes a single
--      explanatory booking_adjustments row — so
--      base + Σ addons + Σ adjustments = subtotal exactly.
--   4. Bookings that violate the model's assumptions (no clients,
--      missing offering, no member services, duration too small to
--      split) are recorded in legacy_backfill_anomalies for manual
--      resolution instead of being guessed at. Participants are still
--      backfilled whenever clients exist (that mapping is lossless);
--      segments are only written when they can be derived faithfully.
--
-- This migration is idempotent: a booking that already has
-- participants or segments is never touched.
-- Reads legacy columns by design; it always runs BEFORE migration 013
-- retires them.
-- ============================================================

create table if not exists legacy_backfill_anomalies (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  reason     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (booking_id, reason)
);

comment on table legacy_backfill_anomalies is
  'Legacy bookings migration 012 could not fully backfill — resolve manually, then re-run the relevant part by hand. Reasons: no_clients, over_participant_cap, missing_offering, no_member_services, duration_too_small.';

do $$
declare
  v_cap        integer;
  v_b          record;
  v_c          record;
  v_svc        record;
  v_n          integer;
  v_pnum       integer;
  v_participant_ids uuid[];
  v_primary_client uuid;
  v_services   record;
  v_svc_count  integer;
  v_break_min  integer;
  v_svc_total  integer;
  v_w          integer[];
  v_w_sum      bigint;
  v_names      text[];
  v_svc_ids    uuid[];
  v_prices     numeric[];
  v_alloc      integer;
  v_remaining  integer;
  v_sort       integer;
  v_break_after integer;
  v_segment_id uuid;
  v_pid        uuid;
  v_residue    numeric;
begin
  select coalesce(max_participants_per_booking, 2) into v_cap
  from booking_settings limit 1;
  v_cap := coalesce(v_cap, 2);

  -- ----------------------------------------------------------
  -- 1. Participants (per booking so one bad row cannot poison
  --    the set-based whole; deferred primary trigger checks at
  --    commit, and we insert the primary first).
  -- ----------------------------------------------------------
  for v_b in
    select b.id, b.status
    from bookings b
    where not exists (select 1 from booking_participants bp where bp.booking_id = b.id)
  loop
    if not exists (select 1 from booking_clients bc where bc.booking_id = v_b.id) then
      insert into legacy_backfill_anomalies (booking_id, reason, details)
      values (v_b.id, 'no_clients', jsonb_build_object('status', v_b.status))
      on conflict (booking_id, reason) do nothing;
      continue;
    end if;

    if (select count(*) from booking_clients bc where bc.booking_id = v_b.id) > v_cap then
      -- Participants are still backfilled below (the mapping is exact
      -- and lossless); flagged so the operator reviews the booking.
      insert into legacy_backfill_anomalies (booking_id, reason, details)
      values (
        v_b.id, 'over_participant_cap',
        jsonb_build_object(
          'client_count', (select count(*) from booking_clients bc where bc.booking_id = v_b.id),
          'cap', v_cap
        )
      )
      on conflict (booking_id, reason) do nothing;
    end if;

    v_pnum := 0;
    v_primary_client := null;
    for v_c in
      select bc.client_id, bc.client_role,
             trim(c.first_name || ' ' || c.last_name) as full_name
      from booking_clients bc
      join clients c on c.id = bc.client_id
      where bc.booking_id = v_b.id
      -- Primary first where recorded; otherwise the ordering is the
      -- only deterministic one available (plan: "else primary = the
      -- first/only client").
      order by (bc.client_role = 'primary') desc nulls last, bc.id
    loop
      v_pnum := v_pnum + 1;
      insert into booking_participants (booking_id, participant_number, client_id, display_name, role)
      values (
        v_b.id, v_pnum, v_c.client_id,
        coalesce(nullif(v_c.full_name, ''), 'Client'),
        case when v_pnum = 1 then 'primary' else 'additional' end
      );
      if v_pnum = 1 then
        v_primary_client := v_c.client_id;
      end if;
    end loop;

    update bookings
    set billing_client_id = coalesce(billing_client_id, v_primary_client)
    where id = v_b.id;
  end loop;

  -- ----------------------------------------------------------
  -- 2. Segments + reconciliation adjustment for legacy bookings
  --    (have participants now, still no segments).
  -- ----------------------------------------------------------
  for v_b in
    select b.id, b.offering_id, b.duration_minutes, b.includes_break,
           b.price_amount, b.subtotal_amount, b.base_package_amount,
           o.name as offering_name,
           coalesce(o.break_minutes, 0) as offering_break_minutes
    from bookings b
    left join offerings o on o.id = b.offering_id
    where exists (select 1 from booking_participants bp where bp.booking_id = b.id)
      and not exists (select 1 from booking_segments bs where bs.booking_id = b.id)
      and not exists (select 1 from booking_adjustments ba where ba.booking_id = b.id)
  loop
    if v_b.offering_id is null then
      insert into legacy_backfill_anomalies (booking_id, reason)
      values (v_b.id, 'missing_offering')
      on conflict (booking_id, reason) do nothing;
      continue;
    end if;

    -- Member services in offering order, with legacy per-person
    -- minutes as proportioning weights and current catalog seat
    -- prices as the provenance snapshot (addons stay 0 regardless —
    -- the legacy package price already covered everyone).
    select
      coalesce(array_agg(s.id order by os.sort_order, s.name), '{}'),
      coalesce(array_agg(s.name order by os.sort_order, s.name), '{}'),
      coalesce(array_agg(greatest(coalesce(s.time_requirement_minutes, 0), 0) order by os.sort_order, s.name), '{}'),
      coalesce(array_agg(round(coalesce(s.price_amount, 0), 2) order by os.sort_order, s.name), '{}')
    into v_svc_ids, v_names, v_w, v_prices
    from offering_services os
    join services s on s.id = os.service_id
    where os.offering_id = v_b.offering_id;

    v_svc_count := coalesce(array_length(v_svc_ids, 1), 0);
    if v_svc_count = 0 then
      insert into legacy_backfill_anomalies (booking_id, reason)
      values (v_b.id, 'no_member_services')
      on conflict (booking_id, reason) do nothing;
      continue;
    end if;

    v_break_min := case
      when v_b.includes_break
       and v_b.offering_break_minutes > 0
       and v_b.offering_break_minutes < v_b.duration_minutes
      then v_b.offering_break_minutes
      else 0
    end;
    v_svc_total := v_b.duration_minutes - v_break_min;
    if v_svc_total < v_svc_count then
      insert into legacy_backfill_anomalies (booking_id, reason, details)
      values (
        v_b.id, 'duration_too_small',
        jsonb_build_object('duration_minutes', v_b.duration_minutes, 'service_count', v_svc_count)
      )
      on conflict (booking_id, reason) do nothing;
      continue;
    end if;

    select sum(w) into v_w_sum from unnest(v_w) w;
    if coalesce(v_w_sum, 0) = 0 then
      -- No usable weights: split equally.
      select array_agg(1) into v_w from generate_series(1, v_svc_count);
      v_w_sum := v_svc_count;
    end if;

    select array_agg(bp.id order by bp.participant_number)
    into v_participant_ids
    from booking_participants bp
    where bp.booking_id = v_b.id;

    -- A legacy break sits mid-sequence; exact placement is unknowable
    -- and purely presentational.
    v_break_after := case when v_break_min > 0 then greatest(1, v_svc_count / 2) else 0 end;

    v_sort := 0;
    v_remaining := v_svc_total;
    for i in 1..v_svc_count loop
      if i = v_svc_count then
        v_alloc := v_remaining;
      else
        -- Proportional share, clamped so every later service keeps ≥1.
        v_alloc := greatest(1, round(v_svc_total::numeric * v_w[i] / v_w_sum)::int);
        v_alloc := least(v_alloc, v_remaining - (v_svc_count - i));
      end if;
      v_remaining := v_remaining - v_alloc;

      v_sort := v_sort + 1;
      insert into booking_segments (
        booking_id, sort_order, kind, service_id, service_name_snapshot,
        duration_minutes, seat_price_amount, addon_amount
      ) values (
        v_b.id, v_sort, 'service', v_svc_ids[i], v_names[i],
        v_alloc, v_prices[i], 0
      ) returning id into v_segment_id;

      foreach v_pid in array v_participant_ids loop
        insert into booking_segment_participants (segment_id, participant_id)
        values (v_segment_id, v_pid);
      end loop;

      if i = v_break_after then
        v_sort := v_sort + 1;
        insert into booking_segments (
          booking_id, sort_order, kind, duration_minutes, label
        ) values (v_b.id, v_sort, 'break', v_break_min, 'Break');
      end if;
    end loop;

    -- Freeze the package base as the legacy price and reconcile any
    -- residue so base + Σ addons (0) + Σ adjustments = legacy subtotal.
    update bookings
    set base_package_amount = coalesce(base_package_amount, price_amount),
        offering_name_snapshot = coalesce(offering_name_snapshot, v_b.offering_name)
    where id = v_b.id;

    v_residue := round(v_b.subtotal_amount - coalesce(v_b.base_package_amount, v_b.price_amount), 2);
    if v_residue <> 0 then
      insert into booking_adjustments (booking_id, kind, label, amount)
      values (
        v_b.id, 'manual',
        'Legacy pricing reconciliation (migration 012)',
        v_residue
      );
    end if;
  end loop;
end$$;

notify pgrst, 'reload schema';
