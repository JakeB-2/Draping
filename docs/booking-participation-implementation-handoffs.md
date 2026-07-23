# Implementation Phases & Agent Handoffs: Per-Service Participation

**Canonical spec:** `docs/booking-participation-final-plan.md` (the final merged plan).
Every implementing chat MUST read it in full before writing code. Where this document
and the plan disagree, the plan wins. The two superseded handoff documents
(`booking-participation-redesign-handoff.md`, `booking-participation-normalized-handoff.md`)
are history only — do not implement from them.

**Repo:** `c:\Users\Jake\Projects\draping` — Next.js 16 + Supabase colour-analysis
booking app. Working branch is `development`; production deploys from `main`.
**No chat pushes to `main`.** Only the human operator does that after final verification.

---

## Orchestration overview

| Phase | What | Model | Runs | Depends on |
|---|---|---|---|---|
| A | Schema migration + money/time/availability core + transaction layer | **Fable** | **Series — first, alone** | — |
| B | Admin booking editor & revision flows | **Opus** | **Parallel with C** | A merged |
| C | Public multi-entry booking flow | **Sol** | **Parallel with B** | A merged |
| D | Legacy backfill, cutover, reconciliation, retirement of old columns | **Fable** | **Series — last, alone** | B and C merged |

**Why this split:** Phase A is the correctness-critical core (money arithmetic,
concurrency, database invariants) and defines every interface the UIs consume — it must
be done first, by the strongest model, with nothing running beside it. B and C touch
disjoint route trees and only *consume* A's modules, so they parallelize safely. D
rewrites live data and deletes columns; it must run alone, after everything reads/writes
through the new model.

**Parallel-safety rules (B and C):**

1. Branch from post-A `development`: B works on branch `phase-b-admin`, C on
   `phase-c-public`. If both chats share one machine/checkout, each MUST use its own
   git worktree (`git worktree add`) — two chats editing one working tree will corrupt
   each other.
2. B and C must NOT modify Phase A's shared modules (calculation, availability,
   transaction layer, generated types). If an interface is insufficient, stop and
   report the needed change to the operator instead of editing it — the operator routes
   it to a Fable chat. This is the contract that makes parallelism safe.
3. B and C may create files freely inside their own route trees and components; any
   file both might plausibly touch (shared UI primitives, global styles) belongs to B —
   C must copy locally instead of editing shared files.
4. Merge order after both finish: B into `development`, then C (C resolves conflicts,
   expected to be near-zero).

**Agent usage:** every chat may deploy its own platform's subagents freely
(Anthropic chats spawn Claude subagents; the Sol chat spawns its own platform's agents
— never cross-vendor). Suggested uses are listed per handoff.

**Universal rules for all four chats** (repeat verbatim in each handoff):

- Read `AGENTS.md`. This repo runs a Next.js 16 with breaking changes — read the
  relevant guides in `node_modules/next/dist/docs/` before writing app code. `params`
  and `cookies()` are async; `cacheComponents` requires Suspense boundaries around
  dynamic data.
- Money is computed in PostgreSQL `numeric` / string-decimal on the server. JavaScript
  floating-point is never the monetary authority.
- Auth checks inside every admin Server Action / server mutation entry point.
  Page/layout protection is not sufficient.
- Open items §11 of the plan: use the stated defaults (no auto price reduction for
  dropped package services; pair discount applies to base package amount only; pick one
  rounding order — round half-up to cents at each adjustment application, discount
  before tax — and implement it identically everywhere). Do not invent alternatives;
  flag disagreement in the final report instead.
- Commit in small logical commits on your branch. Never push `main`. Never force-push.
- Finish with: what was built, what was verified (commands + results), known gaps,
  and any plan deviations with reasons.

---

## HANDOFF A — Fable — "Foundation: schema, money, time, transactions"

*Run first, alone. Nothing else starts until this is merged to `development`.*

Copy everything between the lines into a fresh Fable chat opened in
`c:\Users\Jake\Projects\draping`:

---------------------------------------------------------------

You are implementing Phase A (foundation) of a schema redesign for a Next.js 16 +
Supabase booking app for a colour-analysis studio (single admin, public booking site).

