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
chmod +x scripts/setup.sh
echo "Starting cloud bot setup..."
./scripts/setup.sh

echo "==========================================="
echo "Setup complete!"
echo "To run the Cloud Bot Orchestrator:"
echo "  cd bot-cloud"
echo "  ./scripts/start.sh"
echo "==========================================="
