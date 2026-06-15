#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Complete Uninstaller Script
#  Cleanly removes all services, logs, configuration, cron jobs, and 
#  optionally system packages (Node.js, FFmpeg) and the project directories.
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

echo -e "${RED}============================================================${NC}"
echo -e "${RED}      🚨 PI YOUTUBE BOT COMPLETE UNINSTALLER 🚨             ${NC}"
echo -e "${RED}============================================================${NC}"
echo "This script will completely uninstall the bot, its services,"
echo "cron jobs, logs, and optionally system packages & codebase files."
echo "------------------------------------------------------------"

# Verify we are running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    error "This script is only compatible with Linux/Raspberry Pi OS."
fi

# Detect directory containing this script safely (handles curl | bash piping and set -u)
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
else
    # Fallback if piped to bash via curl
    PROJECT_ROOT="$HOME/pi-youtube-bot"
    if [[ ! -d "$PROJECT_ROOT" && -d "$HOME/pibot" ]]; then
        PROJECT_ROOT="$HOME/pibot"
    fi
fi

# Prompt for absolute confirmation
read -r -p "Are you absolutely sure you want to proceed with full uninstallation? [y/N]: " CONFIRM_ALL
CONFIRM_ALL="${CONFIRM_ALL:-N}"
if [[ ! "$CONFIRM_ALL" =~ ^[Yy]$ ]]; then
    info "Uninstallation aborted."
    exit 0
fi

# 1. Stop and Disable Services
info "Stopping and disabling systemd services..."
SERVICES=("pibot" "pibot-cloud" "bot_service" "pi-youtube-bot")
for svc in "${SERVICES[@]}"; do
    if systemctl list-unit-files | grep -F "${svc}.service" > /dev/null 2>&1; then
        info "Found service: ${svc}"
        if sudo systemctl is-active --quiet "$svc" 2>/dev/null; then
            sudo systemctl stop "$svc"
            success "Service '${svc}' stopped."
        fi
        if sudo systemctl is-enabled --quiet "$svc" 2>/dev/null; then
            sudo systemctl disable "$svc"
            success "Service '${svc}' disabled."
        fi
        if [[ -f "/etc/systemd/system/${svc}.service" ]]; then
            sudo rm -f "/etc/systemd/system/${svc}.service"
            success "Service file '/etc/systemd/system/${svc}.service' deleted."
        fi
    fi
done

sudo systemctl daemon-reload
success "Systemd daemon reloaded."

# 2. Remove Logrotate Configurations
info "Removing logrotate configurations..."
LOGROTATES=("pibot" "pibot-cloud" "pi-youtube-bot")
for lr in "${LOGROTATES[@]}"; do
    if [[ -f "/etc/logrotate.d/${lr}" ]]; then
        sudo rm -f "/etc/logrotate.d/${lr}"
        success "Logrotate config '/etc/logrotate.d/${lr}' deleted."
    fi
done

# 3. Remove Cron Jobs
info "Removing automated cron update entries..."
if crontab -l 2>/dev/null | grep -qE "pi-youtube-bot|pibot"; then
    crontab -l 2>/dev/null | grep -vE "pi-youtube-bot|pibot" | crontab - || true
    success "Removed cron job entries related to PiBot."
else
    info "No related cron jobs found."
fi

# 4. Optional: Uninstall Node.js, NPM, and FFmpeg packages
echo ""
warn "System Packages Clean-up"
echo "If you installed Node.js, NPM, and FFmpeg specifically for the PiBot,"
echo "you can remove them to restore your system to its default state."
read -r -p "Uninstall Node.js, NPM, and FFmpeg packages? [y/N]: " UNINSTALL_PKGS
UNINSTALL_PKGS="${UNINSTALL_PKGS:-N}"
if [[ "$UNINSTALL_PKGS" =~ ^[Yy]$ ]]; then
    info "Purging nodejs, npm, and ffmpeg..."
    sudo apt-get purge -y nodejs npm ffmpeg || true
    sudo apt-get autoremove -y || true
    
    # Remove NodeSource repository files if they exist
    if [[ -f "/etc/apt/sources.list.d/nodesource.list" ]]; then
        sudo rm -f "/etc/apt/sources.list.d/nodesource.list"
        sudo rm -f "/usr/share/keyrings/nodesource.gpg" 2>/dev/null || true
        sudo apt-get update -y || true
        success "NodeSource repository sources removed."
    fi
    success "Packages and repositories cleared successfully."
else
    info "System packages kept intact."
fi

# 5. Optional: Delete PiBot Directories & Data
echo ""
warn "Files & Directory Clean-up"
echo "This will delete all configurations, secrets, SQLite databases,"
echo "logs, virtual environments, and downloaded/cloned codebase files."
echo "Expected directories: "
echo "  - $PROJECT_ROOT"
echo "  - $HOME/pi-youtube-bot"
echo "  - $HOME/pibot"
echo ""
read -r -p "Delete all configuration, data, and codebase files? [y/N]: " DELETE_FILES
DELETE_FILES="${DELETE_FILES:-N}"
if [[ "$DELETE_FILES" =~ ^[Yy]$ ]]; then
    # We will remove other directories first, then our own root dir
    DIRS_TO_REMOVE=("$HOME/pi-youtube-bot" "$HOME/pibot")
    for dir in "${DIRS_TO_REMOVE[@]}"; do
        if [[ -d "$dir" && "$dir" != "$PROJECT_ROOT" ]]; then
            info "Deleting directory: $dir"
            rm -rf "$dir"
            success "Deleted: $dir"
        fi
    done
    
    # Delete the current workspace directory last (so the script completes execution gracefully)
    if [[ -d "$PROJECT_ROOT" ]]; then
        info "Deleting current project directory: $PROJECT_ROOT"
        # We start a background subshell to delete this directory after a short delay, 
        # so this script can finish exiting without crashing the shell.
        (sleep 1 && rm -rf "$PROJECT_ROOT") &
        success "Current project files marked for deletion."
    fi
else
    info "Codebase and config files kept intact."
fi

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}      🎉 UNINSTALL COMPLETED SUCCESSFULLY!                 ${NC}"
echo -e "${GREEN}============================================================${NC}"
echo "Your Raspberry Pi is now clean of Pi YouTube Bot."
echo "If you chose to delete files, they will be removed shortly."
echo "============================================================"
