$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"
$examplePath = Join-Path $repoRoot ".env.example"

$paths = @(
  (Join-Path $repoRoot "projects"),
  (Join-Path $repoRoot "prompts"),
  (Join-Path $repoRoot "skills"),
  (Join-Path $repoRoot "vendor")
)

foreach ($path in $paths) {
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

if (-not (Test-Path $envPath)) {
  Copy-Item $examplePath $envPath
  Write-Host "Created $envPath from template. Add your NVIDIA API key before starting OpenClaw."
} else {
  Write-Host "$envPath already exists."
}

