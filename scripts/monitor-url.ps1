$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"
$port = "18880"
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^CLAWSCOPE_PORT=' } | Select-Object -First 1
  if ($line) {
    $value = ($line -split '=', 2)[1].Trim()
    if ($value) { $port = $value }
  }
}
"http://127.0.0.1:$port/"