**Read first, in this order:**
1. `AGENTS.md` (repo rules — Next.js 16 has breaking changes; consult
   `node_modules/next/dist/docs/` before writing app code)
2. `docs/booking-participation-final-plan.md` — the canonical spec. Your phase
   implements §4 (schema), §5 (pricing), §6 (duration/scheduling/transactions),
   §9.2 (availability/quote contract), and the non-UI test scenarios of §10.
3. `supabase/schema.sql` + `supabase/migrations/001`–`010` — current state and
   migration conventions (plain SQL files, numbered).

**Context in one paragraph:** bookings currently hardcode duration/price on offerings
with a `people_count` and pair flags. The redesign: services get a canonical
per-attendee `price_amount` and per-participant-count duration rows
(`service_duration_terms`); offerings become templates with optional `price_override`;
bookings own their truth via `booking_participants`, `booking_segments`,
`booking_segment_participants`, and `booking_adjustments`, all snapshotted at write
time. The 2-person cap is `booking_settings.max_participants_per_booking`, policy not
table shape. Pricing is "transferable seat": the package covers one seat per member
service; add-on charges apply only when a service has >1 attendee. Full details,
invariants, and formulas are in the plan — follow it exactly.

**Deliverables:**

1. **Migration `011_participation_redesign.sql`** — ADDITIVE ONLY. Create all new
   tables/columns/constraints from plan §4, including: the range exclusion constraint
   on active non-waitlist bookings' occupied ranges (btree_gist), check constraints and
   triggers for the §4.4 invariants (one primary participant per booking, segment
   participants same-booking, service/break shape rules), seeds for
   `service_duration_terms` (count-1 from `services.time_requirement_minutes`, count-2
   at exactly 2×), and new `booking_settings` columns. Do NOT drop or alter existing
   columns or `booking_clients` — that is Phase D. Old and new structures coexist.
2. **Pricing module** (server-only TypeScript, one directory, e.g.
   `src/lib/booking-engine/` — adapt to the repo's existing structure): implements plan
   §5 exactly — base package amount, per-segment addon amounts, package adjustment row,
   pair-discount eligibility and amount, manual adjustments, subtotal/tax/total using
   the existing tax behaviour unchanged. Decimal-safe (integer cents or a decimal lib
   already in the repo; never float math on money). Rounding: half-up to cents, applied
   per adjustment, discount before tax — one constant place.
3. **Duration/availability module** implementing plan §9.2's four queries: `windows`,
   `fits`, `quote`, `starts` — over weekly_schedule, blocked_periods, recurring_blocks,
   allowed_start_times, buffers, and existing bookings' occupied ranges. Offering min
   duration = all member services at count 1; max = all at the configured participant
   cap.
4. **Transaction layer:** atomic booking create and revise (Postgres functions or a
   single-transaction server path — prefer DB functions given Supabase): lock →
   validate participant cap & invariants → recompute duration/pricing → availability
   check (schedule, blocks, overlap, daily/weekly limits) → write
   booking+participants+segments+segment_participants+adjustments together → commit or
   roll back everything. The old check-then-insert pattern must not be used by any new
   code path.
5. **Tests** for every non-UI scenario in plan §10 (solo derived price, package
   override, add-on charging, transferable seat, non-linear shared duration, pair
   discount lifecycle, revision-into-conflict leaves original untouched, concurrent
   submission — exactly one wins, buffer collision, participant-cap enforcement via
   direct call). Use the repo's existing test setup if present; if none exists, add a
   minimal one and document how to run it.

**Explicitly out of scope for you:** any UI, the public flow, admin screens, legacy
data backfill, dropping old columns, emails. Existing app code keeps working against
the old columns during your phase.

**Subagents:** you may deploy Claude subagents — suggested: one to map the existing
data-access layer and conventions before you design module placement; parallel ones for
test-writing per scenario group; a final adversarial reviewer agent over the migration
SQL checking every §4.4 invariant is actually enforced.

**Verify before finishing:** migration applies cleanly to a fresh database AND to a
database with the existing schema+seed data; all tests pass; `npm run build` (or the
repo's build script) passes. Work on branch `phase-a-foundation` off `development`;
commit in logical steps; do not push `main`. Report: interfaces you exported (exact
signatures — Phases B/C build against them), verification results, deviations from the
plan with reasons.

---------------------------------------------------------------

## HANDOFF B — Opus — "Admin booking editor & revisions"

*Starts only after Phase A is merged into `development`. Runs in parallel with C —
observe the parallel-safety rules.*

Copy between the lines into a fresh Opus chat in the repo (its own worktree/checkout on
branch `phase-b-admin`):

---------------------------------------------------------------

You are implementing Phase B (admin UI) of a booking-schema redesign, in parallel with
another chat doing the public flow (Phase C). You work ONLY on branch `phase-b-admin`
(branched from `development` after Phase A merged), in your own git worktree.

**Read first:** 1) `AGENTS.md` — this is Next.js 16 with breaking changes; read the
relevant guides in `node_modules/next/dist/docs/` before writing app code (`params`/
`cookies()` are async; `cacheComponents` needs Suspense around dynamic data).
2) `docs/booking-participation-final-plan.md` — canonical spec; your sections are §9
(admin workflow), §5–§6 for what the numbers mean, §4 for the data shapes.
3) The Phase A foundation modules (search for the booking-engine / availability /
transaction-layer code merged into `development`) — these are your ONLY write path and
calculators.

