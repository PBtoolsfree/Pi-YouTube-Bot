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
chmod +x scripts/setup.sh
echo "Starting local bot setup..."
./scripts/setup.sh

echo "==========================================="
echo "Setup complete!"
echo "To run the Local Pi Bot:"
echo "  cd bot-local"
echo "  ./scripts/start.sh"
echo "==========================================="
