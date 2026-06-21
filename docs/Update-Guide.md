# 🔄 Pi YouTube Bot — Local Pi Update Guide

> **Applies to:** Pi YouTube Bot v3.0+ (split `bot-local` / `bot-cloud` architecture)  
> **Target platform:** Raspberry Pi OS (Bookworm 64-bit)  
> **Current Version:** 3.0.2

---

## Table of Contents

1. [Before You Update](#before-you-update)
2. [Quick Update (One-liner)](#quick-update-one-liner)
3. [Full Manual Update (Step-by-Step)](#full-manual-update-step-by-step)
4. [Force Reinstall](#force-reinstall)
5. [Auto-Update (Daily Cron)](#auto-update-daily-cron)
6. [Update via Docker](#update-via-docker)
7. [What the Update Script Does](#what-the-update-script-does)
8. [Checking Update Status](#checking-update-status)
9. [Rollback](#rollback)
10. [Backup Before Major Updates](#backup-before-major-updates)
11. [Cloud VPS Update](#cloud-vps-update)
12. [Troubleshooting](#troubleshooting)

---

## Before You Update

> **⚠️ IMPORTANT — Split Architecture (v3.0+)**  
> Since v3.0, the project is split into two separate nodes:  
> - **`bot-local/`** → Runs on your Raspberry Pi (lightweight: TTS, chat relay, redeems, OBS)  
> - **`bot-cloud/`** → Runs on your Cloud VPS (heavy: AI engine, orchestrator, personalities, points)  
>
> **You must update them separately.** Updating one does NOT update the other.

### What gets updated:
- Python backend code (`bot-local/backend/`)
- Frontend dashboard (`bot-local/frontend/`)
- Scripts (`bot-local/scripts/`)
- Python dependencies (`requirements.txt`)

### What is NEVER overwritten:
- `config.json` — your personal settings
- `.env` — your API keys and secrets
- `viewers.db` — loyalty points and viewer database
- `data/` — audio logs, donation history, etc.
- `client_secret.json` — Google OAuth credentials

---

## Quick Update (One-liner)

SSH into your Pi and run:

```bash
cd ~/pibot && bash ./update_local_pi.sh
```

Or use the more robust internal update script (with backup + rollback):

```bash
cd ~/pibot/bot-local && bash scripts/update.sh
```

That's it. The script handles everything automatically, including rollback if the service fails to start.

---

## Full Manual Update (Step-by-Step)

If you prefer to do things step-by-step:

### Step 1: SSH into your Raspberry Pi

```bash
ssh pradip@172.168.30.135
# Password: 1234
```

### Step 2: Navigate to the project

```bash
cd ~/pibot
```

### Step 3: Check what will change (optional)

```bash
git fetch origin master
git log --oneline HEAD..origin/master
```

If the output is empty — you're already up to date. If it shows commits, proceed.

### Step 4: Create a manual backup (recommended)

```bash
cd bot-local
python3 scripts/backup_manager.py --backup-only
cd ..
```

### Step 5: Pull the latest code

```bash
git pull origin master
```

> **If `git pull` gives a merge conflict error**, use the nuclear option:
> ```bash
> git fetch origin
> git reset --hard origin/master
> ```
> This is safe because your `config.json`, `.env`, and `viewers.db` are gitignored.

### Step 6: Update Python dependencies

```bash
cd bot-local
.venv/bin/pip install -r requirements.txt --quiet
```

### Step 7: Rebuild frontend (only if UI changed)

```bash
cd frontend
npm install --silent
export NODE_OPTIONS=--max_old_space_size=512
npm run build
cd ../..
```

### Step 8: Restart the service

```bash
sudo systemctl restart pibot.service
```

### Step 9: Verify it's running (wait ~15 seconds for Python to load)

```bash
sudo systemctl status pibot.service
# or check the health endpoint:
curl -s http://localhost:8000/api/health | python3 -m json.tool
```

---

## Force Reinstall

Forces a complete dependency reinstall and frontend rebuild, even if code hasn't changed:

```bash
cd ~/pibot/bot-local
bash scripts/update.sh --force
```

The `--force` flag triggers:
- Full `pip install -r requirements.txt`
- Complete `npm install` + `npm run build`
- Service restart with rollback check

---

## Auto-Update (Daily Cron)

### Enable via setup script (interactive)

```bash
cd ~/pibot/bot-local
bash scripts/setup.sh
# When prompted: "Enable automatic daily updates at 3:00 AM?" → y
```

### Enable manually

```bash
crontab -e
```

Add this line:

```
0 3 * * * /bin/bash $HOME/pibot/bot-local/scripts/auto-update.sh >> $HOME/pibot/bot-local/logs/auto-update.log 2>&1
```

### What auto-update does

| Step | Description |
|------|-------------|
| 1 | Checks lock file (prevents concurrent runs) |
| 2 | Fetches from GitHub |
| 3 | Compares local vs remote commit hashes |
| 4 | **Skips entirely** if already up to date |
| 5 | Delegates to `scripts/update.sh` (with auto-rollback) |
| 6 | Logs everything to `logs/auto-update.log` |

### Disable auto-update

```bash
crontab -e
# Delete or comment out the auto-update.sh line
```

---

## Update via Docker

If you're running the Docker deployment:

```bash
cd ~/pibot/bot-local
git pull origin master
docker compose pull
docker compose up -d --build
```

---

## What the Update Script Does

Here's the exact flow when you run `bash scripts/update.sh`:

```
┌─────────────────────────────────────────────┐
│  Step 1/5: Create local data backup         │
│  (config, .env, viewers.db, data/)          │
├─────────────────────────────────────────────┤
│  Step 2/5: git pull origin <branch>         │
│  (fetches latest code from GitHub)          │
├─────────────────────────────────────────────┤
│  Step 3/5: pip install -r requirements.txt  │
│  (updates Python packages in .venv)         │
├─────────────────────────────────────────────┤
│  Step 4/5: npm install + npm run build      │
│  (only with --force or --frontend flag)     │
├─────────────────────────────────────────────┤
│  Step 5/5: systemctl restart pibot          │
│  (restarts the systemd service)             │
├─────────────────────────────────────────────┤
│  ⚠ ROLLBACK CHECK (after 3 seconds)        │
│  If service failed → git reset --hard       │
│  to previous commit and restart again       │
└─────────────────────────────────────────────┘
```

---

## Checking Update Status

```bash
# Current version
cat ~/pibot/bot-local/VERSION

# Service status
sudo systemctl status pibot.service

# Health endpoint (version + uptime)
curl -s http://localhost:8000/api/health

# Recent git changes
git -C ~/pibot log --oneline -10

# Last update/start log
tail -50 ~/pibot/bot-local/logs/start.log

# Auto-update log
tail -50 ~/pibot/bot-local/logs/auto-update.log

# Live service logs (follow mode)
sudo journalctl -fu pibot.service
```

---

## Rollback

### Automatic rollback

The update script automatically rolls back if `pibot.service` fails to start within 3 seconds after an update. No action needed.

### Manual rollback

```bash
cd ~/pibot

# See recent commits
git log --oneline -10

# Roll back to the previous commit
git reset --hard HEAD~1
sudo systemctl restart pibot.service

# Or roll back to a specific commit
git checkout <commit-hash>
cd bot-local/frontend && npm run build && cd ../..
sudo systemctl restart pibot.service
```

---

## Backup Before Major Updates

### Quick backup (data only)

```bash
cd ~/pibot/bot-local
python3 scripts/backup_manager.py --backup-only
```

This saves to `bot-local/backups/manual_backup_<timestamp>/`:
- `config.json`, `.env`
- `viewers.db` and any `.db` / `.sqlite` files
- `client_secret.json`, `sheets_client_secret.json`, `token.json`
- Entire `data/` folder

### Full archive backup

```bash
BACKUP="pibot-backup-$(date +%Y%m%d).tar.gz"
tar -czf ~/$BACKUP \
    ~/pibot/bot-local/config.json \
    ~/pibot/bot-local/.env \
    ~/pibot/bot-local/viewers.db \
    ~/pibot/bot-local/data/ \
    ~/pibot/bot-local/client_secret.json \
    ~/pibot/bot-local/sheets_client_secret.json \
    2>/dev/null
echo "✅ Backup saved: ~/$BACKUP"
```

### Copy backup off the Pi (from Windows)

```bash
scp pradip@172.168.30.135:~/pibot-backup-*.tar.gz D:\bot\backups\
```

---

## Cloud VPS Update

> This section is for updating the **Cloud VPS** (Oracle/DigitalOcean/AWS). The Local Pi has its own update process above.

### Quick update

```bash
cd ~/pibot
bash ./update_cloud.sh
```

### Manual update

```bash
cd ~/pibot
git fetch origin
git reset --hard origin/master
cd bot-cloud
.venv/bin/pip install -r requirements.txt --quiet
cd frontend && npm install --silent && npm run build && cd ..
sudo systemctl restart pibot-cloud.service
```

> **Note:** The Cloud service is named `pibot-cloud.service` (not `pibot.service`). Don't confuse them!

---

## Troubleshooting

### ❌ `git pull` fails with merge conflicts

```bash
cd ~/pibot
git fetch origin
git reset --hard origin/master
```

> Your `config.json`, `.env`, and `viewers.db` are in `.gitignore`, so they are **never** affected by git operations. `git reset --hard` is safe.

---

### ❌ `ERR_CONNECTION_REFUSED` — Dashboard not loading after update

**Most common cause:** The bot crashed during startup before port 8000 could open.

Check the error:
```bash
sudo journalctl -fu pibot.service --no-pager -n 50
```

**Common fixes:**

| Error in logs | Fix |
|---|---|
| `ModuleNotFoundError` / `ImportError` | `.venv/bin/pip install -r requirements.txt` |
| `KeyError: 'youtube'` (missing config key) | Copy config: `cp ~/pibot/config.json ~/pibot/bot-local/config.json` |
| `AttributeError` (deleted function) | `git fetch origin && git reset --hard origin/master` |
| `status=126` (Permission denied) | Fix service: see [Service path fix](#-service-shows-status126-or-status127) |
| `status=127` (File not found) | Fix service path: see below |

---

### ❌ Service shows `status=126` or `status=127`

This means the systemd service file is pointing to the **old path** (before the split architecture).

**Fix it by re-running the update script:**
```bash
cd ~/pibot
git pull origin master
bash ./update_local_pi.sh
```

The update script automatically detects old service paths and rewrites them to point to `bot-local/`.

**Or fix manually:**
```bash
# Check current service path
cat /etc/systemd/system/pibot.service

# If it shows the old path (/pibot/scripts/start.sh), fix it:
sudo sed -i 's|/pibot/scripts/start.sh|/pibot/bot-local/scripts/start.sh|g' /etc/systemd/system/pibot.service
sudo sed -i 's|WorkingDirectory=.*/pibot$|WorkingDirectory=/home/pradip/pibot/bot-local|g' /etc/systemd/system/pibot.service
sudo systemctl daemon-reload
sudo systemctl restart pibot.service
```

---

### ❌ `config.json` missing in `bot-local/` after migration

When migrating from the old single-folder structure to the new split architecture, your `config.json` stays in the old root folder. The new `bot-local/` folder won't have it.

```bash
# Copy your existing config to the new location
cp ~/pibot/config.json ~/pibot/bot-local/config.json
cp ~/pibot/.env ~/pibot/bot-local/.env 2>/dev/null

# Restart
sudo systemctl restart pibot.service
```

> The `install_local_pi.sh` script does this automatically for new installations.

---

### ❌ Frontend shows old UI after update

The update script only rebuilds the frontend with `--force` or `--frontend` flag:

```bash
cd ~/pibot/bot-local
bash scripts/update.sh --frontend
```

After updating, **hard refresh your browser**: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac).

---

### ❌ `npm run build` fails (out of memory on Raspberry Pi)

```bash
export NODE_OPTIONS=--max_old_space_size=512
cd ~/pibot/bot-local/frontend
npm run build
```

---

### ❌ Auto-update stuck (lock file won't clear)

```bash
rm -f /tmp/pibot_auto_update.lock
```

The lock file auto-expires after 1 hour, but you can remove it manually.

---

### ❌ `not a git repository` error

You're in the wrong directory. Always navigate to `~/pibot` first:

```bash
cd ~/pibot
git pull origin master
```

---

### ❌ Permission denied on `systemctl`

```bash
sudo visudo
# Add this line at the end:
pradip ALL=(ALL) NOPASSWD: /bin/systemctl restart pibot.service, /bin/systemctl status pibot.service, /bin/systemctl daemon-reload
```

---

### ❌ Python venv completely broken

Nuclear option — rebuild the virtual environment from scratch:

```bash
cd ~/pibot/bot-local
rm -rf .venv
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
sudo systemctl restart pibot.service
```

---

### ❌ AI Testing doesn't work from Local Pi dashboard

This is **expected behavior** in the split architecture. AI processing runs on the Cloud VPS, not the Local Pi.

- To test AI: Use the **Cloud Dashboard** → Testing tab
- The Local Pi's Testing tab will forward test messages to the Cloud automatically (v3.0.2+)

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────┐
│  LOCAL PI UPDATE (SSH into Pi)                       │
│  cd ~/pibot && bash ./update_local_pi.sh             │
│                                                      │
│  CLOUD VPS UPDATE (SSH into Cloud)                   │
│  cd ~/pibot && bash ./update_cloud.sh                │
│                                                      │
│  FORCE UPDATE (Nuclear)                              │
│  cd ~/pibot                                          │
│  git fetch origin && git reset --hard origin/master  │
│  bash ./update_local_pi.sh    # (or update_cloud.sh) │
│                                                      │
│  CHECK STATUS                                        │
│  sudo systemctl status pibot.service                 │
│  curl http://localhost:8000/api/health               │
│                                                      │
│  VIEW LOGS                                           │
│  sudo journalctl -fu pibot.service                   │
└──────────────────────────────────────────────────────┘
```

---

> **Questions?** Check the [FAQ](FAQ.md) or open an issue on [GitHub](https://github.com/PBtoolsfree/pi-youtube-bot/issues).
