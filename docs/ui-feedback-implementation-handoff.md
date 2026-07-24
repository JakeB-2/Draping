# Handoff: UI feedback implementation pass

**Written 2026-07-24 for the next agent.** Jake is away; work autonomously through the
phases below. The companion document `docs/ui-feedback-triage-2026-07-24.md` is the
source of truth for every item's rationale, current-state file references, and the
resolved business decisions — read it first and keep this file's checkboxes updated as
you go.

This handoff **absorbs and supersedes** `docs/ui-quality-pass-handoff.md` (written
earlier, never executed). Its environment warnings and functional checks are folded
into Phase 1; its responsiveness + performance passes into Phase 10. One of its tasks
(harden 0-vs-null cap semantics) already shipped as `b1b0383`.

## Ground rules

- **Production is live.** The prod cutover completed 2026-07-24 (migrations 011–014).
  Any schema change is a new numbered migration (next: 015); never edit shipped ones.
  Test locally (`npm run test:setup` then `npm test`; needs Docker) before anything
  touches remotes.
- **Deploy workflow (AGENTS.md):** production deploys from `main`. When a phase is
  complete, tested, and verified, push the tested commit to **both** `development` and
  `main` and keep the two remote branches at the same commit. If a phase is only
  partially done or you're unsure, push `development` only and say so in your report —
  never leave `main` ahead of `development` or push unverified work to `main`.
- **This is NOT the Next.js you know** — Next 16 with breaking changes. Read
  `node_modules/next/dist/docs/` guides before writing route/server code. `params` and
  `cookies()` are async; `cacheComponents` requires Suspense around dynamic data.
- **protec-portal** (`c:\Users\Jake\Projects\protec-portal`) is the design-system
  source of truth. Copy components from it (adapt, strip its capability-gating);
  do not modify protec-portal itself.
- **Engine discipline:** all money/duration shown in UI comes from engine responses —
  never compute amounts client-side. Phases 4 (settings columns) and 6 (break /
  requires_all_attendees) are the ONLY places this plan intentionally touches
  `lib/booking-engine/` or migrations. Any *incidental* engine bug you find (wrong
  number, wrong availability) while doing UI work: do not patch it — report it.
- Auth check (`requireAdmin`) inside every new admin server action.
- Verify each phase in the running app (use the `/verify` skill), not just tests.

## ⚠ Environment — local dev points at PRODUCTION

`.env.local` contains the **production** Supabase project. Anything submitted through
the local app (bookings, catalog edits, publishes) writes real production rows.

