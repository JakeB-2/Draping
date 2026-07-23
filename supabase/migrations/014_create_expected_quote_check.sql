-- ============================================================
-- Migration 014 — In-transaction stale-quote detection on create
-- ============================================================
-- Closes the Phase C interface gap: the public flow could only compare
-- the visitor's reviewed quote against a fresh one BEFORE calling the
-- atomic create, leaving a race where the catalog or settings change
-- between the check and the write.
--
-- booking_engine_create now accepts an optional fingerprint:
--   p.expected_quote: { duration_minutes, subtotal_amount,
--                       tax_amount, total_amount }
-- After recomputing the authoritative quote inside the transaction
-- (advisory lock held), any mismatch raises hint 'quote_changed' and
-- nothing is written. Omitting expected_quote keeps the previous
-- behaviour (admin flows surface the engine's own quote on save).
--
-- The function body is otherwise identical to migration 013.
-- ============================================================

create or replace function public.booking_engine_create(p jsonb)
returns jsonb
language plpgsql volatile
set search_path = public, pg_temp as $$
declare
  v_quote        jsonb;
  v_expected     jsonb;
  v_mismatch     boolean;
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

  -- Stale-quote fingerprint: the quote the caller showed the visitor
  -- must match what the catalog produces NOW, inside this transaction.
  -- A malformed fingerprint is by definition not a match.
  if p ? 'expected_quote' and jsonb_typeof(p->'expected_quote') = 'object' then
    v_expected := p->'expected_quote';
    begin
      v_mismatch :=
        (v_expected->>'duration_minutes')::int is distinct from (v_quote->>'duration_minutes')::int
        or round((v_expected->>'subtotal_amount')::numeric, 2) is distinct from (v_quote->>'subtotal_amount')::numeric
        or round((v_expected->>'tax_amount')::numeric, 2) is distinct from (v_quote->>'tax_amount')::numeric
        or round((v_expected->>'total_amount')::numeric, 2) is distinct from (v_quote->>'total_amount')::numeric;
    exception when others then
      v_mismatch := true;
    end;
    if v_mismatch then
      raise exception 'The timing or price changed while you were reviewing. Please check the refreshed quote.'
        using hint = 'quote_changed';
    end if;
  end if;

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

-- create or replace preserves the server-only ACLs from migration 011.

notify pgrst, 'reload schema';
