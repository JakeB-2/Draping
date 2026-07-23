-- ============================================================
-- Migration 011 — Per-service participation redesign (Phase A)
-- ============================================================
-- ADDITIVE ONLY. Implements docs/booking-participation-final-plan.md
-- §4 (schema), §5 (pricing), §6 (duration/transactions) foundations.
-- Old columns and booking_clients remain untouched; they are retired
-- in Phase D. Old and new structures coexist during Phases B/C.
--
-- Contents:
--   1. Extensions (btree_gist for the range exclusion constraint)
--   2. Catalog: services.price_amount, service_duration_terms (+seeds),
--      offerings.price_override (+price preservation)
--   3. Settings: max_participants_per_booking, pair_discount_percent
--   4. bookings: new snapshot columns, occupied_until (+backfill),
--      time-order check, range exclusion constraint
--   5. New tables: booking_participants, booking_segments,
--      booking_segment_participants, booking_adjustments
--   6. Invariant triggers (§4.4)
--   7. Booking engine functions (quote / validate / create / revise)
--   8. Grants
--
-- Money rule: all monetary arithmetic happens here in Postgres numeric.
-- Rounding: half-up to cents, applied at each adjustment application,
-- discount before tax (plan §11.3 — one constant place, this file).
-- ============================================================

create extension if not exists btree_gist;

-- ============================================================
-- 1. Catalog
-- ============================================================

-- Canonical per-attendee seat price. Cannot be inferred from offering
-- totals (plan §8.3) — starts at 0, configured by the admin. Offerings
-- keep today's prices via price_override below, so nothing changes
-- until seat prices are deliberately configured.
alter table services
  add column if not exists price_amount numeric(10,2) not null default 0
  check (price_amount >= 0);

create table if not exists service_duration_terms (
  id                uuid primary key default gen_random_uuid(),
  service_id        uuid not null references services(id) on delete cascade,
  participant_count integer not null check (participant_count >= 1),
  duration_minutes  integer not null check (duration_minutes > 0),
  unique (service_id, participant_count)
);

comment on table service_duration_terms is
  'Total duration of a service at a given attendee count (need not be linear). A missing count means that count is not offered for the service.';

-- Seed: count-1 from today's time_requirement_minutes, count-2 at 2×
-- (today every service runs one-at-a-time — plan §4.1 seeding rule).
insert into service_duration_terms (service_id, participant_count, duration_minutes)
select id, 1, time_requirement_minutes
from services
where time_requirement_minutes > 0
on conflict (service_id, participant_count) do nothing;

insert into service_duration_terms (service_id, participant_count, duration_minutes)
select id, 2, time_requirement_minutes * 2
from services
where time_requirement_minutes > 0
on conflict (service_id, participant_count) do nothing;

-- Optional fixed package price; null = derived from member seat prices.
alter table offerings
  add column if not exists price_override numeric(10,2)
  check (price_override is null or price_override >= 0);

-- Preserve current offering prices wherever they differ from the derived
-- sum of member seat prices (plan §8.3). With seat prices seeded at 0
-- this freezes every current price, keeping public totals unchanged.
update offerings o
set price_override = o.price_amount
where o.price_override is null
  and o.price_amount is distinct from (
    select coalesce(sum(s.price_amount), 0)
    from offering_services os
    join services s on s.id = os.service_id
    where os.offering_id = o.id
  );

-- ============================================================
-- 2. Settings (policy, not table shape — plan §4.2)
-- ============================================================

alter table booking_settings
  add column if not exists max_participants_per_booking smallint not null default 2
    check (max_participants_per_booking >= 1),
  add column if not exists pair_discount_percent numeric(5,2) not null default 0
    check (pair_discount_percent between 0 and 100);

-- ============================================================
-- 3. bookings — additive columns + overlap protection
-- ============================================================

alter table bookings
  add column if not exists billing_client_id     uuid references clients(id),
  add column if not exists offering_name_snapshot text,
  add column if not exists base_package_amount   numeric(10,2),
  add column if not exists occupied_until        timestamptz;

comment on column bookings.occupied_until is
  'End of the conflict window (ends_at + buffer). Basis of the range exclusion constraint.';

-- Backfill the conflict window for existing rows so legacy active
-- bookings participate in overlap protection. Mirrors the app''s
-- current occupied-end derivation (duration rounded up to the 30-min
-- grid, plus buffer); greatest() guards odd legacy rows.
update bookings
set occupied_until = greatest(
      ends_at,
      starts_at + make_interval(mins =>
        (ceil(duration_minutes / 30.0)::int * 30) + coalesce(buffer_minutes, 0))
    )
