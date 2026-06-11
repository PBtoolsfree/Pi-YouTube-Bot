#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Cloud VPS Update Script
#  Updates the Tip Page and API backend on the Cloud Server
# =============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "============================================================"
echo " 🔄 UPDATING PI BOT CLOUD SERVER..."
echo "============================================================"

# Check if running as cloud server
if [[ ! -f "/etc/systemd/system/pibot-cloud.service" ]]; then
    echo "⚠️ Warning: pibot-cloud.service not found. Is this instance set up as the Cloud server?"
fi

# Pull latest code
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Update python environment
echo "🐍 Updating dependencies..."
if [[ -d ".venv" ]]; then
    .venv/bin/pip install -r requirements.txt --quiet
else
    python3 -m venv .venv
    .venv/bin/pip install --upgrade pip --quiet
    .venv/bin/pip install -r requirements.txt --quiet
fi

# Rebuild frontend
echo "⚛️ Rebuilding frontend Tip Page..."
if [[ -d "frontend" ]]; then
    cd frontend
    npm install --silent
    npm run build
    cd "$PROJECT_DIR"
else
    echo "❌ ERROR: 'frontend/' directory not found."
    exit 1
fi

# Restart cloud service
echo "⚙️ Restarting Cloud systemd service..."
if systemctl list-units --type=service | grep -q "pibot-cloud.service"; then
    sudo systemctl restart pibot-cloud.service
    echo "✅ Service restarted successfully."
else
    echo "⚠️ Warning: pibot-cloud.service is not registered. Please run scripts/deploy_cloud.sh first."
fi

echo "============================================================"
echo " 🎉 CLOUD TIP PAGE UPDATE COMPLETED!"
echo "============================================================"
