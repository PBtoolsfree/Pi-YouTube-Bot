$files = @(
"backend\bot_service.py",
"backend\api.py",
"backend\ai_service.py",
"backend\services\discord_service.py",
"backend\services\youtube_service.py",
"backend\services\auth_service.py",
"backend\services\ai_handler.py",
"backend\services\redeem_service.py",
"backend\services\viewer_service.py",
"backend\services\loyalty_games.py",
"frontend\src\pages\Settings.jsx",
"frontend\src\pages\Loyalty.jsx",
"frontend\src\components\Layout.jsx",
"frontend\src\pages\RedeemManager.jsx",
"backend\services\giveaway_service.py",
"frontend\src\App.jsx",
"frontend\src\pages\Giveaways.jsx",
"frontend\src\pages\GiveawaySpinOverlay.jsx",
"frontend\src\pages\OBS.jsx",
"backend\services\cloud_alert_client.py",
"frontend\src\pages\RotatingWidgetOverlay.jsx",
"frontend\src\pages\TransactionsOverlay.jsx",
"frontend\src\pages\TopViewersOverlay.jsx"
)
foreach ($f in $files) {
    # Replace backslashes with forward slashes for the remote path
    $remote = $f -replace "\\", "/"
    Write-Host "Deploying $f to $remote..."
    pscp -pw 1234 $f pradip@172.168.30.135:/home/pradip/pi-youtube-bot/$remote
}
Write-Host "Deployment complete."