where occupied_until is null;

-- Writers that predate the engine (the pre-Phase-D public flow) insert
-- without occupied_until; derive it so every active booking always
-- participates in the exclusion constraint. Same derivation as the
-- backfill above.
create or replace function public.bookings_fill_occupied_until()
returns trigger language plpgsql as $$
begin
  if new.occupied_until is null then
    new.occupied_until := greatest(
      new.ends_at,
      new.starts_at + make_interval(mins =>
        (ceil(coalesce(new.duration_minutes, 0) / 30.0)::int * 30)
        + coalesce(new.buffer_minutes, 0)));
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_fill_occupied_until on bookings;
create trigger bookings_fill_occupied_until
  before insert or update on bookings
  for each row execute procedure public.bookings_fill_occupied_until();

alter table bookings alter column occupied_until set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_time_order') then
    alter table bookings add constraint bookings_time_order
      check (starts_at < ends_at and ends_at <= occupied_until);
  end if;

  -- §4.4: overlap protection at the database. Active, non-waitlist
  -- bookings'' occupied ranges must not overlap.
  if not exists (select 1 from pg_constraint where conname = 'bookings_no_overlap') then
    alter table bookings add constraint bookings_no_overlap
      exclude using gist (tstzrange(starts_at, occupied_until, '[)') with &&)
      where (status in ('pending', 'confirmed') and not is_waitlist and occupied_until is not null);
  end if;
end$$;

-- ============================================================
-- 4. New booking-owned tables (§4.3)
-- ============================================================

create table if not exists booking_participants (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references bookings(id) on delete cascade,
  participant_number integer not null check (participant_number >= 1),
  client_id          uuid references clients(id),
  display_name       text not null check (length(trim(display_name)) > 0),
  role               text not null check (role in ('primary', 'additional')),
  unique (booking_id, participant_number)
);

-- At most one primary, immediately; "exactly one" is completed by the
-- deferred trigger below.
create unique index if not exists booking_participants_one_primary
  on booking_participants (booking_id) where role = 'primary';

create table if not exists booking_segments (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references bookings(id) on delete cascade,
  sort_order            integer not null,
  kind                  text not null check (kind in ('service', 'break')),
  service_id            uuid references services(id),
  service_name_snapshot text,
  duration_minutes      integer not null check (duration_minutes > 0),
  seat_price_amount     numeric(10,2) check (seat_price_amount is null or seat_price_amount >= 0),
  addon_amount          numeric(10,2) not null default 0 check (addon_amount >= 0),
  label                 text,
  unique (booking_id, sort_order),
  constraint booking_segments_shape check (
    (kind = 'service'
      and service_id is not null
      and service_name_snapshot is not null
      and seat_price_amount is not null)
    or
    (kind = 'break'
      and service_id is null
      and service_name_snapshot is null
      and seat_price_amount is null
      and addon_amount = 0)
  )
);

create index if not exists booking_segments_booking_idx on booking_segments (booking_id, sort_order);

create table if not exists booking_segment_participants (
  id             uuid primary key default gen_random_uuid(),
  segment_id     uuid not null references booking_segments(id) on delete cascade,
  participant_id uuid not null references booking_participants(id) on delete cascade,
  unique (segment_id, participant_id)
);

create index if not exists booking_segment_participants_participant_idx
  on booking_segment_participants (participant_id);

create table if not exists booking_adjustments (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings(id) on delete cascade,
  kind             text not null check (kind in ('package', 'pair_discount', 'manual')),
  label            text not null,
  amount           numeric(10,2) not null,
  percent_snapshot numeric(5,2),
  created_at       timestamptz not null default now()
);

create index if not exists booking_adjustments_booking_idx on booking_adjustments (booking_id);

-- ============================================================
-- 5. Invariant triggers (§4.4)
-- ============================================================

-- 5.1 Segment participants: must attend a *service* segment of the
--     *same booking*. Immediate (BEFORE row) — never valid to violate.
create or replace function public.booking_segment_participants_check()
returns trigger language plpgsql as $$
declare
  v_segment  record;
  v_p_booking uuid;
begin
  select booking_id, kind into v_segment from booking_segments where id = new.segment_id;
  if not found then
    raise exception 'Segment % does not exist', new.segment_id;
  end if;
  if v_segment.kind <> 'service' then
    raise exception 'Break segments cannot have participants' using hint = 'segment_invalid';
  end if;
  select booking_id into v_p_booking from booking_participants where id = new.participant_id;
  if not found then
    raise exception 'Participant % does not exist', new.participant_id;
  end if;
  if v_p_booking <> v_segment.booking_id then
    raise exception 'Participant belongs to a different booking than the segment'
      using hint = 'segment_invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_segment_participants_check on booking_segment_participants;
