#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Cloud VPS Deployment & Setup Automation
# =============================================================================
set -euo pipefail

# Print banner
echo "============================================================"
echo " 🌐 PI BOT — CLOUD VPS DEPLOYMENT SERVICE"
echo "============================================================"

# Check OS compatibility
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ ERROR: This deployment script is only compatible with Linux."
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Install system dependencies
echo "📦 Installing system dependencies (requires sudo)..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update -y
    sudo apt-get install -y git python3 python3-venv python3-pip sqlite3 curl build-essential
else
    echo "⚠️ Warning: apt-get not found. Make sure git, python3 (with venv, pip), and sqlite3 are installed."
fi

# Node.js installation (NodeSource v20 LTS)
if ! command -v node &> /dev/null || [[ "$(node -v | cut -d'.' -f1)" != "v20" && "$(node -v | cut -d'.' -f1)" != "v21" && "$(node -v | cut -d'.' -f1)" != "v22" ]]; then
    echo "🟢 Node.js v20+ not found. Installing Node.js LTS v20..."
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "❌ Node.js v20+ is required. Please install it manually."
        exit 1
    fi
else
    echo "✅ Node.js $(node -v) is already installed."
fi

# Python environment setup
echo "🐍 Setting up Python Virtual Environment..."
python3 -m venv .venv
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt --quiet

# Frontend build
echo "⚛️ Building Frontend Assets (this may take a moment)..."
if [[ -d "frontend" ]]; then
    cd frontend
    npm install --silent
    npm run build
    cd "$PROJECT_DIR"
else
    echo "❌ ERROR: 'frontend/' directory not found."
    exit 1
fi

# Configure config.json and generate credentials
echo "🔑 Preparing configuration and security credentials..."
CREDS=$(python3 -c "
import json, os, secrets

config_path = 'config.json'
example_path = 'config.example.json'

if not os.path.exists(config_path):
    if os.path.exists(example_path):
        with open(example_path, 'r') as f:
            cfg = json.load(f)
    else:
        cfg = {}
else:
    with open(config_path, 'r') as f:
        try:
            cfg = json.load(f)
        except:
            cfg = {}

if 'security' not in cfg:
    cfg['security'] = {}

# Generate secrets if missing
web_sec = cfg['security'].get('webhook_secret')
if not web_sec:
    web_sec = secrets.token_hex(16)
    cfg['security']['webhook_secret'] = web_sec

db_pass = cfg['security'].get('dashboard_password')
if not db_pass:
    db_pass = secrets.token_urlsafe(9) # ~12 chars
    cfg['security']['dashboard_password'] = db_pass

with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=4)

print(f'{web_sec}:{db_pass}')
")

WEBHOOK_SECRET=$(echo "$CREDS" | cut -d':' -f1)
DASHBOARD_PASSWORD=$(echo "$CREDS" | cut -d':' -f2)

# Create systemd service unit file locally
echo "⚙️ Configuring systemd service..."
SERVICE_FILE="scripts/pibot-cloud.service"
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Pi Bot Cloud Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment=RUN_MODE=cloud
ExecStart=$PROJECT_DIR/.venv/bin/uvicorn backend.api:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Install systemd service
sudo cp "$SERVICE_FILE" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pibot-cloud.service
sudo systemctl restart pibot-cloud.service

# Get Public/LAN IP
IP_ADDR=$(hostname -I | awk '{print $1}' || echo "localhost")

echo "============================================================"
echo " 🎉 CLOUD DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "============================================================"
echo "  URL (Public/Local): http://${IP_ADDR}:8000"
echo "  Tip Page:           http://${IP_ADDR}:8000/tip"
echo "============================================================"
echo "  🔐 ADMIN CREDENTIALS:"
echo "    Username:         admin"
echo "    Password:         ${DASHBOARD_PASSWORD}"
echo "============================================================"
echo "  🔗 WEBSOCKET & WEBHOOK CONFIGURATION:"
echo "    Local Pi WS URL:  ws://${IP_ADDR}:8000/ws/pi-client?token=${WEBHOOK_SECRET}"
echo "    Webhook Secret:   ${WEBHOOK_SECRET}"
echo "============================================================"
echo "  ℹ️ To view service logs, run:"
echo "    sudo journalctl -fu pibot-cloud.service"
echo "============================================================"
