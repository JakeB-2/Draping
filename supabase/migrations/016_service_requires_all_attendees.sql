-- A4: services that must include every attendee on the booking.
-- The public matrix locks these rows to all attendees, and the break rule
-- (A3) counts performances of flagged services to decide whether the
-- booking gets an automatic break appended.

alter table services
  add column if not exists requires_all_attendees boolean not null default false;

comment on column services.requires_all_attendees is
  'When true, every booking attendee participates in this service; the public matrix locks the row.';
