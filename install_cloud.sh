#!/bin/bash
# Cloud Orchestrator Bot Installation Script
echo "==========================================="
echo "   Pi YouTube Bot - Cloud Node Installer"
echo "==========================================="

if [ ! -d "bot-cloud" ]; then
    echo "Error: bot-cloud directory not found!"
    exit 1
fi

cd bot-cloud

# Migrate existing configuration files if they exist in the parent directory
if [ -f "../config.json" ] && [ ! -f "config.json" ]; then
    echo "Migrating existing config.json to bot-cloud..."
    cp ../config.json config.json
fi

if [ -f "../.env" ] && [ ! -f ".env" ]; then
    echo "Migrating existing .env to bot-cloud..."
    cp ../.env .env
fi

chmod +x scripts/setup.sh
echo "Starting cloud bot setup..."
./scripts/setup.sh

echo "==========================================="
echo "Setup complete!"
echo "To run the Cloud Bot Orchestrator:"
echo "  cd bot-cloud"
echo "  ./scripts/start.sh"
echo "==========================================="