create trigger booking_segment_participants_check
  before insert or update on booking_segment_participants
  for each row execute procedure public.booking_segment_participants_check();

-- 5.2 Exactly one primary participant per booking (deferred to commit
--     so multi-row rewrites inside one transaction stay legal).
create or replace function public.booking_participants_primary_check()
returns trigger language plpgsql as $$
declare
  v_booking uuid;
  v_primary integer;
  v_total   integer;
begin
  foreach v_booking in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.booking_id end,
    case when tg_op in ('DELETE', 'UPDATE') then old.booking_id end
  ], null)
  loop
    -- The booking may have been deleted in the same transaction.
    if exists (select 1 from bookings where id = v_booking) then
      select count(*), count(*) filter (where role = 'primary')
        into v_total, v_primary
      from booking_participants where booking_id = v_booking;
      if v_total > 0 and v_primary <> 1 then
        raise exception 'Booking % must have exactly one primary participant', v_booking
          using hint = 'primary_required';
      end if;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists booking_participants_primary_check on booking_participants;
create constraint trigger booking_participants_primary_check
  after insert or update or delete on booking_participants
  deferrable initially deferred
  for each row execute procedure public.booking_participants_primary_check();

-- 5.3 Service segments must end the transaction with ≥1 participant.
create or replace function public.booking_segments_min_participants_check()
returns trigger language plpgsql as $$
declare
  v_segment_id uuid;
  v_kind text;
begin
  if tg_table_name = 'booking_segments' then
    v_segment_id := coalesce(new.id, old.id);
  else
    v_segment_id := coalesce(new.segment_id, old.segment_id);
  end if;
  select kind into v_kind from booking_segments where id = v_segment_id;
  if found and v_kind = 'service'
     and not exists (select 1 from booking_segment_participants where segment_id = v_segment_id) then
    raise exception 'Service segment % must have at least one participant', v_segment_id
      using hint = 'segment_participants_required';
  end if;
  return null;
end;
$$;

drop trigger if exists booking_segments_min_participants on booking_segments;
create constraint trigger booking_segments_min_participants
  after insert or update on booking_segments
  deferrable initially deferred
  for each row execute procedure public.booking_segments_min_participants_check();

drop trigger if exists booking_segment_participants_min_check on booking_segment_participants;
create constraint trigger booking_segment_participants_min_check
  after update or delete on booking_segment_participants
  deferrable initially deferred
  for each row execute procedure public.booking_segments_min_participants_check();

-- 5.4 booking_id is immutable on child rows. Re-parenting a participant
--     or segment would silently carry booking_segment_participants links
--     across bookings (§4.4 d); the engine always recreates child rows
--     instead of moving them.
create or replace function public.booking_child_immutable_booking()
returns trigger language plpgsql as $$
begin
  if new.booking_id is distinct from old.booking_id then
    raise exception 'booking_id is immutable — recreate the row under the target booking'
      using hint = 'segment_invalid';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_participants_immutable_booking on booking_participants;
create trigger booking_participants_immutable_booking
  before update of booking_id on booking_participants
  for each row execute procedure public.booking_child_immutable_booking();

drop trigger if exists booking_segments_immutable_booking on booking_segments;
create trigger booking_segments_immutable_booking
  before update of booking_id on booking_segments
  for each row execute procedure public.booking_child_immutable_booking();

-- ============================================================
-- 6. Booking engine
-- ============================================================
-- The single authority for money and duration (§5, §6). The TypeScript
-- modules in lib/booking-engine/ are typed wrappers over these
-- functions — they never re-implement the arithmetic.
--
-- Machine-readable failure codes travel in the exception HINT:
--   offering_missing, participants_invalid, participant_cap,
--   primary_required, billing_client_required, segment_invalid,
--   duration_term_missing, no_service_segments, adjustment_invalid,
--   outside_schedule, invalid_start_time, too_soon, too_far_ahead,
--   blocked, slot_taken, day_minutes_cap, week_days_cap,
--   consecutive_days_cap, booking_missing
-- ============================================================

create or replace function public.booking_engine_settings()
returns booking_settings language sql stable
set search_path = public, pg_temp as $$
  select * from booking_settings limit 1;
$$;

