$ErrorActionPreference = "Stop"

$logs = cmd /c "docker logs clawforge-cloudflared-preview 2>&1"
$url = $logs | Select-String -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' -AllMatches |
  ForEach-Object { $_.Matches } |
  ForEach-Object { $_.Value } |
  Select-Object -Last 1

if ($url) {
  $url
} else {
  Write-Error "No Quick Tunnel URL found yet. Check: docker logs -f clawforge-cloudflared-preview"
}

