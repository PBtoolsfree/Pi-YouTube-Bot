# Donations Setup

Support multiple payment methods: PhonePe, Paytm/UPI via webhook notifications.

---

## Method 1: PhonePe (Payment Gateway)

### Prerequisites
- PhonePe Business account
- Merchant ID and Salt Key (from PhonePe dashboard)

### Configuration
```json
"tip_page": {
  "gateway": {
    "type": "phonepe",
    "merchant_id": "YOUR_MERCHANT_ID",
    "salt_key": "YOUR_SALT_KEY",
    "salt_index": 1
  }
}
```

### Webhook Setup
1. In your Cloudflare Tunnel dashboard, note your public URL
2. In PhonePe merchant portal, set webhook URL to:
   `https://your-tunnel-url/api/webhook/phonepe?secret=YOUR_WEBHOOK_SECRET`
3. Set `security.webhook_secret` in config

---

## Method 2: Paytm/UPI Notification Forwarding

Uses Android notification forwarding. A user pays via any UPI app, their phone receives a notification, the app forwards it to the bot webhook.

### Apps to Use
- **Notification 2 Webhook** (Google Play)
- Configure webhook URL: `https://your-tunnel-url/api/webhook/paytm?secret=YOUR_SECRET`

### Configuration
```json
"paytm_alerts": {
  "enabled": true,
  "min_amount": 10,
  "tts_enabled": true
}
```

---

## Method 3: Email Scanning

If your UPI app sends email notifications:
```json
"email_verification": {
  "enabled": true,
  "host": "imap.gmail.com",
  "port": 993,
  "user": "yourbot@gmail.com",
  "password": "your-app-password"
}
```

> Use a Gmail App Password, not your main password.

---

## Tip Page

The tip page (`/tip`) shows:
- Streamer name and logo
- UPI QR code
- Payment button (PhonePe)
- Minimum donation amount

Configure branding:
```json
"tip_page": {
  "streamer_name": "My Channel",
  "logo_url": "https://...",
  "currency": "INR"
},
"upi_vpa": "yourname@upi",
"upi_name": "Your Name"
```

---

## Testing Donations

```bash
curl -X POST http://localhost:8000/api/donate \
  -H "Content-Type: application/json" \
  -d '{"user": "TestUser", "amount": 100, "message": "Test donation"}'
```

---

## Alert Behavior

When a donation is detected:
1. TTS alert plays (e.g. "TestUser donated 100 rupees!")
2. OBS overlay shows animation
3. Telegram notification sent
4. Logged to Google Sheets (if enabled)
5. Super Chat style display for large amounts
