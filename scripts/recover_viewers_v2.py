#!/usr/bin/env python3
"""
Improved recovery: Extract REAL point balances from bot messages in youtube_memory.db.
Finds patterns like "Balance: 12360" and "@user You have 13071 Points!" in bot chat.
"""
import sqlite3
import json
import os
import re
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YT_MEM_DB = os.path.join(BASE, "data", "youtube_memory.db")
GAMBLING_FILE = os.path.join(BASE, "data", "gambling_history.json")
VIEWERS_DB = os.path.join(BASE, "viewers.db")

RANKS = [
    {"name": "Noob",     "min_points": 0},
    {"name": "Bronze",   "min_points": 100},
    {"name": "Silver",   "min_points": 500},
    {"name": "Gold",     "min_points": 2000},
    {"name": "Diamond",  "min_points": 5000},
    {"name": "GOD",      "min_points": 10000},
]

def get_rank(points):
    current = RANKS[0]
    for r in RANKS:
        if points >= r["min_points"]:
            current = r
    return current["name"]


def main():
    yt = sqlite3.connect(YT_MEM_DB)

    # ── Step 1: Extract actual balances from bot messages ──────────
    # Pattern: "Balance: 12360"  
    # Pattern: "@kinggamersyt9761 You have 13071 Points!"
    # Pattern: "lost 5 points. Better luck next time! Balance: 12355"
    # Pattern: "won 5 points! Balance: 12350"

    user_balances = defaultdict(list)  # user -> [(timestamp, balance)]

    # Get ALL bot messages
    bot_msgs = yt.execute("""
        SELECT user, message, timestamp FROM yt_messages 
        WHERE user = 'pbherolive' OR user = 'PB Hero Live'
        ORDER BY timestamp ASC
    """).fetchall()

    print(f"Scanning {len(bot_msgs)} bot messages for balance data...")

    for _, msg, ts in bot_msgs:
        # Pattern: "@username You have XXXX Points!"
        m = re.search(r'@(\S+)\s+You have\s+(\d+)\s+Points', msg)
        if m:
            user_balances[m.group(1)].append((ts, int(m.group(2))))
            continue

        # Pattern: "Balance: XXXX" with preceding username context
        # "kinggamersyt9761 rolled ... Balance: 12360"
        m = re.search(r'(\w[\w-]+)\s+rolled\s+.*Balance:\s*(\d+)', msg)
        if m:
            user_balances[m.group(1)].append((ts, int(m.group(2))))
            continue

        # Pattern: "@username Not enough Points! You have XXX/YYY"
        m = re.search(r'@(\S+)\s+Not enough.*You have\s+(\d+)/(\d+)', msg)
        if m:
            user_balances[m.group(1)].append((ts, int(m.group(2))))
            continue

        # Pattern: "fine of XXXX points to USERNAME"
        m = re.search(r'fine of\s+(\d+)\s+points to\s+(\S+)', msg)
        if m:
            # The target received these points, but we can't determine their total
            pass

        # Pattern: "@username claimed the Loot Box and got XXX Points!"
        # Not useful for balance, skip

    print(f"Found balance data for {len(user_balances)} users")
    for user, balances in sorted(user_balances.items(), key=lambda x: max(b for _, b in x[1]), reverse=True):
        latest = balances[-1]
        peak = max(b for _, b in balances)
        print(f"  {user:30s}: latest={latest[1]:6d}, peak={peak:6d}, readings={len(balances)}")

    # ── Step 2: Get user info from all messages ──────────────────
    user_info = {}
    rows = yt.execute("""
        SELECT user, user_id, count(*) as cnt,
               min(timestamp) as first_seen,
               max(timestamp) as last_seen
        FROM yt_messages
        WHERE user IS NOT NULL AND user != ''
        GROUP BY user
    """).fetchall()

    day_data = {}
    for row in yt.execute("""
        SELECT user, date(timestamp, 'unixepoch') as day
        FROM yt_messages
        WHERE user IS NOT NULL AND user != ''
        GROUP BY user, day ORDER BY user, day
    """).fetchall():
        day_data.setdefault(row[0], []).append(row[1])

    yt.close()

    # ── Step 3: Gambling net from history ─────────────────────────
    gambling_net = defaultdict(int)
    user_max_bet = defaultdict(int)
    if os.path.exists(GAMBLING_FILE):
        with open(GAMBLING_FILE) as f:
            history = json.load(f)
        for entry in history:
            user = entry.get("user", "")
            game = entry.get("game", "")
            if game in ("gamble", "slots"):
                bet = entry.get("bet", 0)
                net = entry.get("net", 0)
                gambling_net[user] += net
                user_max_bet[user] = max(user_max_bet[user], bet)
            elif game == "rob":
                amount = entry.get("amount", 0)
                target = entry.get("target", "")
                won = entry.get("win", False)
                if won:
                    gambling_net[user] += amount
                    gambling_net[target] -= amount
                else:
                    gambling_net[user] -= amount
                    gambling_net[target] += amount
            elif game == "give":
                amount = entry.get("amount", 0)
                target = entry.get("target", "")
                gambling_net[user] -= amount
                if target:
                    gambling_net[target] += amount

    # ── Step 4: Build final viewer data ──────────────────────────
    import time
    from datetime import datetime, timedelta

    viewers = {}
    pts_per_msg = 10
    daily_bonus = 50

    for user, user_id, msg_count, first_seen, last_seen in rows:
        days = day_data.get(user, [])
        unique_days = len(days)

        # Streak calculation
        consecutive = 1
        if len(days) >= 2:
            sorted_days = sorted(days, reverse=True)
            consecutive = 1
            for i in range(1, len(sorted_days)):
                d1 = datetime.strptime(sorted_days[i-1], "%Y-%m-%d")
                d2 = datetime.strptime(sorted_days[i], "%Y-%m-%d")
                if (d1 - d2).days == 1:
                    consecutive += 1
                else:
                    break

        # BEST AVAILABLE POINTS:
        # Priority 1: Latest known balance from bot messages (MOST ACCURATE)
        # Priority 2: Max observed balance from bot messages
        # Priority 3: Max bet placed (minimum floor)
        # Priority 4: Estimated from msg count + daily bonuses + gambling net

        best_points = None

        if user in user_balances:
            # Use latest known balance
            latest_balance = user_balances[user][-1][1]
            peak_balance = max(b for _, b in user_balances[user])
            # Use the higher of latest or peak (user may have spent some)
            best_points = max(latest_balance, peak_balance)

        if best_points is None and user in user_max_bet and user_max_bet[user] > 100:
            # User had at least this many points to bet
            # Rough estimate: if they could bet X, they probably had 2-3x that
            best_points = int(user_max_bet[user] * 2)

        if best_points is None:
            # Fallback: estimation with HIGHER multipliers
            # Real system gives 10pts/msg + 50 daily + streak bonuses + loot boxes
            base = msg_count * pts_per_msg
            daily = unique_days * daily_bonus
            streak_bonus = max(0, consecutive - 1) * 25
            gamble = gambling_net.get(user, 0)
            best_points = max(0, base + daily + streak_bonus + gamble)
            # Apply a 1.5x multiplier for untracked bonuses (loot boxes, etc.)
            best_points = int(best_points * 1.5)

        today = time.strftime("%Y-%m-%d")
        last_date = days[-1] if days else today

        viewers[user] = {
            "count": msg_count,
            "points": best_points,
            "warnings": 0,
            "last_seen": last_seen or time.time(),
            "last_date": last_date,
            "consecutive_days": consecutive,
            "rank": get_rank(best_points),
        }
        if user_id:
            viewers[user]["channel_id"] = user_id

    # ── Step 5: Write to viewers.db ──────────────────────────────
    if os.path.exists(VIEWERS_DB):
        backup = VIEWERS_DB + ".before_improved_recovery"
        os.rename(VIEWERS_DB, backup)
        print(f"\nBacked up old viewers.db to {backup}")

    conn = sqlite3.connect(VIEWERS_DB)
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS viewers (username TEXT PRIMARY KEY, data TEXT)")
    for username, data in viewers.items():
        cursor.execute("INSERT INTO viewers (username, data) VALUES (?, ?)",
                       (username, json.dumps(data)))
    conn.commit()
    conn.close()

    print(f"\n✅ Recovered {len(viewers)} viewers with IMPROVED point estimates")
    print("\nTop 15 by points:")
    for u, d in sorted(viewers.items(), key=lambda x: x[1]["points"], reverse=True)[:15]:
        source = "💬chat" if u in user_balances else ("🎰bet" if u in user_max_bet and user_max_bet[u] > 100 else "📊est")
        print(f"  {d['rank']:8s} {u:30s} {d['points']:6d} pts  ({d['count']} msgs, {d['consecutive_days']}d streak) [{source}]")


if __name__ == "__main__":
    main()
