# Deploy Discord Removal Changes

Write-Host "Copying backend files..."
pscp -pw 1234 backend\bot_service.py pradip@172.168.30.135:/home/pradip/pi-youtube-bot/backend/bot_service.py
pscp -pw 1234 backend\services\agent_service.py pradip@172.168.30.135:/home/pradip/pi-youtube-bot/backend/services/agent_service.py

Write-Host "Deleting Discord service on remote..."
plink -pw 1234 pradip@172.168.30.135 "rm -f /home/pradip/pi-youtube-bot/backend/services/discord_service.py"

Write-Host "Copying frontend files..."
pscp -pw 1234 frontend\src\pages\RedeemManager.jsx pradip@172.168.30.135:/home/pradip/pi-youtube-bot/frontend/src/pages/RedeemManager.jsx
pscp -pw 1234 frontend\src\pages\Settings.jsx pradip@172.168.30.135:/home/pradip/pi-youtube-bot/frontend/src/pages/Settings.jsx

Write-Host "Building React UI remotely..."
plink -pw 1234 pradip@172.168.30.135 "cd /home/pradip/pi-youtube-bot/frontend && npm run build"

Write-Host "Restarting pi-youtube-bot..."
plink -pw 1234 pradip@172.168.30.135 "echo 1234 | sudo -S systemctl restart pibot"

Write-Host "Done!"
