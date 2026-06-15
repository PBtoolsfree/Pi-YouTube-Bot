#!/bin/bash
echo "==========================================="
echo "   PiBot Updater (Raspberry Pi Edition)"
echo "==========================================="

echo "1. Pulling latest code from GitHub..."
git pull origin master

echo "2. Installing dependencies (if any new ones)..."
if [ -d ".venv" ]; then
    .venv/bin/pip install -r requirements.txt
else
    pip install -r requirements.txt --break-system-packages || pip install -r requirements.txt
fi

echo "3. Restarting PiBot service..."
sudo systemctl restart pibot

echo "==========================================="
echo "   Update Complete!"
echo "==========================================="
