# Handoff: Normalized Booking Participation and Add-on Pricing

**Status:** Approved design direction for implementation planning. No implementation has
been performed by this document.

**Supersedes:** `docs/booking-participation-redesign-handoff.md`, specifically the proposed
`primary | second | both` segment field and the decision to encode a permanent two-person
limit directly into the booking schema.

**Repo context:** Draping, a Next.js 16 and Supabase booking application. The current
schema is in `supabase/schema.sql` plus migrations `001` through `010`.

---

## 1. Final business interpretation

A booking has one customer, one checkout flow, and one total price.

- The primary client owns the booking and is solely responsible for its total.
- Other people are attendees/add-ons, not additional payers.
- There is no price splitting, per-person balance, separate invoice, or separate payment
  status inside one booking.
- If two people want to book or pay separately, they create separate bookings.
- The public product currently permits no more than two attendees, but the database model
  should not encode two as a permanent structural limit.
- The current maximum is a business rule (`max_participants_per_booking = 2`), not the
  shape of the participation tables.
- Payments remain external. The application calculates, snapshots, explains, and displays
  one booking total.

This distinction is central:

> Participation answers who receives a service. Billing answers who owns the booking.
> Normalizing participation must not turn attendees into separate customers or payers.

---

## 2. Why the earlier enum design was rejected

The earlier proposal put this value on every service segment:

```text
participants = primary | second | both
```

That works for exactly two people, but it is deliberately denormalized. Adding a third
participant would require a schema change and a data conversion rather than merely a new
participant row. It also makes participant-specific metadata awkward and prevents an
ordinary foreign key from expressing which people attend which service.

The two-person cap may remain in the product indefinitely, but it is inexpensive to model
attendance correctly now. At the current scale, the additional join rows have negligible
storage and query cost. The UI can remain deliberately limited to two while the underlying
relationships remain general.

This does **not** mean building a group-booking product now. It means avoiding a structural
shortcut in the core data model.

---

## 3. Recommended domain model

| Concept | Responsibility |
|---|---|
| Service | Canonical service identity, per-attendee price, and duration rules |
| Offering | Curated package/template and optional package price override |
| Published catalog version | Immutable terms shown to the customer |
| Booking | One primary billing client, one appointment, and one total |
| Booking participant | A person attending the booking; not necessarily a client account |
| Booking segment | A service or break in the sequential appointment timeline |
| Segment participation | Which booking participants attend a segment |
| Booking adjustment | Package-price difference, pair discount, or explicit manual correction |
| Booking revision | Audit record of a post-creation change |

The booking becomes operationally self-contained when it is created. Catalog foreign keys
remain useful provenance, but historic names, terms, durations, and amounts must not depend
on mutable catalog rows.

---

## 4. Proposed schema shape

Names below are recommendations for planning, not a ready-to-run migration.

### 4.1 Catalog service terms

```text
services
  id
  name
  description
  price_amount                         -- canonical price per attendee
  is_active

service_duration_terms
  id
  service_id
  participant_count                   -- 1, 2; more rows can be added later
  duration_minutes                    -- total duration at this attendance count
  unique(service_id, participant_count)
```

Why use duration terms instead of `duration_minutes_two`:

- Rows for counts 1 and 2 express today's requirements.
- Supporting a later group size does not require adding another service column.
- Duration need not scale linearly. Two attendees might take 80 minutes even if one takes
  60 minutes.
- The public maximum can remain two even if additional catalog terms are introduced later.

Service pricing is initially linear: every additional attendee assigned to a service adds
that service's snapshotted per-attendee price. A future non-linear price schedule can be
added without changing participant relationships, but it is not required now.

### 4.2 Offerings

```text
offerings
  id
  name
  description
  price_override nullable             -- fixed base package price when present
  buffer_minutes
  allowed_start_times
  is_active

offering_services
  offering_id
  service_id
  sort_order
```

Base offering price:

```text
coalesce(price_override, sum(member service price_amount))
```

The offering is a template and commercial package, not the continuing source of truth for
an existing booking.

