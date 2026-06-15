import json
import csv
import os
import logging
from datetime import datetime, date
from typing import List, Dict, Any, Optional
import asyncio

logger = logging.getLogger(__name__)

DATA_DIR = "data/chat_logs"


class ChatLogger:
    """
    Saves every YouTube chat message + AI replies to daily JSON log files.
    Also supports CSV export for Google Sheets ingestion.
    """

    def __init__(self, save_path: str = DATA_DIR):
        self.save_path = save_path
        self._buffer: List[Dict[str, Any]] = []
        self._buffer_lock = asyncio.Lock()
        os.makedirs(self.save_path, exist_ok=True)
        logger.info(f"ChatLogger initialized — save path: {self.save_path}")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def log_message(
        self,
        author: str,
        message: str,
        rank: Optional[str] = None,
        points: int = 0,
        ai_reply: Optional[str] = None,
        extra: Optional[Dict] = None,
    ) -> None:
        """Append a chat event to the daily log."""
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "author": author,
            "rank": rank or "Viewer",
            "points": points,
            "message": message,
            "ai_reply": ai_reply,
        }
        if extra:
            entry.update(extra)

        async with self._buffer_lock:
            self._buffer.append(entry)

        # Flush to disk asynchronously
        await asyncio.to_thread(self._flush_entry, entry)

    def get_recent(self, n: int = 20) -> List[Dict[str, Any]]:
        """Return the last N messages from today's log."""
        path = self._today_path()
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data[-n:]
        except Exception as e:
            logger.error(f"ChatLogger read error: {e}")
            return []

    def get_session_stats(self) -> Dict[str, Any]:
        """Return quick stats for today's log."""
        path = self._today_path()
        if not os.path.exists(path):
            return {"total": 0, "ai_replies": 0, "unique_authors": 0}
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            authors = set(e.get("author") for e in data)
            ai_count = sum(1 for e in data if e.get("ai_reply"))
            return {
                "total": len(data),
                "ai_replies": ai_count,
                "unique_authors": len(authors),
                "date": str(date.today()),
            }
        except Exception as e:
            logger.error(f"ChatLogger stats error: {e}")
            return {"total": 0, "ai_replies": 0, "unique_authors": 0}

    def export_csv(self, output_path: Optional[str] = None) -> str:
        """Export today's log as CSV. Returns the output file path."""
        path = self._today_path()
        if not os.path.exists(path):
            raise FileNotFoundError("No chat log for today yet.")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not output_path:
            output_path = path.replace(".json", ".csv")

        fieldnames = ["timestamp", "author", "rank", "points", "message", "ai_reply"]
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(data)

        logger.info(f"CSV exported: {output_path}")
        return output_path

    def list_log_files(self) -> List[str]:
        """Return names of all saved log files."""
        try:
            files = sorted(
                [f for f in os.listdir(self.save_path) if f.endswith(".json")],
                reverse=True,
            )
            return files
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _today_path(self) -> str:
        filename = f"{date.today()}.json"
        return os.path.join(self.save_path, filename)

    def _flush_entry(self, entry: Dict[str, Any]) -> None:
        """Write a single entry to the daily JSON file (thread-safe append)."""
        path = self._today_path()
        try:
            # Load existing data
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = []

            data.append(entry)

            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        except Exception as e:
            logger.error(f"ChatLogger flush error: {e}")


# ---------------------------------------------------------------------------
# Cleanup old logs (call periodically or at startup)
# ---------------------------------------------------------------------------

def cleanup_old_logs(save_path: str = DATA_DIR, max_files: int = 30) -> None:
    """Delete oldest log files if count exceeds max_files."""
    try:
        files = sorted(
            [f for f in os.listdir(save_path) if f.endswith(".json")]
        )
        while len(files) > max_files:
            oldest = files.pop(0)
            os.remove(os.path.join(save_path, oldest))
            logger.info(f"Deleted old log: {oldest}")
    except Exception as e:
        logger.warning(f"Log cleanup error: {e}")
