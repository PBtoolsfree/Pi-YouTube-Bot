# FAQ & Troubleshooting

---

## General

### The service won't start

```bash
sudo journalctl -fu pibot --no-pager | tail -50
```
Look for Python import errors or config issues.

### Dashboard (port 8000) is blank / shows "cannot connect"

1. Check service is running: `sudo systemctl status pibot`
2. Check frontend was built: `ls ~/pi-youtube-bot/frontend/dist/`
3. If dist is missing: `cd ~/pi-youtube-bot/frontend && npm run build`
4. Restart: `sudo systemctl restart pibot`

### Config changes aren't taking effect

The config is reloaded automatically every 2 seconds. Or force reload:
```bash
sudo systemctl restart pibot
```

---

## Audio / TTS

### No audio in OBS

1. Confirm `audio.gaming_pc_ip` is set to your PC's local IP
2. Check Windows firewall: allow UDP inbound on port 1234
3. Open OBS Media Source and set input to `udp://0.0.0.0:1234`
4. Check debug log: `tail -f ~/pi-youtube-bot/logs/audio_debug.log`

### `ffmpeg: command not found`

```bash
sudo apt-get install -y ffmpeg
```

### TTS generates but no sound

- Verify FFmpeg is working: `ffmpeg -version`
- Try local playback: set `audio.local_playback: true`, connect Pi to speakers

---

## AI

### AI replies stopped working

1. Check your API key is valid and has credits
2. Test provider: `curl -X POST http://localhost:8000/api/providers/test/gemini`
3. Check logs: `sudo journalctl -fu pibot | grep -i ai`
4. Ensure at least one provider is `enabled: true`

### AI responses are slow

- Use a faster model (Groq is 5-10× faster than OpenAI for similar quality)
- Add Groq as first-priority provider

---

## YouTube

### Not reading chat messages

1. Check `youtube.channel_id` is correct (starts with `UC`)
2. Verify a stream is live
3. Check `pytchat` is installed: `.venv/bin/pip show pytchat`

### Subscriber count not updating

- Requires a YouTube Data API v3 key
- Check quota: [Google Cloud Console](https://console.cloud.google.com)

---

## Installation / Updates

### `npm: command not found` during setup

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Update failed and bot won't start

The update script automatically rolls back. Check:
```bash
cat ~/pi-youtube-bot/logs/update.log | tail -30
sudo systemctl restart pibot
```

### Permission denied on setup.sh

```bash
chmod +x setup.sh && bash setup.sh
```

---

## Webhook / Donations

### Webhook 401 Unauthorized

- Make sure `security.webhook_secret` matches what you send
- Pass as query param: `?secret=your-secret` or header `x-webhook-secret: your-secret`

### Donation not triggering alert

1. Enable debug: check `/api/debug/email` for email scanning
2. Test directly: `POST /api/donate` with amount > min_amount
3. Check `paytm_alerts.enabled: true` in config

---

## Useful Commands Reference

```bash
# Service
sudo systemctl status pibot
sudo systemctl restart pibot
sudo journalctl -fu pibot

# Health check
curl http://localhost:8000/api/health

# Test audio
curl http://localhost:8000/api/test/audio

# Test AI
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello!"}'

# Update
bash ~/pi-youtube-bot/update.sh

# View logs
tail -f ~/pi-youtube-bot/logs/pibot.log
```