### 4.3 Booking and participants

```text
bookings
  id
  billing_client_id                   -- the sole customer/payer
  offering_id nullable                -- provenance
  source_snapshot_id                  -- immutable catalog version selected
  offering_name_snapshot
  starts_at
  ends_at                             -- customer-facing appointment end
  occupied_until                      -- appointment end plus private buffer
  status
  base_package_amount                 -- frozen offering base price
  subtotal_amount
  discount_amount
  tax_rate_percent
  tax_amount
  total_amount
  duration_minutes
  buffer_minutes
  currency_code
  created_at / updated_at

booking_participants
  id
  booking_id
  participant_number                 -- stable display/order value within booking
  client_id nullable                 -- normally populated only for the primary
  display_name                       -- frozen name used for the appointment
  role                               -- primary | additional
  created_at
  unique(booking_id, participant_number)
```

Required invariants:

- Exactly one primary participant per booking.
- The primary participant corresponds to `bookings.billing_client_id`.
- Additional participants do not acquire billing responsibility.
- Participant count may not exceed the active business maximum when a booking is created
  or revised.
- The database tables can contain more than two participant rows if the business maximum
  is deliberately increased in the future.

Recommended setting:

```text
booking_settings.max_participants_per_booking smallint not null default 2
```

Changing this setting should not automatically enable a group-booking UI. It only provides
one authoritative policy value for server-side validation.

### 4.4 Booking segments and participation

```text
booking_segments
  id
  booking_id
  sort_order
  kind                                 -- service | break
  service_id nullable                  -- provenance; null for breaks
  service_name_snapshot nullable
  duration_minutes                     -- actual frozen duration for this revision
  base_list_amount                     -- package's one-person service component
  addon_list_amount                    -- charges caused by additional attendees
  net_amount
  label nullable                       -- useful for manually inserted breaks
  unique(booking_id, sort_order)

booking_segment_participants
  segment_id
  participant_id
  unique(segment_id, participant_id)
```

Service segment rules:

- Must reference a service or retain sufficient snapshot data when the catalog row is no
  longer available.
- Must have at least one participant.
- Duration comes from the snapshotted duration term for the number of attendees assigned
  to the segment.
- Additional-participant charges are included in the booking total, not owed by the
  participant represented by the join row.

Break segment rules:

- Has no service and no participants.
- Has a positive duration and zero price.
- Appears at an explicit point in `sort_order`; breaks are never inferred automatically.

### 4.5 Snapshotting terms needed by later revisions

Storing only a segment's current duration is insufficient. If participant 2 is added after
the catalog changes, the booking otherwise cannot determine whether to use the original or
new two-attendee term.

Recommended snapshot table:

```text
booking_segment_terms
  segment_id
  participant_count
  duration_minutes
  unit_price_amount
  source_catalog_version
  unique(segment_id, participant_count)
```

At booking creation, copy all applicable duration terms up to the configured maximum into
the booking. With the current maximum, each service segment normally snapshots terms for
counts 1 and 2.

An existing segment can then be changed from one attendee to two using the terms originally
offered. Adding an entirely new service later should explicitly snapshot current terms as
part of a new booking revision.

### 4.6 Price adjustments

```text
booking_adjustments
  id
  booking_id
  kind                                 -- package | pair_discount | manual
  label
  amount                               -- signed currency amount
  percent_snapshot nullable
  created_at
```

Adjustments are required because a package override and a whole-booking discount cannot be
explained reliably by overwriting service line prices.

Examples:

- Member services total $200 but the offering is advertised at $175: package adjustment
  is `-$25`.
- A 10% pair discount produces `-$27.50`: record both the frozen percentage and amount.
- An owner makes a one-off $10 courtesy adjustment: record `-$10` with a label.

Only the booking has a payable total. Adjustments are never assigned as participant debts.

---

## 5. Pricing behaviour

Recommended initial formula:

```text
base package amount
+ additional attendee service charges
+ package/manual adjustments
- pair discount
= subtotal
+ tax
= one booking total
```

Example:

