#!/bin/bash
# ------------------------------------------------------------------
# Pre-job cleanup for ephemeral GitHub Actions runner
# Runs via ACTIONS_RUNNER_HOOK_JOB_STARTED before every job to
# guarantee a clean workspace even if the ephemeral restart somehow
# retained state.
# ------------------------------------------------------------------

set -euo pipefail

echo "[cleanup] Starting pre-job cleanup..."

# Clear temporary files
rm -rf /tmp/* 2>/dev/null || true

# Remove any leaked npm credentials
rm -f ~/.npmrc 2>/dev/null || true

# Remove any leaked Docker credentials
rm -f ~/.docker/config.json 2>/dev/null || true

# Prune Docker: stopped containers, dangling images, unused volumes
docker system prune -f --volumes 2>/dev/null || true

# Clear runner work directory caches that may have survived
if [ -d "${RUNNER_WORKSPACE:-}" ]; then
  find "$RUNNER_WORKSPACE" -maxdepth 1 -mindepth 1 -not -name "$(basename "$GITHUB_WORKSPACE" 2>/dev/null || echo '__none__')" -exec rm -rf {} + 2>/dev/null || true
fi

echo "[cleanup] Pre-job cleanup complete."
