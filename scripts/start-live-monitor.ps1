$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$monitorRoot = Join-Path $repoRoot "monitor"
$pidPath = Join-Path $monitorRoot "clawscope-live.pid"
$outLogPath = Join-Path $monitorRoot "clawscope-live.out.log"
$errLogPath = Join-Path $monitorRoot "clawscope-live.err.log"
$defaultStateDir = Join-Path $repoRoot ".openclaw"

param(
  [string]$StateDir = $defaultStateDir,
  [string]$Container = "openclaw-gateway",
  [string]$Port = "18880",
  [string]$PreviewPort = "4310"
)

if (Test-Path $pidPath) {
  $existingPid = Get-Content $pidPath | Select-Object -First 1
  if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    Write-Host "ClawScope live monitor already running on PID $existingPid"
    exit 0
  }
  Remove-Item $pidPath -Force
}

$serverPath = Join-Path $monitorRoot "server.js"
$env:CLAWSCOPE_EXEC_MODE = "docker"
$env:OPENCLAW_CONTAINER = $Container
$env:OPENCLAW_STATE_DIR = $StateDir
$env:CLAWSCOPE_PORT = $Port
$env:APP_PREVIEW_PORT = $PreviewPort

$process = Start-Process -FilePath "node" -ArgumentList $serverPath -WorkingDirectory $repoRoot -RedirectStandardOutput $outLogPath -RedirectStandardError $errLogPath -PassThru
$process.Id | Set-Content $pidPath

Write-Host "ClawScope live monitor started on PID $($process.Id)"
Write-Host "State dir: $StateDir"
Write-Host "Container: $Container"
Write-Host "URL: http://127.0.0.1:$Port/"
