# Configuration Reference

All configuration lives in `config.json` at the project root.

> **Tip**: Use `.env` for sensitive keys (API keys, tokens). See [.env.example](../.env.example).

---

## Server

```json
"server": {
  "host": "0.0.0.0",
  "port": 8000
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `host` | `0.0.0.0` | Bind address. `0.0.0.0` = all interfaces |
| `port` | `8000` | HTTP port |

---

## YouTube

```json
"youtube": {
  "channel_id": "UCxxxxxxxxxx",
  "channel_name": "My Channel",
  "api_key": "AIza...",
  "fetch_interval": 30,
  "logo_url": "https://..."
}
```

| Key | Description |
|-----|-------------|
| `channel_id` | Your YouTube channel ID (starts with `UC`) |
| `channel_name` | Display name for UI |
| `api_key` | YouTube Data API v3 key (for subscriber count) |
| `fetch_interval` | Seconds between subscriber count updates |
| `logo_url` | Channel logo URL shown on tip page |

---

## AI Topology

```json
"ai_topology": {
  "enabled": true,
  "system_prompt": "You are a helpful livestream assistant...",
  "providers": [
    {
      "id": "gemini",
      "name": "Google Gemini",
      "type": "gemini",
      "enabled": true,
      "api_key": "AIza...",
      "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
      "models": [
        { "id": "gemini-2.0-flash", "enabled": true, "priority": 1 }
      ]
    }
  ]
}
```

Provider types: `gemini`, `openai`, `custom` (OpenRouter etc.), `groq`, `ollama`

The engine tries providers in priority order and automatically fails over.

---

## Audio

```json
"audio": {
  "enabled": true,
  "voice": "en-IN-PrabhatNeural",
  "rate": "+0%",
  "volume": "+0%",
  "max_queue_size": 20,
  "priority_mode": "public",
  "local_playback": false,
  "gaming_pc_ip": "192.168.1.100",
  "udp_ports": {
    "public": 1234,
    "secret": 1235
  }
}
```

| Key | Description |
|-----|-------------|
| `voice` | Edge-TTS voice name. Find voices: `edge-tts --list-voices` |
| `rate` | Speech rate: `+10%`, `-10%`, `+0%` |
| `local_playback` | `true` = play on Pi speakers; `false` = UDP stream to gaming PC |
| `gaming_pc_ip` | IP of your gaming PC for UDP audio stream |
| `udp_ports` | UDP ports OBS listens on |
| `priority_mode` | `public` (chat first) or `secret` (alerts first) |

---

## Tip Page

```json
"tip_page": {
  "streamer_name": "My Channel",
  "currency": "INR",
  "gateway": {
    "type": "phonepe",
    "merchant_id": "...",
    "salt_key": "..."
  }
}
```

---

## Security

```json
"security": {
  "webhook_secret": "your-random-secret",
  "allowed_public_paths": ["/tip", "/api/donate", "/api/webhook/*"],
  "cors_origins": ["*"],
  "tunnel_domains": ["trycloudflare.com", "yoursubdomain.com"]
}
```

| Key | Description |
|-----|-------------|
| `webhook_secret` | Required query param/header for webhook endpoints |
| `allowed_public_paths` | Paths accessible via Cloudflare Tunnel |
| `cors_origins` | CORS origins (`["*"]` = allow all) |
| `tunnel_domains` | Domains that trigger public-mode security |

---

## Telegram

```json
"telegram": {
  "enabled": true,
  "token": "1234567890:ABC...",
  "chat_id": "-100..."
}
```

---

## Auto Messages

```json
"auto_messages": {
  "enabled": true,
  "messages": [
    { "id": "follow", "text": "Follow me for more!", "interval_minutes": 15, "enabled": true }
  ]
}
```

---

## Custom Commands

```json
"custom_commands": {
  "!discord": { "response": "Join our Discord: discord.gg/...", "cooldown": 30, "enabled": true }
}
```