**Hard rule that makes parallel work safe:** you must NOT modify Phase A's shared
modules (pricing, availability, transaction layer, migrations, generated types) or any
shared UI primitive another route tree uses. Consume them as-is. If an interface is
missing or wrong, STOP that thread of work and list the needed change in your final
report for the operator — do not patch it yourself. New files inside the admin route
tree and admin-only components are yours freely.

**Context in one paragraph:** bookings are now composed of ordered segments (services
and manual breaks) with per-segment participant assignment (join rows, cap enforced via
`booking_settings.max_participants_per_booking`, currently 2). Pricing is transferable
seat: package covers one seat per service; a second attendee on a service adds that
service's snapshotted seat price; a pair discount (settings percent) applies to the base
package amount when an additional participant attends ≥1 service; package overrides and
manual corrections are explicit `booking_adjustments` rows. All create/revise operations
go through Phase A's atomic transaction layer, which recomputes and validates
availability — a failed check leaves the booking unchanged.

**Deliverables (admin side only):**

1. **Booking creation** in the admin: choose offering → participants (primary client
   record + optional name-only attendee) → per-service attendance matrix → live
   duration/quote via Phase A's `quote` → start-time selection via `starts` → atomic
   submit. Show the price breakdown (base package, add-ons, adjustments, discount, tax,
   total) exactly as the engine returns it.
2. **Booking revision editor:** add/remove attendee, toggle per-service participation,
   insert/remove/move manual breaks, reorder segments (sort-order unique), add manual
   adjustments with labels. Every save = full recompute + availability re-validation
   through the transaction layer; surface a failed availability check clearly with the
   booking left untouched.
3. **Booking detail/list views** updated to read the new structures (participants,
   segments timeline with derived per-segment times, adjustments breakdown). Legacy
   bookings (not yet backfilled — that's Phase D) must still render without crashing:
   fall back to booking-level totals when segments are absent.
4. **Catalog admin:** edit `services.price_amount` and `service_duration_terms` rows
   (add/edit counts — the UI may cap visible counts at the settings max), offering
   `price_override`, and the new settings fields (`max_participants_per_booking`,
   `pair_discount_percent`).
5. Auth checks inside every Server Action / mutation entry (not just pages/layouts).

**Out of scope:** public routes (Phase C owns them), emails, backfill, schema changes,
any edit to Phase A modules.

**Subagents:** deploy Claude subagents freely — suggested: an explorer to map existing
admin routes/components/conventions first; parallel builders per screen; a reviewer
pass checking every mutation calls the transaction layer (grep for any direct
insert/update to bookings tables that bypasses it — there must be none).

**Verify before finishing:** `npm run build` passes; exercise create + revise + break
insertion + attendee add/remove against a local database end-to-end; confirm a
revision into a conflicting slot fails and changes nothing. Commit in logical steps on
`phase-b-admin`; never push `main`. Report: screens built, verification performed,
interface gaps found (for the operator), deviations with reasons.

---------------------------------------------------------------

## HANDOFF C — Sol — "Public multi-entry booking flow"

*Starts only after Phase A is merged into `development`. Runs in parallel with B —
observe the parallel-safety rules. Sol deploys only its own platform's agents (no
cross-vendor).*

