# DNA My Colours

Public catalog and booking-request flow for DNA My Colours, with a small authenticated admin for services, offerings, availability rules, bookings, and email templates.

## Local development

Copy `.env.example` to `.env.local` and fill in the Supabase and Resend values, then run:

```bash
npm install
npm run dev
```

The site is available at `http://localhost:3000`; admin is at `/admin`.

## Docker development

Docker runs only the Next.js application. Supabase and Resend remain hosted services.

```bash
powershell -ExecutionPolicy Bypass -File scripts/docker-dev.ps1
```

The launcher reads valid variables from `.env.local` while ignoring the legacy database-password line used only by the migration runner. Source files are mounted into the container and hot reload is enabled. Docker defaults to `http://localhost:3001` so it can coexist with another app on port 3000. Override it with `APP_PORT`, for example `$env:APP_PORT=3002` before running the launcher.

## Production image

The Dockerfile includes a minimal standalone production target:

```bash
docker build --target runner \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -t dna-my-colours .
```

Supply `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, and the two public Supabase variables at runtime.

## Database migrations

Apply migrations in `supabase/migrations` in numeric order. Migration `007_booking_requested_trigger.sql` adds the separate **Request Submitted** email trigger. Link an email template to it under Admin → Email; the existing **Booking Confirm** trigger fires only when a pending request is confirmed in the admin.
