$ErrorActionPreference = "Stop"

docker compose --profile shell up -d openclaw-shell

$installCommand = @'
set -eu
BREW_ROOT=/home/linuxbrew/.linuxbrew
BREW_REPO="$BREW_ROOT/Homebrew"
BREW_BIN="$BREW_ROOT/bin/brew"

mkdir -p "$BREW_ROOT/bin" "$BREW_ROOT/sbin"

if [ ! -x "$BREW_BIN" ]; then
  rm -rf "$BREW_REPO"
  git clone --depth=1 https://github.com/Homebrew/brew "$BREW_REPO"
  ln -sf ../Homebrew/bin/brew "$BREW_ROOT/bin/brew"
fi
'@

$verifyCommand = @'
set -eu
export PATH=/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
brew update
brew --help >/dev/null
'@

docker compose exec -u node -T openclaw-shell /bin/sh -lc ($installCommand -replace "`r", "")
docker compose exec -u node -T openclaw-shell /bin/sh -lc ($verifyCommand -replace "`r", "")
