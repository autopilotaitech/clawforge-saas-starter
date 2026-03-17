# TOOLS

## Local Paths
- Shared repo mount in container -> `/share`
- Target projects directory -> `/share/projects`
- Local prompts directory -> `/share/prompts`
- Local skills directory -> `/share/skills`

## Helper Commands
- Prepare repo -> `.\scripts\prepare-host.ps1`
- Fetch OpenClaw -> `.\scripts\fetch-openclaw.ps1`
- Fetch extra skills -> `.\scripts\fetch-skill-repos.ps1`
- Build image -> `.\scripts\build-image.ps1`
- Bootstrap config -> `.\scripts\bootstrap-openclaw.ps1`
- Start stack -> `.\scripts\start-stack.ps1`
- Start monitor -> `.\scripts\start-monitor.ps1`
- Show dashboard URL -> `.\scripts\dashboard-url.ps1`
- Show monitor URL -> `.\scripts\monitor-url.ps1`
- Show preview URL -> `.\scripts\preview-url.ps1`

## Project Pattern
- Clone target repos into `projects/`
- Ask OpenClaw to work on `/share/projects/<repo-name>`
