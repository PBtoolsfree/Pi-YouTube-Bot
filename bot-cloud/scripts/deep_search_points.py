#!/usr/bin/env python3
"""Search all available data sources for actual viewer point values."""
import sqlite3
import json
import os
import re
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

print("=" * 60)
print("DEEP DATA SEARCH FOR VIEWER POINTS")
print("=" * 60)

# 1. Check brain.db
print("\n--- brain.db ---")
brain = sqlite3.connect(os.path.join(BASE, "data", "brain.db"))
tables = [r[0] for r in brain.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"Tables: {tables}")
for t in tables:
    cnt = brain.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
    schema = brain.execute(f"PRAGMA table_info({t})").fetchall()
    cols = [s[1] for s in schema]
    print(f"  {t}: {cnt} rows, cols={cols}")
    if cnt > 0 and cnt < 10:
        rows = brain.execute(f"SELECT * FROM {t} LIMIT 5").fetchall()
        for r in rows:
            print(f"    {r}")

# 2. Search youtube_memory for bot messages about points
print("\n--- Bot messages with point values ---")
yt = sqlite3.connect(os.path.join(BASE, "data", "youtube_memory.db"))

# Bot responses that mention points, balance, rank
point_msgs = yt.execute("""
    SELECT user, message, timestamp 
    FROM yt_messages 
    WHERE (user = 'pbherolive' OR user = 'PB Hero Live')
    AND (message LIKE '%points%' OR message LIKE '%pts%' 
         OR message LIKE '%rank%' OR message LIKE '%balance%'
         OR message LIKE '%coins%' OR message LIKE '%streak%')
    ORDER BY timestamp DESC
    LIMIT 50
""").fetchall()

# Extract point values from bot messages
user_points = defaultdict(list)
for user, msg, ts in point_msgs:
    print(f"  {msg[:150]}")
    # Try to find patterns like "Username has 1234 points" or "balance: 1234"
    matches = re.findall(r'(\w+).*?(\d{2,})\s*(?:points|pts|coins)', msg, re.IGNORECASE)
    for m in matches:
        print(f"    -> Found: {m[0]} = {m[1]} points")
        user_points[m[0]].append(int(m[1]))

# 3. Check ALL chat messages from users that contain numbers (commands)
print("\n--- User commands with !points, !balance, !gamble ---")
cmd_msgs = yt.execute("""
    SELECT user, message, timestamp 
    FROM yt_messages 
    WHERE message LIKE '!points%' OR message LIKE '!balance%'
       OR message LIKE '!rank%' OR message LIKE '!leaderboard%'
       OR message LIKE '!lb%'
    ORDER BY timestamp DESC
    LIMIT 30
""").fetchall()
for user, msg, ts in cmd_msgs:
    print(f"  [{user}] {msg}")

# 4. Gambling history deep analysis — get max bets as floor for points
print("\n--- Gambling: Max bets per user (minimum points floor) ---")
with open(os.path.join(BASE, "data", "gambling_history.json")) as f:
    history = json.load(f)

user_max_bet = defaultdict(int)
user_total_volume = defaultdict(int)
user_gamble_count = defaultdict(int)
user_rob_amounts = defaultdict(int)

for entry in history:
    user = entry.get("user", "")
    game = entry.get("game", "")
    if game in ("gamble", "slots"):
        bet = entry.get("bet", 0)
        user_max_bet[user] = max(user_max_bet[user], bet)
        user_total_volume[user] += bet
        user_gamble_count[user] += 1
    elif game == "rob":
        amount = entry.get("amount", 0)
        user_rob_amounts[user] = max(user_rob_amounts[user], amount)

for user in sorted(user_max_bet.keys(), key=lambda u: user_max_bet[u], reverse=True):
    print(f"  {user:30s}: max_bet={user_max_bet[user]:6d}, "
          f"total_volume={user_total_volume[user]:8d}, "
          f"gambles={user_gamble_count[user]:5d}, "
          f"max_rob={user_rob_amounts.get(user, 0)}")

# 5. Check if any Google Sheets backups exist
print("\n--- Google Sheets transaction data ---")
sheets_cfg = {}
try:
    with open(os.path.join(BASE, "config.json")) as f:
        cfg = json.load(f)
    sheets_cfg = cfg.get("google_sheets", {})
    print(f"  Sheet ID: {sheets_cfg.get('sheet_id', 'NOT SET')}")
    print(f"  Enabled: {sheets_cfg.get('enabled', False)}")
except Exception as e:
    print(f"  Config error: {e}")

# 6. Summary: best estimate per user
print("\n" + "=" * 60)
print("BEST AVAILABLE POINT ESTIMATES")
print("=" * 60)
print("(max_bet is the MINIMUM the user had at some point)")

yt.close()
brain.close()
