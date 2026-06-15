$files = @(
"backend\bot_service.py",
"backend\services\agent_service.py",
"backend\services\ai_handler.py",
"backend\services\auth_service.py",
"backend\services\brain_service.py",
"backend\services\loyalty_games.py",
"backend\services\moderation_service.py",
"backend\services\redeem_service.py",
"backend\services\cloud_alert_client.py",
"backend\services\viewer_service.py",
"backend\services\discord_service.py",
"backend\services\youtube_service.py",
"config.example.json",
"backend\api.py",
"frontend\src\pages\Settings.jsx",
"frontend\src\pages\Loyalty.jsx",
"frontend\src\pages\Moderation.jsx"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        $remote = $f -replace "\\", "/"
        Write-Host "Deploying $f to $remote..."
        pscp -pw 1234 $f pradip@172.168.30.135:/home/pradip/pi-youtube-bot/$remote
    }
}

Write-Host "Rebuilding frontend and restarting services..."
plink -pw 1234 pradip@172.168.30.135 "cd /home/pradip/pi-youtube-bot/frontend && npm install && npm run build && echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service"
Write-Host "Deployment and Build complete."
