# Update Guide

## Manual Update (Recommended)

```bash
bash ~/pi-youtube-bot/scripts/update.sh
```

The update script automatically:
1. Checks for new commits from GitHub
2. Stashes your local config changes (protects `config.json`)
3. Pulls latest code
4. Updates Python dependencies (if `requirements.txt` changed)
5. Rebuilds frontend (only if `package.json` changed)
6. Restarts the `pibot` service
7. **Rolls back automatically** if the service fails to start after update

---

## Force Reinstall

Run even if already up to date (useful after config changes):

```bash
bash ~/pi-youtube-bot/scripts/update.sh --force
```

---

## Auto-Update (Daily Cron)

Set up once:

```bash
crontab -e
# Add (runs every day at 3:00 AM):
0 3 * * * /bin/bash $HOME/pi-youtube-bot/scripts/auto-update.sh >> $HOME/pi-youtube-bot/logs/auto-update.log 2>&1
```

The auto-update script:
- Checks if a newer commit exists on GitHub
- Only updates when new code is available
- Uses a lock file to prevent concurrent runs
- Delegates all update logic (including rollback) to `scripts/update.sh`

---

## Update via Docker

```bash
cd ~/pi-youtube-bot
docker compose pull
docker compose up -d --build
```

---

## Checking Update Status

```bash
# View last update log
tail -50 ~/pi-youtube-bot/logs/update.log

# View auto-update log
tail -50 ~/pi-youtube-bot/logs/auto-update.log

# Current version
cat ~/pi-youtube-bot/VERSION

# Git log (recent changes)
git -C ~/pi-youtube-bot log --oneline -10
```

---

## Rollback (Manual)

If an update breaks something and auto-rollback didn't work:

```bash
cd ~/pi-youtube-bot

# Find previous good commit
git log --oneline -10

# Checkout previous version
git checkout <commit-hash>

# Rebuild frontend
cd frontend && npm run build && cd ..

# Restart service
sudo systemctl restart pibot
```

---

## Backup Before Major Updates

```bash
BACKUP="pibot-backup-$(date +%Y%m%d).tar.gz"
tar -czf ~/$BACKUP \
    ~/pi-youtube-bot/config.json \
    ~/pi-youtube-bot/.env \
    ~/pi-youtube-bot/data/
echo "Backup saved: ~/$BACKUP"
```
