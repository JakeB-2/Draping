-- Legacy-shaped seed data applied BEFORE migration 011 so the redesign
-- migration is always exercised against a database that already holds
-- pre-participation data (schema.sql + migrations 001–010 state).

insert into booking_settings (
  day_start_time, day_end_time, pair_extra_minutes, tax_rate_percent,
  timezone, min_lead_hours, max_advance_days
) values ('09:00', '19:00', 0, 13, 'America/Toronto', 0, 60);

-- Open every day 09:00–19:00 to keep test date math simple.
update weekly_schedule set is_open = true, start_time = '09:00', end_time = '19:00';

insert into service_groups (name) values ('Colour Journey');

insert into services (name, description, time_requirement_minutes, service_group_id, is_active)
select s.name, s.description, s.minutes, g.id, true
from (values
  ('Colour Analysis', 'Seasonal colour analysis', 60),
  ('Draping Session', 'Full fabric draping', 90),
  ('Style Consult', 'Wardrobe and style consult', 45)
) as s(name, description, minutes)
cross join (select id from service_groups where name = 'Colour Journey') g;

-- Old-model offerings: hardcoded duration/price, people_count.
insert into offerings (name, description, duration_minutes, price_amount, buffer_minutes, people_count, is_active)
values
  ('Solo Experience', 'Analysis + draping', 150, 250.00, 15, 1, true),
  ('Override Package', 'Analysis + draping + style', 195, 300.00, 15, 1, true);

insert into offering_services (offering_id, service_id, sort_order)
select o.id, s.id, m.sort_order
from (values
  ('Solo Experience', 'Colour Analysis', 1),
  ('Solo Experience', 'Draping Session', 2),
  ('Override Package', 'Colour Analysis', 1),
  ('Override Package', 'Draping Session', 2),
  ('Override Package', 'Style Consult', 3)
) as m(offering_name, service_name, sort_order)
join offerings o on o.name = m.offering_name
join services s on s.name = m.service_name;

insert into clients (first_name, last_name, email, phone_number)
values
  ('Alice', 'Nguyen', 'alice@example.com', '555-0101'),
  ('Bob', 'Nguyen', 'bob@example.com', '555-0102');

-- A completed legacy pair booking (old columns + booking_clients join),
-- safely in the past so it never collides with availability tests.
insert into bookings (
  offering_id, starts_at, ends_at, status, booked_as_pair, includes_break,
  buffer_minutes, price_amount, subtotal_amount, tax_rate_percent, tax_amount,
  total_amount, duration_minutes, notes, is_waitlist
)
select o.id,
  '2026-06-01T14:00:00Z', '2026-06-01T16:30:00Z', 'completed', true, false,
  15, 250.00, 250.00, 13, 32.50, 282.50, 150, 'Legacy booking', false
from offerings o where o.name = 'Solo Experience';

insert into booking_clients (booking_id, client_id, client_role)
select b.id, c.id, r.role
from bookings b
cross join (values ('alice@example.com', 'primary'), ('bob@example.com', 'additional')) as r(email, role)
join clients c on c.email = r.email
where b.notes = 'Legacy booking';
