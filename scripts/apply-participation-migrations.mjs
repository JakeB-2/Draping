// One-shot, gated application of the participation-redesign migrations
// (011 → 014) to a live database. Designed for the production cutover:
//
//   DATABASE_URL="postgres://postgres:<DB-PASSWORD>@db.<ref>.supabase.co:5432/postgres" \
//     node scripts/apply-participation-migrations.mjs
//
// (Connection string: Supabase dashboard → Project Settings → Database.)
//
// What it does, in order — each step is skipped automatically if the
// database already has it:
//   1. 011 participation schema + engine     (additive)
//   2. 012 legacy booking backfill           (additive)
//   3. Reconciliation gate: recomputed totals/durations must match the
//      frozen booking values EXACTLY. Any discrepancy aborts. Anomalies
//      (bookings needing manual resolution) also abort unless
//      --allow-anomalies is passed after you have reviewed them.
//   4. 013 retire legacy columns             (DESTRUCTIVE — gated above)
//   5. 014 expected-quote check on create
//
// Safe to re-run: every step probes the schema before applying.
// Pass --dry-run to only report which steps would run.

import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dryRun = process.argv.includes('--dry-run')
const allowAnomalies = process.argv.includes('--allow-anomalies')

if (!process.env.DATABASE_URL) {
  console.error('✗ Set DATABASE_URL to the target database connection string.')
  console.error('  Supabase dashboard → Project Settings → Database → Connection string (URI).')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
    ? undefined
    : { rejectUnauthorized: false },
})

const sql = (file) => fs.readFileSync(path.join(root, 'supabase', 'migrations', file), 'utf8')

async function columnExists(table, column) {
  const r = await client.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [table, column],
  )
  return r.rowCount > 0
}

async function tableExists(table) {
  const r = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'public' and table_name = $1`,
    [table],
  )
  return r.rowCount > 0
}

async function apply(label, file) {
  if (dryRun) { console.log(`WOULD apply ${label}`); return }
  process.stdout.write(`→ applying ${label} ... `)
  await client.query('begin')
  try {
    await client.query(sql(file))
    await client.query('commit')
    console.log('ok')
  } catch (error) {
    await client.query('rollback')
    console.log('FAILED (rolled back)')
    throw error
  }
}

async function reconcile() {
  const money = await client.query(`
    select b.id, b.subtotal_amount,
           round(coalesce(b.base_package_amount, 0)
             + coalesce((select sum(s.addon_amount) from booking_segments s where s.booking_id = b.id), 0)
             + coalesce((select sum(a.amount) from booking_adjustments a where a.booking_id = b.id), 0), 2)
             as recomputed
    from bookings b
    where exists (select 1 from booking_segments s where s.booking_id = b.id)
  `)
  const duration = await client.query(`
    select b.id, b.duration_minutes,
           (select coalesce(sum(s.duration_minutes), 0) from booking_segments s where s.booking_id = b.id)
             as seg_minutes
    from bookings b
    where exists (select 1 from booking_segments s where s.booking_id = b.id)
  `)
  const anomalies = (await tableExists('legacy_backfill_anomalies'))
    ? (await client.query(
        `select booking_id, reason, details from legacy_backfill_anomalies order by created_at`,
      )).rows
    : []
  const anomalousIds = new Set(anomalies.map((a) => a.booking_id))
  const unbackfilled = await client.query(`
    select b.id, b.status from bookings b
    where not exists (select 1 from booking_participants p where p.booking_id = b.id)
       or not exists (select 1 from booking_segments s where s.booking_id = b.id)
  `)

  const moneyBad = money.rows.filter((r) => Number(r.recomputed) !== Number(r.subtotal_amount))
  const durationBad = duration.rows.filter((r) => Number(r.seg_minutes) !== Number(r.duration_minutes))
  const unbackfilledBad = unbackfilled.rows.filter((r) => !anomalousIds.has(r.id))

  console.log(`Reconciliation: ${money.rows.length} backfilled booking(s) checked`)
  for (const r of moneyBad) console.log(`  ✗ money    ${r.id}: ${r.subtotal_amount} vs ${r.recomputed}`)
  for (const r of durationBad) console.log(`  ✗ duration ${r.id}: ${r.duration_minutes} vs ${r.seg_minutes}`)
  for (const r of unbackfilledBad) console.log(`  ✗ unbackfilled ${r.id} (${r.status})`)
  for (const a of anomalies) console.log(`  ⚠ anomaly  ${a.booking_id}: ${a.reason} ${JSON.stringify(a.details)}`)

  if (moneyBad.length + durationBad.length + unbackfilledBad.length > 0) {
    throw new Error('Reconciliation discrepancies found — NOT proceeding to the destructive step.')
  }
  if (anomalies.length > 0 && !allowAnomalies) {
    throw new Error(
      `${anomalies.length} booking(s) need manual resolution (see above). ` +
      'Resolve them, or re-run with --allow-anomalies to retire the legacy columns anyway ' +
      '(anomalous bookings keep their booking-level totals but lose legacy client links).',
    )
  }
  console.log('✓ reconciliation clean')
}

async function main() {
  await client.connect()

  const has011 = await tableExists('service_duration_terms')
  const has012 = await tableExists('legacy_backfill_anomalies')
  const has013 = !(await tableExists('booking_clients')) && !(await columnExists('bookings', 'price_amount'))
  const has014 = has011 && (await client.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'booking_engine_create'
       and pg_get_functiondef(p.oid) like '%expected_quote%'`,
  )).rowCount > 0

  console.log(`state: 011=${has011 ? 'applied' : 'pending'} 012=${has012 ? 'applied' : 'pending'} 013=${has013 ? 'applied' : 'pending'} 014=${has014 ? 'applied' : 'pending'}`)

  if (!has011) await apply('011 participation schema + engine', '011_participation_redesign.sql')
  if (!has012) await apply('012 legacy backfill', '012_legacy_participation_backfill.sql')

  if (!has013) {
    if (dryRun) {
      console.log('WOULD run reconciliation gate, then 013 retirement')
    } else {
      await reconcile()
      await apply('013 retire legacy columns (destructive)', '013_retire_legacy_booking_columns.sql')
    }
  }
  if (!has014) await apply('014 expected-quote check', '014_create_expected_quote_check.sql')

  if (!dryRun) {
    const counts = await client.query(`
      select
        (select count(*) from bookings) as bookings,
        (select count(*) from booking_participants) as participants,
        (select count(*) from booking_segments) as segments,
        (select count(*) from booking_adjustments) as adjustments,
        (select count(*) from service_duration_terms) as duration_terms
    `)
    console.log('✓ done:', JSON.stringify(counts.rows[0]))
    console.log('Next: in the admin catalog, set each service\'s seat price and review 2-person duration terms.')
  }
}

main()
  .catch((error) => {
    console.error('✗', error.message)
    process.exitCode = 1
  })
  .finally(() => client.end())
