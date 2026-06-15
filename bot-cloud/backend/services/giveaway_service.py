import os
import json
import logging
from threading import Lock

logger = logging.getLogger(__name__)

class LogicGiveaway:
    def __init__(self, data_path="data/giveaway_state.json"):
        self.data_path = data_path
        self.state = {"participants": []}
        self.lock = Lock()
        self._load()

    def _load(self):
        with self.lock:
            if os.path.exists(self.data_path):
                try:
                    with open(self.data_path, "r", encoding="utf-8") as f:
                        self.state = json.load(f)
                        if "participants" not in self.state:
                            self.state["participants"] = []
                        if "history" not in self.state:
                            self.state["history"] = []
                except Exception as e:
                    logger.error(f"Failed to load giveaway state: {e}")
            else:
                self.state = {"participants": [], "history": []}
                self._save()

    def _save(self):
        os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
        try:
            with open(self.data_path, "w", encoding="utf-8") as f:
                json.dump(self.state, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save giveaway state: {e}")

    def add_participant(self, author):
        with self.lock:
            # Case insensitive check
            author_lower = author.lower()
            for p in self.state["participants"]:
                if p["name"].lower() == author_lower:
                    return {"ok": False, "error": "You already have a ticket! Only 1 entry per viewer."}
                    
            self.state["participants"].append({"name": author})
            self._save()
            return {"ok": True}

    def remove_participant(self, author):
        with self.lock:
            author_lower = author.lower()
            original_len = len(self.state["participants"])
            self.state["participants"] = [p for p in self.state["participants"] if p["name"].lower() != author_lower]
            if len(self.state["participants"]) < original_len:
                self._save()
                return True
            return False

    def get_participants(self):
        with self.lock:
            return self.state["participants"]

    def get_history(self):
        with self.lock:
            return self.state.get("history", [])

    def add_history(self, winners):
        import time
        with self.lock:
            if "history" not in self.state:
                self.state["history"] = []
            
            self.state["history"].insert(0, {
                "timestamp": time.time(),
                "winners": winners
            })
            
            # Keep only last 50
            if len(self.state["history"]) > 50:
                self.state["history"] = self.state["history"][:50]
                
            self._save()

    def clear_giveaway(self):
        with self.lock:
            self.state["participants"] = []
            self._save()
            return True


# Singleton instance for easy import across the app
GiveawayService = LogicGiveaway()
