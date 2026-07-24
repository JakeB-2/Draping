# UI feedback triage — 2026-07-24

Raw feedback from Jake's review pass, triaged against the current code. Each item has
current state, proposed change, and rough size. Open questions at the bottom must be
answered before the flagged items start.

Themes, in priority order per the feedback: **the landing page is a booking tool** —
catalog + booking front and centre, everything educational pushed to external links;
the booking flow itself needs to get denser, more guided, and mobile-friendly.

---

## A. Booking flow (`app/book/booking-flow.tsx`)

### A1. Replace the date/time picker with the protec-portal calendar
- **Now:** dates are a native `<input type="date">` From/To pair plus a grouped list of
  window buttons (`WindowStep`, booking-flow.tsx:583).
- **Change:** use the calendar already in this repo — `components/ui/calendar.tsx`
  exists and `react-day-picker` 9.14 + `date-fns` are already installed (same stack as
  protec-portal); the booking flow just never adopted it. Reconcile against
  protec-portal's version if it has diverged. Days with open windows become
  selectable; others disabled.
- **Also (A6):** keep the current **list view** and add the **calendar view** as a user
  toggle.
- **Size:** M — no new deps; availability-day mapping + flow integration.

### A2. Min lead time in days, not hours
- **Now:** `min_lead_hours` in `booking_rules`, edited in
  `app/(admin)/admin/bookings/options/rules-form.tsx:32`, applied in
  `lib/booking-engine/availability-core.ts:225`.
- **Change:** surface as **days** in admin UI. Simplest: keep the column, store
  `days * 24`; or migrate to `min_lead_days`. Recommend UI-only conversion first
  (no migration risk), rename later if it bothers us.
- **Size:** S.

### A3. Re-apply break logic, admin-configurable — RESOLVED (Q1)
- **Now:** engine supports `kind: 'break'` segments (`lib/booking-engine/engine.ts:52`)
  but the public flow never emits one — `app/book/actions.ts:491` hardcodes
  `booking_includes_break: 'No'`. Break is effectively dropped.
- **Rule (from Jake, 2026-07-24):** a break is inserted **iff the booking contains more
  than one performance of a "requires all attendees" service** — in practice, >1
  attendee doing core analysis. One attendee, however long, gets no break. (Lisa's
  underlying reason is total duration beyond ~X hours, but her real behaviour reduces
  to this multi-core-analysis rule, so encode that.)
- **Break duration:** admin-editable setting (`break_minutes` on `booking_settings` or
  `booking_rules`), surfaced under the "Booking options" settings section (C2).
- **Placement is irrelevant** — the break only needs to extend the booking's total
  duration; how the time is spent is out of scope.
- **Deferred alternative (parked):** move away from live-built bookings to preformed
  offerings, generated via a protec-portal-style wizard (Pattern 9,
  `components/screens/wizard.tsx` + steps, cf. `/offerings/price-list/new`). Revisit
  only if the simple rule proves insufficient.
- **Size:** M. Touches quote/create segment payloads, availability fit, email vars.

### A4. "Requires all attendees" flag on services — RESOLVED (Q2)
- **Now:** attendance matrix (`MatrixStep`, booking-flow.tsx:728) lets each service be
  assigned independently ("You" / name / "Both").
- **Change:** add a boolean column on **services** (suggested name:
  `requires_all_attendees`), editable on the services/offerings admin tab. When a
  selected offering includes such a service, the matrix locks that row to all
  attendees. Only core analysis will have it set initially. This flag is also what A3
  counts to decide the break (occurrences = attendee count on that service when >1).
- **Size:** M (migration + admin field + matrix lock + engine passthrough).

### A5. Auto-advance / scroll on selection
- **Now:** picking an offering just reveals the next step inline; user must scroll.
  Only `selectMode` scrolls (booking-flow.tsx:248).
- **Change:** on each committed choice (offering, date, time), `scrollIntoView` +
  focus the next actionable section.
- **Size:** S.

### A6. List/calendar toggle — folded into A1.

### A7. Hide other dates once one is selected
- **Now:** the full window list stays rendered after selection.
- **Change:** collapse to the chosen date + a visible "Clear selection" action.
- **Size:** S.

### A8. Configurable alert text on the live server quote card
- **Now:** `QuoteCard` (booking-flow.tsx:1046) is purely computed figures.
- **Change:** new setting (e.g. `quote_notice_text`); when non-empty, render as a
  notice inside the quote card.
- **Size:** S.

### A9. Offering-specific warnings at "One last look"
- **Now:** `ConfirmationStep` (booking-flow.tsx:971) has no per-offering notices.
- **Change:** add a warning/notes field to offerings (admin-editable, per offering,
  e.g. "wear no makeup"); show all applicable warnings at confirmation.
- **Size:** S–M (offerings column + admin field + display).

### A10. De-duplicate the confirmation summary
- **Now:** `finalReview` grid (booking-flow.tsx:1030) repeats what the quote card shows.
- **Change:** drop the summary-below-inputs; the live server quote is the single
  source of truth on screen.
- **Size:** S.

### A11. Density / mobile pass
- Whole flow "takes a lot of space for not much data — punishing for mobile."
  Tighten spacing, collapse completed steps, audit at 375 px. Do this **last**, after
  the structural items above, so it's done once.
- **Size:** M.

## B. Landing page (`app/page.tsx`)