```text
Primary package                                  $175.00
Additional attendee joins Service A             +100.00
Additional attendee joins Service C              +60.00
Pair discount (10% of the configured base)       -33.50
Subtotal                                         $301.50
Tax                                               $39.20
One total owed by the primary client             $340.70
```

The exact discount base and currency rounding order must be specified once and implemented
identically in the database, public quote, admin editor, email, and tests. Do not use
floating-point JavaScript arithmetic as the monetary authority.

### Pricing decision still requiring explicit confirmation

The owner must confirm what happens when only an additional participant receives a service
that is already included in the primary package:

1. **Strict add-on interpretation (current recommended assumption):** the base package
   remains unchanged and the additional participant's service is charged as an add-on,
   even if the primary does not personally attend that service.
2. **Transferable inclusion:** the package includes one attendee place per service, which
   may be assigned to either participant; an add-on is charged only when more than one
   person attends the same service.

These produce different totals. The implementation plan must not bury this decision in
code. Until confirmed otherwise, use the strict add-on interpretation because it most
directly matches the statement that additional clients are add-ons to the primary client's
booking.

Pair-discount eligibility must also be explicit. Recommended rule: it applies when at least
one valid additional participant is assigned to at least one service segment. Merely adding
a name without service participation must not trigger it.

---

## 6. Scheduling behaviour

The appointment remains one continuous, sequential use of one studio/practitioner.

```text
duration_minutes = sum(segment duration_minutes)
ends_at = starts_at + duration_minutes
occupied_until = rounded appointment end + buffer_minutes
```

Explicit per-segment timestamps are unnecessary while all work is sequential and uses one
resource. Segment times can be derived from `starts_at`, `sort_order`, and preceding segment
durations.

This model does not yet support:

- Parallel services
- Multiple practitioners or rooms
- Participants arriving for independently scheduled sub-appointments
- Non-contiguous use of the resource

Those are intentional product exclusions, not reasons to denormalize participation.

### Atomic conflict enforcement

Booking creation and revision must be database transactions. A safe operation must:

1. Authenticate and authorize the caller where appropriate.
2. Lock the relevant scheduling scope.
3. Validate the participant maximum and segment relationships.
4. Recalculate duration, occupied time, pricing, discount, and tax.
5. Check weekly schedule, blocks, allowed starts, other active bookings, daily limits, and
   weekly/consecutive-day limits.
6. Write participants, segments, terms, adjustments, and booking totals together.
7. Commit once; otherwise roll everything back.

Use PostgreSQL overlap protection, preferably a range exclusion constraint for active,
non-waitlist bookings. Transaction/advisory locking is still needed for aggregate daily and
weekly limits that an overlap constraint cannot enforce.

Do not retain the current application-level pattern of checking availability and inserting
or updating later in a separate operation.

---

## 7. Public and admin workflows

### Public booking

The public flow should collect the full initial participation matrix before final price and
availability are shown:

1. Select offering.
2. Enter primary client details.
3. Optionally add an attendee, up to the configured maximum.
4. Select which services each person attends.
5. Calculate duration and one booking total from the selected published catalog version.
6. Show availability for that exact duration.
7. Submit the complete booking atomically with an idempotency key.

The earlier assumption that all public bookings begin primary-only and are configured as a
pair later is rejected because it can show the wrong duration, price, and availability.

### Admin revision

An administrator may later:

- Add or remove an attendee.
- Change service participation.
- Insert, remove, or move a break.
- Reorder segments.
- Make an explicit price adjustment.

Every revision must recalculate the complete proposed booking and verify availability before
persisting it. A failed availability check leaves the existing booking unchanged.

Confirmed bookings must not be silently overwritten without history. Record a booking
revision containing the previous and new operational totals, the actor, timestamp, reason,
and whether an updated customer notification was sent.

---

## 8. Published catalog contract

The current application displays an immutable published snapshot but reads live offering
rows during availability and submission. That permits a draft edit to change the terms
between display and booking.

The redesigned flow must:

- Include a catalog snapshot/version ID in the public booking state.
- Calculate the quote from that exact version on the server.
- Materialize services, duration terms, names, and prices from that version.
- Reject or explicitly refresh the quote if the version is no longer acceptable.
- Retain `offering_id` and `service_id` only as provenance, not as historic display data.

---

## 9. Data integrity requirements

The migration and transaction functions should enforce at least:

- One active booking-settings row.
- `max_participants_per_booking >= 1`.
- One primary participant per booking.
- Unique participant number within a booking.
- Segment participants must belong to the same booking as the segment.
- Unique segment sort order within a booking.
- Service/break shape checks.
- Positive service and break durations.
- Nonnegative list prices and valid percentage ranges.
- Consistent subtotal, discount, tax, and total calculations.
- `starts_at < ends_at <= occupied_until`.
- No overlap between active, non-waitlist occupied ranges.
- Valid booking lifecycle transitions.

Use decimal/numeric arithmetic in PostgreSQL for authoritative money calculations. Snapshot
both a percentage and its applied amount only when the amount is treated as authoritative
and the percentage is explanatory.

---

## 10. Migration cautions

This should be an additive migration followed by a controlled cutover, not an immediate
drop-and-rebuild.

1. Add new catalog term, participant, segment, participation, adjustment, and revision
   structures.
2. Add the immutable source-version relationship.
3. Seed count-1 duration terms from current service durations.
4. Obtain or configure service prices; they cannot always be inferred correctly from
   existing offering totals. Preserve current offering prices as overrides where necessary.
5. Backfill existing booking participants from `booking_clients`.
6. Detect and manually resolve any existing bookings with more than the currently supported
   participant maximum.
7. Backfill legacy booking segments carefully. Old bookings generally imply that every
   recorded participant received every offering service, but this assumption must be
   verified. Preserve old booking-level totals even when a reliable line allocation cannot
   be reconstructed.
8. Update admin detail, list, email-context, confirmation, and public submission reads.
9. Run reconciliation reports comparing legacy and redesigned booking totals and times.
10. Remove old columns and `booking_clients` only after all reads and writes have cut over
    and the backfill has been verified.

Do not discard historic secondary contact information merely because future additional
participants only require a display name.

---

## 11. Implementation gates and test scenarios

The implementation plan must include authentication and authorization inside every admin
Server Action or the server-only mutation layer. Page or layout protection is not sufficient.

Minimum automated coverage:

- Solo booking with derived offering price.
- Solo booking with package override.
- Additional attendee on one service.
- Different participants attending different service subsets.
- Both attendees sharing a service with a non-linear two-person duration.
- Pair discount eligibility and removal.
- Adding an attendee after catalog prices/durations change while retaining snapshotted terms.
- Adding a new service later using explicitly current terms.
- Lengthening a booking into a conflict and proving the original remains unchanged.
- Two concurrent submissions for one slot; only one succeeds.
- Two concurrent revisions attempting the same newly occupied time.
- Buffer collision while customer-facing end times do not overlap.
- Break insertion and reordering.
- Draft catalog edit between page load and submission.
- Idempotent retry of the same booking submission.
- Migration reconciliation for legacy totals, participants, and emails.
- Attempt to exceed `max_participants_per_booking = 2` through both public and direct server
  calls.

---

## 12. Explicit non-goals

- Split payments or participant balances
- Separate invoices inside one booking
- Public bookings for more than two people today
- A generic promotions/rules engine
- Multiple currencies today
- Multiple practitioners/resources
- Parallel segment scheduling
- Automatically inferred breaks

---

## 13. Decision summary

Proceed with normalized booking participants and segment participation.

Keep one primary billing client and one booking total. Treat all other attendees as add-ons.
Enforce the current maximum of two as configurable business policy rather than encoding two
participant identities into segment columns. Materialize bookings from an immutable
published catalog version, snapshot the terms required for later revisions, express package
and pair discounts as explicit adjustments, and perform creation/revision atomically at the
database boundary.

This is more structurally correct than `primary | second | both` without committing the
project to group-booking UI, split billing, or a generic pricing engine.
