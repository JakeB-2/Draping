# Handoff: Per-Service Participation Redesign — Proposal for Review

**Status:** Proposal only. Nothing implemented. This document is for an independent
reviewer to critique before a decision is made.

**Repo context:** Draping — a colour-analysis booking site (Next.js 16 + Supabase).
Current schema: `supabase/schema.sql` (+ migrations 001–010). The relevant tables are
`services`, `offerings`, `offering_services`, `bookings`, `booking_clients`,
`booking_settings`, `clients`.

---

## 1. Problem statement (as given by the user)

The current booking model assumes an **offering** has a fixed set of services, a fixed
participant count (`people_count`), a single `price_amount`, and a precomputed
`duration_minutes` (plus manually added breaks/buffers). Pair bookings are a boolean
(`booked_as_pair`) with a global `pair_extra_minutes` fudge.

This breaks down because real bookings don't have every participant taking every service:

- A booking may contain **up to two clients**, each participating in **different subsets**
  of the offering's services. Any combination is possible (A does 1+2+3 while B only
  joins 2; both do 1, only A does 2, only B does 3; etc.).
- Time and pricing therefore need to be calculated **per service**, not per offering.
- A shared service (or the booking overall) may receive a discount.
- A second participant can be **added or removed days later**, and the system must
  re-verify schedule availability for the changed duration.
- Breaks remain manually inserted; never auto-inferred.
- Payments are external; the app only calculates and displays pricing.

**Hard constraints stated by the user:**

- Maximum **2 participants** per booking; scaling beyond 2 is explicitly *not* a concern.
- Both participants are booked in a single workflow.
- Only the **primary client's contact information** is stored. The second participant is
  "essentially just another attendee."
- The existing schema must not constrain the solution; redesigning it is acceptable.

**The dilemma that prompted this:** the obvious workaround is to create a separate
offering for every participant/service combination. It would work for the business
today, but the user suspects (correctly, in my view) that it's a workaround rather than
a normalized design.

---

## 2. Clarifying questions asked, and the user's answers

I asked four questions to pin down the business rules. Answers verbatim-in-spirit,
including the user's expressed uncertainty, because the uncertainty itself is signal:

### Q1. When both clients share one service, how long does that segment take?

**Answer:** "It is double [the service runs one-at-a-time, back-to-back], but the
*varies per service* option feels more scaleable and flexible for future changes, so I
want that. Push back if needed."

### Q2. Where should price live once participation is per-service? (Today only offerings have a price; services have none.)

**Answer:** Unsure. Two competing instincts: (a) clients selecting a preset offering
feels safest — no live computation, clients see pre-approved numbers; (b) "a correct
schema would allow the user to generate those offerings from logic, which means services
likely need prices, and possibly offerings can have an override." Also: "the final
correct schema will not have offerings for a set amount of people, as that will become
enormous with even an expansion to 3 client options or an increase in services."

### Q3. How should the two-participant discount work?

**Answer:** "It is an automatic whole-booking rule" (that's the business logic the owner
gave). But the user is uneasy: a hardcoded rule "isn't really schema-ing the problem
correctly"; they'd one day like to offer the app to similar users, and hardcoding
bothers them on principle. They cited a previous project (protec portal) where
extracting everything to settings worked well, "although likely overkill for this
project," and asked where the line is between over-complexifying and solid structure.

### Q4. What role should the offering play when a booking is created?

**Answer:** "Suggest best practice." (Deferred to me entirely.)

---

## 3. Framing that drove the recommendation

Everything mapped onto the standard e-commerce **product / bundle / order / order-line**
pattern:

| E-commerce | This app |
|---|---|
| Product | `services` (canonical price + duration) |
| Bundle / package | `offerings` (curated set, optional price override) |
| Order | `bookings` (snapshot of money + time at creation) |
| Order line | **`booking_segments`** (new — per-service participation, frozen price/duration) |

The key move: **the booking owns its own truth.** At creation the offering's services
are *materialized* into segment rows with frozen durations and prices; from then on the
admin edits segments freely (participation toggles, reordering, manual breaks,
adjustments) without touching the catalog. `bookings.offering_id` becomes provenance,
not a live dependency. The existing `bookings` table already snapshots price/tax/
duration — this extends an established habit to line items rather than introducing a
new philosophy.

This framing is also *why* the variant-explosion approach fails: it forces the catalog
to own what the order should own.

---

## 4. Decisions and reasoning

### D1. Shared time: per-service rule via one nullable column — agreed with the user, no pushback

`services.duration_minutes_two integer null` = total minutes when two people
participate. `NULL` = "runs twice, i.e. double" (today's actual behaviour, so the
default requires zero configuration). `60` on a 60-min service = fully shared. `80` =
shared with overhead. One column expresses every behaviour I offered in Q1
(together / together+extra / double / varies). The user feared over-engineering; the
marginal cost is one nullable column, so the flexibility is nearly free.

### D2. Pricing: services get `price_amount` (per participant); offerings get `price_override`

This resolves the user's two competing instincts — they were never in conflict:

- Services carry the canonical price → offerings' prices are **derived** (sum of member
  services) unless the admin sets `price_override` for package-deal marketing.
