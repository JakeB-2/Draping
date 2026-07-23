# Deferred code review findings

Status: deferred; no fixes applied  
Review performed: 2026-07-20  
Saved: 2026-07-22  
Reviewed branch: `development`

This document preserves the findings from a maximum-depth, read-only review so they can survive unrelated application and schema work. Some database findings may be superseded by later migrations; revalidate them against both the repository migrations and the live Supabase configuration before closing them.

## Validation snapshot

- `npx tsc --noEmit --incremental false`: passed.
- `npm run build`: passed.
- `npm run lint`: failed with 6 errors and 6 warnings.
- `npm audit --json`: 14 advisories (4 high, 9 moderate, 1 low) at review time.
- No unit, integration, accessibility, or end-to-end tests were found.
- No CI workflow or test script was found.
- An anonymous production-mode smoke request received `200 OK` from `/admin/bookings`.
- Runtime responses lacked standard security headers and exposed `X-Powered-By: Next.js`.
- The worktree was clean after review; no fixes were made.

## Critical

### 1. Admin and database security boundaries are disabled

Admin authentication is commented out in `proxy.ts:26-41` and `app/(admin)/admin/layout.tsx:7-10`. Every admin Server Action is independently callable and none revalidates authentication or authorization; for example, `app/(admin)/admin/bookings/actions.ts:11-17` begins directly with a database client.

The repository contains no RLS policies. `supabase/migrations/001_additions.sql:14-15` explicitly says RLS was deferred. With normal Supabase grants, the public anon key may consequently access tables directly through PostgREST, bypassing Next.js.

Impact includes unauthorized access to customer PII, bookings, private files, email templates, schedules, settings, and all admin mutations.

Even the commented intended check only verifies that a Supabase user exists. There is no admin role or allowlist, while `supabase/schema.sql:197-215` mirrors every new auth user. Restoring the commented code would authenticate users but would not establish meaningful authorization.

## High

### 2. Concurrent requests can double-book a slot

`app/book/actions.ts:310-345` verifies availability and then performs a separate insert. Two requests can both pass before either insert commits. `supabase/schema.sql:157-178` has no transaction-backed booking function, advisory lock, unique slot rule, or exclusion constraint.

The same race can bypass daily, weekly, and consecutive-day limits. Reopening or confirming a booking also performs no collision check.

### 3. Public submissions can overwrite an existing customer's identity

`app/book/actions.ts:247-265` looks up a client by email and overwrites that shared record's name and phone number. Anyone knowing a victim's email can alter the identity shown on the victim's historical and future bookings.

### 4. Customers can submit under terms different from those displayed

The catalog renders the published snapshot (`app/page.tsx:140-142`), but availability and submission fetch the live draft offering (`app/book/actions.ts:85-95` and `287-305`). An unpublished admin edit can silently change the price stored on the booking, duration, guest count, buffer, allowed start times, or whether the published offering remains bookable.

The publisher omits buffer and allowed-start-time fields from its snapshot (`app/(admin)/admin/offerings/actions.ts:284-326`), so the published object cannot be the authoritative booking contract.

### 5. Public booking can be automated for email and database abuse

`app/book/actions.ts:283-376` is unauthenticated, uses the service-role client, creates database records, and sends email. There is no rate limit, CAPTCHA, abuse detection, idempotency key, or email verification.

An automated caller can exhaust email quotas, send unsolicited email, fill database tables, reserve all slots as pending, and repeatedly invoke expensive availability queries.

### 6. The pinned Next.js version has applicable high-severity advisories

`package.json:22` pins Next.js 16.2.4. The audit performed on 2026-07-20 reported proxy bypass, Cache/Server Components denial-of-service, and SSRF advisories. The audit identified 16.2.10 as a non-major patched version. Re-run the audit before acting because advisory state and patched versions change.

## Medium

### 7. Public confirmation pages expose customer information by booking ID

`app/book/confirmation/[id]/page.tsx:30-95` uses the service-role client and authorizes solely with the booking UUID. It displays the customer's first name, email, appointment, service, price, and tax. UUID entropy makes blind enumeration difficult, but the ID is displayed, emailed, and stored in browser history as the URL bearer credential.

The page always claims the request is pending even after confirmation, cancellation, or completion.

### 8. Multi-step writes are non-transactional

