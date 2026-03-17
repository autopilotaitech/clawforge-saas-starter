$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outLogPath = Join-Path $repoRoot "monitor\\clawscope-live.out.log"
$errLogPath = Join-Path $repoRoot "monitor\\clawscope-live.err.log"

if (-not (Test-Path $outLogPath) -and -not (Test-Path $errLogPath)) {
  Write-Error "No live monitor logs found."
}

if (Test-Path $outLogPath) {
  Get-Content $outLogPath -Wait
}

if (Test-Path $errLogPath) {
  Get-Content $errLogPath -Wait
}
