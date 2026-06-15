#!/bin/bash
echo "==========================================="
echo "   PiBot Updater (Raspberry Pi Edition)"
echo "==========================================="

echo "1. Pulling latest code from GitHub..."
git pull origin master

echo "2. Installing dependencies (if any new ones)..."
pip install -r requirements.txt

echo "3. Restarting PiBot service..."
sudo systemctl restart pibot

echo "==========================================="
echo "   Update Complete!"
echo "==========================================="
