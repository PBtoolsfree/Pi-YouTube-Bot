# Cloudflare Tunnel Setup

Expose your tip page securely to the internet — no port forwarding needed.

---

## What It Does

- Makes `https://your-link.trycloudflare.com/tip` publicly accessible
- Only exposes approved endpoints (tip page, webhooks)
- Hides your real IP address
- Free with a Cloudflare account

---

## Quick Setup (Temporary Tunnel)

No account needed for testing:
```bash
bash install_cloudflared.sh
cloudflared tunnel --url http://localhost:8000
```

Copy the `*.trycloudflare.com` URL and share it with viewers.

---

## Permanent Tunnel (Recommended)

### 1. Install cloudflared
```bash
bash pi_setup/install_cloudflared.sh
```

### 2. Authenticate
```bash
cloudflared login
```

### 3. Create a named tunnel
```bash
cloudflared tunnel create pibot
```

### 4. Configure
```bash
nano ~/.cloudflared/config.yml
```
```yaml
tunnel: pibot
credentials-file: /home/pi/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: tip.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

### 5. Run as service
```bash
cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

---

## Security Notes

- Only these paths are accessible publicly by default:
  - `/tip` — Tip page
  - `/api/donate` — Donation endpoint
  - `/api/webhook/*` — Payment webhooks (secret-protected)
  - `/assets` — Static files
- All other paths return **403 Forbidden**
- Add paths via `security.allowed_public_paths` in config

---

## Config Integration

Update `config.json` to allow your tunnel domain:
```json
"security": {
  "tunnel_domains": ["trycloudflare.com", "yourdomain.com"],
  "webhook_secret": "your-strong-secret"
}
```
