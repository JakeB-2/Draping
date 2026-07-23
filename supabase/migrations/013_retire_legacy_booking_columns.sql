-- ============================================================
-- Migration 013 — Retire legacy booking columns (Phase D, DESTRUCTIVE)
-- ============================================================
-- The final step of the participation redesign (plan §8.8). Run ONLY
-- after migration 012 has been applied and the reconciliation report
-- (scripts/reconcile-legacy-backfill.mjs) shows zero discrepancies.
--
--   1. Recreates booking_engine_create / booking_engine_revise without
--      the legacy bridge writes (price_amount, booked_as_pair,
--      includes_break) so the engine no longer references the columns
--      being dropped.
--   2. Drops the retired columns:
--        bookings:          booked_as_pair, includes_break, price_amount
--        offerings:         duration_minutes, price_amount, break_required,
--                           break_minutes, people_count, time_adjustment_minutes
--        services:          time_requirement_minutes
--        booking_settings:  pair_extra_minutes
--   3. Drops booking_clients (fully superseded by booking_participants,
--      which preserves every client_id link).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Engine functions without legacy bridge writes. Bodies are
--    otherwise identical to migration 011.
-- ------------------------------------------------------------

create or replace function public.booking_engine_create(p jsonb)
returns jsonb
language plpgsql volatile
set search_path = public, pg_temp as $$
declare
  v_quote        jsonb;
  v_starts       timestamptz;
  v_ends         timestamptz;
  v_occupied     timestamptz;
  v_duration     integer;
  v_buffer       integer;
  v_status       text;
  v_is_waitlist  boolean;
  v_billing      uuid;
  v_booking_id   uuid;
  v_participant_id uuid;
  v_participant_ids uuid[] := '{}';
  v_p            record;
  v_seg          record;
  v_segment_id   uuid;
  v_idx          integer;
  v_adj          record;
begin
  -- Serialize booking writes so cap checks and overlap validation are
  -- race-free; the exclusion constraint remains the DB-level backstop.
  perform pg_advisory_xact_lock(hashtext('draping_booking_write'));

  v_starts := (p->>'starts_at')::timestamptz;
  if v_starts is null then
    raise exception 'A start time is required' using hint = 'invalid_start_time';
  end if;
  v_status := coalesce(p->>'status', 'pending');
  if v_status not in ('draft', 'pending', 'confirmed') then
    raise exception 'New bookings must be draft, pending or confirmed'
      using hint = 'status_invalid';
  end if;
  v_is_waitlist := coalesce((p->>'is_waitlist')::boolean, false);

  v_quote := booking_engine_quote(
    (p->>'offering_id')::uuid,
    p->'participants',
    p->'segments',
    coalesce(p->'manual_adjustments', '[]'::jsonb)
  );

  v_duration := (v_quote->>'duration_minutes')::int;
  v_buffer := (v_quote->>'buffer_minutes')::int;
  v_ends := v_starts + make_interval(mins => v_duration);
  v_occupied := v_ends + make_interval(mins => v_buffer);

  -- Billing client = the primary participant's client record.
  select (value->>'client_id')::uuid into v_billing
  from jsonb_array_elements(p->'participants')
  where value->>'role' = 'primary';
  if v_billing is null then
    raise exception 'The primary participant must be linked to a client record'
      using hint = 'billing_client_required';
  end if;

  perform booking_engine_validate_slot(
    (p->>'offering_id')::uuid,
    v_starts, v_duration, v_buffer,
    v_is_waitlist,
    coalesce((p->>'skip_lead_checks')::boolean, false),
    null
  );

  insert into bookings (
    offering_id, offering_name_snapshot, billing_client_id,
    starts_at, ends_at, occupied_until,
    status, is_waitlist, notes,
    duration_minutes, buffer_minutes,
    base_package_amount, subtotal_amount, tax_rate_percent, tax_amount, total_amount
  ) values (
    (v_quote->>'offering_id')::uuid, v_quote->>'offering_name', v_billing,
    v_starts, v_ends, v_occupied,
    v_status, v_is_waitlist, nullif(trim(coalesce(p->>'notes', '')), ''),
    v_duration, v_buffer,
    (v_quote->>'base_package_amount')::numeric,
    (v_quote->>'subtotal_amount')::numeric,
    (v_quote->>'tax_rate_percent')::numeric,
    (v_quote->>'tax_amount')::numeric,
    (v_quote->>'total_amount')::numeric
  ) returning id into v_booking_id;

  for v_p in
    select value as pj, ordinality as n
    from jsonb_array_elements(p->'participants') with ordinality
  loop
    insert into booking_participants (booking_id, participant_number, client_id, display_name, role)
    values (
      v_booking_id, v_p.n,
      (v_p.pj->>'client_id')::uuid,
      trim(v_p.pj->>'display_name'),
      v_p.pj->>'role'
    ) returning id into strict v_participant_id;
    v_participant_ids[v_p.n] := v_participant_id;
  end loop;

  for v_seg in select value as sj from jsonb_array_elements(v_quote->'segments')
  loop
    insert into booking_segments (
      booking_id, sort_order, kind, service_id, service_name_snapshot,
      duration_minutes, seat_price_amount, addon_amount, label
    ) values (
      v_booking_id,
      (v_seg.sj->>'sort_order')::int,
      v_seg.sj->>'kind',
      (v_seg.sj->>'service_id')::uuid,
      v_seg.sj->>'service_name_snapshot',
      (v_seg.sj->>'duration_minutes')::int,
      (v_seg.sj->>'seat_price_amount')::numeric,
      (v_seg.sj->>'addon_amount')::numeric,
      v_seg.sj->>'label'
    ) returning id into v_segment_id;

    for v_idx in select (jsonb_array_elements_text(v_seg.sj->'participants'))::int
    loop
      insert into booking_segment_participants (segment_id, participant_id)
      values (v_segment_id, v_participant_ids[v_idx + 1]);
    end loop;
  end loop;

  for v_adj in select value as aj from jsonb_array_elements(v_quote->'adjustments')
  loop
    insert into booking_adjustments (booking_id, kind, label, amount, percent_snapshot)
    values (
      v_booking_id,
      v_adj.aj->>'kind',
      v_adj.aj->>'label',
      (v_adj.aj->>'amount')::numeric,
      (v_adj.aj->>'percent_snapshot')::numeric
    );
  end loop;

  return jsonb_build_object('booking_id', v_booking_id, 'quote', v_quote);
