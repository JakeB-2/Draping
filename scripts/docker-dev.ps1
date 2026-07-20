$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.local'

if (-not (Test-Path -LiteralPath $envPath)) {
  throw '.env.local is missing. Copy .env.example and fill in the required values first.'
}

# Load standards-compliant KEY=value lines and intentionally ignore the old
# "database password = ..." migration-runner line, which Docker cannot parse.
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}

Push-Location $projectRoot
try {
  docker compose up --build
} finally {
  Pop-Location
}
