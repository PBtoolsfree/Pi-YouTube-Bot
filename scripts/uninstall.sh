#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Uninstall Script v3
#  Cleanly removes service, cron jobs, and optionally all files.
#
#  Usage: bash scripts/uninstall.sh
# =============================================================================
set -euo pipefail

SERVICE_NAME="pibot"
INSTALL_DIR="${PIBOT_DIR:-$HOME/pi-youtube-bot}"

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' NC='\033[0m'
info()    { echo -e "${C}[INFO ]${NC} $*"; }
success() { echo -e "${G}[  OK ]${NC} $*"; }
warn()    { echo -e "${Y}[WARN ]${NC} $*"; }

echo ""
echo -e "${R}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${R}║      Pi YouTube Bot — Uninstaller v3          ║${NC}"
echo -e "${R}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# 1. Stop and disable systemd service
info "Stopping systemd service..."
if sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    sudo systemctl stop "$SERVICE_NAME"
    success "Service stopped"
fi
if sudo systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    sudo systemctl disable "$SERVICE_NAME"
    success "Service disabled"
fi
if [[ -f "/etc/systemd/system/$SERVICE_NAME.service" ]]; then
    sudo rm -f "/etc/systemd/system/$SERVICE_NAME.service"
    sudo systemctl daemon-reload
    success "Service file removed"
fi

# 2. Remove logrotate config
if [[ -f "/etc/logrotate.d/pibot" ]]; then
    sudo rm -f /etc/logrotate.d/pibot
    success "Log rotation config removed"
fi

# 3. Remove cron jobs
info "Removing cron jobs..."
if crontab -l 2>/dev/null | grep -q "pi-youtube-bot"; then
    crontab -l 2>/dev/null | grep -v "pi-youtube-bot" | crontab -
    success "Cron jobs removed"
else
    info "No cron jobs found"
fi

# 4. Optional: Delete install directory
echo ""
warn "Install directory: $INSTALL_DIR"
echo ""
read -r -p "Delete all bot files? This CANNOT be undone. [y/N] " CONFIRM
CONFIRM="${CONFIRM:-N}"
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    [[ -d "$INSTALL_DIR" ]] && rm -rf "$INSTALL_DIR" && success "Files deleted: $INSTALL_DIR" || warn "Directory not found"
else
    info "Files kept at: $INSTALL_DIR"
fi

echo ""
echo -e "${G}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${G}║         ✓ UNINSTALL COMPLETE                  ║${NC}"
echo -e "${G}╚═══════════════════════════════════════════════╝${NC}"
echo ""
