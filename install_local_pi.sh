#!/bin/bash
# Local Raspberry Pi Bot Installation Script
echo "==========================================="
echo "   Pi YouTube Bot - Local Node Installer"
echo "==========================================="

if [ ! -d "bot-local" ]; then
    echo "Error: bot-local directory not found!"
    exit 1
fi

cd bot-local

# Migrate existing configuration files if they exist in the parent directory
if [ -f "../config.json" ] && [ ! -f "config.json" ]; then
    echo "Migrating existing config.json to bot-local..."
    cp ../config.json config.json
fi

if [ -f "../.env" ] && [ ! -f ".env" ]; then
    echo "Migrating existing .env to bot-local..."
    cp ../.env .env
fi

chmod +x scripts/setup.sh
echo "Starting local bot setup..."
./scripts/setup.sh

echo "==========================================="
echo "Setup complete!"
echo "To run the Local Pi Bot:"
echo "  cd bot-local"
echo "  ./scripts/start.sh"
echo "==========================================="
