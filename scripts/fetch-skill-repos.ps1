$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$vendorRoot = Join-Path $repoRoot "vendor"
$targets = @(
  @{ Url = "https://github.com/obra/superpowers.git"; Path = (Join-Path $vendorRoot "superpowers") },
  @{ Url = "https://github.com/andrewyng/context-hub.git"; Path = (Join-Path $vendorRoot "context-hub") }
)

foreach ($target in $targets) {
  if (-not (Test-Path $target.Path)) {
    git clone --depth=1 $target.Url $target.Path
  } else {
    git -C $target.Path pull --ff-only
  }
}