- Client rows are inserted or updated before booking creation; later failures do not roll them back (`app/book/actions.ts:318-361`).
- Offering creation inserts the offering before its services (`app/(admin)/admin/offerings/actions.ts:215-223`).
- Offering updates delete all service links before inserting replacements (`app/(admin)/admin/offerings/actions.ts:149-156`, `247-254`).
- Publishing deactivates the active snapshot before inserting its replacement; insert failure leaves no active catalog (`app/(admin)/admin/offerings/actions.ts:338-351`).
- Template attachment upload does not remove the storage object if its database insert fails (`app/(admin)/admin/email-templates/actions.ts:59-73`).

### 9. Admin scheduling uses inconsistent and ambiguous timezones

The public flow uses the studio timezone, while admin pages format dates using the server or browser default:

- `app/(admin)/admin/bookings/[id]/page.tsx:10-14`
- `app/(admin)/admin/bookings/booking-row.tsx:54-55`
- `app/(admin)/admin/bookings/one-off-section.tsx:19-20`

The Docker image does not configure `TZ`, so server-rendered details normally use UTC while client-rendered lists use the administrator's timezone.

Time-off forms submit timezone-less `datetime-local` strings directly to `timestamptz` columns (`app/(admin)/admin/bookings/one-off-actions.ts:17-27`), leaving PostgreSQL to interpret them using its session timezone. Settings validation accepts any nonempty timezone string (`app/(admin)/admin/settings/actions.ts:17`).

### 10. Authentication callbacks contain an open redirect

`app/auth/callback/route.ts:5-12` and `app/auth/confirm/route.ts:5-14` concatenate the request origin with an unvalidated `next` value. For example, `next=@evil.test/path` produces `https://legitimate-host@evil.test/path`, whose actual host is `evil.test`.

### 11. Email substitution and preview permit HTML injection

`lib/email/render.ts:5-9` inserts user-controlled values directly into HTML without context-sensitive escaping. Client names and booking notes can inject markup, links, or tracking resources into transactional email and configured CC/BCC recipients.

The admin preview separately renders template HTML using `dangerouslySetInnerHTML` at `components/ui/body-editor.tsx:311-316`, permitting stored dangerous links and event-handler content in the admin origin.

### 12. Booking transitions are replayable and do not enforce lifecycle state

`app/(admin)/admin/bookings/actions.ts:11-30` updates any booking ID without checking current status. Repeated confirmation calls can resend email, completed or cancelled bookings can be confirmed through direct action calls, and invalid IDs can be reported as successful because zero-row updates are not distinguished from successful updates.

### 13. Upload and mutation validation is incomplete

Document and attachment uploads read the whole file into memory and trust browser-supplied filename, extension, and MIME type:

- `app/(admin)/admin/files/actions.ts:14-31`
- `app/(admin)/admin/email-templates/actions.ts:47-72`

There is no application-level size or type allowlist. `deleteTemplateAttachment` accepts an independent database ID and storage path (`app/(admin)/admin/email-templates/actions.ts:78-96`), allowing mismatched object deletion.

Email-template input and trigger patches are spread into database updates without runtime schemas. The attachment UI also appends a fake random database ID and empty storage path after upload (`app/(admin)/admin/email-templates/email-template-form.tsx:150-159`), so immediate deletion cannot target the actual object.

### 14. Database integrity depends too heavily on application code

Repository schema gaps include:

- No booking-overlap exclusion constraint.
- No `starts_at < ends_at` check for bookings or blocked periods.
- No singleton constraint for `booking_settings`.
- No weekday range check for `weekly_schedule`.
- No element-range constraint for recurring weekdays.

Settings writes use select-then-update/insert (`app/(admin)/admin/settings/actions.ts:38-43` and the equivalent rules action). Concurrent first-time writes can create multiple settings rows, after which reads select an arbitrary row.

### 15. Database access and admin usability degrade with data growth

The availability query filters bookings by status and time (`app/book/actions.ts:131-137`), but the repository schema provides no supporting status/time indexes. Every availability calculation also loads every blocked period without a date filter (`app/book/actions.ts:90`).

The booking list is limited to the newest 100 records with no pagination or search (`app/(admin)/admin/bookings/page.tsx:29-40`), making older records effectively inaccessible through the UI.

The homepage calls `connection()` and performs an uncached service-role settings query on each request (`app/page.tsx:50-55`, `lib/public-settings.ts:13-19`), which produced `private, no-store` runtime responses and limits CDN usefulness.

### 16. Email failures can be silent

