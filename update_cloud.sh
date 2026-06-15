#!/usr/bin/env bash
# Update script for Cloud Orchestrator Node

set -e
echo "==========================================="
echo "   Pi YouTube Bot - Cloud Node Updater"
echo "==========================================="

echo "Fetching updates from GitHub..."
git pull origin master

echo "Entering bot-cloud directory..."
cd bot-cloud

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
if systemctl list-units --type=service | grep -q "pibot-cloud.service"; then
    sudo systemctl restart pibot-cloud.service
    echo "Service restarted successfully."
else
    echo "Service not found in systemd. You can start it manually: cd bot-cloud && ./scripts/start.sh"
fi
echo "==========================================="
echo "Update complete!"
echo "==========================================="
