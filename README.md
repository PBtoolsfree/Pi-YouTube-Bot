# Pi YouTube Bot 🎥🤖

> **Production-Ready 24/7 YouTube Livestream Automation — Optimized for Raspberry Pi 4**

[![Version](https://img.shields.io/badge/version-v3.0.0-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Pi OS](https://img.shields.io/badge/Raspberry%20Pi%20OS-Bookworm-red)](https://www.raspberrypi.com/software/)

---

## 1. Project Overview

Pi YouTube Bot is a self-hosted automation system for YouTube livestreamers.  
It handles AI chat responses, live donation alerts, TTS audio, Telegram notifications, OBS overlays, and a full web dashboard — all running 24/7 on a Raspberry Pi 4.

**No cloud dependency.** Everything runs on your local hardware.

---

## 2. Feature Scope

| Category | Features |
|----------|---------|
| 💬 **AI Chat** | Gemini, OpenAI, OpenRouter, Groq, Ollama — automatic failover |
| 🔊 **TTS Audio** | Edge-TTS neural voices · UDP stream to gaming PC · local playback |
| 💸 **Donations** | PhonePe payment gateway · Paytm/UPI notification forwarding · email scanning |
| 📊 **Dashboard** | Real-time React dashboard · config editor · queue control |
| 📱 **Telegram** | Alerts (donations, subs) · remote control commands |
| 🌐 **Cloudflare** | Secure public tip page · no port forwarding required |
| 🎮 **OBS Overlay** | WebSocket sub counter · animated donation alerts |
| 💰 **Loyalty** | Viewer XP & points system · leaderboard · chat commands |
| 🧠 **AI Memory** | Per-viewer conversation context retention |
| 📋 **Sheets** | Google Sheets logging for SuperChats & donations |
| 🔒 **Security** | Webhook secrets · rate limiting · path allowlist · .env secrets |
| 🏥 **Health** | `/api/health` · systemd auto-restart · rollback updates |

---

## 3. Architecture Diagram

```
┌───────────────────────────────────────────────────────┐
│                    Raspberry Pi 4                      │
│                                                        │
│  ┌─────────────────┐   ┌──────────────────────────┐   │
│  │  FastAPI :8000  │◄─►│      Bot Service          │   │
│  │  (api.py)       │   │  ┌────────────────────┐   │   │
│  └────────┬────────┘   │  │  YouTube Chat live │   │   │
│           │            │  │  AI Engine (fallbk)│   │   │
│  ┌────────▼────────┐   │  │  Audio/TTS Queue   │   │   │
│  │  React Vite UI  │   │  │  Loyalty System    │   │   │
│  │  (frontend/dist)│   │  │  Telegram Bot      │   │   │
│  └─────────────────┘   │  │  Webhook Handler   │   │   │
│                         │  └────────────────────┘   │   │
│                         └──────────────────────────┘   │
└────────────────────────┬──────────────────────────────┘
                         │
       ┌─────────────────┼──────────────────┐
       ▼                 ▼                  ▼
  Gaming PC        Cloudflare Tunnel    Telegram
  OBS + UDP Audio  Public Tip Page     Alerts & Control
  (ports 1234/1235) (tip, webhooks)
```

---

## 4. Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Model | Raspberry Pi 4 (2 GB RAM) | Raspberry Pi 4 (4 GB RAM) |
| Storage | 16 GB microSD | 32 GB microSD (Class 10 A1) |
| Power | Official 3A USB-C adapter | UPS-supported |
| Network | Wi-Fi | Ethernet (for stability) |
| Cooling | Passive heatsink | Active fan case |

> Pi 5 is also supported. Pi 3 may work but is not recommended.

---

## 5. Software Requirements

| Software | Version | Notes |
|----------|---------|-------|
| Raspberry Pi OS | Bookworm (64-bit) | `raspi-config` → 64-bit |
| Python | 3.10+ | Installed automatically |
| Node.js | 20 LTS | Installed automatically |
| FFmpeg | Latest stable | Installed automatically |
| Git | 2.x+ | Installed automatically |

---

## 6. Raspberry Pi Installation Guide

### Quick Install (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/PBtoolsfree/pi-youtube-bot/main/scripts/setup.sh | bash
```

### What it does (automatically):
1. Installs Python 3, Node.js v20, npm, FFmpeg, Git
2. Clones the repository to `~/pi-youtube-bot`
3. Creates Python virtual environment (`.venv`)
4. Installs all Python & npm dependencies
5. Builds the React frontend (`npm run build`)
6. Creates and starts a systemd service (`pibot`)
7. Enables auto-start on every boot
8. Configures log rotation (7 days, 20 MB max)

### After Install:
```bash
# Edit your configuration
nano ~/pi-youtube-bot/config.json

# Restart to apply
sudo systemctl restart pibot

# Check it's running
curl http://localhost:8000/api/health
```

---

## 6.1 Cloud VPS / Oracle Cloud Setup (Tip Page Only)

For running only the public Tip Page and webhook payment handlers in the cloud (VPS) with dashboard password protection.

### Quick Install (Recommended)

```bash
curl -sSL https://raw.githubusercontent.com/PBtoolsfree/pibot/main/scripts/deploy_cloud.sh | bash
```

### What it does (automatically):
1. Installs Node.js v20+, Python 3, Git, SQLite
2. Clones the repository to `~/pibot`
3. Creates Python virtual environment (`.venv`) and installs requirements
4. Generates secure credentials:
   - **`security.dashboard_password`**: Unique admin dashboard password
   - **`security.webhook_secret`**: Webhook validation secret token
5. Rebuilds the frontend Tip Page assets
6. Registers and starts the systemd service (`pibot-cloud.service`) in Cloud Mode (`RUN_MODE=cloud`)

### How to Update:
```bash
bash scripts/update_cloud.sh
```

> 💡 **Oracle Cloud (OCI) Users**:
> 1. Add an Ingress Rule in OCI Virtual Cloud Network (VCN) subnet allowing TCP port `8000`.
> 2. Open port `8000` in the OS firewall by running `sudo iptables -I INPUT 6 -p tcp --dport 8000 -j ACCEPT && sudo netfilter-persistent save`.
> Detailed guide: [Cloud-Deployment.md](docs/Cloud-Deployment.md)

---

## 7. Manual Installation Guide (Linux)

```bash
# 1. Install system packages
sudo apt-get update
sudo apt-get install -y git python3 python3-venv python3-pip ffmpeg curl

# 2. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Clone repository
git clone https://github.com/PBtoolsfree/pi-youtube-bot.git ~/pi-youtube-bot
cd ~/pi-youtube-bot

# 4. Configure
cp config.example.json config.json
cp .env.example .env
nano config.json   # Add your API keys

# 5. Python virtualenv
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 6. Build frontend
cd frontend && npm ci && npm run build && cd ..

# 7. Run manually (testing)
.venv/bin/python main.py

# 8. Install as service
bash scripts/setup.sh
```

---

## 8. Environment Variables Setup

Create `.env` from the template:
```bash
cp .env.example .env
nano .env
```

| Variable | Example | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | `sk-...` | OpenAI / OpenRouter key |
| `GEMINI_API_KEY` | `AIza...` | Google Gemini API key |
| `TELEGRAM_BOT_TOKEN` | `12345:ABC...` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | `-100...` | Your Telegram group/DM ID |
| `WEBHOOK_SECRET` | `random-string-64` | Secures webhook endpoints |
| `PIBOT_AUTO_UPDATE_ON_START` | `true` | Auto-pull updates at each boot |

> `.env` is gitignored — your secrets stay local. Never put real keys in `config.json`.

---

## 9. AI Provider Setup

### 9.1 Google Gemini (Free tier available)

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create API key
3. Add to `config.json`:

```json
{
  "id": "gemini",
  "type": "gemini",
  "enabled": true,
  "api_key": "AIza...",
  "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
  "models": [{ "id": "gemini-2.0-flash", "enabled": true, "priority": 1 }]
}
```

### 9.2 OpenAI

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Add to `config.json`:

```json
{
  "id": "openai",
  "type": "openai",
  "enabled": true,
  "api_key": "sk-...",
  "base_url": "https://api.openai.com/v1",
  "models": [{ "id": "gpt-4o-mini", "enabled": true, "priority": 2 }]
}
```

### 9.3 OpenRouter (100+ models, generous free tier)

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Add to `config.json`:

```json
{
  "id": "openrouter",
  "type": "custom",
  "enabled": true,
  "api_key": "sk-or-...",
  "base_url": "https://openrouter.ai/api/v1",
  "models": [{ "id": "meta-llama/llama-3.1-8b-instruct:free", "enabled": true, "priority": 3 }]
}
```

> **Failover**: AI providers are tried in ascending `priority` order. If one fails, the next is used automatically.

---

## 10. Telegram Bot Setup

```
1. Open Telegram → search @BotFather
2. Send /newbot → choose name → copy token
3. Start a chat with your bot → send any message
4. Visit: https://api.telegram.org/bot<TOKEN>/getUpdates
5. Find "chat": {"id": ...} → copy your chat ID
```

Add to `config.json`:
```json
"telegram": {
  "enabled": true,
  "token": "1234567890:ABCdef...",
  "chat_id": "-100..."
}
```

**Telegram Alerts:** donations, new subscribers, errors, update status  
**Remote Commands:** `/status`, `/skip`, `/pause`, `/resume`, `/version`

---

## 11. Cloudflare Tunnel Setup

Expose your tip page publicly — no port forwarding, no static IP needed.

### Quick (temporary, no account):
```bash
cloudflared tunnel --url http://localhost:8000
# Use the https://*.trycloudflare.com URL
```

### Permanent tunnel:
```bash
# Install cloudflared
sudo apt-get install cloudflared

# Authenticate
cloudflared login

# Create tunnel
cloudflared tunnel create pibot
cloudflared tunnel route dns pibot tip.yourdomain.com

# Config: ~/.cloudflared/config.yml
tunnel: pibot
credentials-file: ~/.cloudflared/<id>.json
ingress:
  - hostname: tip.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404

# Run as service
cloudflared service install
sudo systemctl enable cloudflared && sudo systemctl start cloudflared
```

**Security config:**
```json
"security": {
  "tunnel_domains": ["yourdomain.com", "trycloudflare.com"],
  "webhook_secret": "your-strong-secret-here",
  "allowed_public_paths": ["/tip", "/api/donate", "/api/webhook/*"]
}
```

---

## 12. OBS Overlay Setup

### Browser Source (Subscriber Counter)
1. OBS → Sources → **+** → **Browser**
2. URL: `http://<pi-ip>:8000/overlay`
3. Width: `1920` · Height: `1080`
4. ✓ Refresh when scene becomes active

### UDP Audio Source (TTS)
1. OBS → Sources → **+** → **Media Source**
2. Uncheck **Local File**
3. Input: `udp://0.0.0.0:1234` (public TTS) or `udp://0.0.0.0:1235` (alerts)
4. Input Format: `mpegts`
5. Buffering: `200ms`

> Windows Firewall must allow UDP inbound on ports 1234 and 1235.

---

## 13. TTS Setup

```json
"audio": {
  "enabled": true,
  "voice": "en-IN-PrabhatNeural",
  "rate": "+0%",
  "volume": "+0%",
  "local_playback": false,
  "gaming_pc_ip": "192.168.1.100",
  "udp_ports": { "public": 1234, "secret": 1235 }
}
```

**List available voices:**
```bash
.venv/bin/edge-tts --list-voices | grep "en-IN\|en-US"
```

**Popular voices:**
| Voice | Accent |
|-------|--------|
| `en-IN-PrabhatNeural` | Indian English, Male |
| `en-IN-NeerjaExpressiveNeural` | Indian English, Female |
| `en-US-GuyNeural` | American, Male |
| `en-GB-RyanNeural` | British, Male |

**API Queue Control:**
- `POST /api/audio/skip` — skip current
- `POST /api/audio/pause` — pause queue
- `POST /api/audio/clear` — clear all pending

---

## 14. Donation System Setup

### PhonePe Payment Gateway
```json
"tip_page": {
  "gateway": {
    "type": "phonepe",
    "merchant_id": "YOUR_MERCHANT_ID",
    "salt_key": "YOUR_SALT_KEY"
  }
},
"paytm_alerts": { "enabled": true, "min_amount": 10, "tts_enabled": true }
```
Set webhook in PhonePe portal: `https://<your-tunnel>/api/webhook/phonepe?secret=<WEBHOOK_SECRET>`

### UPI / Paytm (Notification Forwarding)
- App: **"Notification 2 Webhook"** (Play Store)  
- Webhook URL: `https://<tunnel>/api/webhook/paytm?secret=<WEBHOOK_SECRET>`

### Test Donation:
```bash
curl -X POST http://localhost:8000/api/donate \
  -H "Content-Type: application/json" \
  -d '{"user":"TestUser","amount":100,"message":"Test"}'
```

---

## 15. Dashboard Usage Guide

Open `http://<pi-ip>:8000` in any browser.

| Section | Description |
|---------|-------------|
| **Home** | Bot status, subscriber count, live controls |
| **Config** | Edit all settings in browser with live validation |
| **Logs** | Real-time log viewer |
| **Overlay** | Preview OBS overlays |
| **Audio** | TTS queue status, test audio |
| **Providers** | AI provider health and test |
| **Tunnel** | Cloudflare tunnel control |

---

## 16. Start / Stop Service

```bash
sudo systemctl start pibot      # Start
sudo systemctl stop pibot       # Stop
sudo systemctl restart pibot    # Restart
sudo systemctl status pibot     # Status

sudo journalctl -fu pibot       # Live logs
tail -f ~/pi-youtube-bot/logs/pibot.log  # File logs
```

---

## 17. How to Update

```bash
# Standard update (with rollback on failure)
bash ~/pi-youtube-bot/scripts/update.sh

# Force reinstall even if already up to date
bash ~/pi-youtube-bot/scripts/update.sh --force
```

The update script:
- Saves current commit for rollback
- Stashes your config changes
- Pulls latest code
- Rebuilds frontend (only if package.json changed)
- Rolls back automatically if service fails to start

---

## 18. How to Enable Auto-Update

```bash
crontab -e
# Add this line (runs every day at 3 AM):
0 3 * * * /bin/bash $HOME/pi-youtube-bot/scripts/auto-update.sh >> $HOME/pi-youtube-bot/logs/auto-update.log 2>&1
```

---

## 19. How to Backup

```bash
# Backup config and data only (what matters)
BACKUP="pibot-backup-$(date +%Y%m%d).tar.gz"
tar -czf ~/$BACKUP \
    ~/pi-youtube-bot/config.json \
    ~/pi-youtube-bot/.env \
    ~/pi-youtube-bot/data/ \
    ~/pi-youtube-bot/logs/
echo "Backup: $BACKUP"

# Full backup
tar -czf ~/pibot-full-$(date +%Y%m%d).tar.gz \
    --exclude="~/pi-youtube-bot/.venv" \
    --exclude="~/pi-youtube-bot/node_modules" \
    --exclude="~/pi-youtube-bot/frontend/dist" \
    ~/pi-youtube-bot/
```

---

## 20. Troubleshooting Guide

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Service won't start | `sudo journalctl -fu pibot` | Check Python errors or missing config |
| Dashboard blank | `ls frontend/dist/` | `cd frontend && npm run build` |
| No TTS audio | `tail logs/audio_debug.log` | Check `gaming_pc_ip`, UDP firewall rules |
| AI not responding | `GET /api/providers/test/gemini` | Check API key and quota |
| Webhook 401 | Check request headers | Pass `?secret=` or `x-webhook-secret:` |
| High CPU | Check `htop` | Disable `reload=True` — already fixed in v3 |
| Rollback happened | `cat logs/update.log` | Fix the issue, manually run `update.sh` |

### Dashboard not opening

If the dashboard does not open, run the health check script to see what is wrong:
```bash
bash scripts/check_dashboard.sh
```
This script will check if the service is running, if port 8000 is listening, and show recent logs and the correct local URL.

**Quick health check:**
```bash
curl -s http://localhost:8000/api/health | python3 -m json.tool
```

---

## 21. Security Best Practices

- ⚠️ **Never commit `config.json` with real API keys** — use `.env`
- 🔐 Set `security.webhook_secret` to a 64-char random string
- 🚫 Keep `allowed_public_paths` minimal — only expose what tip viewers need
- 🔒 Use HTTPS via Cloudflare Tunnel — never expose HTTP to internet directly
- 🛡️ Rate limiting enabled: 60 req/min per IP on tunnel traffic
- 🔑 Rotate API keys periodically via the dashboard Config editor
- 🌐 Set `security.cors_origins` explicitly in production

---

## 22. Performance Optimization Guide

Optimized for Raspberry Pi 4 (4 GB RAM):

```json
"server": { "host": "0.0.0.0", "port": 8000 }
```

| Setting | Optimal | Default |
|---------|---------|---------|
| `audio.max_queue_size` | 20 | 20 |
| `youtube.fetch_interval` | 60s | 30s (increase to reduce API calls) |
| `ai_topology.providers` | Use Groq for fastest local latency | varies |

```bash
# Monitor Pi resource usage
htop
vcgencmd measure_temp        # CPU temperature
vcgencmd get_throttled       # Throttling status

# Check log file size
du -sh ~/pi-youtube-bot/logs/
```

> Keep CPU temp < 70°C for sustained performance. Consider active cooling.

---

## 🗂️ Project Structure

```
pi-youtube-bot/
├── backend/               # FastAPI application
│   ├── api.py             # All HTTP/WebSocket routes
│   ├── bot_service.py     # Core orchestration
│   ├── ai_service.py      # AI provider failover engine
│   ├── audio_service.py   # TTS + FFmpeg pipeline
│   ├── config_manager.py  # Thread-safe config + .env
│   └── services/          # Integrations (PhonePe, Telegram, Email…)
├── frontend/              # React + Vite dashboard
│   └── src/
├── scripts/               # Management scripts
│   ├── setup.sh           # Production installer
│   ├── start.sh           # systemd entry point
│   ├── update.sh          # Update + rollback
│   ├── uninstall.sh       # Clean removal
│   └── auto-update.sh     # Daily cron
├── docs/                  # Detailed documentation
├── tests/                 # Smoke tests
├── logs/                  # Runtime logs (gitignored)
├── data/                  # State data (gitignored)
├── Dockerfile             # Multi-stage container build
├── docker-compose.yml     # Compose with volumes & healthcheck
├── config.example.json    # Config template
├── .env.example           # Environment variable template
├── requirements.txt       # Pinned Python dependencies
├── main.py                # Application entry point
├── VERSION                # Current version (3.0.0)
└── CHANGELOG.md           # Version history
```

---

## 🐳 Docker (Alternative to Pi Install)

```bash
cp .env.example .env && nano .env
docker compose up -d
docker compose logs -f
```

---

## 📚 More Documentation

- [Installation Guide](docs/Installation.md)
- [Configuration Reference](docs/Configuration.md)
- [AI Providers](docs/AI-Providers.md)
- [Telegram Setup](docs/Telegram-Setup.md)
- [Cloudflare Tunnel](docs/Cloudflare-Tunnel.md)
- [OBS Overlay](docs/OBS-Overlay.md)
- [TTS Setup](docs/TTS-Setup.md)
- [Donations Setup](docs/Donations-Setup.md)
- [FAQ & Troubleshooting](docs/FAQ.md)

---

## 📝 License

[MIT](LICENSE) — Free for personal and commercial use.

---

*Built for Raspberry Pi 4 · Python 3.11 · FastAPI · React/Vite · Edge-TTS · v3.0.0*
