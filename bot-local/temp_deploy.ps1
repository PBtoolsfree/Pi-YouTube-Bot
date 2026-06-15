$files = @(
"backend\api.py",
"backend\bot_service.py",
"backend\services\cloud_alert_client.py",
"frontend\src\pages\Settings.jsx",
"frontend\src\App.jsx",
"frontend\src\components\Layout.jsx",
"frontend\src\pages\TipPageSettings.jsx",
"frontend\src\pages\AppWebhookSettings.jsx",
"frontend\src\pages\LocalPiConnection.jsx",
"frontend\src\pages\Dashboard.jsx"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        $remote = $f -replace "\\", "/"
        Write-Host "Deploying $f to $remote..."
        pscp -pw 1234 $f pradip@172.168.30.135:/home/pradip/pi-youtube-bot/$remote
    } else {
        Write-Host "Warning: $f not found locally."
    }
}

Write-Host "Rebuilding frontend and restarting services..."
plink -pw 1234 pradip@172.168.30.135 "cd /home/pradip/pi-youtube-bot/frontend && npm install && npm run build && echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service"
Write-Host "Deployment and Build complete."
