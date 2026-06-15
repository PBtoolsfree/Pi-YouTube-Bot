# Update Guide

## Manual Update (Recommended)

```bash
bash ~/pibot/scripts/update.sh
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
bash ~/pibot/scripts/update.sh --force
```

---

## Auto-Update (Daily Cron)

Set up once:

```bash
crontab -e
# Add (runs every day at 3:00 AM):
0 3 * * * /bin/bash $HOME/pibot/scripts/auto-update.sh >> $HOME/pibot/logs/auto-update.log 2>&1
```

The auto-update script:
- Checks if a newer commit exists on GitHub
- Only updates when new code is available
- Uses a lock file to prevent concurrent runs
- Delegates all update logic (including rollback) to `scripts/update.sh`

---

## Update via Docker

```bash
cd ~/pibot
docker compose pull
docker compose up -d --build
```

---

## Checking Update Status

```bash
# View last update log
tail -50 ~/pibot/logs/update.log

# View auto-update log
tail -50 ~/pibot/logs/auto-update.log

# Current version
cat ~/pibot/VERSION

# Git log (recent changes)
git -C ~/pibot log --oneline -10
```

---

## Rollback (Manual)

If an update breaks something and auto-rollback didn't work:

```bash
cd ~/pibot

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
    ~/pibot/config.json \
    ~/pibot/.env \
    ~/pibot/data/
echo "Backup saved: ~/$BACKUP"
```
