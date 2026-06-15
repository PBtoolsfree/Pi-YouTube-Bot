# Installation Guide — v3

## Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| Hardware | Raspberry Pi 4 (2 GB RAM) | Raspberry Pi 4 (4 GB RAM) |
| OS | Raspberry Pi OS Bookworm 64-bit | Same |
| Storage | 16 GB microSD | 32 GB Class 10 A1 |
| Internet | Required at install, optional after | Ethernet |

---

## Quick Install (One Command)

```bash
curl -sSL https://raw.githubusercontent.com/PBtoolsfree/pi-youtube-bot/main/scripts/setup.sh | bash
```

**The installer handles everything automatically:**
1. Installs system packages (Python 3.10+, Node.js 20, npm, FFmpeg, Git)
2. Clones repo to `~/pi-youtube-bot`
3. Creates Python virtual environment (`.venv`)
4. Installs all Python & npm dependencies
5. Builds the React frontend
6. Creates and starts systemd service (`pibot`)
7. Enables auto-start on boot
8. Configures logrotate (7 days, 20 MB max)

---

## Manual Step-by-Step

### 1. System packages
```bash
sudo apt-get update
sudo apt-get install -y git python3 python3-venv python3-pip ffmpeg curl
```

### 2. Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # Must be v20+
```

### 3. Clone repository
```bash
git clone https://github.com/PBtoolsfree/pi-youtube-bot.git ~/pi-youtube-bot
cd ~/pi-youtube-bot
```

### 4. Configure
```bash
cp config.example.json config.json
cp .env.example .env
nano config.json     # Fill in your API keys
nano .env            # Optional: add secrets as env vars
```

### 5. Python environment
```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

### 6. Build frontend
```bash
cd frontend
npm ci
npm run build
cd ..
```

### 7. Test run
```bash
.venv/bin/python main.py
# Visit http://localhost:8000/api/health
```

### 8. Install as service
```bash
bash scripts/setup.sh
# Service installs and starts automatically
```

---

## Managing the Service

```bash
sudo systemctl status pibot       # Status
sudo systemctl start pibot        # Start
sudo systemctl stop pibot         # Stop
sudo systemctl restart pibot      # Restart
sudo journalctl -fu pibot         # Live logs
```

---

## Auto-Updates (Optional)

```bash
crontab -e
# Add (runs daily 3 AM):
0 3 * * * /bin/bash $HOME/pi-youtube-bot/scripts/auto-update.sh >> $HOME/pi-youtube-bot/logs/auto-update.log 2>&1
```

---

## Uninstall

To cleanly remove all services, configuration, cron jobs, and optionally all dependencies and files:
```bash
curl -sSL https://raw.githubusercontent.com/PBtoolsfree/pibot/master/scripts/complete_uninstall.sh | bash
```

---

## Accessing Dashboard

```
http://<your-pi-ip>:8000
```

Find Pi's IP: `hostname -I`

---

## Docker Alternative

```bash
cp .env.example .env && nano .env
docker compose up -d
docker compose logs -f
```
