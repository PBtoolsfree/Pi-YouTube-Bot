#!/usr/bin/env python3
"""
Recover viewers.db from youtube_memory.db and gambling_history.json.

This script reconstructs the viewers database after accidental deletion.
It uses chat message history and gambling records to estimate points,
message counts, streaks, and ranks.

Usage: python3 scripts/recover_viewers.py
"""
import sqlite3
import json
import os
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YT_MEM_DB = os.path.join(BASE, "data", "youtube_memory.db")
GAMBLING_FILE = os.path.join(BASE, "data", "gambling_history.json")
VIEWERS_DB = os.path.join(BASE, "viewers.db")

RANKS = [
    {"name": "Noob",     "emoji": "🐣", "min_points": 0},
    {"name": "Bronze",   "emoji": "🥉", "min_points": 100},
    {"name": "Silver",   "emoji": "🥈", "min_points": 500},
    {"name": "Gold",     "emoji": "🥇", "min_points": 2000},
    {"name": "Diamond",  "emoji": "💎", "min_points": 5000},
    {"name": "GOD",      "emoji": "👑", "min_points": 10000},
]

def get_rank(points):
    current = RANKS[0]
    for r in RANKS:
        if points >= r["min_points"]:
            current = r
    return current["name"]


def main():
    if os.path.exists(VIEWERS_DB):
        print(f"⚠️  viewers.db already exists at {VIEWERS_DB}")
        print("   Refusing to overwrite. Delete or rename it first if you want to re-run recovery.")
        return

    # ── Step 1: Extract user data from youtube_memory.db ──────────
    if not os.path.exists(YT_MEM_DB):
        print(f"❌ youtube_memory.db not found at {YT_MEM_DB}")
        return

    mem_conn = sqlite3.connect(YT_MEM_DB)
    rows = mem_conn.execute("""
        SELECT user, user_id, count(*) as msg_count,
               min(timestamp) as first_seen,
               max(timestamp) as last_seen
        FROM yt_messages
        WHERE user IS NOT NULL AND user != ''
        GROUP BY user
    """).fetchall()

    # Also get distinct days per user for streak estimation
    day_data = {}
    for row in mem_conn.execute("""
        SELECT user, date(timestamp, 'unixepoch') as day
        FROM yt_messages
        WHERE user IS NOT NULL AND user != ''
        GROUP BY user, day
        ORDER BY user, day
    """).fetchall():
        day_data.setdefault(row[0], []).append(row[1])

    mem_conn.close()

    print(f"📊 Found {len(rows)} unique users in youtube_memory.db")

    # ── Step 2: Load gambling history for net winnings ────────────
    gambling_points = {}  # user -> net points from gambling
    if os.path.exists(GAMBLING_FILE):
        try:
            with open(GAMBLING_FILE) as f:
                history = json.load(f)
            for entry in history:
                user = entry.get("user", "")
                if not user:
                    continue
                game = entry.get("game", "")
                if game in ("gamble", "slots"):
                    bet = entry.get("bet", 0)
                    won = entry.get("win", False)
                    payout = entry.get("payout", 0) if won else 0
                    net = payout - bet if won else -bet
                    gambling_points[user] = gambling_points.get(user, 0) + net
                elif game == "give":
                    amount = entry.get("amount", 0)
                    target = entry.get("target", "")
                    gambling_points[user] = gambling_points.get(user, 0) - amount
                    if target:
                        gambling_points[target] = gambling_points.get(target, 0) + amount
                elif game == "rob":
                    amount = entry.get("amount", 0)
                    target = entry.get("target", "")
                    won = entry.get("win", False)
                    if won:
                        gambling_points[user] = gambling_points.get(user, 0) + amount
                        if target:
                            gambling_points[target] = gambling_points.get(target, 0) - amount

            print(f"🎰 Found gambling data for {len(gambling_points)} users")
        except Exception as e:
            print(f"⚠️  Could not parse gambling_history.json: {e}")

    # ── Step 3: Reconstruct viewer profiles ──────────────────────
    viewers = {}
    pts_per_msg = 10  # default from config
    daily_bonus = 50

    for user, user_id, msg_count, first_seen, last_seen in rows:
        # Skip bot messages
        if user.lower() == "pbherolive":
            # Bot's own account — still track but with 0 points
            pass

        days = day_data.get(user, [])
        unique_days = len(days)

        # Estimate consecutive streak from most recent days
        consecutive = 1
        if len(days) >= 2:
            from datetime import datetime, timedelta
            sorted_days = sorted(days, reverse=True)
            consecutive = 1
            for i in range(1, len(sorted_days)):
                d1 = datetime.strptime(sorted_days[i-1], "%Y-%m-%d")
                d2 = datetime.strptime(sorted_days[i], "%Y-%m-%d")
                if (d1 - d2).days == 1:
                    consecutive += 1
                else:
                    break

        # Points estimation: msg_count * pts_per_msg + unique_days * daily_bonus + gambling net
        base_points = msg_count * pts_per_msg
        daily_points = unique_days * daily_bonus
        gamble_net = gambling_points.get(user, 0)
        total_points = max(0, base_points + daily_points + gamble_net)

        today = time.strftime("%Y-%m-%d")
        last_date = days[-1] if days else today

        viewers[user] = {
            "count": msg_count,
            "points": total_points,
            "warnings": 0,
            "last_seen": last_seen or time.time(),
            "last_date": last_date,
            "consecutive_days": consecutive,
            "rank": get_rank(total_points),
        }
        if user_id:
            viewers[user]["channel_id"] = user_id

    # ── Step 4: Write to viewers.db ──────────────────────────────
    conn = sqlite3.connect(VIEWERS_DB)
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS viewers (username TEXT PRIMARY KEY, data TEXT)")
    for username, data in viewers.items():
        cursor.execute("INSERT INTO viewers (username, data) VALUES (?, ?)",
                       (username, json.dumps(data)))
    conn.commit()
    conn.close()

    print(f"\n✅ Recovered {len(viewers)} viewers to {VIEWERS_DB}")
    print("\nTop 10 by points:")
    for u, d in sorted(viewers.items(), key=lambda x: x[1]["points"], reverse=True)[:10]:
        print(f"  {d['rank']:8s} {u:30s} {d['points']:6d} pts  ({d['count']} msgs, {d['consecutive_days']}d streak)")


if __name__ == "__main__":
    main()
