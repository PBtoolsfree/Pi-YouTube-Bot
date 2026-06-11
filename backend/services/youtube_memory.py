"""
YouTube Chat Memory — SQLite
------------------------------
Stores all YouTube chat messages + AI replies per user.
Auto-purges messages older than 7 days.

DB: data/youtube_memory.db
Table: yt_messages (id, user, user_id, message, ai_reply, timestamp)
"""

import sqlite3
import logging
import os
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "youtube_memory.db")

RETENTION_DAYS = 7

# ── Persistent connection (module-level singleton) ────────────────────────
# Avoids opening/closing a connection on every read/write — important on
# the Pi 4 where SD-card I/O per sqlite3.connect() call is expensive.
_conn: Optional[sqlite3.Connection] = None


def _get_conn() -> sqlite3.Connection:
    """Return the module-level persistent connection (lazy-init)."""
    global _conn
    if _conn is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
    return _conn


def close_conn() -> None:
    """Close connection so it gets recreated on next access."""
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
        _conn = None


def init_db() -> None:
    """Create tables if not exist."""
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS yt_messages (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user      TEXT NOT NULL,
            user_id   TEXT,
            message   TEXT NOT NULL,
            ai_reply  TEXT,
            timestamp REAL NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_yt_user ON yt_messages(user)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_yt_ts ON yt_messages(timestamp)")
    conn.commit()
    logger.info("YouTube memory DB initialized")


# ------------------------------------------------------------------
# Write Operations
# ------------------------------------------------------------------

def save_message(user: str, message: str, user_id: Optional[str] = None, ai_reply: Optional[str] = None) -> Optional[int]:
    """Save a YouTube chat message (+ optional AI reply). Returns row id."""
    ts = time.time()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO yt_messages (user, user_id, message, ai_reply, timestamp) VALUES (?, ?, ?, ?, ?)",
        (user, user_id, message, ai_reply, ts)
    )
    conn.commit()
    return cur.lastrowid


def update_ai_reply(row_id: int, ai_reply: str) -> None:
    """Update the AI reply for a previously saved message."""
    conn = _get_conn()
    conn.execute(
        "UPDATE yt_messages SET ai_reply = ? WHERE id = ?",
        (ai_reply, row_id)
    )
    conn.commit()


# ------------------------------------------------------------------
# Read Operations
# ------------------------------------------------------------------

def get_user_history(user: str, limit: int = 20) -> List[Dict]:
    """Get recent messages for a user (for AI context injection).
    Returns in chronological order (oldest first) for natural conversation flow."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT message, ai_reply, timestamp FROM yt_messages
           WHERE user = ?
           ORDER BY id DESC LIMIT ?""",
        (user, limit)
    ).fetchall()
    # Reverse so oldest is first (natural conversation order for AI)
    return [dict(r) for r in reversed(rows)]


def get_user_history_as_chat(user: str, limit: int = 20) -> List[Dict]:
    """Get user history formatted as AI chat messages [{role, content}].
    Used to inject context into AI handler."""
    raw = get_user_history(user, limit)
    messages = []
    for entry in raw:
        messages.append({"role": "user", "content": entry["message"]})
        if entry.get("ai_reply"):
            messages.append({"role": "assistant", "content": entry["ai_reply"]})
    return messages


def get_all_users() -> List[Dict]:
    """Get all unique users with message count and last seen time."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT user,
                  COUNT(*) as message_count,
                  MAX(timestamp) as last_seen,
                  SUM(CASE WHEN ai_reply IS NOT NULL THEN 1 ELSE 0 END) as ai_replies,
                  (SELECT message FROM yt_messages m2
                   WHERE m2.user = m.user ORDER BY id DESC LIMIT 1) as last_message
           FROM yt_messages m
           GROUP BY user
           ORDER BY last_seen DESC"""
    ).fetchall()
    return [dict(r) for r in rows]


def get_user_messages(user: str, limit: int = 50) -> List[Dict]:
    """Get full conversation history for one user (for dashboard view)."""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT id, user, user_id, message, ai_reply, timestamp
           FROM yt_messages WHERE user = ?
           ORDER BY id DESC LIMIT ?""",
        (user, limit)
    ).fetchall()
    return [dict(r) for r in reversed(rows)]


def delete_user_history(user: str) -> int:
    """Delete all history for a user. Returns rows deleted."""
    conn = _get_conn()
    cur = conn.execute("DELETE FROM yt_messages WHERE user = ?", (user,))
    conn.commit()
    return cur.rowcount


# ------------------------------------------------------------------
# Cleanup & Stats
# ------------------------------------------------------------------

def cleanup_old_messages(days: int = RETENTION_DAYS) -> int:
    """Delete messages older than N days. Returns rows deleted."""
    cutoff = time.time() - (days * 86400)
    conn = _get_conn()
    cur = conn.execute("DELETE FROM yt_messages WHERE timestamp < ?", (cutoff,))
    conn.commit()
    deleted = cur.rowcount
    if deleted > 0:
        logger.info(f"YouTube Memory Cleanup: Deleted {deleted} messages older than {days} days")
    return deleted


def get_memory_stats() -> Dict:
    """Get memory statistics for dashboard."""
    try:
        conn = _get_conn()
        total_msgs = conn.execute("SELECT COUNT(*) FROM yt_messages").fetchone()[0]
        total_users = conn.execute("SELECT COUNT(DISTINCT user) FROM yt_messages").fetchone()[0]
        ai_replies = conn.execute("SELECT COUNT(*) FROM yt_messages WHERE ai_reply IS NOT NULL").fetchone()[0]

        oldest_row = conn.execute("SELECT MIN(timestamp) FROM yt_messages").fetchone()[0]
        newest_row = conn.execute("SELECT MAX(timestamp) FROM yt_messages").fetchone()[0]

        # DB file size
        db_size_bytes = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
        db_size_mb = int(db_size_bytes / (1024 * 1024) * 100) / 100

        oldest_age_days = int((time.time() - oldest_row) / 86400 * 10) / 10 if oldest_row else 0

        return {
            "total_messages": total_msgs,
            "total_users": total_users,
            "ai_replies": ai_replies,
            "oldest_message_days": oldest_age_days,
            "newest_timestamp": newest_row,
            "db_size_mb": db_size_mb,
            "retention_days": RETENTION_DAYS,
        }
    except Exception as e:
        logger.error(f"YouTube Memory Stats Error: {e}")
        return {
            "total_messages": 0, "total_users": 0, "ai_replies": 0,
            "oldest_message_days": 0, "db_size_mb": 0, "retention_days": RETENTION_DAYS
        }


# Auto-init on import
try:
    init_db()
except Exception as e:
    logger.warning(f"YouTube memory DB init failed: {e}")
