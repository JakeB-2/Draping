// Probe the pooler in every region (both fleet prefixes) until one
// accepts us. Run once to discover where the project lives.
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const raw = fs.readFileSync(path.join(root, '.env.local'), 'utf8')
const url = raw.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$/m)?.[1]?.trim()
const password = raw.match(/^database password\s*=\s*(.+)$/m)?.[1]?.trim()
const ref = new URL(url).hostname.split('.')[0]

console.log(`ref=${ref}, password length=${password?.length ?? 0}`)

const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1',
  'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'ap-south-1', 'sa-east-1',
]
const FLEETS = ['aws-0', 'aws-1']

async function probe(fleet, region) {
  const host = `${fleet}-${region}.pooler.supabase.com`
  const client = new pg.Client({
    host, port: 5432, user: `postgres.${ref}`, password,
    database: 'postgres', ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000, statement_timeout: 5000,
  })
  try {
    await client.connect()
    await client.query('select 1')
    await client.end()
    return { fleet, region, ok: true }
  } catch (e) {
    try { await client.end() } catch {}
    return { fleet, region, ok: false, err: e.message }
  }
}

const tasks = []
for (const fleet of FLEETS) {
  for (const region of REGIONS) {
    tasks.push(probe(fleet, region))
  }
}
const results = await Promise.all(tasks)
const ok = results.find((r) => r.ok)
if (ok) {
  console.log(`✓ found: ${ok.fleet}-${ok.region}`)
  process.exit(0)
}

// Print one example error per error class so we can see what's wrong.
const errs = new Map()
for (const r of results) {
  if (!errs.has(r.err)) errs.set(r.err, `${r.fleet}-${r.region}`)
}
console.log('✗ no host accepted the connection. distinct errors:')
for (const [err, sample] of errs) {
  console.log(`  [${sample}] ${err}`)
}
process.exit(1)
