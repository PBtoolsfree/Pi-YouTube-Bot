#!/usr/bin/env bash
# Update script for Cloud Orchestrator Node

set -e
echo "==========================================="
echo "   Pi YouTube Bot - Cloud Node Updater"
echo "==========================================="

echo "Fetching updates from GitHub..."
git pull origin master || echo "Note: Check if there are unstaged changes if pull failed."

echo "Entering bot-cloud directory..."
cd bot-cloud

echo "🧹 Cleaning old cache files to prevent conflicts..."
# Clean Python cache
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true

# Check and prompt for domain if config.json exists
if [ -f "config.json" ]; then
    if grep -q '"public_url": ""' config.json || ! grep -q '"public_url"' config.json; then
        echo "==========================================="
        echo "🌐 DOMAIN SETUP"
        echo "Your bot doesn't have a public domain configured."
        read -p "Enter your public domain (e.g. https://tip.mydomain.com) or press Enter to skip: " DOMAIN_INPUT
        if [ ! -z "$DOMAIN_INPUT" ]; then
            python3 -c "
import json
try:
    with open('config.json', 'r+') as f:
        cfg = json.load(f)
        cfg['public_url'] = '$DOMAIN_INPUT'
        f.seek(0)
        json.dump(cfg, f, indent=4)
        f.truncate()
    print('✅ Domain updated in config.json!')
except Exception as e:
    print('Failed to update domain automatically:', e)
"
        fi
        echo "==========================================="
    fi
fi

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
WorkingDirectory=$PROJECT_DIR
Environment=RUN_MODE=cloud
ExecStart=/bin/bash $PROJECT_DIR/scripts/start.sh
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
echo "If you set up a custom domain, use the new Domain Integration UI"
echo "in the Cloud Dashboard to easily copy your NGINX config!"
echo "==========================================="
