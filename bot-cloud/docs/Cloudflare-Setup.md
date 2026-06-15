# Cloudflare Setup Guide

Expose your Pi YouTube Bot's tip page to the internet securely — **no port forwarding, no static IP required**.

---

## Method 1 — Quick Temporary Tunnel (No Account)

```bash
# Install cloudflared (Raspberry Pi OS)
sudo apt-get install cloudflared

# Start temporary tunnel
cloudflared tunnel --url http://localhost:8000
```

You'll see output like:
```
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://some-random-name.trycloudflare.com
```

Use this URL as your webhook base URL. Restarting creates a new URL.

---

## Method 2 — Permanent Named Tunnel (Recommended)

### Step 1: Install cloudflared

```bash
# Download for ARM64 (Pi 4/5)
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
sudo mv cloudflared-linux-arm64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
```

### Step 2: Authenticate

```bash
cloudflared login
# Opens browser — select your Cloudflare zone (domain)
```

### Step 3: Create Tunnel

```bash
cloudflared tunnel create pibot
# Note the tunnel UUID shown
```

### Step 4: Route DNS

```bash
# Creates tip.yourdomain.com → your Pi tunnel
cloudflared tunnel route dns pibot tip.yourdomain.com
```

### Step 5: Create Config File

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: pibot
credentials-file: /home/pi/.cloudflared/<YOUR-TUNNEL-UUID>.json
ingress:
  - hostname: tip.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

### Step 6: Test Tunnel

```bash
cloudflared tunnel run pibot
# Visit https://tip.yourdomain.com — should show your dashboard
# Ctrl+C to stop
```

### Step 7: Install as System Service

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

---

## Step 8: Configure Bot Security

In `config.json`, set your tunnel domain and security:

```json
"security": {
  "tunnel_domains": ["yourdomain.com", "trycloudflare.com"],
  "webhook_secret": "use-a-long-random-string-here",
  "allowed_public_paths": [
    "/tip", "/tip/",
    "/api/donate",
    "/api/webhook/*",
    "/api/config",
    "/assets", "/favicon.ico"
  ],
  "rate_limit_per_minute": 60
}
```

---

## Webhook URLs (for Donations)

After tunnel is running, use these webhook URLs in payment portals:

| Provider | Webhook URL |
|----------|------------|
| PhonePe | `https://tip.yourdomain.com/api/webhook/phonepe?secret=YOUR_SECRET` |
| Paytm | `https://tip.yourdomain.com/api/webhook/paytm?secret=YOUR_SECRET` |
| Manual Test | `https://tip.yourdomain.com/api/donate` |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `502 Bad Gateway` | Check `sudo systemctl status pibot` — bot may not be running |
| DNS not working | Wait 5 min for propagation; check `cloudflared tunnel info pibot` |
| Tunnel disconnecting | Check `sudo journalctl -fu cloudflared` |
| Webhook 401 | Verify `webhook_secret` matches in config AND in URL `?secret=` param |

---

## Management Commands

```bash
sudo systemctl status cloudflared    # Service status
sudo systemctl restart cloudflared   # Restart tunnel
cloudflared tunnel list              # List tunnels
cloudflared tunnel info pibot        # Tunnel details
sudo journalctl -fu cloudflared      # Live logs
```
