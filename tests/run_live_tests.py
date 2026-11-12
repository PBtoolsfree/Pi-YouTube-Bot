import urllib.request
import json

tests = [
    'website-key',
    'android-device',
    'notification-forwarding',
    'email-observer',
    'donation-matching',
    'cloud-overlay',
    'local-tts',
    'complete-system'
]

print("Executing all 8 live testing endpoints on https://pbhero.qzz.io ...\n")
for t in tests:
    url = f"https://pbhero.qzz.io/api/test/{t}"
    req = urllib.request.Request(
        url,
        data=b"{}",
        headers={"X-Admin-Token": "12345678", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            status = data.get("status")
            dur = data.get("duration_ms")
            cid = data.get("correlation_id")
            msg = data.get("message")
            print(f"[{status}] {t} ({dur} ms, CID: {cid})\n  → {msg}")
    except Exception as e:
        print(f"[FAIL] {t} -> {e}")
