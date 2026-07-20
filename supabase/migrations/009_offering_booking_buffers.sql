-- Move booking cadence and buffers out of global settings.
-- Public bookings always start on a 30-minute boundary. Each offering owns
-- its after-booking buffer, which is frozen onto a booking when it is created.

do $$
declare
  previous_buffer integer := 0;
  has_global_buffer boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'booking_settings'
      and column_name = 'buffer_minutes'
  ) into has_global_buffer;

  if has_global_buffer then
    execute 'select coalesce(max(buffer_minutes), 0) from booking_settings'
      into previous_buffer;
  end if;

  -- Direct selections use 15-minute increments. Preserve the old setting by
  -- rounding it up so the migration never shortens existing booking padding.
  previous_buffer := least(240, greatest(0, ceil(previous_buffer / 15.0)::integer * 15));

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'offerings' and column_name = 'buffer_minutes'
  ) then
    alter table offerings add column buffer_minutes integer not null default 0;
    update offerings set buffer_minutes = previous_buffer;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'buffer_minutes'
  ) then
    alter table bookings add column buffer_minutes integer not null default 0;
    update bookings set buffer_minutes = previous_buffer;
  end if;

  if has_global_buffer then
    alter table booking_settings drop column buffer_minutes;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'booking_settings'
      and column_name = 'slot_increment_minutes'
  ) then
    alter table booking_settings drop column slot_increment_minutes;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offerings_buffer_minutes_range') then
    alter table offerings add constraint offerings_buffer_minutes_range
      check (buffer_minutes between 0 and 240 and buffer_minutes % 15 = 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bookings_buffer_minutes_range') then
    alter table bookings add constraint bookings_buffer_minutes_range
      check (buffer_minutes between 0 and 240 and buffer_minutes % 15 = 0);
  end if;
end
$$;