- Clients still only ever see pre-approved offering prices, and nothing is dangerously
  live-computed, because **every number is snapshotted into booking/segment rows at
  creation time**.
- No per-people-count offering variants ever need to exist, which addresses the
  combinatorial worry directly.

### D3. Pair discount: `booking_settings.pair_discount_percent`, snapshotted onto the booking

The business rule today is a whole-booking discount. Putting it in the existing
`booking_settings` singleton (and freezing the applied `discount_percent` /
`discount_amount` on the booking) is configuration, not hardcode — which is what the
user's "extract to settings" principle actually demands. What the principle warns
against is `* 0.9` buried in application code; this avoids that. A generic
discount-rules *table/engine* is the overkill the user sensed. If per-service discounts
are ever needed, that's an additive column later, not a redesign.

### D4. Offering role: template, not anchor

Public site sells offerings as-is. Booking creation materializes the offering into
segments; the booking is thereafter self-contained and admin-editable. Rationale in §3.

### D5. Participant representation: enum on the segment, not a join table (deliberate denormalization)

`booking_segments.participants ∈ ('primary','second','both')`, null for breaks.

Justification: the user's stated constraints (hard cap of 2; second person is "just an
attendee"; only primary's contact stored) mean a normalized `segment_participants` join
table buys nothing today and costs per-participant rows, heavier queries, and a clunkier
admin UI. Migration to the join table later is mechanical (`'both'` → two rows), so this
does not paint the project into a corner.

### D6. `booking_clients` is removed (deliberate simplification)

It existed only to allow two clients per booking. Under the stated rules the second
participant is not a client. Replace with `bookings.client_id` (fk) +
`bookings.second_participant_name text null`. Removes a join; matches the business
exactly.

### D7. Two assumed defaults (flagged, not confirmed by the user)

- Public bookings materialize with **all services, primary participant only**; pair
  setup happens admin-side (or via a later "bringing a friend?" toggle).
- `time_adjustment_minutes` moves from `offerings` to `bookings` as a manual admin
  fudge-factor.

---

## 5. Recommended schema (Option A)

```
services            + price_amount numeric(10,2)
                    + duration_minutes_two integer null   -- null = double
offerings           - duration_minutes, - people_count
                    - pair-era knobs (time_adjustment_minutes; pair_extra_minutes
                      in booking_settings also retires)
                    + price_override numeric(10,2) null   -- null = derived
booking_settings    + pair_discount_percent numeric(5,2) default 0
bookings            + client_id uuid fk (primary client)
                    + second_participant_name text null
                    + discount_percent / discount_amount (snapshot)
                    (booking_clients table dropped)

booking_segments  (NEW)
  id                uuid pk
  booking_id        uuid fk on delete cascade
  sort_order        integer
  kind              text check ('service','break')
  service_id        uuid fk, null for breaks
  participants      text check ('primary','second','both'), null for breaks
  duration_minutes  integer   -- frozen: base | base×2 | duration_minutes_two
  price_amount      numeric   -- frozen line total
```

Derived behaviour:

- Booking duration = Σ segment durations + buffer.
- Booking subtotal = Σ service-segment prices − discount; tax on top as today.
- Adding/removing participant 2 days later = recompute affected segments' durations →
  new `ends_at` → re-validate against weekly schedule, blocked/recurring periods, and
  other bookings. Pure recomputation, because segments are the single source of truth.
- Breaks are segments the admin inserts manually — never inferred (per requirement).

---

## 6. Options considered and rejected

### Option B — one offering per participant-combination (the user's candidate workaround)

Rejected. Three services × two participants ≈ 27 meaningful combinations per offering,
each with its own duration and price; every price change fans out across variants. It
encodes a participation *matrix* as catalog *rows*. Works short-term, decays fast.

### Option C — full normalization

`segment_participants` join table; tiered `service_prices` keyed by participant count;
a discount-rules table. This is the multi-tenant, N-participant future-proof version.
Rejected *for now*: every extra table is real admin-UI and query cost spent on
hypotheticals the stated constraints explicitly exclude (max 2, single-tenant).
The honest test that Option A isn't itself a workaround: **A migrates to C cleanly**
(enum → join rows is mechanical; settings field → rules table is additive).

---

## 7. What the reviewer should probe

Suggested critique surface (not exhaustive — challenge anything):

1. Is the `participants` enum genuinely safe, or does any near-term feature (e.g.
   per-participant notes, separate confirmation emails) force the join table sooner?
2. Does freezing `duration_minutes_two` semantics into segment snapshots create edge
   cases when participant 2 is added *later* (which base do we recompute from if the
   catalog changed in between)?
3. Is `price_override` on offerings a footgun (drift between advertised override and
   derived sum after a service price change)?
4. Whole-booking discount in settings: does snapshotting percent *and* amount on the
   booking cover retroactive setting changes adequately?
5. Dropping `booking_clients`: any existing data/UI that depends on two client rows
   (e.g. `client_role`) that makes the migration riskier than claimed?
6. The two assumed defaults in D7 — reasonable?
7. Anything the e-commerce framing obscures? (Scheduling is not commerce: segments have
   *order and clock time*, order lines don't. Does the schema need explicit per-segment
   times, or is derive-from-sort-order + durations sufficient?)