Copy between the lines into a fresh Sol chat in the repo (its own worktree/checkout on
branch `phase-c-public`):

---------------------------------------------------------------

You are implementing Phase C (public booking flow) of a booking-schema redesign for a
Next.js 16 + Supabase colour-analysis studio site, in parallel with another chat doing
the admin UI (Phase B). You work ONLY on branch `phase-c-public` (branched from
`development` after Phase A merged), in your own git worktree.

**Read first:** 1) `AGENTS.md` — this repo's Next.js 16 has breaking changes vs. what
you may know; read the relevant guides in `node_modules/next/dist/docs/` before writing
app code (`params`/`cookies()` are async; `cacheComponents` requires Suspense around
dynamic data). 2) `docs/booking-participation-final-plan.md` — canonical spec; your
sections are §9.1 (multi-entry flow — read it twice, it is the heart of your phase),
§9.2 (the availability/quote contract you consume), DEC-2/3/5. 3) Phase A's foundation
modules in `development` (booking-engine: pricing, availability `windows`/`fits`/
`quote`/`starts`, atomic submission) — your ONLY source of numbers and your only write
path.

**Hard rule that makes parallel work safe:** do NOT modify Phase A's shared modules,
migrations, generated types, or shared UI primitives used outside the public routes. If
an interface is missing/insufficient, STOP that thread and list the needed change in
your final report — never patch shared code yourself. New files under the public route
tree and public-only components are yours freely. Phase B owns any genuinely shared UI
file; copy locally rather than editing shared files.

**Context in one paragraph:** a booking = one offering, one participation matrix (which
of up to `max_participants_per_booking` people — currently 2 — attends each service),
one start time, one server-computed total. Durations vary with the matrix
(per-attendee-count duration terms), so no fixed slot length exists. The calendar
primitive is the OPEN WINDOW (contiguous free time), which is truthful regardless of
selection. Nothing is reserved while browsing; the atomic server submission is the only
claim on the calendar and will fail cleanly if the slot was taken meanwhile.

**Deliverable — the multi-entry flow of plan §9.1:**

1. **Entry choice:** "I know when I want to come" and "I know what I want" (plus
   naturally supporting switching midway).
2. **Time-first path:** open-window calendar (from `windows`) → pick a window/start →
   offering list filtered by `fits` (an offering shows if some allowed start in the
   window leaves room for its minimum duration; show duration ranges honestly) →
   offering → participation matrix (primary details + optional attendee display-name,
   per-service attendance) → live `quote`; if the matrix outgrows the window, say so
   immediately and offer nearest fitting alternatives via `starts` → confirm → submit.
3. **Service-first path:** offering → matrix → exact duration + total from `quote` →
   calendar of valid starts from `starts` → pick → confirm → submit.
4. **Bidirectional filtering:** selections on either side narrow the other; clearing a
   selection widens the other again. Single-screen or wizard rendering is your choice —
   the plan requires the data handling to support either, so keep flow state in one
   serializable structure independent of presentation.
5. **Price display:** always the server quote, itemized (base package, add-on lines,
   pair discount, tax, total). The client computes nothing authoritative.
6. **Submission:** one atomic server call through Phase A's transaction layer; on
   conflict/validation failure, re-offer nearby times without losing the visitor's
   selections. The existing post-submission behaviour (pending status, request-received
   email trigger) continues to work — do not redesign emails.

**Out of scope:** admin routes (Phase B), schema changes, emails, backfill, holds/
reservations (explicitly rejected in the plan), editing Phase A modules.

**Agents:** you may deploy your own platform's subagents — suggested: one to map the
existing public routes/styles/conventions before building; a reviewer pass verifying no
client-side arithmetic ever reaches the display and every displayed time originates
from `windows`/`starts`.

**Verify before finishing:** `npm run build` passes; walk both entry paths end-to-end
against a local database, including: matrix change that outgrows a chosen window (must
warn + reoffer), and a submit into a just-taken slot (must fail cleanly and reoffer).
Commit in logical steps on `phase-c-public`; never push `main`. Report: what was built,
verification performed, interface gaps found, deviations with reasons.

