// Phase D reconciliation report (plan §8.7). Compares every booking's
// frozen booking-level truth against its participation rows:
//
//   money:    base_package_amount + Σ segment addon_amounts
//             + Σ adjustment amounts  ==  subtotal_amount
//   duration: Σ segment duration_minutes ==  duration_minutes
//   links:    every legacy booking_clients row still has a
//             booking_participants row with the same client_id
//             (skipped automatically once booking_clients is retired)
//
// Bookings recorded in legacy_backfill_anomalies are listed for manual
// resolution and excluded from the pass/fail discrepancy count.
//
// Usage: node scripts/reconcile-legacy-backfill.mjs
//   DATABASE_URL overrides the default test-database connection.
// Exit code 0 = zero discrepancies; 1 = discrepancies found.

import pg from 'pg'

const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/postgres',
})

async function tableExists(name) {
  const res = await client.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1`,
    [name],
  )
  return res.rowCount > 0
}

async function main() {
  await client.connect()

  const anomalies = (await tableExists('legacy_backfill_anomalies'))
    ? (await client.query(
        `select booking_id, reason, details from legacy_backfill_anomalies order by created_at`,
      )).rows
    : []
  const anomalousIds = new Set(anomalies.map((a) => a.booking_id))

  const money = await client.query(`
    select b.id, b.subtotal_amount,
           round(coalesce(b.base_package_amount, 0)
             + coalesce((select sum(s.addon_amount) from booking_segments s where s.booking_id = b.id), 0)
             + coalesce((select sum(a.amount) from booking_adjustments a where a.booking_id = b.id), 0), 2)
             as recomputed_subtotal
    from bookings b
    where exists (select 1 from booking_segments s where s.booking_id = b.id)
  `)
  const duration = await client.query(`
    select b.id, b.duration_minutes,
           (select coalesce(sum(s.duration_minutes), 0) from booking_segments s where s.booking_id = b.id)
             as segments_duration
    from bookings b
    where exists (select 1 from booking_segments s where s.booking_id = b.id)
  `)
  const unbackfilled = await client.query(`
    select b.id, b.status from bookings b
    where not exists (select 1 from booking_participants p where p.booking_id = b.id)
       or not exists (select 1 from booking_segments s where s.booking_id = b.id)
  `)
  const links = (await tableExists('booking_clients'))
    ? (await client.query(`
        select bc.booking_id, bc.client_id from booking_clients bc
        where not exists (
          select 1 from booking_participants p
          where p.booking_id = bc.booking_id and p.client_id = bc.client_id
        )
      `)).rows
    : []

  const moneyBad = money.rows.filter(
    (r) => Number(r.recomputed_subtotal) !== Number(r.subtotal_amount) && !anomalousIds.has(r.id),
  )
  const durationBad = duration.rows.filter(
    (r) => Number(r.segments_duration) !== Number(r.duration_minutes) && !anomalousIds.has(r.id),
  )
  const unbackfilledBad = unbackfilled.rows.filter((r) => !anomalousIds.has(r.id))
  const linksBad = links.filter((r) => !anomalousIds.has(r.booking_id))

  console.log(`Bookings with segments checked: ${money.rows.length}`)
  console.log(`Money discrepancies:            ${moneyBad.length}`)
  for (const r of moneyBad) {
    console.log(`  ✗ ${r.id}: subtotal ${r.subtotal_amount} vs recomputed ${r.recomputed_subtotal}`)
  }
  console.log(`Duration discrepancies:         ${durationBad.length}`)
  for (const r of durationBad) {
    console.log(`  ✗ ${r.id}: duration ${r.duration_minutes} vs segments ${r.segments_duration}`)
  }
  console.log(`Unbackfilled (non-anomaly):     ${unbackfilledBad.length}`)
  for (const r of unbackfilledBad) console.log(`  ✗ ${r.id} (${r.status})`)
  console.log(`Lost client links:              ${linksBad.length}`)
  for (const r of linksBad) console.log(`  ✗ booking ${r.booking_id} client ${r.client_id}`)

  console.log(`Anomalies for manual resolution: ${anomalies.length}`)
  for (const a of anomalies) {
    console.log(`  ⚠ ${a.booking_id}: ${a.reason} ${JSON.stringify(a.details)}`)
  }

  const failed =
    moneyBad.length + durationBad.length + unbackfilledBad.length + linksBad.length > 0
  console.log(failed ? '✗ RECONCILIATION FAILED' : '✓ Reconciliation clean')
  process.exitCode = failed ? 1 : 0
}

main()
  .catch((error) => {
    console.error('✗', error.message)
    process.exitCode = 1
  })
  .finally(() => client.end())
