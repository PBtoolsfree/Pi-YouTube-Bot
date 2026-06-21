#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Local Node Updater
# =============================================================================
set -euo pipefail

echo "==========================================="
echo "   PiBot Updater (Local Edition)"
echo "==========================================="

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "1. Pulling latest code from GitHub..."
git pull origin master || git pull || true

echo "2. Installing Python dependencies..."
if [ -d ".venv" ]; then
    .venv/bin/pip install -r requirements.txt --quiet
else
    pip install -r requirements.txt --break-system-packages --quiet || pip install -r requirements.txt --quiet
fi

echo "3. Building Local Frontend..."
if [ -d "bot-local/frontend" ]; then
    cd bot-local/frontend
    npm install --silent
    export NODE_OPTIONS=--max_old_space_size=512
    npm run build
    cd "$PROJECT_DIR"
else
    echo "⚠️ bot-local/frontend directory not found! Skipping frontend build."
fi

echo "4. Restarting Local Service..."
if command -v systemctl &> /dev/null; then
    sudo systemctl restart pibot.service
else
    echo "⚠️ systemctl not found. Please restart the service manually."
fi

echo "==========================================="
echo "   Local Node Update Complete!"
echo "==========================================="
