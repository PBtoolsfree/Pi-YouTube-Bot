import re

with open(r'd:\bot\pi-youtube-bot\docs\Update-Guide.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Quick Update (One-liner)
content = re.sub(
    r'## Quick Update \(One-liner\).*?That\'s it\. The script handles everything automatically, including rollback if the service fails to start\.',
    '''## Quick Update (One-liner)

### For Local Pi
SSH into your Pi and run:

```bash
bash ~/pibot/scripts/update_local.sh
```

### For Cloud VPS
SSH into your Cloud VPS and run:

```bash
bash ~/pibot/scripts/update_cloud.sh
```

That's it. The script handles everything automatically.''',
    content,
    flags=re.DOTALL
)

# Replace force reinstall
content = re.sub(
    r'## Force Reinstall.*?Service restart with rollback check',
    '''## Force Reinstall

If you need to force a rebuild of the frontend or reinstall dependencies, simply run the update script again:

```bash
bash ~/pibot/scripts/update_local.sh
```
(or `update_cloud.sh` for the cloud server).''',
    content,
    flags=re.DOTALL
)

# Replace auto update paths
content = content.replace(
    '0 3 * * * /bin/bash $HOME/pibot/bot-local/scripts/auto-update.sh >> $HOME/pibot/bot-local/logs/auto-update.log 2>&1',
    '0 3 * * * /bin/bash $HOME/pibot/scripts/auto-update.sh >> $HOME/pibot/logs/auto-update.log 2>&1'
)
content = content.replace(
    '| 5 | Delegates to `scripts/update.sh` (with auto-rollback) |',
    '| 5 | Delegates to `scripts/update_local.sh` or `scripts/update_cloud.sh` |'
)

# Replace what update script does
content = re.sub(
    r'## What the Update Script Does.*?└─────────────────────────────────────────────┘\n```',
    '''## What the Update Scripts Do

Here's the exact flow when you run `bash scripts/update_local.sh` or `update_cloud.sh`:

1. **Pulling latest code from GitHub...** (`git pull origin master`)
2. **Installing Python dependencies...** (`pip install -r requirements.txt`)
3. **Building Frontend...** (`npm install` and `npm run build` in the specific frontend directory)
4. **Restarting Service...** (`systemctl restart pibot.service` or `pibot-cloud.service`)''',
    content,
    flags=re.DOTALL
)

# Replace cloud VPS update
content = content.replace(
    'bash ./update_cloud.sh',
    'bash ~/pibot/scripts/update_cloud.sh'
)

# Replace Quick Reference Card
content = re.sub(
    r'## Quick Reference Card.*?└──────────────────────────────────────────────────────┘',
    '''## Quick Reference Card

```
┌──────────────────────────────────────────────────────┐
│  LOCAL PI UPDATE (SSH into Pi)                       │
│  bash ~/pibot/scripts/update_local.sh                │
│                                                      │
│  CLOUD VPS UPDATE (SSH into Cloud)                   │
│  bash ~/pibot/scripts/update_cloud.sh                │
│                                                      │
│  FORCE UPDATE (Nuclear)                              │
│  cd ~/pibot                                          │
│  git fetch origin && git reset --hard origin/master  │
│  bash ~/pibot/scripts/update_local.sh                │
│                                                      │
│  CHECK STATUS                                        │
│  sudo systemctl status pibot.service                 │
│  curl http://localhost:8000/api/health               │
│                                                      │
│  VIEW LOGS                                           │
│  sudo journalctl -fu pibot.service                   │
└──────────────────────────────────────────────────────┘''',
    content,
    flags=re.DOTALL
)

# Replace any lingering bot-local/scripts/update.sh
content = content.replace('bash scripts/update.sh', 'bash ~/pibot/scripts/update_local.sh')
content = content.replace('bash ./update_local_pi.sh', 'bash ~/pibot/scripts/update_local.sh')


with open(r'd:\bot\pi-youtube-bot\docs\Update-Guide.md', 'w', encoding='utf-8') as f:
    f.write(content)
