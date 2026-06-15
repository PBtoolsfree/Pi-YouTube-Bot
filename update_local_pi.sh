#!/usr/bin/env bash
# Update script for Local Raspberry Pi Node

set -e
echo "==========================================="
echo "   Pi YouTube Bot - Local Node Updater"
echo "==========================================="

echo "Fetching updates from GitHub..."
git pull origin master

echo "Entering bot-local directory..."
cd bot-local

if [ -d ".venv" ]; then
    echo "Updating Python dependencies..."
    .venv/bin/pip install -r requirements.txt
else
    echo "Virtual environment not found, creating..."
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi

if [ -d "frontend" ]; then
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
