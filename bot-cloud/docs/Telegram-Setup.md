# Telegram Bot Setup

Get real-time alerts and remote control through Telegram.

---

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g. `My Stream Bot`)
4. Choose a username ending in `bot` (e.g. `mystreambot`)
5. Copy the **bot token** (format: `1234567890:ABCdef...`)

---

## Step 2: Get Your Chat ID

1. Start a conversation with your bot (click Start)
2. Send any message to it
3. Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
4. Find `"chat": {"id": -100...}` in the response — that is your chat ID

For a **group chat**: add the bot to the group, send a message, fetch updates.

---

## Step 3: Add to Config

```json
"telegram": {
  "enabled": true,
  "token": "1234567890:ABCdef...",
  "chat_id": "-100..."
}
```

---

## Step 4: Test

Restart the service and send `/start` to your bot.

---

## Available Telegram Alerts

- 💸 Donation received
- 🔔 New subscriber
- ⭐ SuperChat
- ❗ Bot errors
- 🔄 Update completed

---

## Remote Commands (if enabled in config)

| Command | Action |
|---------|--------|
| `/status` | Show bot status |
| `/skip` | Skip current TTS |
| `/pause` | Pause TTS queue |
| `/resume` | Resume TTS queue |
