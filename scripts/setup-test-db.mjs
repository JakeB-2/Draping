// Booking-engine test database. Spins up a throwaway Postgres in Docker,
// applies supabase/schema.sql + every migration in order, and (by default)
// loads tests/fixtures/legacy-seed.sql BEFORE migration 011 so the
// participation redesign is exercised against a database that already
// holds legacy-shaped data — mirroring the real upgrade path.
//
// Usage:
//   node scripts/setup-test-db.mjs           # legacy seed, then 011
//   node scripts/setup-test-db.mjs --fresh   # no seed (clean-install path)
//
// Connection (used by `npm test`):
//   postgres://postgres:postgres@127.0.0.1:55432/postgres

import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const CONTAINER = 'draping-test-pg'
const PORT = Number(process.env.TEST_PG_PORT ?? 55432)
const fresh = process.argv.includes('--fresh')

// Supabase-managed schemas that supabase/schema.sql references. Minimal
// stubs — enough for the DDL and triggers to apply on plain Postgres.
const STUBS = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id    uuid primary key,
    email text
  );
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id                 text primary key,
    name               text,
    public             boolean,
    file_size_limit    bigint,
    allowed_mime_types text[]
  );
`

function sh(cmd) {
  execSync(cmd, { stdio: 'pipe' })
}

async function connectWithRetry() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new pg.Client({
      host: '127.0.0.1',
      port: PORT,
      user: 'postgres',
      password: 'postgres',
      database: 'postgres',
    })
    try {
      await client.connect()
      await client.query('select 1')
      return client
    } catch {
      await client.end().catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw new Error('Test Postgres did not become ready in time')
}

async function apply(client, label, sql) {
  process.stdout.write(`→ ${label} ... `)
  await client.query(sql)
  console.log('ok')
}

async function main() {
  console.log(`→ recreating container ${CONTAINER} on port ${PORT}`)
  try { sh(`docker rm -f ${CONTAINER}`) } catch { /* not running */ }
  sh(`docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=postgres -p ${PORT}:5432 postgres:17`)

  const client = await connectWithRetry()
  try {
    await apply(client, 'stub auth/storage schemas', STUBS)
    await apply(client, 'supabase/schema.sql',
      fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8'))

    // supabase/schema.sql is a snapshot that already contains the outcome
    // of 004 (add max_bookings_per_day) + 006 (rename it) — replaying them
    // on top of the snapshot fails, so the baseline skips them.
    const FOLDED_INTO_SCHEMA = ['004', '006']
    const migrationDir = path.join(root, 'supabase', 'migrations')
    const migrations = fs.readdirSync(migrationDir)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => !FOLDED_INTO_SCHEMA.some((prefix) => f.startsWith(prefix)))
      .sort()
    for (const file of migrations) {
      if (file.startsWith('011') && !fresh) {
        await apply(client, 'tests/fixtures/legacy-seed.sql (pre-011 legacy data)',
          fs.readFileSync(path.join(root, 'tests', 'fixtures', 'legacy-seed.sql'), 'utf8'))
      }
      await apply(client, `migrations/${file}`, fs.readFileSync(path.join(migrationDir, file), 'utf8'))
    }
    console.log(`✓ test database ready (${fresh ? 'fresh' : 'legacy-seeded'})`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('✗', error.message)
  process.exit(1)
})
