#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Production Setup & Installation Script
#  Designed for Raspberry Pi OS (Bookworm 64-bit)
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
echo -e "${CYAN}      🎥🤖 PI YOUTUBE BOT — SETUP INSTALLER                 ${NC}"
echo -e "${CYAN}============================================================${NC}"

# Check OS compatibility
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    error "This setup script is only compatible with Linux/Raspberry Pi OS."
fi

# Detect project directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"
cd "$PROJECT_DIR"

info "Project directory detected: $PROJECT_DIR"

# Install system dependencies
info "Installing system dependencies..."
SUDO_CMD=""
if command -v sudo &> /dev/null; then
    SUDO_CMD="sudo"
fi

if command -v apt-get &> /dev/null; then
    $SUDO_CMD apt-get update -y
    $SUDO_CMD apt-get install -y git python3 python3-venv python3-pip sqlite3 curl build-essential ffmpeg
else
    warn "apt-get not found. Ensure git, python3 (with venv/pip), ffmpeg, and sqlite3 are manually installed."
fi

# Node.js installation (NodeSource v20 LTS)
if ! command -v node &> /dev/null || [[ "$(node -v | cut -d'.' -f1)" != "v20" && "$(node -v | cut -d'.' -f1)" != "v21" && "$(node -v | cut -d'.' -f1)" != "v22" ]]; then
    info "Node.js v20+ not found. Installing Node.js LTS v20..."
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO_CMD -E bash -
        $SUDO_CMD apt-get install -y nodejs
    else
        error "Node.js v20+ is required. Please install it manually."
    fi
else
    success "Node.js $(node -v) is already installed."
fi

# Python environment setup
info "Setting up Python Virtual Environment..."
python3 -m venv .venv
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt --quiet
success "Python virtual environment set up and packages installed."

# Frontend build
info "Building Frontend Dashboard..."
if [[ -d "frontend" ]]; then
    cd frontend
    npm install --silent
    export NODE_OPTIONS=--max_old_space_size=512
    npm run build
    cd "$PROJECT_DIR"
    success "Frontend built successfully."
else
    error "frontend/ directory not found!"
fi

# Configure config.json and generate credentials
info "Preparing configuration and security credentials..."
if [[ ! -f "config.json" ]]; then
    if [[ -f "config.example.json" ]]; then
        cp config.example.json config.json
        info "Created config.json from template."
    else
        echo "{}" > config.json
    fi
fi

if [[ ! -f ".env" ]]; then
    if [[ -f ".env.example" ]]; then
        cp .env.example .env
        info "Created .env from template."
    else
        touch .env
    fi
fi

# Generate credentials
CREDS=$(python3 -W ignore -c "
import json, os, secrets

config_path = 'config.json'

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
    db_pass = secrets.token_urlsafe(9)
    cfg['security']['dashboard_password'] = db_pass

with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=4)

print(f'{web_sec}:{db_pass}')
")

WEBHOOK_SECRET=$(echo "$CREDS" | cut -d':' -f1)
DASHBOARD_PASSWORD=$(echo "$CREDS" | cut -d':' -f2)

# Make start script executable
chmod +x scripts/start.sh

# Configure logrotate config
info "Configuring log rotation..."
LOGROTATE_FILE="/etc/logrotate.d/pibot"
cat <<EOF | $SUDO_CMD tee "$LOGROTATE_FILE" > /dev/null
$PROJECT_DIR/logs/*.log {
    daily
    rotate 7
    maxsize 20M
    compress
    missingok
    notifempty
    copytruncate
}
EOF
success "Logrotate config installed: $LOGROTATE_FILE"

# Create systemd service unit file
info "Configuring systemd service..."
SERVICE_FILE="scripts/pibot.service"
CURRENT_USER=$(whoami)
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Pi YouTube Bot Service
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/bin/bash $PROJECT_DIR/scripts/start.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Install systemd service
if command -v systemctl &> /dev/null; then
    $SUDO_CMD cp "$SERVICE_FILE" /etc/systemd/system/
    $SUDO_CMD systemctl daemon-reload
    $SUDO_CMD systemctl enable pibot.service
    $SUDO_CMD systemctl restart pibot.service
    success "Systemd service 'pibot' created, enabled, and started."
else
    warn "systemctl not found. You will need to start the service manually: bash scripts/start.sh"
fi

# Optional Cron setup for Auto-updates
echo ""
read -r -p "Do you want to enable automatic daily updates at 3:00 AM? [y/N]: " ENABLE_CRON
ENABLE_CRON="${ENABLE_CRON:-N}"
if [[ "$ENABLE_CRON" =~ ^[Yy]$ ]]; then
    info "Setting up daily auto-updater cron job..."
    # Avoid duplicate cron job
    (crontab -l 2>/dev/null | grep -v "auto-update.sh" || true; echo "0 3 * * * /bin/bash $PROJECT_DIR/scripts/auto-update.sh >> $PROJECT_DIR/logs/auto-update.log 2>&1") | crontab -
    success "Cron job registered successfully."
else
    info "Skipping cron job registration. You can update manually later."
fi

IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')
if [[ -z "$IP_ADDR" ]]; then
    IP_ADDR="localhost"
fi

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} 🎉 LOCAL PI INSTALLATION COMPLETED SUCCESSFULLY!           ${NC}"
echo -e "${GREEN}============================================================${NC}"
echo -e "  Local Dashboard URL:  http://${IP_ADDR}:8000"
echo -e "  OBS Sub Overlay URL:  http://${IP_ADDR}:8000/overlay"
echo -e "============================================================"
echo -e "  🔐 ADMIN CREDENTIALS:"
echo -e "    Username:           admin"
echo -e "    Password:           ${DASHBOARD_PASSWORD}"
echo -e "============================================================"
echo -e "  🔗 WEBHOOK & SECURITY DETAILS:"
echo -e "    Webhook Secret:     ${WEBHOOK_SECRET}"
echo -e "============================================================"
echo -e "  ℹ️ To view service logs, run:"
echo -e "    sudo journalctl -fu pibot.service"
echo -e "============================================================"
echo ""