exception
  when exclusion_violation then
    raise exception 'That time was just taken. Please choose another available time.'
      using hint = 'slot_taken';
end;
$$;

create or replace function public.booking_engine_revise(p_booking_id uuid, p jsonb)
returns jsonb
language plpgsql volatile
set search_path = public, pg_temp as $$
declare
  v_booking      bookings;
  v_quote        jsonb;
  v_starts       timestamptz;
  v_ends         timestamptz;
  v_occupied     timestamptz;
  v_duration     integer;
  v_buffer       integer;
  v_billing      uuid;
  v_participant_id uuid;
  v_participant_ids uuid[] := '{}';
  v_p            record;
  v_seg          record;
  v_segment_id   uuid;
  v_idx          integer;
  v_adj          record;
begin
  perform pg_advisory_xact_lock(hashtext('draping_booking_write'));

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using hint = 'booking_missing';
  end if;
  if v_booking.offering_id is null then
    raise exception 'This booking predates the participation model and cannot be revised yet'
      using hint = 'offering_missing';
  end if;

  v_starts := coalesce((p->>'starts_at')::timestamptz, v_booking.starts_at);

  v_quote := booking_engine_quote(
    v_booking.offering_id,
    p->'participants',
    p->'segments',
    coalesce(p->'manual_adjustments', '[]'::jsonb)
  );

  v_duration := (v_quote->>'duration_minutes')::int;
  v_buffer := (v_quote->>'buffer_minutes')::int;
  v_ends := v_starts + make_interval(mins => v_duration);
  v_occupied := v_ends + make_interval(mins => v_buffer);

  select (value->>'client_id')::uuid into v_billing
  from jsonb_array_elements(p->'participants')
  where value->>'role' = 'primary';
  v_billing := coalesce(v_billing, v_booking.billing_client_id);
  if v_billing is null then
    raise exception 'The primary participant must be linked to a client record'
      using hint = 'billing_client_required';
  end if;

  perform booking_engine_validate_slot(
    v_booking.offering_id,
    v_starts, v_duration, v_buffer,
    v_booking.is_waitlist,
    coalesce((p->>'skip_lead_checks')::boolean, false),
    p_booking_id
  );

  -- Replace all child rows; deferred invariant triggers re-check the
  -- final state at commit.
  delete from booking_segments where booking_id = p_booking_id;
  delete from booking_participants where booking_id = p_booking_id;
  delete from booking_adjustments where booking_id = p_booking_id;

  update bookings set
    offering_name_snapshot = v_quote->>'offering_name',
    billing_client_id = v_billing,
    starts_at = v_starts,
    ends_at = v_ends,
    occupied_until = v_occupied,
    notes = case when p ? 'notes' then nullif(trim(coalesce(p->>'notes', '')), '') else notes end,
    duration_minutes = v_duration,
    buffer_minutes = v_buffer,
    base_package_amount = (v_quote->>'base_package_amount')::numeric,
    subtotal_amount = (v_quote->>'subtotal_amount')::numeric,
    tax_rate_percent = (v_quote->>'tax_rate_percent')::numeric,
    tax_amount = (v_quote->>'tax_amount')::numeric,
    total_amount = (v_quote->>'total_amount')::numeric
  where id = p_booking_id;

  for v_p in
    select value as pj, ordinality as n
    from jsonb_array_elements(p->'participants') with ordinality
  loop
    insert into booking_participants (booking_id, participant_number, client_id, display_name, role)
    values (
      p_booking_id, v_p.n,
      (v_p.pj->>'client_id')::uuid,
      trim(v_p.pj->>'display_name'),
      v_p.pj->>'role'
    ) returning id into strict v_participant_id;
    v_participant_ids[v_p.n] := v_participant_id;
  end loop;

  for v_seg in select value as sj from jsonb_array_elements(v_quote->'segments')
  loop
    insert into booking_segments (
      booking_id, sort_order, kind, service_id, service_name_snapshot,
      duration_minutes, seat_price_amount, addon_amount, label
    ) values (
      p_booking_id,
      (v_seg.sj->>'sort_order')::int,
      v_seg.sj->>'kind',
      (v_seg.sj->>'service_id')::uuid,
      v_seg.sj->>'service_name_snapshot',
      (v_seg.sj->>'duration_minutes')::int,
      (v_seg.sj->>'seat_price_amount')::numeric,
      (v_seg.sj->>'addon_amount')::numeric,
      v_seg.sj->>'label'
    ) returning id into v_segment_id;

    for v_idx in select (jsonb_array_elements_text(v_seg.sj->'participants'))::int
    loop
      insert into booking_segment_participants (segment_id, participant_id)
      values (v_segment_id, v_participant_ids[v_idx + 1]);
    end loop;
  end loop;

  for v_adj in select value as aj from jsonb_array_elements(v_quote->'adjustments')
  loop
    insert into booking_adjustments (booking_id, kind, label, amount, percent_snapshot)
    values (
      p_booking_id,
      v_adj.aj->>'kind',
      v_adj.aj->>'label',
      (v_adj.aj->>'amount')::numeric,
      (v_adj.aj->>'percent_snapshot')::numeric
    );
  end loop;

  return jsonb_build_object('booking_id', p_booking_id, 'quote', v_quote);
exception
  when exclusion_violation then
    raise exception 'That time was just taken. Please choose another available time.'
      using hint = 'slot_taken';
end;
$$;

-- create or replace preserves the existing ACLs (server-only grants
-- from migration 011), so no re-grant step is needed.

-- ------------------------------------------------------------
-- 2. Drop retired columns
-- ------------------------------------------------------------

alter table bookings
  drop column if exists booked_as_pair,
  drop column if exists includes_break,
  drop column if exists price_amount;

alter table offerings
  drop column if exists duration_minutes,
  drop column if exists price_amount,
  drop column if exists break_required,
  drop column if exists break_minutes,
  drop column if exists people_count,
  drop column if exists time_adjustment_minutes;

alter table services
  drop column if exists time_requirement_minutes;

alter table booking_settings
  drop column if exists pair_extra_minutes;

-- ------------------------------------------------------------
-- 3. Drop the superseded join table
-- ------------------------------------------------------------

drop table if exists booking_clients;

notify pgrst, 'reload schema';
