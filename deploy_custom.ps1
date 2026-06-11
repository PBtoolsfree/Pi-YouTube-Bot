$files = @(
"backend\services\viewer_service.py",
"backend\services\loyalty_games.py",
"backend\bot_service.py",
"backend\services\agent_service.py",
"backend\services\ai_handler.py"
)
foreach ($f in $files) {
    # Replace backslashes with forward slashes for the remote path
    $remote = $f -replace "\\", "/"
    Write-Host "Deploying $f to $remote..."
    pscp -pw 1234 $f pradip@172.168.30.135:/home/pradip/pi-youtube-bot/$remote
}
Write-Host "Deployment complete."
Write-Host "Restarting Bot Service..."
plink -pw 1234 pradip@172.168.30.135 "echo 1234 | sudo -S systemctl restart pibot"
Write-Host "Done."
