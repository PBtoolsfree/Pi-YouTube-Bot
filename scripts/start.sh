#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Start Wrapper (called by systemd)
#  Checks for updates on each start, then launches the bot.
# =============================================================================
set -uo pipefail

INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$INSTALL_DIR/.venv"
LOG_FILE="$INSTALL_DIR/logs/start.log"
BRANCH=$(git -C "$INSTALL_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")

mkdir -p "$INSTALL_DIR/logs"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$INSTALL_DIR"
log "===== Pi YouTubeBot Starting (v$(cat VERSION 2>/dev/null || echo unknown)) ====="

# Optional: pull latest on start (controlled by config or env var)
if [[ "${PIBOT_AUTO_UPDATE_ON_START:-true}" == "true" ]]; then
    if git fetch origin "$BRANCH" --quiet 2>/dev/null; then
        LOCAL=$(git rev-parse HEAD 2>/dev/null)
        REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null)
        if [[ "$LOCAL" != "$REMOTE" ]]; then
            log "New code available — updating..."
            export FROM_START=1
            bash "$INSTALL_DIR/scripts/update.sh" >> "$LOG_FILE" 2>&1 && log "Auto-update complete." || log "WARNING: auto-update failed, starting with existing code."
        else
            log "Already up to date."
        fi
    else
        log "WARNING: Cannot reach GitHub. Starting with existing code."
    fi
fi

# Ensure Python deps are current
if [[ -f "$VENV/bin/pip" ]]; then
    "$VENV/bin/pip" install -r "$INSTALL_DIR/requirements.txt" --quiet 2>/dev/null \
        && log "Python deps OK." \
        || log "WARNING: pip check had warnings."
fi

log "Launching bot..."
exec "$VENV/bin/python" "$INSTALL_DIR/main.py"
