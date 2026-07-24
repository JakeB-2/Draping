# Handoff: UI Quality Pass — performance, function, display (mobile / tablet / desktop)

**Repo:** `c:\Users\Jake\Projects\draping` — Next.js 16 + Supabase colour-analysis booking
app (single admin, public booking site). Work on branch `ui-quality-pass` off
`development`. **Never push `main`** — the operator deploys after review.

**State of the codebase:** the per-service participation redesign is COMPLETE and live
in production (migrations 011–014 applied; legacy columns are gone). The booking
engine (`lib/booking-engine/`, DB functions in migrations 011/013/014) is the sole
authority for money, duration, and availability. This pass is about the **UI layer
only** — visual quality, responsiveness, and front-end behaviour.

---

## Read first

1. `AGENTS.md` — this repo runs a Next.js 16 with breaking changes vs. your training
   data; read the relevant guides in `node_modules/next/dist/docs/` before writing app
   code (`params`/`cookies()` are async; `cacheComponents` requires Suspense around
   dynamic data).
2. `docs/booking-participation-final-plan.md` §9.1 — the intended public flow shape
   (multi-entry, bidirectional filtering, open windows). The UI must keep honouring it.
3. The screens themselves (inventory below).

## ⚠ Environment warning — local dev points at PRODUCTION

`.env.local` contains the **production** Supabase project. Anything you submit through
the local app (bookings, catalog edits, publishes) writes real production rows.

- For read-only browsing and layout work this is fine.
- For any flow that WRITES (submitting a booking, revising, catalog edits): either use
  the throwaway Postgres harness (`npm run test:setup` — but note the app itself reads
  Supabase, not that Postgres, so app-level write testing against it isn't wired), or
  create clearly-marked test rows (notes = "UI TEST") and DELETE them before finishing.
  List every production row you created and removed in your final report.
- Port 3000 on this machine is occupied by an unrelated app — run `npx next dev -p 3105`
  (or any free port) and confirm you're on the right app.

Admin login for local testing: `jakekbul@gmail.com` / `jake-password` at `/admin/login`
(temporary credentials; they will be rotated).

---

## Part 1 — Functional checks (do these first)

1. **Availability now returns dates — verify end-to-end.** A production data issue was
   fixed on 2026-07-24: `booking_settings.max_booked_minutes_per_day` and
   `max_consecutive_booking_days` were `0`, which the legacy system meant as "no limit"
   but the new engine reads literally (0 minutes/day, bookings paused) — so the public
   calendar found no dates. Both are now `null`. Walk both public entry paths and
   confirm windows and start times appear (studio timezone America/Toronto; Mon/Tue
   closed; 24 h min lead; 60-day advance window; some offerings restrict start times).
2. **Harden the 0-vs-null semantics in the admin UI** so this can't recur: find the
   admin form(s) that edit booking rules (`app/(admin)/admin/bookings/options/`,
   `rules-actions.ts`, and the settings form) and ensure "no limit" saves `null` —
   never 0 — with the UI making "no limit" an explicit choice. If a legitimate "pause
   bookings" toggle is wanted, it must be deliberate, not a 0 fallback.
3. **Walk the plan's §9.1 behaviours** in a real browser (both entry paths):
   - time-first: window → offerings filter → matrix → quote; matrix change that
     outgrows the chosen window must warn immediately and offer alternatives.
   - service-first: offering → matrix → exact duration/total → valid starts only.
   - clearing a selection widens the other side again.
   - submit into a just-taken slot fails cleanly and re-offers times without losing
     the visitor's selections (simulate by creating a colliding booking in another
     tab via the admin, then submitting — and clean both rows up afterwards).
4. **Admin flows:** create a booking, revise (add attendee, toggle participation,
   insert/move a break, manual adjustment), confirm a failed availability check leaves
   the booking untouched and the error is clearly surfaced. Catalog: edit a service's
   seat price / duration terms, offering override, settings — confirm saves and
   validation messages.
