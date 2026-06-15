$files = @(
"backend\audio_service.py",
"config.example.json",
"requirements.txt",
"frontend\src\pages\AudioEngine.jsx"
)
foreach ($f in $files) {
    $remote = $f -replace "\\", "/"
    Write-Host "Deploying $f to $remote..."
    pscp -pw 1234 "d:\bot\pi-youtube-bot\$f" "pradip@172.168.30.135:/home/pradip/pi-youtube-bot/$remote"
}
Write-Host "Files uploaded successfully. Rebuilding frontend and restarting services..."

$commands = @(
    "echo 1234 | sudo -S systemctl stop pibot",
    "cd /home/pradip/pi-youtube-bot && .venv/bin/pip install -r requirements.txt",
    "cd /home/pradip/pi-youtube-bot/frontend && npm run build",
    "echo 1234 | sudo -S systemctl start pibot",
    "echo 1234 | sudo -S systemctl status pibot --no-pager | head -n 15"
)

foreach ($cmd in $commands) {
    Write-Host "Running: $cmd"
    plink -pw 1234 -batch pradip@172.168.30.135 $cmd
}

Write-Host "Deployment complete."
