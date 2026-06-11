import sqlite3
import time
import logging
import os
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

DB_PATH = "data/brain.db"

class BrainService:
    def __init__(self):
        self.db_path = DB_PATH
        self._conn: Optional[sqlite3.Connection] = None
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        """Return a persistent SQLite connection (lazy-init).
        
        Using a single persistent connection avoids the overhead of
        opening/closing on every call — significant on Pi 4's SD card.
        """
        if self._conn is None:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        return self._conn

    def close_conn(self):
        """Close connection so it gets recreated on next access."""
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def _init_db(self):
        conn = self._get_conn()
        c = conn.cursor()
        
        # 1. Chat Logs (Full History)
        c.execute('''CREATE TABLE IF NOT EXISTS chat_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user TEXT,
                        user_id TEXT,
                        message TEXT,
                        timestamp REAL,
                        role TEXT DEFAULT 'user'
                    )''')
        
        # 2. Knowledge Base (Q&A)
        c.execute('''CREATE TABLE IF NOT EXISTS knowledge (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        question TEXT,
                        answer TEXT,
                        embedding TEXT, 
                        added_at REAL,
                        frequency INTEGER DEFAULT 1
                    )''')
        
        # Create Indexes for speed
        c.execute("CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history (user)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_chat_content ON chat_history (message)")
        
        conn.commit()

    def remember(self, user: str, message: str, user_id: Optional[str] = None, role: str = "user"):
        """Save a chat message to history."""
        try:
            conn = self._get_conn()
            c = conn.cursor()
            c.execute("INSERT INTO chat_history (user, user_id, message, timestamp, role) VALUES (?, ?, ?, ?, ?)",
                      (user, user_id, message, time.time(), role))
            conn.commit()
        except Exception as e:
            logger.error(f"Brain Remember Error: {e}")

    def learn(self, question: str, answer: str):
        """Store a Q&A pair. If Q exists, update answer and increment freq."""
        try:
            conn = self._get_conn()
            c = conn.cursor()
            
            c.execute("SELECT id, frequency FROM knowledge WHERE question = ?", (question,))
            row = c.fetchone()
            
            if row:
                kid, freq = row
                c.execute("UPDATE knowledge SET answer = ?, frequency = ?, added_at = ? WHERE id = ?",
                          (answer, freq + 1, time.time(), kid))
            else:
                c.execute("INSERT INTO knowledge (question, answer, added_at) VALUES (?, ?, ?)",
                          (question, answer, time.time()))
            
            conn.commit()
        except Exception as e:
            logger.error(f"Brain Learn Error: {e}")

    def recall_answer(self, query: str) -> Optional[str]:
        """Try to find a known answer for the query."""
        try:
            conn = self._get_conn()
            c = conn.cursor()
            
            # Search for exact match first
            c.execute("SELECT answer FROM knowledge WHERE question = ? ORDER BY frequency DESC LIMIT 1", (query,))
            row = c.fetchone()
            if row:
                return row[0]
                
            # Search for "LIKE" match (basic fuzzy)
            c.execute("SELECT answer FROM knowledge WHERE question LIKE ? ORDER BY frequency DESC LIMIT 1", (f"%{query}%",))
            row = c.fetchone()
            
            return row[0] if row else None
            
        except Exception as e:
            logger.error(f"Brain Recall Error: {e}")
            return None

    def get_user_context(self, user: str, limit: int = 5) -> List[Dict]:
        """Get recent chat history for a user to provide context."""
        try:
            conn = self._get_conn()
            c = conn.cursor()
            c.execute("SELECT role, message, timestamp FROM chat_history WHERE user = ? ORDER BY id DESC LIMIT ?", (user, limit))
            rows = c.fetchall()
            
            history = [{"role": r[0], "content": r[1], "time": r[2]} for r in rows]
            return list(reversed(history)) # Return in chronological order
        except Exception as e:
            logger.error(f"Brain Context Error: {e}")
            return []
            
    def cleanup_old_chats(self, days: int = 7) -> int:
        """Delete chat_history entries older than N days. Returns rows deleted."""
        cutoff = time.time() - (days * 86400)
        try:
            conn = self._get_conn()
            c = conn.cursor()
            c.execute("DELETE FROM chat_history WHERE timestamp < ?", (cutoff,))
            deleted = c.rowcount
            conn.commit()
            if deleted > 0:
                logger.info(f"Brain Cleanup: Deleted {deleted} chat entries older than {days} days")
            return deleted
        except Exception as e:
            logger.error(f"Brain Cleanup Error: {e}")
            return 0

    def get_stats(self):
        try:
            conn = self._get_conn()
            c = conn.cursor()
            c.execute("SELECT count(*) FROM chat_history")
            chats = c.fetchone()[0]
            c.execute("SELECT count(*) FROM knowledge")
            knowledge = c.fetchone()[0]
            return {"memories": chats, "facts": knowledge}
        except Exception:
            return {"memories": 0, "facts": 0}
