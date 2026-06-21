#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Cloud Node Updater
# =============================================================================
set -euo pipefail

echo "==========================================="
echo "   PiBot Updater (Cloud Edition)"
echo "==========================================="

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "1. Pulling latest code from GitHub..."
git pull origin master || git pull || true

echo "2. Installing Python dependencies..."
cd bot-cloud
if [ -d ".venv" ]; then
    .venv/bin/pip install -r requirements.txt --quiet
else
    pip install -r requirements.txt --break-system-packages --quiet || pip install -r requirements.txt --quiet
fi
cd ..

echo "3. Building Cloud Frontend..."
if [ -d "bot-cloud/frontend" ]; then
    cd bot-cloud/frontend
    npm install --silent
    export NODE_OPTIONS=--max_old_space_size=512
    npm run build
    cd "$PROJECT_DIR"
else
    echo "⚠️ bot-cloud/frontend directory not found! Skipping frontend build."
fi

echo "4. Restarting Cloud Service..."
if command -v systemctl &> /dev/null; then
    sudo systemctl restart pibot-cloud.service
else
    echo "⚠️ systemctl not found. Please restart the cloud service manually."
fi

echo "==========================================="
echo "   Cloud Node Update Complete!"
echo "==========================================="
