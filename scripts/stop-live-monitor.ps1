$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pidPath = Join-Path $repoRoot "monitor\\clawscope-live.pid"

if (-not (Test-Path $pidPath)) {
  Write-Host "No ClawScope live monitor PID file found."
  exit 0
}

$procId = Get-Content $pidPath | Select-Object -First 1
if ($procId) {
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($proc) {
    Stop-Process -Id $procId -Force
    Write-Host "Stopped ClawScope live monitor PID $procId"
  }
}

Remove-Item $pidPath -Force
