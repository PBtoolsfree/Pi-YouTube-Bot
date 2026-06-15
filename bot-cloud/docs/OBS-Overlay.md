# OBS Overlay Setup

Display a live subscriber counter and stream alerts in OBS.

---

## Available Overlays

| URL | Description |
|-----|-------------|
| `http://<pi-ip>:8000/overlay` | Subscriber counter overlay |
| `http://<pi-ip>:8000/obs` | Alert overlay |

---

## Adding to OBS

1. In OBS, click **+** in the Sources panel
2. Select **Browser**
3. Set URL to `http://<pi-ip>:8000/overlay`
4. Set Width: `1920`, Height: `1080` (or your stream resolution)
5. Check **Refresh browser when scene becomes active**
6. Click OK

---

## Subscriber Counter Overlay

- Updates in real-time via WebSocket
- No page refresh needed
- Animated number transitions

---

## Alert Overlay

Shows alerts for:
- 🔔 New subscriber
- 💸 Donation / SuperChat
- ⭐ Special events

---

## Audio via UDP in OBS

The bot streams TTS audio to OBS via UDP. Configure OBS Media Source:

1. Add **Media Source** in OBS
2. Uncheck "Local File"
3. Set Input to: `udp://0.0.0.0:1234` (public channel)
4. Set Input Format: `mpegts`
5. Check "Loop" = OFF
6. Check "Restart playback when source becomes active"

For alert audio:
- Public TTS: `udp://0.0.0.0:1234`
- Alert/Secret TTS: `udp://0.0.0.0:1235`

> Make sure your Gaming PC's firewall allows UDP on ports 1234 and 1235.