`lib/email/triggers.ts:19-59` ignores errors from trigger, template, attachment-query, and attachment-download operations. Database or storage failures can look like an intentionally disabled trigger.

Admin confirmation catches and logs email failures but still returns success (`app/(admin)/admin/bookings/actions.ts:20-30`). Cancellation email remains explicitly unfinished (`app/(admin)/admin/bookings/actions.ts:33-35`) despite a seeded cancellation trigger.

### 17. Standard HTTP security headers are absent

`next.config.ts` configures no CSP, frame restrictions, content-type protection, referrer policy, or permissions policy. Runtime responses expose `X-Powered-By: Next.js`. This leaves the admin open to clickjacking and removes defense in depth around raw HTML preview and uploaded content.

### 18. Accessibility issues are systemic in the public flow

- Several tiny labels use 38-48% opacity. For example, white at 38% over `#1e211d` is approximately 3.5:1 while rendered at `0.55rem` (`app/globals.css:688-689`), below WCAG AA for normal text.
- Dark-on-light labels also use 36-45% opacity (`app/globals.css:639-645`).
- Group-size choices expose selection only through `data-selected`, not `aria-pressed` (`app/book/booking-flow.tsx:340-346`).
- Time-slot buttons likewise lack a programmatic selected state (`app/book/booking-flow.tsx:620-629`).
- Image `alt_text` is fetched while publishing but discarded; public offering images use the offering name as a generic ARIA label (`app/(admin)/admin/offerings/actions.ts:293-314`, `app/book/booking-flow.tsx:432-438`).

### 19. Production dependency placement increases audit and supply-chain noise

`shadcn` is a development CLI but is declared under production dependencies (`package.json:31`). It pulls MCP, Hono, Express, Babel, and related packages into production dependency installation.

At review time, the audit also reported a high advisory in `ws` through Supabase and a moderate chain through `resend`/`svix`/`uuid`. Recheck reachability and current versions when dependency work is scheduled.

### 20. Migration scripts disable TLS certificate verification

Both `scripts/apply-migration.mjs:46-53` and `scripts/find-region.mjs:25-29` use `ssl: { rejectUnauthorized: false }`. A network attacker could intercept database credentials or alter migration traffic.

## Quality and release readiness

### Lint failures

Active-source lint errors were reported at:

- `app/(admin)/admin/offerings/catalog-client.tsx:310`
- `app/(admin)/admin/offerings/catalog-client.tsx:753`
- `app/admin/login/login-form.tsx:25`
- `hooks/use-mobile.ts:12`

`_legacy` is excluded from TypeScript but not ESLint, so obsolete code adds two more lint errors and several warnings. The production build passes because lint is not part of that build gate.

### Missing verification infrastructure

- No test files or test script.
- No CI workflow.
- No automated booking-concurrency coverage.
- No authorization/RLS policy tests.
- No accessibility automation.
- No email-rendering safety tests.
- No migration consistency verification.

### Other deferred product/operations gaps

- `package.json:8` uses `next start` while `next.config.ts:5` enables standalone output. It currently warns; Docker correctly runs `node server.js`.
- Image tables and snapshot support exist, but no current admin write path for `images` or `offering_images` was found.
- The tracked `_legacy` tree materially increases repository and lint noise.

## Suggested revalidation order after schema work

This is not an implementation plan; it is an order for reassessing whether findings still apply.

1. Re-read every migration and inspect the live database for RLS policies, grants, constraints, functions, triggers, and indexes.
2. Re-test anonymous access to admin pages, Server Actions, Supabase REST, and Storage.
3. Run concurrent submission tests against one slot and against daily/weekly caps.
4. Verify the published snapshot is the authoritative source for every customer-visible and booking-frozen field.
5. Exercise client deduplication with an existing email and confirm historical records cannot be mutated.
6. Test studio-timezone rendering and time-off entry from browsers in multiple timezones and across DST changes.
7. Re-run typecheck, lint, production build, dependency audit, and any tests added in the meantime.
8. Repeat accessibility and response-header checks on the deployed production path.

## Release blockers retained from the review

Before a production release, explicitly resolve or accept the risk for:

1. Admin authentication, authorization, RLS, grants, and Storage policies.
2. Atomic double-booking prevention at the database boundary.
3. Existing-client identity overwrite through public submission.
4. Published-versus-live offering inconsistency.
5. Public booking and email abuse controls.
6. Applicable Next.js/runtime dependency advisories.

