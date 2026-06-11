import json
import time
import os
import asyncio
import logging

logger = logging.getLogger(__name__)

class ViewerService:
    def __init__(self, viewers_path="viewers.json"):
        self.viewers_path = viewers_path
        self.ranks = [
            {"name": "Noob", "emoji": "🐣", "min_points": 0},
            {"name": "Bronze", "emoji": "🥉", "min_points": 100},
            {"name": "Silver", "emoji": "🥈", "min_points": 500},
            {"name": "Gold", "emoji": "🥇", "min_points": 2000},
            {"name": "Diamond", "emoji": "💎", "min_points": 5000},
            {"name": "GOD", "emoji": "👑", "min_points": 10000}
        ]
        self.viewers = self._load_viewers()
        
        # Performance: Delayed Save
        self._dirty = False
        self._last_save = time.time()
        
        # WebSocket broadcast callback (set by bot_service after startup)
        self._broadcast_func = None
        self._auto_save_started = False

        # Migration: Ensure all viewers have 'points'
        for v in self.viewers.values():
            if "points" not in v:
                v["points"] = v.get("count", 0) * 10
                self._dirty = True

    async def start(self):
        """Start background tasks. Call after event loop is running."""
        if not self._auto_save_started:
            asyncio.create_task(self._auto_save_loop())

            self._auto_save_started = True

    def _load_viewers(self):
        import sqlite3
        db_path = self.viewers_path.replace('.json', '.db')
        
        # Migration from JSON to DB
        if os.path.exists(self.viewers_path) and not os.path.exists(db_path):
            try:
                with open(self.viewers_path, "r") as f:
                    data = json.load(f)
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute('CREATE TABLE IF NOT EXISTS viewers (username TEXT PRIMARY KEY, data TEXT)')
                for user, user_data in data.items():
                    cursor.execute('INSERT INTO viewers (username, data) VALUES (?, ?)', (user, json.dumps(user_data)))
                conn.commit()
                conn.close()
                logger.info(f"Migrated {len(data)} viewers from JSON to SQLite.")
                os.rename(self.viewers_path, self.viewers_path + ".bak")
            except Exception as e:
                logger.error(f"Migration error: {e}")
                
        # Load from DB
        viewers = {}
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute('CREATE TABLE IF NOT EXISTS viewers (username TEXT PRIMARY KEY, data TEXT)')
                cursor.execute('SELECT username, data FROM viewers')
                for row in cursor.fetchall():
                    viewers[row[0]] = json.loads(row[1])
                conn.close()
            except Exception as e:
                logger.error(f"Error loading viewers from DB: {e}")
        return viewers

    def _save_viewers(self):
        """Internal save method. Safe to call, but prefer marking dirty."""
        import sqlite3
        db_path = self.viewers_path.replace('.json', '.db')
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute('CREATE TABLE IF NOT EXISTS viewers (username TEXT PRIMARY KEY, data TEXT)')
            
            cursor.execute('BEGIN TRANSACTION')
            for user, user_data in self.viewers.items():
                cursor.execute('INSERT OR REPLACE INTO viewers (username, data) VALUES (?, ?)', 
                               (user, json.dumps(user_data)))
            conn.commit()
            conn.close()
            self._dirty = False
            self._last_save = time.time()
        except Exception as e:
            logger.error(f"Error saving viewers to DB: {e}")

    def _save_single_viewer(self, username, user_data):
        """Save a single viewer's data to the SQLite database immediately."""
        import sqlite3
        db_path = self.viewers_path.replace('.json', '.db')
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute('CREATE TABLE IF NOT EXISTS viewers (username TEXT PRIMARY KEY, data TEXT)')
            cursor.execute('INSERT OR REPLACE INTO viewers (username, data) VALUES (?, ?)', 
                           (username, json.dumps(user_data)))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error saving single viewer {username} to DB: {e}")

    def reload(self):
        """Reload all viewers from the SQLite database."""
        self.viewers = self._load_viewers()
        self._dirty = False
        self._last_save = time.time()
        logger.info("ViewerService database reloaded.")

    async def _auto_save_loop(self):
        """Periodically checks if data needs saving."""
        while True:
            await asyncio.sleep(60) # Save every 60 seconds if dirty
            if self._dirty:
                logger.debug("Auto-saving viewers...")
                await asyncio.to_thread(self._save_viewers)



    def mark_dirty(self):
        self._dirty = True

    def _notify_viewer_update(self, author=None, event="update"):
        """Broadcast a viewer_update event so the frontend refreshes instantly."""
        if self._broadcast_func:
            try:
                asyncio.create_task(self._broadcast_func({
                    "type": "viewer_update",
                    "event": event,
                    "viewer": author,
                    "timestamp": time.time()
                }))
            except Exception:
                pass  # Non-critical — don't crash the bot for a UI notification

    def update_viewer(self, author, trigger_welcome_cb, trigger_rank_up_cb, check_loyalty_cb, channel_id=None):
        now = time.time()
        today = time.strftime("%Y-%m-%d", time.localtime(now))
        
        # --- AUTO MERGE BY CHANNEL ID ---
        # If the user changed their name (or we have a legacy name vs display name mismatch),
        # automatically merge their legacy profile into their active chat name.
        if channel_id:
            old_name_to_merge = None
            for name, data in list(self.viewers.items()):
                if name != author and data.get("channel_id") == channel_id:
                    old_name_to_merge = name
                    break
            
            if old_name_to_merge:
                logger.info(f"Auto-merging legacy profile '{old_name_to_merge}' into active profile '{author}' (matching channel_id: {channel_id})")
                old_data = self.viewers.pop(old_name_to_merge)
                
                if author not in self.viewers:
                    self.viewers[author] = {
                        "count": 0, "points": 0, "warnings": 0,
                        "last_seen": now, "last_date": today,
                        "consecutive_days": 1, "rank": "Noob"
                    }
                    
                # Merge points, count, and streak
                self.viewers[author]["points"] = self.viewers[author].get("points", 0) + old_data.get("points", 0)
                self.viewers[author]["count"] = self.viewers[author].get("count", 0) + old_data.get("count", 0)
                self.viewers[author]["consecutive_days"] = max(self.viewers[author].get("consecutive_days", 1), old_data.get("consecutive_days", 1))
                self.viewers[author]["channel_id"] = channel_id
                self.viewers[author]["rank"] = self.get_rank(self.viewers[author]["points"])["name"]
                
                # Keep other legacy stats if they don't exist in new profile
                if "first_seen_today" in old_data and "first_seen_today" not in self.viewers[author]:
                    self.viewers[author]["first_seen_today"] = old_data["first_seen_today"]
                    
                self.mark_dirty()
                self._notify_viewer_update(author, "merge")
        
        if author not in self.viewers:
            self.viewers[author] = {
                "count": 0, 
                "points": 0,
                "warnings": 0,
                "last_seen": now, 
                "last_date": today,
                "consecutive_days": 1,
                "rank": "Noob"
            }
            if channel_id:
                self.viewers[author]["channel_id"] = channel_id
            self.mark_dirty()
            if trigger_welcome_cb:
                asyncio.create_task(trigger_welcome_cb(author))
        
        v = self.viewers[author]
        
        if channel_id and v.get("channel_id") != channel_id:
            v["channel_id"] = channel_id
            self.mark_dirty()
            
        # old_count = v["count"] # Unused
        last_date = v.get("last_date")
        
        v["count"] += 1
        
        if last_date != today:
            if check_loyalty_cb:
                asyncio.create_task(check_loyalty_cb(author, v, last_date, today, now))
            v["last_date"] = today
            v["first_seen_today"] = now
            self.mark_dirty()
            
        elif "first_seen_today" not in v:
            v["first_seen_today"] = now
            self.mark_dirty()
            
        v["last_seen"] = now
        self.mark_dirty()
        
        # rank check handled in add_points
        
        # Auto-add points for activity (dynamically from config)
        from backend.config_manager import ConfigManager
        loyalty_cfg = ConfigManager.get_config().get("loyalty", {})
        pts_per_msg = loyalty_cfg.get("points_per_message", 10)
        
        # Apply daily return and streak bonuses if this is the first message today
        if last_date != today:
            streak = v.get("consecutive_days", 1)
            # The streak value might have just been updated by bot_service _check_loyalty, 
            # or will be right after this. Either way, give daily bonus * streak mult if streak > 1.
            daily_bonus = loyalty_cfg.get("bonus_daily_return", 50)
            streak_mult = loyalty_cfg.get("bonus_streak_multiplier", 1.5)
            
            bonus_pts = daily_bonus
            if streak >= 2:
                bonus_pts = int(daily_bonus * streak_mult)
            
            self.add_points(author, bonus_pts) # We don't trigger rank up cb here to avoid double notifications, wait, let's just add it directly

        self.add_points(author, pts_per_msg, trigger_rank_up_cb) 
        
        self._notify_viewer_update(author, "message")
        return self.viewers[author]

    def add_points(self, author, amount, rank_cb=None):
        if author not in self.viewers: return
        
        v = self.viewers[author]
        old_rank = self.get_rank(v["points"])
        
        v["points"] += amount
        self.mark_dirty()
        
        new_rank = self.get_rank(v["points"])
        
        if old_rank["name"] != new_rank["name"]:
            v["rank"] = new_rank["name"]
            if rank_cb:
                asyncio.create_task(rank_cb(author, new_rank))
        
        self._save_single_viewer(author, v)

    def redeem(self, author, cost):
        if author not in self.viewers: return False
        if self.viewers[author]["points"] >= cost:
            self.viewers[author]["points"] -= cost
            self.mark_dirty()
            self._save_single_viewer(author, self.viewers[author])
            self._notify_viewer_update(author, "redeem")
            return True
        return False

    def get_rank(self, points):
        from backend.config_manager import ConfigManager
        cfg = ConfigManager.get_config().get("loyalty", {})
        ranks = cfg.get("ranks", self.ranks)
        
        if not ranks:
            return {"name": "Noob", "emoji": "🐣", "min_points": 0}
            
        current_rank = ranks[0]
        sorted_ranks = sorted(ranks, key=lambda x: int(x.get("min_points", 0)))
        
        for rank in sorted_ranks:
            if points >= int(rank.get("min_points", 0)):
                current_rank = rank
            else:
                break
        return current_rank

    def get_viewer(self, author):
        return self.viewers.get(author, {"count": 1})



    def deduct_points(self, author, amount):
        if author not in self.viewers: return False
        if self.viewers[author]["points"] >= amount:
            self.viewers[author]["points"] -= amount
            self.mark_dirty()
            self._save_single_viewer(author, self.viewers[author])
            return True
        return False

    def set_points(self, author, amount):
        """Set a viewer's points to an exact value."""
        if author not in self.viewers: return False
        self.viewers[author]["points"] = max(0, int(amount))
        self.viewers[author]["rank"] = self.get_rank(self.viewers[author]["points"])["name"]
        self.mark_dirty()
        self._save_single_viewer(author, self.viewers[author])
        self._notify_viewer_update(author, "set_points")
        return True

    def transfer_points(self, sender, receiver, amount):
        """Transfer points from one viewer to another."""
        if amount <= 0: return False
        if sender not in self.viewers: return False
        
        # We don't require the receiver to exist first, it can be created if needed, 
        # but add_points doesn't create users automatically. 
        # So we ensure the receiver exists first by calling get_viewer or letting the bot do it.
        # But wait, self.viewers[sender] check is enough for sender.
        if receiver not in self.viewers:
            # Let's create a minimal profile for receiver so points aren't lost
            self.viewers[receiver] = {"count": 0, "points": 0, "consecutive_days": 1, "rank": "Noob"}

        if self.viewers[sender]["points"] >= amount:
            self.viewers[sender]["points"] -= amount
            self.viewers[receiver]["points"] += amount
            self.viewers[receiver]["rank"] = self.get_rank(self.viewers[receiver]["points"])["name"]
            self.viewers[sender]["rank"] = self.get_rank(self.viewers[sender]["points"])["name"]
            
            self.mark_dirty()
            self._save_single_viewer(sender, self.viewers[sender])
            self._save_single_viewer(receiver, self.viewers[receiver])
            
            self._notify_viewer_update(sender, "transfer_out")
            self._notify_viewer_update(receiver, "transfer_in")
            return True
        return False

    def delete_viewer(self, author):
        """Remove a viewer from the database."""
        if author in self.viewers:
            del self.viewers[author]
            self.mark_dirty()
            import sqlite3
            db_path = self.viewers_path.replace('.json', '.db')
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute('DELETE FROM viewers WHERE username = ?', (author,))
                conn.commit()
                conn.close()
            except Exception as e:
                logger.error(f"Error deleting viewer {author} from DB: {e}")
            self._notify_viewer_update(author, "delete")
            return True
        return False

    def reset_viewer(self, author):
        """Reset a viewer's points and streak to 0."""
        if author not in self.viewers: return False
        self.viewers[author]["points"] = 0
        self.viewers[author]["consecutive_days"] = 0
        self.viewers[author]["rank"] = "Noob"
        self.mark_dirty()
        self._save_single_viewer(author, self.viewers[author])
        self._notify_viewer_update(author, "reset")
        return True

    def get_viewer_stats(self):
        """Return aggregate stats for all viewers."""
        vl = list(self.viewers.values())
        total = len(vl)
        total_points = sum(v.get("points", 0) for v in vl)
        today = __import__("time").strftime("%Y-%m-%d")
        active_today = sum(1 for v in vl if v.get("last_date") == today)
        streakers = sum(1 for v in vl if v.get("consecutive_days", 0) >= 2)
        return {
            "total_viewers": total,
            "total_points": total_points,
            "active_today": active_today,
            "streakers": streakers,
        }
        
    def get_leaderboard(self, limit=10):
        # Sort by points desc
        sorted_viewers = sorted(
            [{"name": k, "rank": self.get_rank(v.get("points", 0))["name"], **v} for k, v in self.viewers.items()],
            key=lambda x: x.get("points", 0),
            reverse=True
        )
        return sorted_viewers[:limit]
