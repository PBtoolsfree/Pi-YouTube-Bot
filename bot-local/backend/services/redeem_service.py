"""
Meme Redeem Service — manages meme rewards that trigger OBS filters via Streamer.bot.
Viewers spend Points to activate visual effects on stream.
"""
import json
import os
import time
import asyncio
import uuid
import logging

logger = logging.getLogger(__name__)

DATA_PATH = os.path.join("data", "meme_redeems.json")


class RedeemService:
    def __init__(self):
        self.redeems = self._load()
        # Cooldown tracking: {reward_id: last_trigger_timestamp}
        self._cooldowns = {}
        # Active timers: {reward_id: asyncio.Task}
        self._active_timers = {}

    # ── Persistence ────────────────────────────────────────────────

    def _load(self):
        if os.path.exists(DATA_PATH):
            try:
                with open(DATA_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load meme redeems: {e}")
        return []

    def _save(self):
        os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
        try:
            with open(DATA_PATH, "w", encoding="utf-8") as f:
                json.dump(self.redeems, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save meme redeems: {e}")

    # ── CRUD ───────────────────────────────────────────────────────

    def get_all(self):
        """Return all meme redeems with real-time cooldown status."""
        now = time.time()
        result = []
        for r in self.redeems:
            item = {**r}
            last = self._cooldowns.get(r["id"], 0)
            remaining = max(0, r.get("cooldown_sec", 0) - (now - last))
            item["cooldown_remaining"] = round(remaining, 1)
            item["is_active"] = r["id"] in self._active_timers
            result.append(item)
        return result

    def get_by_id(self, reward_id):
        for r in self.redeems:
            if r["id"] == reward_id:
                return r
        return None

    def get_by_name(self, name):
        """Find a redeem by name (case-insensitive with fallback)."""
        name_lower = name.lower()
        # 1. Exact match
        for r in self.redeems:
            if r["name"].lower() == name_lower:
                return r
        # 2. Starts with match
        for r in self.redeems:
            if r["name"].lower().startswith(name_lower):
                return r
        # 3. Substring match
        for r in self.redeems:
            if name_lower in r["name"].lower():
                return r
        return None

    def _safe_int(self, val, default=0):
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    def create(self, data):
        reward = {
            "id": str(uuid.uuid4())[:8],
            "name": data.get("name", "Unnamed Meme"),
            "cost": self._safe_int(data.get("cost", 500)),
            "obs_source": data.get("obs_source", ""),
            "obs_filter": data.get("obs_filter", ""),
            "sb_action": data.get("sb_action", ""),
            "type": data.get("type", "obs"),
            "role_id": data.get("role_id", ""),
            "mod_duration_days": self._safe_int(data.get("mod_duration_days", 7), 7),
            "required_rank": data.get("required_rank", ""),
            "duration_ms": self._safe_int(data.get("duration_ms", 5000), 5000),
            "cooldown_sec": self._safe_int(data.get("cooldown_sec", 30), 30),
            "enabled": data.get("enabled", True),
            "eligibility": data.get("eligibility", "everyone"),
            "giveaway_wheel_style": data.get("giveaway_wheel_style", "roulette"),
            "giveaway_elimination": data.get("giveaway_elimination", False),
            "giveaway_spin_duration": self._safe_int(data.get("giveaway_spin_duration", 5), 5),
            "giveaway_multi_winner": self._safe_int(data.get("giveaway_multi_winner", 1), 1),
            "giveaway_prize": data.get("giveaway_prize", ""),
            "created_at": time.time(),
        }
        self.redeems.append(reward)
        self._save()
        logger.info(f"Created meme redeem: {reward['name']} (ID: {reward['id']})")
        return reward

    def update(self, reward_id, data):
        for i, r in enumerate(self.redeems):
            if r["id"] == reward_id:
                for key in ["name", "cost", "obs_source", "obs_filter", "sb_action", "type", "role_id",
                             "mod_duration_days", "required_rank", "duration_ms", "cooldown_sec", "enabled",
                             "eligibility", "giveaway_wheel_style", "giveaway_elimination", 
                             "giveaway_spin_duration", "giveaway_multi_winner", "giveaway_prize"]:
                    if key in data:
                        val = data[key]
                        if key in ("cost", "duration_ms", "cooldown_sec", "mod_duration_days", "giveaway_spin_duration", "giveaway_multi_winner"):
                            val = self._safe_int(val)
                        if key == "giveaway_elimination":
                            val = bool(val)
                        self.redeems[i][key] = val
                self._save()
                logger.info(f"Updated meme redeem: {reward_id}")
                return self.redeems[i]
        return None

    def delete(self, reward_id):
        before = len(self.redeems)
        self.redeems = [r for r in self.redeems if r["id"] != reward_id]
        if len(self.redeems) < before:
            self._save()
            logger.info(f"Deleted meme redeem: {reward_id}")
            return True
        return False

    # ── Trigger Logic ──────────────────────────────────────────────

    def check_cooldown(self, reward_id):
        """Return True if the reward is off cooldown and can be triggered."""
        reward = self.get_by_id(reward_id)
        if not reward:
            return False
        now = time.time()
        last = self._cooldowns.get(reward_id, 0)
        return (now - last) >= reward.get("cooldown_sec", 0)

    async def trigger(self, reward_id, author, viewer_service, sb_ws, broadcast_func=None, skip_cost=False):
        """
        Full redeem flow:
        1. Validate reward exists & enabled
        2. Check cooldown
        3. Deduct Points (unless skip_cost for testing)
        4. Send DoAction to Streamer.bot WS
        5. Schedule auto-disable after duration
        6. Broadcast event
        """
        reward = self.get_by_id(reward_id)
        if not reward:
            return {"ok": False, "error": "Reward not found"}

        if not reward.get("enabled") and not skip_cost:
            return {"ok": False, "error": "Reward is disabled"}

        # Cooldown check
        if not self.check_cooldown(reward_id) and not skip_cost:
            remaining = reward.get("cooldown_sec", 0) - (time.time() - self._cooldowns.get(reward_id, 0))
            return {"ok": False, "error": f"On cooldown ({int(remaining)}s remaining)"}

        # Active check (prevent overlapping triggers)
        if reward_id in self._active_timers and not skip_cost:
            return {"ok": False, "error": "Effect already active"}

        # Rank Check
        if reward.get("required_rank"):
            v = viewer_service.get_viewer(author)
            viewer_rank = viewer_service.get_rank(v.get("points", 0))["name"]
            
            # Use config-based ranks (same source as viewer_service.get_rank)
            from backend.config_manager import ConfigManager
            ranks_list = ConfigManager.get_config().get("loyalty", {}).get(
                "ranks", viewer_service.ranks if hasattr(viewer_service, 'ranks') else []
            )
            # Ensure ranks are sorted by min_points
            ranks = sorted(ranks_list, key=lambda x: int(x.get("min_points", 0)))

            # Find viewer rank index
            viewer_idx = -1
            req_idx = -1
            
            for i, rnk in enumerate(ranks):
                if rnk["name"] == viewer_rank:
                    viewer_idx = i
                if rnk["name"] == reward["required_rank"]:
                    req_idx = i
                    
            if req_idx != -1 and viewer_idx < req_idx:
                return {"ok": False, "error": f"Requires {reward['required_rank']} rank."}

        # Deduct points
        if not skip_cost:
            success = viewer_service.redeem(author, reward["cost"])
            if not success:
                v = viewer_service.get_viewer(author)
                return {
                    "ok": False,
                    "error": f"Not enough Points! You have {v.get('points', 0)}/{reward['cost']} Points"
                }

        # Mark cooldown
        self._cooldowns[reward_id] = time.time()

        # Only send to Streamer.bot if it's an OBS reward
        reward_type = reward.get("type", "obs")
        sb_result = False
        custom_message = None
        reward_data = dict(reward)
        
        if reward_type == "obs":
            sb_result = await self._send_sb_action(reward, author, sb_ws)
            if not sb_result:
                # Refund Logic
                if not skip_cost:
                    viewer_service.add_points(author, reward["cost"])
                    self._cooldowns.pop(reward_id, None)
                return {"ok": False, "error": f"Streamer.bot connection failed. Refunded {reward['cost']} Points!"}
                
            duration_sec = reward.get("duration_ms", 5000) / 1000.0
            task = asyncio.create_task(self._auto_disable(reward, author, sb_ws, duration_sec, broadcast_func))
            self._active_timers[reward_id] = task
        else:
            sb_result = True

        # Broadcast event
        if broadcast_func:
            await broadcast_func({
                "category": "LOYALTY",
                "message": f"Redeemed '{reward['name']}'",
                "author": author,
                "timestamp": time.time(),
            })

        action_info = "via SB" if reward_type == "obs" else reward_type
        logger.info(f"Redeem triggered: {reward['name']} by {author} ({action_info})")
        
        # Inject our fields so bot_service.py can apply them
        if reward_type == "youtube_mod":
            reward_data["duration"] = reward.get("mod_duration_days", 7)  # days
            
        return {
            "ok": True, 
            "reward": reward_data, 
            "sb_sent": sb_result,
            "custom_message": custom_message
        }

    async def _send_sb_action(self, reward, author, sb_ws):
        """Send DoAction to Streamer.bot WebSocket."""
        if not sb_ws:
            logger.warning("Cannot trigger meme: Streamer.bot WS not connected")
            return False

        action_name = reward.get("sb_action") or f"MemeFilter_{reward['name']}"

        payload = {
            "request": "DoAction",
            "action": {"name": action_name},
            "args": {
                "obsSource": reward.get("obs_source", ""),
                "obsFilter": reward.get("obs_filter", ""),
                "duration": reward.get("duration_ms", 5000),
                "redeemUser": author,
                "redeemName": reward["name"],
            },
            "id": f"MemeRedeem_{reward['id']}_{int(time.time())}",
        }

        try:
            await sb_ws.send(json.dumps(payload))
            logger.info(f"Sent SB DoAction: {action_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to send SB action: {e}")
            return False

    async def _auto_disable(self, reward, author, sb_ws, duration_sec, broadcast_func):
        """Wait for duration then broadcast that the effect ended."""
        try:
            await asyncio.sleep(duration_sec)
        except asyncio.CancelledError:
            pass
        finally:
            self._active_timers.pop(reward["id"], None)
            if broadcast_func:
                await broadcast_func({
                    "category": "SYSTEM",
                    "message": f"Meme effect ended: {reward['name']}",
                    "author": "System",
                    "timestamp": time.time(),
                })
            logger.info(f"Meme effect ended: {reward['name']}")
