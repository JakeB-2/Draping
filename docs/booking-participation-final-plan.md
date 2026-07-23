# Final Plan: Per-Service Participation, Normalized

**Status:** Final merged design for implementation planning. Supersedes both
`docs/booking-participation-redesign-handoff.md` (original proposal) and
`docs/booking-participation-normalized-handoff.md` (review counter-proposal).
No implementation has been performed.

**How this document was produced:** the original proposal was critiqued by an
independent review; the review's normalization argument was accepted, its scope
additions were individually validated, and the owner made three binding decisions
(§2). This is the compiled result.

---

## 1. Problem (unchanged)

A booking contains up to two people today, each participating in different subsets
of the offering's services. Duration and price must be computed per service segment,
not per offering. A second attendee can be added/removed days later, requiring
availability re-validation. Breaks are always manual. Payments are external; the app
only calculates, snapshots, and displays one booking total.

---

## 2. Binding decisions (made by the owner, 2026-07-23)

| # | Decision | Ruling |
|---|---|---|
| DEC-1 | Participation modelling | **Fully normalized.** No `primary\|second\|both` enum, and no per-count columns like `duration_minutes_two` — a third/fourth/fifth participant must never require new columns. Attendance counts are *rows* (`service_duration_terms`, `booking_participants`, `booking_segment_participants`). The two-person cap is a settings value, not table shape. |
| DEC-2 | Package pricing when only the additional attendee takes a package service | **Transferable seat.** The package includes one attendee seat per member service, assignable to either participant. An add-on charge occurs only when a service has *more than one* attendee. |
| DEC-3 | Public booking data | **Full participation matrix before confirmation.** Public visitors declare who attends which service before a booking is submitted; price and availability shown to them are always computed from the actual matrix, never from an assumed duration. (The original proposal's "materialize primary-only" default is rejected — it produces wrong durations and availability.) |
| DEC-5 | Public flow shape (2026-07-23, supersedes the *ordering* implied by DEC-3) | **Multi-entry, bidirectionally filtered.** Clients may start from either "I know when" (pick a time window → see offerings that fit) or "I know what" (pick offering/participation → see available times). Each selection live-filters the other side within one flow. The owner's request for a calendar based on an *assumed 2-hour average* is rejected as a data source (§9.1) but honoured as an entry point: the calendar can come first, showing truthful open windows instead of assumed-length slots. |
| DEC-4 | Scope | **Trimmed.** Adopt the review's normalized core; drop its enterprise additions (§6). No new tax/currency complexity — the existing tax snapshot columns and behaviour stay exactly as they are today. |

---

## 3. Domain model

| Concept | Responsibility |
|---|---|
| Service | Canonical identity + per-attendee price; durations live in duration-terms rows |
| Service duration term | Total duration of a service at a given attendee count (one row per count) |
| Offering | Curated template/package; optional package price override; not a live dependency of existing bookings |
| Booking | One billing client, one appointment, one total; snapshots all operative numbers at write time |
| Booking participant | A person attending; only the primary is a `clients` record |
| Booking segment | A service or break in the sequential timeline; owns frozen duration and amounts |
| Segment participation | Join rows: which participants attend which segment |
| Booking adjustment | Signed, labelled price component (package delta, pair discount, manual) |

Core principle (both documents agreed): **the booking owns its own truth.** Creation
materializes catalog data into booking rows; catalog foreign keys remain as provenance
only. This extends the snapshot habit the `bookings` table already has.

---

## 4. Schema

Planning names, not a ready-to-run migration.

### 4.1 Catalog

```text
services
  id, name, description, is_active
  price_amount numeric(10,2)            -- canonical per-attendee price (NEW)
  -- time_requirement_minutes retired in favour of duration terms

service_duration_terms                  -- NEW
  id
  service_id      fk
  participant_count integer >= 1
  duration_minutes  integer > 0         -- TOTAL duration at this count (need not be linear)
  unique(service_id, participant_count)

offerings
  id, name, description, is_active
  price_override numeric(10,2) null     -- fixed package price; null = derived
  buffer_minutes, allowed_start_times   -- kept as today
  -- retired: duration_minutes, people_count, time_adjustment_minutes,
  --          break_required, break_minutes (breaks are per-booking, manual)

offering_services                       -- unchanged: offering_id, service_id, sort_order
```

Base package price = `coalesce(price_override, Σ member services' price_amount)`.

Seeding rule for duration terms (matches today's behaviour): count-1 rows come from the
current `time_requirement_minutes`; count-2 rows are seeded at **2× count-1** (today every
service runs one-at-a-time), then edited per service where sharing is possible. Missing
higher-count rows simply mean that count is not offered for that service.

### 4.2 Settings

```text
booking_settings
  + max_participants_per_booking smallint not null default 2   -- policy, not shape
  + pair_discount_percent numeric(5,2) not null default 0
  - pair_extra_minutes (retired)
  tax_rate_percent: unchanged
```

Raising the maximum is a deliberate future act; it must not implicitly unlock group UI.

### 4.3 Booking

```text
bookings
  id
  billing_client_id fk                  -- sole customer; replaces booking_clients
  offering_id fk null                   -- provenance
  offering_name_snapshot text
  starts_at, ends_at                    -- customer-facing window
  occupied_until                        -- ends_at + buffer (conflict window)
  status                                -- lifecycle unchanged
  base_package_amount                   -- frozen package base (seat coverage, §5)
  subtotal_amount, discount_amount,
  tax_rate_percent, tax_amount,
  total_amount                          -- tax columns exactly as today
  duration_minutes, buffer_minutes
  notes, is_waitlist, created_at, updated_at
  -- retired: booked_as_pair (derivable), includes_break (derivable), price_amount
  --          (replaced by base_package_amount)

booking_participants                    -- NEW; replaces booking_clients
  id
  booking_id fk cascade
  participant_number integer            -- stable ordering within booking
  client_id fk null                     -- populated for the primary only (normally)
  display_name text                     -- frozen name shown on the appointment
  role text check ('primary','additional')
  unique(booking_id, participant_number)

booking_segments                        -- NEW
  id
  booking_id fk cascade
  sort_order integer
  kind text check ('service','break')
  service_id fk null                    -- provenance; null for breaks
  service_name_snapshot text null
  duration_minutes integer > 0          -- frozen from the matching duration term
  seat_price_amount numeric null        -- frozen per-attendee price; null for breaks
  addon_amount numeric not null default 0  -- seat_price × (attendee_count − 1); 0 for breaks
  label text null                       -- e.g. "Lunch break"
  unique(booking_id, sort_order)

booking_segment_participants            -- NEW
  segment_id fk cascade
  participant_id fk
  unique(segment_id, participant_id)
  -- participant must belong to the same booking as the segment (trigger/constraint)

booking_adjustments                     -- NEW
  id
  booking_id fk cascade
  kind text check ('package','pair_discount','manual')
  label text
  amount numeric(10,2)                  -- signed
  percent_snapshot numeric(5,2) null    -- explanatory (e.g. frozen pair %)
  created_at
```

### 4.4 Invariants

- Exactly one `primary` participant per booking; it corresponds to `billing_client_id`.
- Participant count ≤ `max_participants_per_booking` at creation/revision time
  (server-side validation; the tables themselves impose no cap).
- Service segments: ≥1 participant; break segments: no service, no participants,
  zero price, positive duration.
- Segment participants belong to the segment's booking.
- Unique sort order per booking; `starts_at < ends_at <= occupied_until`.
- Money in Postgres `numeric`; JS floats are never the monetary authority.
- **Overlap protection at the database:** range exclusion constraint on active,
  non-waitlist bookings' occupied ranges, with creation/revision performed in a single
  transaction (lock → validate → recalculate → write all rows → commit). The current
  check-then-insert pattern is retired.

---

## 5. Pricing (transferable seat — DEC-2)

The package buys **one seat per member service**, usable by whichever participant
attends. Charges arise only from *second* attendees on a service.

```text
base_package_amount   = coalesce(price_override, Σ member seat prices)   [frozen]
segment addon_amount  = seat_price × (attendee_count − 1)                [frozen]
package adjustment    = only if override differs from derived sum (explanatory row)
pair discount         = − pair_discount_percent × base_package_amount    [adjustment row,
                        frozen percent + amount]
manual adjustment     = admin-entered signed amount with label

subtotal = base_package_amount + Σ addon_amounts + Σ adjustment amounts
tax/total = existing behaviour, unchanged
```

Rules made explicit (flagged for owner confirmation where noted):

- **Pair-discount eligibility:** applies when at least one `additional` participant is
  assigned to at least one service segment. A named attendee with no participation does
  not trigger it. *(Review's recommendation, adopted.)*
- **Unused seats:** if a package service ends up with attendees but the primary skips it,
  the seat simply transfers (no charge, per DEC-2). If a package service is dropped
  entirely (zero attendees), the segment is removed admin-side and the price does **not**
  auto-reduce — the package price is the package price; the admin uses a manual
  adjustment if a reduction is warranted. ⚠ *Reasonable default; confirm with the owner.*
- **Discount base:** pair discount applies to `base_package_amount` (not add-ons).
  ⚠ *Confirm with the owner; changing it later is a calculation-module edit, not schema.*

The whole calculation lives in **one server-side pricing module** used identically by the
public quote, admin editor, and persistence layer, with the rules above as named
constants/flags so a flipped ruling is a one-line change.

## 6. Duration and scheduling

```text
segment duration  = duration term for (service, attendee_count)       [frozen at write]
booking duration  = Σ segment durations
ends_at           = starts_at + duration
occupied_until    = ends_at + buffer
```

One practitioner, one sequential timeline. No per-segment timestamps — derived from
`starts_at` + `sort_order` + durations. Parallel services, multiple resources, and
independent sub-appointments remain explicit non-goals.

**Revisions** (add/remove attendee, change participation, reorder, insert/remove breaks):
recompute the full proposed booking (durations from *current* catalog duration terms —
see §7), re-validate availability in the same transaction, and only then persist.
A failed check leaves the booking untouched.

---

## 7. What was deliberately dropped from the review (and why)

| Review item | Ruling | Reason |
|---|---|---|
| Published catalog versioning (`source_snapshot_id`, immutable catalog versions) | **Dropped** | Solves a seconds-wide draft-edit race already ~fully mitigated by snapshot-on-write + server-side recalculation at submission (reject/refresh if the recomputed quote differs from what was shown). A versioned catalog subsystem is marketplace-scale machinery. |
| `booking_segment_terms` (pre-snapshotting 2-person terms for later revisions) | **Dropped** | The admin *is* the business owner. Revisions use current catalog terms; the manual adjustment row is the escape hatch if she wants to honour old pricing. Pre-copying hypothetical terms into every booking protects nobody. |
| `booking_revisions` audit table | **Deferred** | Good hygiene, not v1. `updated_at` + email triggers cover the current need. |
| Idempotency keys on public submission | **Deferred** | The exclusion constraint already makes the dangerous double-submit fail safely. |
| `currency_code`, non-linear price schedules, promotions engine | **Dropped** | Explicit non-goals; no added tax/currency complexity (DEC-4). |

Everything dropped here is additive later; nothing in §4 blocks it.

---

## 8. Migration outline (additive, then cutover)

1. Add new tables/columns (§4); leave existing columns and `booking_clients` in place.
2. Seed `service_duration_terms`: count-1 from `time_requirement_minutes`; count-2 at 2×.
3. Configure `services.price_amount` manually (cannot be reliably inferred from offering
   totals); preserve current offering prices as `price_override` where they differ from
   the new derived sums.
4. Backfill `booking_participants` from `booking_clients` (do not discard historic
   second-client contact data — keep the `client_id` link on backfilled rows even though
   future additional participants are name-only).
5. Backfill legacy `booking_segments` assuming every participant attended every offering
   service — verify this assumption per booking where possible; preserve legacy
   booking-level totals verbatim even where line allocation is approximate.
6. Cut over reads/writes: admin detail/list, public quote + submission, email context.
7. Reconciliation report: legacy vs. new totals and durations for all existing bookings.
8. Only then retire old columns and drop `booking_clients`.

---

## 9. Workflows

### 9.1 Public flow (multi-entry — DEC-5)

**The owner's request and why it is amended, not adopted verbatim.** The owner asked for
clients to see the calendar first, based on an assumed average booking of two hours, then
pick services. The intent (calendar-first browsing) is sound; the mechanism (a fixed
assumed duration) is not: real durations vary with the offering and the participation
matrix, so 2-hour slots would sometimes show times the actual selection cannot fit
(broken promise at the last step) and sometimes hide times it could (lost bookings).

**The truthful calendar primitive is the open window, not the slot.** A day's
availability is presented as contiguous free windows (e.g. "Tue 10:00–13:30 open"),
derived from the weekly schedule, blocks, recurring blocks, and existing bookings'
occupied ranges. Windows are correct regardless of what the client eventually picks —
no assumed duration exists anywhere.

**Two entry points, one converging flow:**

- **"I know when":** browse the open-window calendar → pick a window (or a start time
  within it) → the offering list filters to those with at least one valid configuration
  that fits (minimum duration ≤ remaining window, and a compatible allowed start time)
  → choose offering → attendance matrix → live re-check as the matrix changes duration
  (adding an attendee may outgrow the window; say so immediately, offering the nearest
  fitting alternatives) → quote → submit.
- **"I know what":** choose offering → attendance matrix → exact duration + total →
  calendar shows only starts that fit that exact duration → pick → submit.

Both paths converge on the same final state: one offering, one matrix, one start time,
one server-computed quote. Selections on either side re-filter the other; clearing a
selection widens the other side again. The UI may render this as a single screen or a
wizard — the data contract (§9.2) supports either and must not assume an ordering.

**Filtering data per offering** (computable from §4, no schema change): minimum public
duration = all member services at attendee count 1; maximum = all at the configured
participant max. An offering "fits" a window if some allowed start time inside the
window leaves room for at least its minimum duration; the matrix then narrows this to
an exact duration.

**No holds.** Browsing and configuring reserve nothing. The atomic submission (§6
transaction + exclusion constraint) is the only claim on the calendar; if the slot was
taken while configuring, the submit fails cleanly and the flow re-offers nearby times.

### 9.2 Availability/quote contract

One server-side module, used by both entry points and the admin editor, exposing two
query shapes over the same internals:

```text
windows(date range)                          → open windows per day
fits(window | start, offering?) → offerings (or starts) with min/max durations
quote(offering, matrix)                      → duration, segments, one total
starts(offering, matrix, date range)         → valid start times for the exact duration
```

All duration/price math comes from the §5 pricing module and §6 duration rules; the
client never computes anything authoritative. Quotes are stateless; submission recomputes
and validates everything server-side.

**Admin:** create bookings with the same matrix, plus: reorder segments, insert/remove
breaks, add/remove attendees on existing bookings, manual adjustments. Every revision is
a full recompute + availability check in one transaction.

Auth on every admin server action / mutation-layer entry point — page/layout protection
alone is insufficient.

---

## 10. Test scenarios (minimum)

- Solo booking, derived offering price; solo with package override (package adjustment row).
- Attendee joins one service (add-on charged); different subsets per person.
- Shared service with non-linear 2-person duration term.
- Transferable seat: attendee-only service in package → no charge (DEC-2).
- Package service dropped entirely → price unchanged, manual adjustment path.
- Pair discount: eligibility trigger, frozen percent/amount, removal on attendee removal.
- Attendee added after a catalog price/duration change → current terms used.
- Revision that lengthens into a conflict → original booking provably unchanged.
- Concurrent submissions for one slot → exactly one succeeds (exclusion constraint).
- Buffer collision where customer-facing windows don't overlap.
- Break insertion/reorder; sort-order uniqueness.
- Attempt to exceed `max_participants_per_booking` via public UI *and* direct server call.
- Migration reconciliation: legacy totals/participants preserved.

---

## 11. Open items for the owner (small, non-blocking)

1. Unused-seat rule: dropped package service does not auto-reduce price — confirm (§5).
2. Pair-discount base: package base only, or base + add-ons — confirm (§5).
3. Rounding order for discount/tax must be specified once before implementation and used
   identically everywhere.
4. Calendar-first presentation (§9.1): confirm the owner accepts open windows in place of
   assumed 2-hour slots — same browsing experience she asked for, but every time shown is
   genuinely bookable for whatever the client goes on to select.
