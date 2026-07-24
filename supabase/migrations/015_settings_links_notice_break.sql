-- Settings consolidation (UI feedback pass, Phase 4).
-- External links move off hardcoded page markup into admin-editable settings,
-- the live quote card gains an optional notice, and the break rule (Phase 6)
-- gets its admin-set duration. All nullable: NULL/empty means "feature off"
-- (links hidden, no notice shown, no break inserted).

alter table booking_settings
  add column if not exists about_url text,
  add column if not exists facebook_url text,
  add column if not exists experience_url text,
  add column if not exists quote_notice_text text,
  add column if not exists break_minutes integer;

alter table booking_settings
  add constraint booking_settings_break_minutes_positive
  check (break_minutes is null or break_minutes > 0);

comment on column booking_settings.about_url is
  'External "about Lisa / Chrysalis" link. NULL hides the link.';
comment on column booking_settings.facebook_url is
  'External Facebook link. NULL hides the link.';
comment on column booking_settings.experience_url is
  'External "The Experience" link; replaces the on-page section when set.';
comment on column booking_settings.quote_notice_text is
  'Optional notice rendered inside the public live quote card.';
comment on column booking_settings.break_minutes is
  'Duration of the auto-inserted break (Phase 6 rule). NULL/absent disables breaks.';
