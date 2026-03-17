$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"
$tokenLine = Get-Content $envFile | Where-Object { $_ -match '^CLOUDFLARE_TUNNEL_TOKEN=' } | Select-Object -First 1
$token = if ($tokenLine) { ($tokenLine -split '=', 2)[1].Trim() } else { "" }

if ([string]::IsNullOrWhiteSpace($token)) {
  docker compose --profile shell --profile gateway --profile monitor --profile preview up -d openclaw-shell openclaw-gateway clawscope cloudflared-preview
} else {
  docker compose --profile shell --profile gateway --profile monitor --profile preview-named up -d openclaw-shell openclaw-gateway clawscope cloudflared-named
}