-- ------------------------------------------------------------
-- 6.1 Quote: participants + segments → durations, segments, price
-- ------------------------------------------------------------
-- p_participants: [{ "role": "primary"|"additional",
--                    "display_name": text, "client_id": uuid|null }]
-- p_segments (ordered): [{ "kind": "service", "service_id": uuid,
--                          "participants": [participant indexes] }
--                      | { "kind": "break", "duration_minutes": int,
--                          "label": text|null }]
-- p_manual_adjustments: [{ "label": text, "amount": "±0.00" }]
-- Money is returned as 2-decimal strings; JS never does the math.
create or replace function public.booking_engine_quote(
  p_offering_id uuid,
  p_participants jsonb,
  p_segments jsonb,
  p_manual_adjustments jsonb default '[]'::jsonb
) returns jsonb
language plpgsql stable
set search_path = public, pg_temp as $$
declare
  v_settings        booking_settings;
  v_offering        offerings;
  v_max_participants integer;
  v_participant_count integer;
  v_primary_count   integer;
  v_p               record;
  v_seg             record;
  v_service         record;
  v_indexes         integer[];
  v_attendee_count  integer;
  v_has_additional_attending boolean := false;
  v_derived_base    numeric := 0;
  v_base            numeric;
  v_duration        integer := 0;
  v_service_segments integer := 0;
  v_seg_duration    integer;
  v_addon           numeric;
  v_addon_total     numeric := 0;
  v_segments_out    jsonb := '[]'::jsonb;
  v_adjustments_out jsonb := '[]'::jsonb;
  v_adjustment_total numeric := 0;
  v_adj             record;
  v_adj_amount      numeric;
  v_discount        numeric;
  v_subtotal        numeric;
  v_tax_rate        numeric;
  v_tax             numeric;
  v_total           numeric;
  v_sort            integer := 0;
