#!/usr/bin/env bash
# Update script for Local Raspberry Pi Node

set -e
echo "==========================================="
echo "   Pi YouTube Bot - Local Node Updater"
echo "==========================================="

echo "Fetching updates from GitHub..."
git pull origin master || echo "Note: Check if there are unstaged changes if pull failed."

echo "Entering bot-local directory..."
cd bot-local

echo "🧹 Cleaning old cache files to prevent conflicts..."
# Clean Python cache
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true

if [ -d ".venv" ]; then
    echo "Updating Python dependencies..."
    .venv/bin/pip install -U pip
    .venv/bin/pip install -U -r requirements.txt
else
    echo "Virtual environment not found, creating..."
    python3 -m venv .venv
    .venv/bin/pip install -U pip
    .venv/bin/pip install -U -r requirements.txt
fi

if [ -d "frontend" ]; then
    echo "🧹 Cleaning old frontend build..."
    rm -rf frontend/dist
    echo "Rebuilding frontend..."
    cd frontend
    npm install --silent
    npm run build
    cd ..
fi

echo "Restarting service..."
if systemctl list-units --type=service | grep -q "pibot.service"; then
    # Fix old service paths if migrating to split architecture
    if grep -q "ExecStart=.*/pibot/scripts/start.sh" /etc/systemd/system/pibot.service 2>/dev/null; then
        echo "Updating systemd service path to new bot-local architecture..."
        sudo sed -i 's|/pibot/scripts/start.sh|/pibot/bot-local/scripts/start.sh|g' /etc/systemd/system/pibot.service
        sudo sed -i 's|WorkingDirectory=.*/pibot$|WorkingDirectory='"$(pwd)"'|g' /etc/systemd/system/pibot.service
        sudo systemctl daemon-reload
    fi
    sudo systemctl restart pibot.service
    echo "Service restarted successfully."
else
    echo "Service not found in systemd. You can start it manually: cd bot-local && ./scripts/start.sh"
fi
echo "==========================================="
echo "Update complete!"
echo "==========================================="
