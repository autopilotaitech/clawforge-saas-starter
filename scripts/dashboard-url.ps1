$ErrorActionPreference = "Stop"
docker compose exec -u node -e HOME=/home/node openclaw-shell openclaw dashboard --no-open
