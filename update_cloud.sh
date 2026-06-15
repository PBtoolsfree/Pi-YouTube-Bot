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

echo "Fixing service path for bot-cloud architecture..."
if systemctl list-units --type=service | grep -q "pibot-cloud.service"; then
    # Rewrite service to point to bot-cloud
    CURRENT_USER=$(whoami)
    PROJECT_DIR=$(pwd)
    SERVICE_FILE="/etc/systemd/system/pibot-cloud.service"
    
    sudo bash -c "cat <<EOF > $SERVICE_FILE
[Unit]
Description=Pi Bot Cloud Service
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$PROJECT_DIR/bot-cloud
Environment=RUN_MODE=cloud
ExecStart=/bin/bash $PROJECT_DIR/bot-cloud/scripts/start.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

    sudo systemctl daemon-reload
    sudo systemctl restart pibot-cloud.service
    echo "Service updated and restarted successfully."
else
    echo "Service not found in systemd. You can start it manually: cd bot-cloud && ./scripts/start.sh"
fi
echo "==========================================="
echo "Update complete!"
echo "==========================================="
