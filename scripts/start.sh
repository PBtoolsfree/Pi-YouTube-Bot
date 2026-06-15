#!/usr/bin/env bash
# =============================================================================
#  Pi YouTube Bot — Start Wrapper Redirect
#  Redirects the old systemd service to the new bot-local architecture
# =============================================================================

# Change to the bot-local directory
cd "$(dirname "$0")/../bot-local"

# Execute the local start script explicitly using bash
exec bash ./scripts/start.sh