5. Any *engine* bug you find (wrong number, wrong availability): **do not patch
   `lib/booking-engine/` or migrations** — report it for the operator to route.

## Part 2 — Display & responsiveness pass

Audit every screen at minimum three widths — **375px (phone), 768px (tablet),
1280px+ (desktop)** — plus landscape phone if a screen is grid-heavy. Screenshot
before/after for everything you change.

Screen inventory (suspects flagged):

| Screen | File(s) | Known suspects |
|---|---|---|
| Public booking flow | `app/book/booking-flow.tsx` (~1600 lines), `booking-flow.module.css` | The big one. Calendar/window grid, offering cards, attendance matrix, quote panel, confirm step. Check matrix usability on phone (tap targets, horizontal overflow), sticky/reachable quote summary, time-chip wrapping. |
| Public confirmation | `app/book/confirmation/[id]/page.tsx` | — |
| Home page | `app/page.tsx` | links into /book |
| Admin bookings list | `app/(admin)/admin/bookings/page.tsx`, `booking-row.tsx` | row overflow on phone |
| Admin booking detail | `app/(admin)/admin/bookings/[id]/page.tsx` | timeline grid (`sm:grid-cols-[9rem_1fr_auto]`), price breakdown |
| Admin booking editor | `app/(admin)/admin/bookings/booking-editor.tsx` (~550 lines) | matrix + segment reorder + start-time picker on small screens |
| Admin catalog | `app/(admin)/admin/offerings/catalog-client.tsx` (~1000 lines) | dense rows with fixed-width columns (`w-14`, `w-20` etc.) — likely truncation/overflow on phone; sheets on mobile |
| Admin settings | `app/(admin)/admin/settings/settings-form.tsx` | — |
| Admin login | `app/admin/login/` | — |
| Email templates, files | `app/(admin)/admin/email-templates/`, `files/` | lower priority |

What to fix (UI files are yours freely; shared primitives in `components/ui/` are
shadcn-derived — prefer composition/overrides in-screen over editing primitives):

- horizontal overflow / clipped content at 375px; tables and dense rows must scroll
  in their own container or reflow — the page body must never scroll sideways
- tap targets ≥ ~40px on touch; hover-only affordances (e.g. catalog rows reveal
  edit/delete on `group-hover`) need a touch-visible alternative
- form fields and sheets usable on phone (no fixed widths forcing zoom, sane keyboard
  types — `inputMode` on numeric/money fields)
- loading states: every async transition should show progress (no dead buttons);
  check the login button, quote refreshes, calendar loads
- consistent spacing/typography between admin screens; dark mode if styles exist

## Part 3 — Performance pass

- `app/book/booking-flow.tsx` is a single large client component: check re-render
  behaviour while typing in the matrix/name fields (React DevTools profiler), debounce
  of quote/starts requests (every matrix click currently triggers server round-trips —
  verify they're coalesced and stale responses are discarded out-of-order).
- Check bundle impact: anything heavy imported into public pages that belongs
  admin-side only.
- Images: offering images should be sized/lazy (`next/image` where applicable).
- Lighthouse (mobile) on `/`, `/book`, and the confirmation page; note scores
  before/after in the report.

---

## Rules

- Auth check (`requireAdmin`) inside every NEW admin server action you add.
- All money/duration displayed must come from engine responses — never compute
  amounts client-side.
- Do not modify `lib/booking-engine/`, `supabase/migrations/`, or `lib/types/database.ts`.
- Small logical commits on `ui-quality-pass`; `npm test` (needs Docker:
  `npm run test:setup` first) and `npm run build` must pass before finishing.
- Finish with: screens changed (with before/after screenshots at the three widths),
  functional walk results (both public paths + admin editor), Lighthouse deltas,
  production test rows created/deleted, and anything found but out of scope
  (engine bugs, product questions) listed for the operator.