- Read-only browsing and layout work: fine.
- Any flow that WRITES: create clearly-marked test rows (notes = "UI TEST") and DELETE
  them before finishing. List every production row created and removed in your final
  report. (The `npm run test:setup` Postgres harness is for the engine test suite
  only — the app itself reads Supabase, so app-level writes can't be pointed at it.)
- Port 3000 is occupied by an unrelated app — run `npx next dev -p 3105` (or any free
  port) and confirm you're on the right app.
- Admin login for local testing: `jakekbul@gmail.com` / `jake-password` at
  `/admin/login` (temporary; will be rotated).

## Phase 0 — Tree review and cleanup (do first)

Current state as of writing: `development` == `main` == `origin/development` ==
`origin/main` at `b1b0383`. Two local-only changes:

1. **Uncommitted diff in `app/book/booking-flow.tsx`** (+7/−2): adds a
   `timeRangeLabel()` helper and switches the ConfirmationStep final-review and
   QuoteCard date lines from a bare start time to a start–end range. It looks
   intentional and complete (Jake's manual edit). **Review it**: check the range math
   respects the studio timezone (it converts via `Date.parse` + minutes, then formats
   with `formatInTimeZone` — fine), confirm it renders correctly in the running app,
   then commit it on its own, e.g.
   `fix: show start–end time range in quote card and final review`.
2. **Untracked docs** (`ui-feedback-triage-2026-07-24.md` + this file): commit as
   `docs: triage and implementation handoff for UI feedback pass`.
3. **Stale local branches:** `phase-a-foundation`, `phase-b-admin`, `phase-c-public`
   are each 0 commits ahead of `development` (fully merged). Delete them
   (`git branch -d`). They have no remote counterparts.
4. Push `development` and `main` (same commit) when 1–2 are committed and verified.
5. Sanity-check nothing else lingers: no stashes existed at handoff time.

- [x] booking-flow diff reviewed, verified in app, committed (`9a45334`)
- [x] docs committed (`465abc9`)
- [x] merged phase branches deleted (phase-a/b/c; phase-c worktree removed)
- [x] remotes in sync, worktree clean

## Phase 1 — Functional verification walk (from the old quality-pass handoff)

Read-only against prod data except where noted; establishes a baseline before changing
anything. Reference: `docs/booking-participation-final-plan.md` §9.1 for the intended
public flow shape (multi-entry, bidirectional filtering, open windows).

- [x] **Availability returns dates end-to-end.** After the 2026-07-24 zero-cap fix
      (caps were `0`, engine read them literally, no dates appeared; now `null`), walk
      both public entry paths and confirm windows and start times appear. Studio
      timezone America/Toronto; Mon/Tue closed; 24 h min lead; 60-day advance window;
      some offerings restrict start times.
- [x] **§9.1 behaviours, both entry paths** — verified. Note: in time-first mode,
      clearing the time selection hides the offering step until a new window is
      chosen (render-condition design, flagged in the final report).
- [x] **Race handling** — verified 2026-07-24: a colliding admin booking made the
      public submit fail cleanly with nearby alternatives; no public booking row was
      created and offering/attendance selections were retained.
- [x] **Admin flows** — create/revise verified incl. attendee add, participation
      toggle, break insert, manual adjustment, and stale-start rejection (clear error,
      booking untouched). Catalog/settings form saves are exercised in Phases 4/6.
- [x] Engine-adjacent findings logged for the final report (admin tz display fixed in Phase 2; past-start offers + pre-availability client upsert reported only). All prod UI TEST rows deleted.

## Phase 2 — Quick wins (triage items C1, A2, A7, A10, A5, A8)

- [x] **C1** — "View client site" action in the admin header
      (`app/(admin)/admin/layout.tsx`), opens `/` in a new tab.
- [x] **A2** — surface min lead time as **days** in
      `app/(admin)/admin/bookings/options/rules-form.tsx`; store `days * 24` into the
      existing `min_lead_hours` column (UI-only conversion, no migration). Display
      converts back (`hours / 24`, round sensibly).
- [x] **A7** — once a date/time window is selected in the booking flow, hide the other
      dates and show a "Clear selection" action (`WindowStep`,
      `app/book/booking-flow.tsx:583`).
- [x] **A10** — remove the `finalReview` summary grid in ConfirmationStep
      (booking-flow.tsx:~1030); the live server quote card is the single source of
      truth. Keep contact fields/notes/submit. (Phase 0's diff touches this grid — do
      Phase 0 first.)
- [x] **A5** — auto-scroll/focus the next actionable step after each committed choice
      (offering selected, date selected, start time selected). Pattern already exists
      at booking-flow.tsx:248 (`scrollIntoView`).
- [ ] **A8** (deferred to Phase 4 storage) — configurable notice inside `QuoteCard` (booking-flow.tsx:1046). Storage
      (`quote_notice_text`) lands in the Phase 4 migration — wire the render now if
      convenient, or defer the whole item to Phase 4.

Commit + test + verify + push per the ground rules.

## Phase 3 — Screens-layer port (E1)

Vendor from protec-portal into draping:

- `components/screens/sub-sidebar.tsx` (SubSidebarLayout — settings left-nav)
- `components/screens/split-view.tsx` (+ `selection-memory-mirror.tsx`)
- `components/screens/row-list.tsx` (SectionStack/RowList family)
- `components/screens/detail-pane-header.tsx`, `detail.tsx`
- `components/tables/DataTable.tsx` (+ its pipeline/row-actions/paginator helpers)
- `components/screens/index.ts` barrel (trim to what's ported)
- Skip: wizard.tsx (not needed yet), capability/tier gating (strip references),
  entity-list-page.tsx unless it ports cleanly.

Draping already has the same `components/ui/*` shadcn base, Tailwind v4, lucide,
sonner — expect mostly mechanical adaptation (imports, removed caps checks). Get it
compiling and render one throwaway usage to prove it, then delete the throwaway.

- [x] screens/tables layer compiles and renders in draping (verified at 1280/950/375; DataTable is container-query keyed — panes under 28rem show cards by design)

## Phase 4 — Settings consolidation (C2 + B2 + A8 storage)

One migration (015) adding to `booking_settings`: `about_url`, `facebook_url`,
`experience_url`, `quote_notice_text`, `break_minutes` (int, nullable — used in
Phase 6; add it here to avoid a second settings migration).

- [x] Migration 015 written, applied locally AND to prod, tests pass
- [x] Rebuild `/admin/settings` on `SubSidebarLayout`: sections Studio, Timezone,
      Tax, Participation, **Booking options** (merge in `rules-form.tsx` content:
      lead time in days, caps, break minutes), **Links** (the three URLs), Email.
      Retire `/admin/booking-options` + `/admin/bookings/options` routes (redirect or
      remove links).
- [x] Landing page (`app/page.tsx`): replace hardcoded chrysaliscolour link (:176),
      Facebook link (:68) with settings values; "The experience" nav becomes the
      external `experience_url` when set. Group external references under one nav item.
- [x] `quote_notice_text` rendered in QuoteCard (completes A8; verified with a temporary prod notice, then cleared).
- [x] Prod note: after this deploys, the new columns are NULL — the site must behave
      sensibly with all of them empty (hide links/notice, break behaviour off until
      Phase 6).

## Phase 5 — Calendar picker (A1/A6)

`components/ui/calendar.tsx` already exists in draping (react-day-picker 9.14
installed). Diff it against protec-portal's version first; take theirs if diverged.

- [x] Map open windows to selectable days; disable days without availability.
- [x] List view ⇄ calendar view toggle in `WindowStep` (keep list as one of the modes;
      respect A7's hide-on-select behaviour in both).
- [x] Mobile check at 375px (no horizontal scroll; calendar fits).

## Phase 6 — Business logic: requires_all_attendees + break (A4 then A3)

**A4 first** (migration 016): boolean `requires_all_attendees` on **services**,
default false. Admin edit on the services/offerings tab
(`app/(admin)/admin/offerings/`). In `MatrixStep` (booking-flow.tsx:728), when a
selected offering includes such a service, lock that service's row to all attendees
(pre-set + disabled, with a short explanation). Engine passthrough so the quote/create
RPCs see correct participants.

**A3 on top:** insert a break segment **iff the booking contains more than one
performance of a `requires_all_attendees` service** (i.e. ≥2 attendees on core
analysis). Duration = `break_minutes` setting (Phase 4). Placement irrelevant — append
it so total duration extends; how the time is spent is out of scope.
- Emit `kind: 'break'` in the segments payload (`lib/booking-engine/engine.ts:52`);
  remove the hardcoded `booking_includes_break: 'No'` / `booking_break_minutes: 0` at
  `app/book/actions.ts:~491` and populate from the actual segments.
- Availability must account for the extended duration (fit calculations in
  `lib/booking-engine/availability-core.ts`).
- Add engine tests: 1 attendee long booking → no break; 2 attendees with core
  analysis → break; 2 attendees without core analysis → no break; `break_minutes`
  null/0 → no break.
- [x] Quote card and emails reflect the break (duration includes it; email vars derive from actual segments). Migration 016 applied to prod; Core Analysis flagged; break_minutes seeded at 30 (admin-editable).

## Phase 7 — Admin split-view migration (C4)

Move `/admin/bookings` (list + detail) and `/admin/offerings` onto
SplitView + DataTable + SectionStack (selection via `?selected=<id>`). Follow
protec-portal's `app/(app)/finance/accounts/` as the canonical example. Don't force
every admin page — these two first; others only if they fall out naturally.

## Phase 8 — Landing restructure (B1)

The landing page is a **booking tool**. Top of page = service catalog cards
(name, description, price/duration, "Book now" that pre-selects that offering in the
embedded `BookingFlow`), merged with the "I know what I want" path — one surface.
Drop "Explore & book" and redundant scroll CTAs. Educational content moves to the
Phase 4 external links. Keep the colour/season branding as smaller accents alongside
the catalog. Preserve the empty-catalog mailto fallback.

## Phase 9 — Email editor (D1)

`app/(admin)/admin/email-templates/email-template-form.tsx` +
`components/ui/body-editor`: hide raw HTML by default; add a live preview pane
rendering via `lib/email/render.ts` with sample data so editing "looks like the
preview". Keep the variables reference and Send-test.

## Phase 10 — Quality pass: responsiveness, density, performance (A11 + old Parts 2–3)

Last, once structure is stable. The booking flow currently "takes a lot of space for
not much data — punishing on mobile."

**Responsiveness/density** — audit every screen at **375px, 768px, 1280px+** (plus
landscape phone for grid-heavy screens); screenshot before/after for everything
changed. Screen inventory and known suspects:

| Screen | File(s) | Known suspects |
|---|---|---|
| Public booking flow | `app/book/booking-flow.tsx`, `booking-flow.module.css` | The big one. Tighten spacing, collapse completed steps. Matrix usability on phone (tap targets, horizontal overflow), sticky/reachable quote summary, time-chip wrapping. |
| Public confirmation | `app/book/confirmation/[id]/page.tsx` | — |
| Home page | `app/page.tsx` | post-Phase-8 shape |
| Admin bookings | Phase 7's split view | verify SplitView phone collapse behaves |
| Admin booking editor | `app/(admin)/admin/bookings/booking-editor.tsx` | matrix + segment reorder + start-time picker on small screens |
| Admin catalog | `app/(admin)/admin/offerings/catalog-client.tsx` | fixed-width columns (`w-14`, `w-20`) truncating on phone; sheets on mobile |
| Admin settings | Phase 4's SubSidebar shell | mobile Select fallback works |
| Admin login | `app/admin/login/` | — |
| Email templates, files | `app/(admin)/admin/email-templates/`, `files/` | lower priority |

Fix targets: no page-body horizontal scroll at 375px (tables/dense rows scroll in
their own container or reflow); tap targets ≥ ~40px with touch-visible alternatives
to hover-only affordances; phone-usable forms/sheets (no fixed widths forcing zoom,
`inputMode` on numeric/money fields); loading states on every async transition (login
button, quote refreshes, calendar loads); consistent spacing/typography across admin.
Prefer composition/overrides in-screen over editing `components/ui/*` primitives.

**Performance:**
- [ ] booking-flow re-render behaviour while typing in matrix/name fields (React
      DevTools profiler); quote/starts requests coalesced/debounced with stale
      out-of-order responses discarded.
- [ ] Bundle: nothing admin-only imported into public pages.
- [ ] Offering images sized/lazy (`next/image` where applicable).
- [ ] Lighthouse (mobile) on `/`, `/book`, confirmation — record before/after scores.

## Definition of done (each phase)

1. `npm test` green (engine phases especially) and `npm run build` passes.
2. Verified in the running app (`/verify` skill), including mobile width for
   user-facing phases.
3. Committed with a clear message; `development` and `main` pushed at the same
   commit (or `development` only if unsure — see ground rules); worktree clean.
4. Checkboxes above updated in this file (commit the doc update too).
5. Any prod "UI TEST" rows deleted and logged.

## Final report

Finish with: phases completed, screens changed (before/after screenshots at three
widths for Phase 10), functional walk results, Lighthouse deltas, prod test rows
created/deleted, and anything found but out of scope (engine bugs, product
questions) listed for Jake.
