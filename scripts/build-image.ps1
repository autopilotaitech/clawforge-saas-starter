$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$upstreamRoot = Join-Path $repoRoot "upstream"

if (-not (Test-Path $upstreamRoot)) {
  & (Join-Path $PSScriptRoot "fetch-openclaw.ps1")
}

docker compose build openclaw-shell openclaw-gateway

