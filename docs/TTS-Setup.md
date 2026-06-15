# TTS (Text-to-Speech) Setup

The bot uses **Microsoft Edge-TTS** — free, high-quality neural voices.

---

## How It Works

1. Chat message or donation comes in
2. Bot generates response text
3. Edge-TTS converts text to MP3 audio
4. FFmpeg streams audio via UDP to your gaming PC
5. OBS receives the UDP stream and plays it

---

## Voice Selection

List all available voices:
```bash
.venv/bin/edge-tts --list-voices | grep -i "en-IN\|en-US"
```

Popular voices:
| Voice | Accent | Style |
|-------|--------|-------|
| `en-IN-PrabhatNeural` | Indian English | Male, natural |
| `en-IN-NeerjaExpressiveNeural` | Indian English | Female, expressive |
| `en-US-GuyNeural` | American | Male, friendly |
| `en-US-JennyNeural` | American | Female, conversational |
| `en-GB-RyanNeural` | British | Male, calm |

Set in config:
```json
"audio": {
  "voice": "en-IN-PrabhatNeural",
  "rate": "+0%",
  "volume": "+0%"
}
```

---

## Audio Routing Options

### Option 1: UDP Stream to Gaming PC (Default)
Pi → UDP → Gaming PC (OBS listens)
```json
"audio": {
  "local_playback": false,
  "gaming_pc_ip": "192.168.1.100",
  "udp_ports": { "public": 1234, "secret": 1235 }
}
```

### Option 2: Local Playback (Pi Speakers)
For all-in-one setups:
```json
"audio": {
  "local_playback": true
}
```
Requires speakers connected to the Pi.

---

## Queue Management

The bot maintains two priority queues:
- **Public** (port 1234): Chat responses
- **Secret** (port 1235): Donation alerts, priority messages

Control via dashboard or API:
- `POST /api/audio/skip` — Skip current
- `POST /api/audio/pause` — Pause queue
- `POST /api/audio/clear` — Clear queue
- `GET /api/audio/status` — Queue status

---

## Testing TTS

```bash
curl http://localhost:8000/api/test/audio
```
Or use the dashboard's "Test Audio" button.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No sound from OBS | Check gaming PC IP, firewall, UDP port 1234 |
| `ffmpeg: command not found` | Run `sudo apt-get install ffmpeg` |
| Voice sounds wrong | Check `audio.voice` in config |
| TTS cuts off early | Increase audio buffer in OBS Media Source |

Check the audio debug log:
```bash
tail -f ~/pibot/logs/audio_debug.log
```
