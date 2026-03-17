$ErrorActionPreference = "Stop"
docker compose --profile shell --profile gateway --profile monitor --profile preview --profile preview-named stop openclaw-shell openclaw-gateway clawscope cloudflared-preview cloudflared-named