### B1. Catalog-first restructure (the big one)
- **Now:** hero → "The experience" season wheel → embedded `BookingFlow` → about-Lisa
  → footer. Redundant CTAs ("Explore & book" :72, "Find your session", "See how it
  works") that all just scroll.
- **Change:** the page is a **booking tool**. Top of page = a **service catalog**:
  cards with descriptions and a "Book now" per service (pre-selecting that offering in
  the flow), merged with the "I know what I want" fast path — same data, one surface.
  Smaller cards/icons sit alongside the colour branding. Drop "Explore & book" and the
  redundant scroll buttons. Educational content (draping generally, Lisa, Chrysalis)
  moves off-page to external links (B2).
- **Size:** L. This is the headline piece of the pass.

### B2. External links become settings
- **Now:** hardcoded — "Read Lisa's story" → chrysaliscolour.com (app/page.tsx:176),
  Facebook (:68), "The experience" is an on-page section (:114).
- **Change:** new settings: `about_url` (Lisa/Chrysalis), `facebook_url`,
  `experience_url` ("The Experience" nav item becomes an external link). Group all
  external references under **one nav tab** (e.g. "Links" / "About"), fully
  admin-configurable.
- **Size:** S–M (settings columns + form + page wiring).

## C. Admin

### C1. "Go to client page" from admin
- **Now:** nothing in admin links to the public site (checked bookings list, detail,
  header).
- **Change:** add a "View client site" action in the admin layout header
  (`app/(admin)/admin/layout.tsx`) opening `/` (target _blank).
- **Size:** XS.

### C2. Adopt the protec-portal settings shell — SUPERSEDES the old C2
- **Now:** settings are spread across `/admin/settings`, `/admin/booking-options`,
  and `/admin/bookings/options` — that spread is why Jake couldn't find the tax field.
- **Change:** port protec-portal's settings layout: a single settings area with a
  left sidebar of sections (icons), content on the right. Source components:
  `components/screens/sub-sidebar.tsx` (`SubSidebarLayout` — sticky w-52 grouped
  nav, collapses to a Select on mobile). Sections here: Studio, Timezone, Tax,
  Participation, **Booking options** (lead time in days per A2, caps, break minutes
  per A3), Links (B2), Email.
- **Size:** M–L (screens-layer port + settings reorg + rules-form merge).

### C3. Tax input
- **Status: already exists** — `tax_rate_percent` (settings-form.tsx:79), rendered in
  the quote. Root cause was discoverability; C2 fixes it. Confirmed not a different
  tax concept.

### C4. Adopt the protec-portal split-view resource pattern for admin
- **Change (from Jake, 2026-07-24):** admin simplifies toward protec-portal's
  "Pattern 1B" — left data table for the resource being viewed, right-hand section
  stack for the selected item, selection in the URL (`?selected=<id>`). Source
  components in protec-portal: `components/screens/split-view.tsx`,
  `components/screens/row-list.tsx` (`SectionStack`/`RowList` family),
  `components/tables/DataTable.tsx`, `detail-pane-header.tsx`, `detail.tsx`.
  Draping already matches the stack (Next 16, Tailwind v4, shadcn, same `ui/*`
  primitives) — the port is the `components/screens` + `components/tables` layer.
  First consumers: bookings list, offerings.
- **Size:** L. Do the port once (see E1), then migrate admin pages onto it.

## D. Email

### D1. Friendlier body editor
- **Now:** `components/ui/body-editor` + variables list; no live preview — only a
  "Send test" (email-template-form.tsx:119).
- **Change:** hide raw HTML from the default view; either a WYSIWYG-light editor or a
  side-by-side live preview using the existing `lib/email/render.ts` with sample data,
  so the editor "looks like the preview."
- **Size:** M.

---

## E. Cross-project component sharing (strategy)

### E1. Port the protec-portal "screens" layer into draping
- Draping and protec-portal already share the foundation: Next 16, React 19.2.4,
  Tailwind v4, shadcn `components/ui/*` (largely the same files), `react-day-picker`
  9.14, `date-fns`, lucide, sonner. The missing layer is protec-portal's
  `components/screens/*` (SubSidebarLayout, SplitView, SectionStack/RowList,
  DetailShell, wizard chrome) + `components/tables/DataTable.tsx`.
- **Approach for now: copy, don't package.** Treat protec-portal as the design-system
  source of truth and vendor the screens/tables layer into draping, adapting the
  capability-gating/tier bits it doesn't need. A shared npm package or monorepo is
  premature at two projects / one dev; revisit when a third project boots or the copies
  drift painfully. This makes booting future projects a copy of `ui/*` + `screens/*`.

## Open questions

All previously open questions resolved 2026-07-24:
- **Q1 → A3:** break iff >1 core-analysis performance in the booking; admin-set
  duration; placement irrelevant, only extends total duration.
- **Q2 → A4:** `requires_all_attendees` boolean on services.
- **Q3 → B1:** yes — catalog cards pre-select the offering in the flow.

## Suggested sequencing

1. **Quick wins:** C1, A2, A7, A10, A5, A8 (all S/XS, no schema surprises)
2. **Screens-layer port:** E1 (unlocks C2, C4, and the wizard pattern if ever needed)
3. **Settings consolidation:** C2 shell + B2 links + A8's setting in one migration
4. **Calendar picker:** A1/A6 (component already in repo)
5. **Business logic:** A4 flag, then A3 break rule on top of it
6. **Admin split-view migration:** C4 (bookings, offerings)
7. **Landing restructure:** B1
8. **Email editor:** D1
9. **Density/mobile pass:** A11 last