begin
  v_settings := booking_engine_settings();
  v_max_participants := coalesce(v_settings.max_participants_per_booking, 2);

  select * into v_offering from offerings where id = p_offering_id;
  if not found then
    raise exception 'Offering not found' using hint = 'offering_missing';
  end if;

  -- Participants ------------------------------------------------
  if p_participants is null or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) = 0 then
    raise exception 'At least one participant is required' using hint = 'participants_invalid';
  end if;
  v_participant_count := jsonb_array_length(p_participants);
  if v_participant_count > v_max_participants then
    raise exception 'A booking allows at most % participant(s)', v_max_participants
      using hint = 'participant_cap';
  end if;

  v_primary_count := 0;
  for v_p in
    select value as pj, ordinality - 1 as idx
    from jsonb_array_elements(p_participants) with ordinality
  loop
    if coalesce(trim(v_p.pj->>'display_name'), '') = '' then
      raise exception 'Participant % needs a display name', v_p.idx + 1
        using hint = 'participants_invalid';
    end if;
    if v_p.pj->>'role' = 'primary' then
      v_primary_count := v_primary_count + 1;
    elsif v_p.pj->>'role' is distinct from 'additional' then
      raise exception 'Participant role must be primary or additional'
        using hint = 'participants_invalid';
    end if;
  end loop;
  if v_primary_count <> 1 then
    raise exception 'Exactly one primary participant is required' using hint = 'primary_required';
  end if;

  -- Base package: coalesce(price_override, Σ member seat prices) (§5)
  select coalesce(sum(s.price_amount), 0) into v_derived_base
  from offering_services os
  join services s on s.id = os.service_id
  where os.offering_id = v_offering.id;
  v_base := round(coalesce(v_offering.price_override, v_derived_base), 2);

  -- Segments ----------------------------------------------------
  if p_segments is null or jsonb_typeof(p_segments) <> 'array'
     or jsonb_array_length(p_segments) = 0 then
    raise exception 'At least one segment is required' using hint = 'segment_invalid';
  end if;

  for v_seg in
    select value as sj, ordinality as ord
    from jsonb_array_elements(p_segments) with ordinality
  loop
    v_sort := v_sort + 1;

    if v_seg.sj->>'kind' = 'service' then
      select s.id, s.name, s.price_amount into v_service
      from services s where s.id = (v_seg.sj->>'service_id')::uuid;
      if not found then
        raise exception 'Segment % references an unknown service', v_sort
          using hint = 'segment_invalid';
      end if;

      select coalesce(array_agg(x::int), '{}') into v_indexes
      from jsonb_array_elements_text(v_seg.sj->'participants') as t(x);
      if array_length(v_indexes, 1) is null then
        raise exception 'Service segment % needs at least one participant', v_sort
          using hint = 'segment_participants_required';
      end if;
      if exists (select 1 from unnest(v_indexes) i where i < 0 or i >= v_participant_count)
         or (select count(distinct i) from unnest(v_indexes) i) <> array_length(v_indexes, 1) then
        raise exception 'Service segment % has invalid participant references', v_sort
          using hint = 'segment_invalid';
      end if;
      v_attendee_count := array_length(v_indexes, 1);

      select sdt.duration_minutes into v_seg_duration
      from service_duration_terms sdt
      where sdt.service_id = v_service.id and sdt.participant_count = v_attendee_count;
      if not found then
        raise exception '"%" is not offered for % participant(s) (no duration term)',
          v_service.name, v_attendee_count using hint = 'duration_term_missing';
      end if;

      if exists (
        select 1
        from unnest(v_indexes) i
        where p_participants->i->>'role' = 'additional'
      ) then
        v_has_additional_attending := true;
      end if;

      -- Transferable seat (§5/DEC-2): only attendees beyond the first
      -- are charged, at the frozen seat price.
      v_addon := round(v_service.price_amount * (v_attendee_count - 1), 2);
      v_addon_total := v_addon_total + v_addon;
      v_duration := v_duration + v_seg_duration;
      v_service_segments := v_service_segments + 1;

      v_segments_out := v_segments_out || jsonb_build_array(jsonb_build_object(
        'sort_order', v_sort,
        'kind', 'service',
        'service_id', v_service.id,
        'service_name_snapshot', v_service.name,
        'duration_minutes', v_seg_duration,
        'seat_price_amount', to_char(round(v_service.price_amount, 2), 'FM999999990.00'),
        'addon_amount', to_char(v_addon, 'FM999999990.00'),
        'label', v_seg.sj->>'label',
        'participants', to_jsonb(v_indexes)
      ));

    elsif v_seg.sj->>'kind' = 'break' then
      v_seg_duration := (v_seg.sj->>'duration_minutes')::int;
      if v_seg_duration is null or v_seg_duration <= 0 then
        raise exception 'Break segment % needs a positive duration', v_sort
          using hint = 'segment_invalid';
      end if;
      if jsonb_array_length(coalesce(v_seg.sj->'participants', '[]'::jsonb)) > 0 then
        raise exception 'Break segment % cannot have participants', v_sort
          using hint = 'segment_invalid';
      end if;
      v_duration := v_duration + v_seg_duration;
      v_segments_out := v_segments_out || jsonb_build_array(jsonb_build_object(
        'sort_order', v_sort,
        'kind', 'break',
        'service_id', null,
        'service_name_snapshot', null,
        'duration_minutes', v_seg_duration,
        'seat_price_amount', null,
        'addon_amount', to_char(0::numeric, 'FM999999990.00'),
        'label', v_seg.sj->>'label',
        'participants', '[]'::jsonb
      ));
    else
      raise exception 'Segment % kind must be service or break', v_sort
        using hint = 'segment_invalid';
    end if;
  end loop;

  if v_service_segments = 0 then
    raise exception 'A booking needs at least one service segment'
      using hint = 'no_service_segments';
  end if;

  -- Adjustments (§5) — order fixed: package, pair discount, manual.
  -- Package override row is explanatory: the override already lives in
  -- base_package_amount, so its amount is 0.00 and the label records
  -- the derived services total it replaced.
  if v_offering.price_override is not null and v_offering.price_override <> v_derived_base then
    v_adjustments_out := v_adjustments_out || jsonb_build_array(jsonb_build_object(
      'kind', 'package',
      'label', format('Package price override (services total %s)',
                      to_char(round(v_derived_base, 2), 'FM999999990.00')),
      'amount', to_char(0::numeric, 'FM999999990.00'),
      'percent_snapshot', null
    ));
  end if;

  -- Pair discount: an additional participant attends ≥1 service (§5).
  -- Applies to the base package amount only; rounded half-up to cents
  -- before tax.
  if v_has_additional_attending and coalesce(v_settings.pair_discount_percent, 0) > 0 then
    v_discount := round(v_base * v_settings.pair_discount_percent / 100, 2);
    if v_discount > 0 then
      v_adjustments_out := v_adjustments_out || jsonb_build_array(jsonb_build_object(
        'kind', 'pair_discount',
        'label', 'Pair discount',
        'amount', to_char(-v_discount, 'FM999999990.00'),
        'percent_snapshot', v_settings.pair_discount_percent
      ));
      v_adjustment_total := v_adjustment_total - v_discount;
    end if;
  end if;

  if p_manual_adjustments is not null and jsonb_typeof(p_manual_adjustments) = 'array' then
    for v_adj in select value as aj from jsonb_array_elements(p_manual_adjustments)
    loop
      if coalesce(trim(v_adj.aj->>'label'), '') = '' then
        raise exception 'Manual adjustments need a label' using hint = 'adjustment_invalid';
      end if;
      begin
        v_adj_amount := round((v_adj.aj->>'amount')::numeric, 2);
      exception when others then
        raise exception 'Manual adjustment amount is not a valid number'
          using hint = 'adjustment_invalid';
      end;
      -- numeric accepts 'NaN'/'Infinity' without a cast error — reject
      -- non-finite and out-of-range values explicitly.
      if v_adj_amount is null or v_adj_amount = 'NaN'::numeric
         or abs(v_adj_amount) > 99999999.99 then
        raise exception 'Manual adjustment amount is not a valid number'
          using hint = 'adjustment_invalid';
      end if;
      v_adjustments_out := v_adjustments_out || jsonb_build_array(jsonb_build_object(
        'kind', 'manual',
        'label', trim(v_adj.aj->>'label'),
        'amount', to_char(v_adj_amount, 'FM999999990.00'),
        'percent_snapshot', null
      ));
      v_adjustment_total := v_adjustment_total + v_adj_amount;
    end loop;
  end if;

  -- Totals (§5): subtotal = base + Σ addons + Σ adjustments;
  -- tax exactly as today (rate% of subtotal, half-up to cents).
  v_subtotal := round(v_base + v_addon_total + v_adjustment_total, 2);
  v_tax_rate := least(100, greatest(0, coalesce(v_settings.tax_rate_percent, 0)));
  v_tax := round(v_subtotal * v_tax_rate / 100, 2);
  v_total := v_subtotal + v_tax;

  return jsonb_build_object(
    'offering_id', v_offering.id,
    'offering_name', v_offering.name,
    'duration_minutes', v_duration,
    'buffer_minutes', coalesce(v_offering.buffer_minutes, 0),
    'base_package_amount', to_char(v_base, 'FM999999990.00'),
    'segments', v_segments_out,
    'adjustments', v_adjustments_out,
    'subtotal_amount', to_char(v_subtotal, 'FM999999990.00'),
    'tax_rate_percent', to_char(v_tax_rate, 'FM990.00'),
    'tax_amount', to_char(v_tax, 'FM999999990.00'),
    'total_amount', to_char(v_total, 'FM999999990.00')
  );
