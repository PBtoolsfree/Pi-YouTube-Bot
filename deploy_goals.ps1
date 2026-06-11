$files = @(
    "frontend\src\index.css",
    "frontend\src\components\GamerFrame.jsx",
    "frontend\src\pages\ChatOverlay.jsx",
    "frontend\src\pages\SubscriberOverlay.jsx",
    "frontend\src\pages\TransactionsOverlay.jsx",
    "frontend\src\pages\TopViewersOverlay.jsx",
    "frontend\src\pages\GoalOverlay.jsx",
    "frontend\src\pages\AlertOverlay.jsx",
    "frontend\src\pages\GameOverlay.jsx",
    "frontend\src\pages\HubOverlay.jsx"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        $remote = $f -replace "\\", "/"
        Write-Host "Deploying $f to $remote..."
        pscp -pw 1234 $f pradip@172.168.30.135:/home/pradip/pi-youtube-bot/$remote
    } else {
        Write-Host "SKIP (not found): $f"
    }
}

Write-Host "Rebuilding frontend and restarting services..."
plink -pw 1234 pradip@172.168.30.135 "cd /home/pradip/pi-youtube-bot/frontend && npm run build && echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service"
Write-Host "Deployment complete! All overlays upgraded."
