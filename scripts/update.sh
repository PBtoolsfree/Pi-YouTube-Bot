#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Production Update Script
#  Updates local repository and restarts systemd services safely
# =============================================================================
set -euo pipefail

# Text styling
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN} 🔄 PI BOT UPDATER — INITIATING CODE UPDATE                 ${NC}"
echo -e "${CYAN}============================================================${NC}"

# Check OS compatibility
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    error "This update script is only compatible with Linux."
fi

# Detect project directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"
cd "$PROJECT_DIR"

REBUILD_FRONTEND=false
for arg in "$@"; do
    if [[ "$arg" == "--frontend" || "$arg" == "--force" ]]; then
        REBUILD_FRONTEND=true
    fi
done

# If frontend build is missing, force rebuild it anyway
if [[ ! -d "frontend/dist" ]]; then
    REBUILD_FRONTEND=true
fi

# Determine current active branch dynamically
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")
info "Detected active branch: $BRANCH"

# Save current commit for potential rollback
OLD_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")

# Step 1: Create a safe backup before any changes
info "Step 1/5: Creating local backup of user data..."
if [[ -f "scripts/backup_manager.py" ]]; then
    python3 scripts/backup_manager.py --backup-only
    success "Backup created successfully."
else
    warn "scripts/backup_manager.py not found. Skipping backup."
fi

# Step 2: Fetch and pull latest changes
info "Step 2/5: Pulling latest changes from GitHub ($BRANCH)..."
git fetch origin "$BRANCH" --quiet
git pull origin "$BRANCH"
success "Code pulled from GitHub successfully."

# Step 3: Update python dependencies
info "Step 3/5: Updating virtual environment Python dependencies..."
if [[ -d ".venv" ]]; then
    .venv/bin/pip install -r requirements.txt --quiet
    success "Python dependencies verified and updated."
else
    warn ".venv virtual environment not found. Skip package updates."
fi

# Step 4: Rebuild frontend if needed
if [[ "$REBUILD_FRONTEND" == "true" ]]; then
    info "Step 4/5: Rebuilding React frontend dashboard (this might take a minute)..."
    if [[ -d "frontend" ]]; then
        cd frontend
        npm install --silent
        npm run build
        cd "$PROJECT_DIR"
        success "Frontend rebuilt successfully."
    else
        error "frontend/ directory not found."
    fi
else
    info "Step 4/5: Skipping frontend rebuild (use --frontend or --force to trigger rebuild)."
fi

# Step 5: Restart active services
info "Step 5/5: Restarting systemd services..."
RESTARTED_SVC=false

# Local Pi Service
if systemctl list-units --type=service | grep -q "pibot.service"; then
    info "Restarting pibot.service..."
    sudo systemctl restart pibot.service
    RESTARTED_SVC=true
fi

# Cloud VPS Service
if systemctl list-units --type=service | grep -q "pibot-cloud.service"; then
    info "Restarting pibot-cloud.service..."
    sudo systemctl restart pibot-cloud.service
    RESTARTED_SVC=true
fi

if [[ "$RESTARTED_SVC" == "true" ]]; then
    success "Active services restarted successfully."
else
    warn "No systemd services found (pibot or pibot-cloud). Start manually using: python3 main.py"
fi

# Self check / rollback trigger if restart failed
if [[ -n "$OLD_COMMIT" ]] && [[ "$RESTARTED_SVC" == "true" ]]; then
    # Give the service a couple seconds to start
    sleep 3
    
    # Check status of local service if active
    if systemctl list-units --type=service | grep -q "pibot.service"; then
        if ! sudo systemctl is-active --quiet pibot.service; then
            warn "⚠️ pibot.service failed to start! Rolling back to commit $OLD_COMMIT..."
            git reset --hard "$OLD_COMMIT"
            sudo systemctl restart pibot.service
            error "Rollback complete. The update broke the service. Check logs: sudo journalctl -fu pibot.service"
        fi
    fi
fi

echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} 🎉 PI BOT UPDATE PROCESS COMPLETED SUCCESSFULLY!           ${NC}"
echo -e "${GREEN}============================================================${NC}"