end;
$$;

-- ------------------------------------------------------------
-- 6.2 Slot validation: schedule, grid, lead/advance, blocks,
--     overlap, daily/weekly caps. Raises on failure.
-- ------------------------------------------------------------
create or replace function public.booking_engine_validate_slot(
  p_offering_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_buffer_minutes integer,
  p_is_waitlist boolean default false,
  p_skip_lead_checks boolean default false,
  p_exclude_booking_id uuid default null
) returns void
language plpgsql stable
set search_path = public, pg_temp as $$
declare
  v_settings   booking_settings;
  v_tz         text;
  v_ends       timestamptz;
  v_occupied   timestamptz;
  v_local      timestamp;
  v_date       date;
  v_time       time;
  v_weekday    integer;
  v_schedule   weekly_schedule;
  v_win_start  timestamptz;
  v_win_end    timestamptz;
  v_allowed    time[];
  v_today      date;
  v_used_minutes numeric;
  v_booked_dates date[];
  v_week_start date;
  v_week_days  integer;
  v_before     integer;
  v_after      integer;
  v_cursor     date;
begin
  v_settings := booking_engine_settings();
  v_tz := coalesce(v_settings.timezone, 'America/Toronto');

  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'Duration must be positive' using hint = 'segment_invalid';
  end if;

  v_ends := p_starts_at + make_interval(mins => p_duration_minutes);
  v_occupied := v_ends + make_interval(mins => greatest(0, coalesce(p_buffer_minutes, 0)));
  v_local := p_starts_at at time zone v_tz;
  v_date := v_local::date;
  v_time := v_local::time;
  v_weekday := extract(dow from v_local)::int;

  -- Start-time shape: allowed_start_times when set, else the 30-minute grid.
  select allowed_start_times into v_allowed from offerings where id = p_offering_id;
  if extract(second from v_time) <> 0 then
    raise exception 'Start time must fall on a whole minute' using hint = 'invalid_start_time';
  end if;
  if coalesce(cardinality(v_allowed), 0) > 0 then
    if not exists (
      select 1 from unnest(v_allowed) a
      where to_char(a, 'HH24:MI') = to_char(v_time, 'HH24:MI')
    ) then
      raise exception 'This session cannot start at that time' using hint = 'invalid_start_time';
    end if;
  elsif extract(minute from v_time)::int % 30 <> 0 then
    raise exception 'Bookings start on the half hour' using hint = 'invalid_start_time';
  end if;

  -- Weekly schedule window (session itself must fit; buffer may spill).
  select * into v_schedule from weekly_schedule where weekday_number = v_weekday;
  if not found or not v_schedule.is_open
     or v_schedule.start_time is null or v_schedule.end_time is null then
    raise exception 'The studio is closed that day' using hint = 'outside_schedule';
  end if;
  v_win_start := (v_date + v_schedule.start_time) at time zone v_tz;
  v_win_end   := (v_date + v_schedule.end_time)   at time zone v_tz;
  if p_starts_at < v_win_start or v_ends > v_win_end then
    raise exception 'That time is outside opening hours' using hint = 'outside_schedule';
  end if;

  -- Lead time and advance window (skippable for admin scheduling).
  if not p_skip_lead_checks then
    if p_starts_at < now() + make_interval(hours => greatest(0, coalesce(v_settings.min_lead_hours, 0))) then
      raise exception 'That time is too soon to book' using hint = 'too_soon';
    end if;
    v_today := (now() at time zone v_tz)::date;
    if v_date > v_today + greatest(1, coalesce(v_settings.max_advance_days, 60)) then
      raise exception 'That date is too far ahead to book' using hint = 'too_far_ahead';
    end if;
  end if;

  -- Blocked periods and recurring blocks (against the session window).
  if exists (
    select 1 from blocked_periods bp
    where bp.start_at < v_ends and bp.end_at > p_starts_at
  ) then
    raise exception 'That time is blocked out' using hint = 'blocked';
  end if;
  if exists (
    select 1 from recurring_blocks rb
    where v_weekday = any(rb.weekdays)
      and (rb.valid_from is null or v_date >= rb.valid_from)
      and (rb.valid_until is null or v_date <= rb.valid_until)
      and ((v_date + rb.start_time) at time zone v_tz) < v_ends
      and ((v_date + rb.end_time) at time zone v_tz) > p_starts_at
  ) then
    raise exception 'That time is blocked out' using hint = 'blocked';
  end if;

  -- Waitlist requests deliberately point at occupied time: skip
  -- occupancy and load caps (the exclusion constraint ignores them too).
  if p_is_waitlist then
    return;
  end if;

  -- Overlap against active bookings' occupied ranges.
  if exists (
    select 1 from bookings b
    where b.status in ('pending', 'confirmed')
      and not b.is_waitlist
      and b.id is distinct from p_exclude_booking_id
      and tstzrange(b.starts_at,
                    coalesce(b.occupied_until, b.ends_at + make_interval(mins => coalesce(b.buffer_minutes, 0))),
                    '[)')
          && tstzrange(p_starts_at, v_occupied, '[)')
  ) then
    raise exception 'That time was just taken. Please choose another available time.'
      using hint = 'slot_taken';
  end if;

  -- Daily minutes cap.
  if v_settings.max_booked_minutes_per_day is not null then
    select coalesce(sum(extract(epoch from (b.ends_at - b.starts_at)) / 60), 0)
      into v_used_minutes
    from bookings b
    where b.status in ('pending', 'confirmed')
      and not b.is_waitlist
      and b.id is distinct from p_exclude_booking_id
      and (b.starts_at at time zone v_tz)::date = v_date;
    if v_used_minutes + p_duration_minutes > v_settings.max_booked_minutes_per_day then
      raise exception 'That day is fully booked' using hint = 'day_minutes_cap';
    end if;
  end if;

  -- Week-days and consecutive-days caps.
  if v_settings.max_booking_days_per_week is not null
     or v_settings.max_consecutive_booking_days is not null then
    select coalesce(array_agg(distinct d), '{}') into v_booked_dates
    from (
      select (b.starts_at at time zone v_tz)::date as d
      from bookings b
      where b.status in ('pending', 'confirmed')
        and not b.is_waitlist
        and b.id is distinct from p_exclude_booking_id
        and b.starts_at >= ((v_date - 40)::timestamp at time zone v_tz)
        and b.starts_at <  ((v_date + 41)::timestamp at time zone v_tz)
    ) t;

    if v_settings.max_booking_days_per_week is not null
       and not (v_date = any(v_booked_dates)) then
      v_week_start := v_date - ((extract(isodow from v_date)::int) - 1);
      select count(*) into v_week_days
      from unnest(v_booked_dates) d
      where d >= v_week_start and d < v_week_start + 7;
      if v_week_days >= v_settings.max_booking_days_per_week then
        raise exception 'That week is fully booked' using hint = 'week_days_cap';
      end if;
    end if;

    if v_settings.max_consecutive_booking_days is not null
       and not (v_date = any(v_booked_dates)) then
      if v_settings.max_consecutive_booking_days = 0 then
        raise exception 'Bookings are paused' using hint = 'consecutive_days_cap';
      end if;
      v_before := 0; v_cursor := v_date - 1;
      while v_cursor = any(v_booked_dates) loop
        v_before := v_before + 1; v_cursor := v_cursor - 1;
      end loop;
      v_after := 0; v_cursor := v_date + 1;
      while v_cursor = any(v_booked_dates) loop
        v_after := v_after + 1; v_cursor := v_cursor + 1;
      end loop;
      if v_before + 1 + v_after > v_settings.max_consecutive_booking_days then
        raise exception 'Too many consecutive booking days' using hint = 'consecutive_days_cap';
      end if;
    end if;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 6.3 Atomic create (§4.4/§6): lock → validate → recompute →
