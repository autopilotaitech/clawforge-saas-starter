$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $repoRoot "upstream"
$envPath = Join-Path $repoRoot ".env"
$examplePath = Join-Path $repoRoot ".env.example"

$defaultRef = "v2026.3.13-1"
$ref = $defaultRef

if (Test-Path $envPath) {
  $line = Get-Content $envPath | Where-Object { $_ -match '^OPENCLAW_GIT_REF=' } | Select-Object -First 1
  if ($line) {
    $value = ($line -split '=', 2)[1].Trim()
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $ref = $value
    }
  }
} elseif (Test-Path $examplePath) {
  $line = Get-Content $examplePath | Where-Object { $_ -match '^OPENCLAW_GIT_REF=' } | Select-Object -First 1
  if ($line) {
    $value = ($line -split '=', 2)[1].Trim()
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $ref = $value
    }
  }
}

if (-not (Test-Path $target)) {
  git clone --branch $ref --depth=1 https://github.com/openclaw/openclaw.git $target
} else {
  git -C $target fetch --tags --depth=1 origin $ref
  git -C $target checkout --force FETCH_HEAD
}
