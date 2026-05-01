// One-shot migration runner. Reads supabase/migrations/<file>.sql and runs it
// against the Supabase project's direct postgres connection.
//
// Usage:  node scripts/apply-migration.mjs <filename>
// Example: node scripts/apply-migration.mjs 001_additions.sql
//
// Connection details come from .env.local:
//   NEXT_PUBLIC_SUPABASE_URL → derives the host (db.<ref>.supabase.co)
//   "database password = X" → derives the password (legacy unkeyed line)
// Falls back to PG_PASSWORD if the legacy line is missing.

import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function readEnv() {
  const raw = fs.readFileSync(path.join(root, '.env.local'), 'utf8')
  const url = raw.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$/m)?.[1]?.trim()
  // Legacy unkeyed line: "database password = X"
  const pwd = raw.match(/^database password\s*=\s*(.+)$/m)?.[1]?.trim()
                ?? process.env.PG_PASSWORD
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing from .env.local')
  if (!pwd) throw new Error('database password missing — add `database password = X` to .env.local or set PG_PASSWORD')
  const ref = new URL(url).hostname.split('.')[0]
  return { ref, password: pwd }
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/apply-migration.mjs <migration-filename>')
    process.exit(1)
  }
  const sqlPath = path.join(root, 'supabase', 'migrations', file)
  const sql = fs.readFileSync(sqlPath, 'utf8')

  const { ref, password } = readEnv()
  // Supabase direct connections are IPv6-only since 2024 — most home/work
  // networks don't reach them. Use the IPv4 pooler in session mode (port 5432)
  // for DDL. User format on pooler: postgres.<ref>.
  const fleet = process.env.SUPABASE_FLEET || 'aws-1'
  const region = process.env.SUPABASE_REGION || 'us-east-2'
  const host = `${fleet}-${region}.pooler.supabase.com`
  const client = new pg.Client({
    host,
    port: 5432,
    user: `postgres.${ref}`,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
  })

  console.log(`→ connecting to ${host} (session pool, region=${region})`)
  await client.connect()
  console.log(`→ applying ${file} (${sql.length} bytes)`)
  try {
    await client.query(sql)
    console.log('✓ migration applied')
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('✗', e.message)
  process.exit(1)
})