--     availability → write everything → commit or roll back.
-- ------------------------------------------------------------
-- p: { offering_id, starts_at, participants, segments,
--      manual_adjustments?, notes?, status? ('pending'),
--      is_waitlist? (false), skip_lead_checks? (false) }
-- The primary participant must carry client_id (the billing client).
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
  v_has_break    boolean := false;
  v_pair         boolean;
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

  select exists (
    select 1 from jsonb_array_elements(v_quote->'segments') s where s->>'kind' = 'break'
  ) into v_has_break;
  v_pair := jsonb_array_length(p->'participants') > 1;

  -- Legacy bridge columns (price_amount, booked_as_pair, includes_break)
  -- are still written so pre-Phase-D readers keep working; Phase D
  -- retires them.
  insert into bookings (
    offering_id, offering_name_snapshot, billing_client_id,
    starts_at, ends_at, occupied_until,
    status, is_waitlist, notes,
    duration_minutes, buffer_minutes,
    base_package_amount, subtotal_amount, tax_rate_percent, tax_amount, total_amount,
    price_amount, booked_as_pair, includes_break
  ) values (
    (v_quote->>'offering_id')::uuid, v_quote->>'offering_name', v_billing,
    v_starts, v_ends, v_occupied,
    v_status, v_is_waitlist, nullif(trim(coalesce(p->>'notes', '')), ''),
    v_duration, v_buffer,
    (v_quote->>'base_package_amount')::numeric,
    (v_quote->>'subtotal_amount')::numeric,
    (v_quote->>'tax_rate_percent')::numeric,
    (v_quote->>'tax_amount')::numeric,
    (v_quote->>'total_amount')::numeric,
    (v_quote->>'subtotal_amount')::numeric,
    v_pair, v_has_break
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

-- ------------------------------------------------------------
-- 6.4 Atomic revise: full recompute from current catalog terms (§6/§7)
--     + availability re-validation. Any failure rolls back everything —
--     the original booking is untouched.
-- ------------------------------------------------------------
-- p: { starts_at?, participants, segments, manual_adjustments?,
--      notes?, skip_lead_checks? } — offering/status/waitlist unchanged.
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
  v_has_break    boolean := false;
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

  select exists (
    select 1 from jsonb_array_elements(v_quote->'segments') s where s->>'kind' = 'break'
  ) into v_has_break;

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
    total_amount = (v_quote->>'total_amount')::numeric,
    price_amount = (v_quote->>'subtotal_amount')::numeric,
    booked_as_pair = jsonb_array_length(p->'participants') > 1,
    includes_break = v_has_break
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

-- ============================================================
-- 7. Grants — engine functions are server-only (service role).
-- ============================================================

revoke execute on function public.booking_engine_settings() from public;
revoke execute on function public.booking_engine_quote(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.booking_engine_validate_slot(uuid, timestamptz, integer, integer, boolean, boolean, uuid) from public;
revoke execute on function public.booking_engine_create(jsonb) from public;
revoke execute on function public.booking_engine_revise(uuid, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.booking_engine_settings() from anon;
    revoke execute on function public.booking_engine_quote(uuid, jsonb, jsonb, jsonb) from anon;
    revoke execute on function public.booking_engine_validate_slot(uuid, timestamptz, integer, integer, boolean, boolean, uuid) from anon;
    revoke execute on function public.booking_engine_create(jsonb) from anon;
    revoke execute on function public.booking_engine_revise(uuid, jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.booking_engine_settings() from authenticated;
    revoke execute on function public.booking_engine_quote(uuid, jsonb, jsonb, jsonb) from authenticated;
    revoke execute on function public.booking_engine_validate_slot(uuid, timestamptz, integer, integer, boolean, boolean, uuid) from authenticated;
    revoke execute on function public.booking_engine_create(jsonb) from authenticated;
    revoke execute on function public.booking_engine_revise(uuid, jsonb) from authenticated;
  end if;
end$$;

notify pgrst, 'reload schema';
