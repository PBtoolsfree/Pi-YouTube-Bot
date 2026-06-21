#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Auto-Update Script v3
#  Designed for daily cron execution.
#
#  Install cron job (runs daily at 3:00 AM):
#    crontab -e
#    Add: 0 3 * * * /bin/bash $HOME/pi-youtube-bot/scripts/auto-update.sh >> $HOME/pi-youtube-bot/logs/auto-update.log 2>&1
#
#  Usage: bash scripts/auto-update.sh
# =============================================================================
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_FILE="/tmp/pibot_auto_update.lock"
LOG_FILE="$PROJECT_DIR/logs/auto-update.log"
MAX_LOG_LINES=1000
BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")
STALE_LOCK_SECS=3600  # 1 hour

# ── Log rotation ───────────────────────────────────────────────────────────────
mkdir -p "$PROJECT_DIR/logs"
if [[ -f "$LOG_FILE" ]] && [[ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]]; then
    tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "====== AUTO-UPDATE CHECK ======"

# ── Lock file ──────────────────────────────────────────────────────────────────
if [[ -f "$LOCK_FILE" ]]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -c%Y "$LOCK_FILE" 2>/dev/null || echo 0) ))
    if [[ "$LOCK_AGE" -lt "$STALE_LOCK_SECS" ]]; then
        log "Another update in progress (lock age: ${LOCK_AGE}s). Exiting."
        exit 0
    fi
    log "Removing stale lock (age: ${LOCK_AGE}s)"
    rm -f "$LOCK_FILE"
fi
touch "$LOCK_FILE"
trap "rm -f '$LOCK_FILE'" EXIT

cd "$PROJECT_DIR"

# ── Check GitHub ───────────────────────────────────────────────────────────────
if ! git fetch origin "$BRANCH" --quiet 2>/dev/null; then
    log "WARNING: Cannot reach GitHub — skipping."
    exit 0
fi

LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

if [[ -z "$LOCAL" || -z "$REMOTE" ]]; then
    log "ERROR: Cannot determine commit hashes."
    exit 1
fi

if [[ "$LOCAL" == "$REMOTE" ]]; then
    log "Up to date (${LOCAL:0:8}). Nothing to do."
    log "====== DONE ======"
    exit 0
fi

# ── Run update ─────────────────────────────────────────────────────────────────
log "Update available: ${LOCAL:0:8} → ${REMOTE:0:8}"

if systemctl is-active --quiet pibot-cloud.service 2>/dev/null; then
    log "Detected Cloud Environment. Starting update via scripts/update_cloud.sh..."
    UPDATE_SCRIPT="$PROJECT_DIR/scripts/update_cloud.sh"
else
    log "Detected Local Environment. Starting update via scripts/update_local.sh..."
    UPDATE_SCRIPT="$PROJECT_DIR/scripts/update_local.sh"
fi

if bash "$UPDATE_SCRIPT" >> "$LOG_FILE" 2>&1; then
    log "Auto-update completed successfully."
else
    log "ERROR: Auto-update FAILED."
    exit 1
fi

log "====== AUTO-UPDATE DONE ======"
