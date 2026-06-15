"""
Build helper — runs npm build on Pi and restarts pibot service.
Uses plink (PuTTY) instead of paramiko so no extra pip installs needed.
"""
import subprocess
import sys

HOST = "pradip@172.168.30.135"
PW = "1234"

COMMANDS = [
    "echo 1234 | sudo -S systemctl stop pibot",
    "cd /home/pradip/pi-youtube-bot/frontend && npm run build 2>&1 | tail -10",
    "echo 1234 | sudo -S systemctl start pibot",
    "sleep 2",
    "echo 1234 | sudo -S systemctl status pibot --no-pager | head -10",
]

def run():
    for cmd in COMMANDS:
        print(f"\n▶ {cmd}")
        result = subprocess.run(
            ["plink", "-pw", PW, "-batch", HOST, cmd],
            capture_output=True, text=True, timeout=120
        )
        if result.stdout.strip():
            print(result.stdout.strip())
        if result.stderr.strip():
            print(f"STDERR: {result.stderr.strip()}", file=sys.stderr)

if __name__ == "__main__":
    run()
