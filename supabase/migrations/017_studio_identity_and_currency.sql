-- Hardcoded-values extraction (2026-07-24 audit): the public site wove the
-- owner's name, city/region, analyst credential, SEO description, and the
-- currency into page markup. They become studio settings; code keeps the
-- previous literals as fallbacks so NULL behaves exactly like today.

alter table booking_settings
  add column if not exists owner_name text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists credential_label text,
  add column if not exists seo_description text,
  add column if not exists currency_code text not null default 'CAD',
  add column if not exists currency_locale text not null default 'en-CA';

comment on column booking_settings.owner_name is
  'Owner/analyst display name used in public copy (nav, about, story link).';
comment on column booking_settings.city is 'Studio city for public copy.';
comment on column booking_settings.region is 'Studio province/region for public copy.';
comment on column booking_settings.credential_label is
  'Credential line shown in the hero signature (e.g. "Chrysalis Colour analyst").';
comment on column booking_settings.seo_description is
  'Meta description for the public site.';
comment on column booking_settings.currency_code is
  'ISO 4217 code shown with money amounts (display only; engine amounts are unitless decimals).';
comment on column booking_settings.currency_locale is
  'BCP 47 locale used to format money for display.';