---------------------------------------------------------------

## HANDOFF D — Fable — "Backfill, cutover, reconciliation, retirement"

*Runs last, alone, after B and C are merged into `development` and the operator has
sanity-checked both UIs. Destructive steps live here — this phase must never run in
parallel with anything.*

Copy between the lines into a fresh Fable chat in the repo, on `development`:

---------------------------------------------------------------

You are implementing Phase D (cutover) — the final phase of a booking-schema redesign.
Phases A (schema+engine), B (admin UI), and C (public flow) are merged into
`development`. Old columns and `booking_clients` still exist alongside the new
structures; legacy bookings have no participants/segments rows yet.

**Read first:** 1) `AGENTS.md`. 2) `docs/booking-participation-final-plan.md` §8
(migration outline — your checklist), §4 (target shapes), §10 (migration test
scenarios). 3) Migration `011` and the booking-engine modules, so your backfill writes
shapes identical to what the engine writes.

**Deliverables, in order:**

1. **Backfill migration(s) (012+):**
   - `booking_participants` from `booking_clients` (preserve `client_id` links on ALL
     backfilled rows, including secondary clients — do NOT discard historic secondary
     contact data; roles from `client_role`/`booked_as_pair` where derivable, else
     primary = the first/only client).
   - `booking_segments` for legacy bookings assuming every participant attended every
     offering service, using durations proportioned from the booking's frozen
     `duration_minutes`. Preserve legacy booking-level totals VERBATIM — where a clean
     line allocation isn't derivable, write segments for the timeline and a single
     `booking_adjustments` row reconciling any difference so
     base + addons + adjustments still equals the original total exactly.
   - Detect bookings that violate current assumptions (more clients than the cap,
     missing offering) and emit them to a report for manual resolution instead of
     guessing.
2. **Reconciliation report** (script or SQL): for every legacy booking, legacy total
   vs. recomputed-from-rows total and legacy duration vs. segments duration — must show
   zero discrepancies before you proceed past this step. Include it in your final
   report.
3. **Cutover sweep:** find and update every remaining read/write of retired columns
   (`booked_as_pair`, `people_count`, offering `duration_minutes`, `pair_extra_minutes`,
   `booking_clients`, `bookings.price_amount`, `includes_break`, offering break fields)
   — email template context builders, list/detail queries, availability code, seeds,
   types. Nothing may reference them afterward except the retirement migration itself.
4. **Retirement migration (final, separate file):** drop the retired columns and
   `booking_clients`. This is destructive — it must be the last migration, after the
   reconciliation report is clean and the cutover sweep leaves zero references. Gate it
   clearly (separate commit, named e.g. `0NN_retire_legacy_booking_columns.sql`).
5. **Full test pass:** entire suite including Phase A's scenarios and the §10 migration
   scenarios; `npm run build`.

**Subagents:** deploy Claude subagents — suggested: parallel grep/read agents to
exhaustively find retired-column references (emails, queries, types, seeds); an
adversarial agent trying to construct a legacy booking shape your backfill mishandles.

**Safety rules:** additive migrations first, retirement last and separate; never run
the retirement step until reconciliation is clean; work on `development` in logical
commits; never push `main` — the human operator deploys after review. Report: backfill
counts, reconciliation results, manual-resolution list, files changed in the sweep,
verification output.

---------------------------------------------------------------

## Operator checklist (you, between phases)

1. Run Handoff A (Fable). On completion: skim its report, merge `phase-a-foundation` →
   `development`.
2. Create two worktrees/branches; run Handoffs B (Opus) and C (Sol) **in parallel**.
3. Merge B → `development`, then C (C's chat or a quick follow-up resolves conflicts).
   Click through both UIs once.
4. Run Handoff D (Fable). Review the reconciliation report BEFORE allowing the
   retirement migration to be applied anywhere real.
5. Only after everything is verified: push `development` and `main` per `AGENTS.md`.
6. Route any "interface gap" reports from B/C to a Fable chat against the foundation
   modules, then let B/C rebase.

Open items §11 of the plan (unused-seat rule, discount base, rounding, window-vs-slot
presentation for the owner) are answered with the plan's stated defaults in all
handoffs — if the owner rules differently later, the changes are localized to the
pricing module and §9.1 presentation.
