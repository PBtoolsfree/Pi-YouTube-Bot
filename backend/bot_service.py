import asyncio
import collections
import pytchat
import logging
import json
import random
import re
import traceback
import os
import time
import httpx
from typing import Any, Dict, List, Optional, Callable

try:
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
except ImportError:
    pass

from backend.ai_service import AIEngine
from backend.services.viewer_service import ViewerService
from backend.services.moderation_service import ModerationService
from backend.services.ai_handler import AIHandler
from backend.config_manager import ConfigManager
from backend.services.loyalty_games import GambleService, BossFightService
from backend.services.sheets_service import GoogleSheetsService
from backend.services.brain_service import BrainService

try:
    from backend.services.tunnel_service import TunnelService
    tunnel_available = True
except ImportError:
    tunnel_available = False

try:
    from backend.services.email_service import EmailService
    email_available = True
except ImportError:
    email_available = False

try:
    from backend.services.cloud_alert_client import CloudAlertClientService
    cloud_alert_available = True
except ImportError:
    cloud_alert_available = False

from backend.services.agent_service import AgentService
from backend.services import youtube_memory
from backend.services.redeem_service import RedeemService
from backend.services.youtube_service import YouTubeService

logger = logging.getLogger(__name__)

class BotService:
    def __init__(self, audio=None, ai=None, config_path="config.json"):
        self.audio = audio
        self.ai_engine = ai or AIEngine()
        self.config_path = config_path # Kept for ref, but ConfigManager handles it
        self.is_running = False
        self.broadcast_func: Optional[Callable] = None 
        self.sb_ws: Any = None 
        self.chat: Any = None 
        self.sb_ws_task: Optional[asyncio.Task] = None
        self.dynamic_engagement_task: Optional[asyncio.Task] = None
        self._background_tasks = set()
        
        # Health Tracking for Background Workers
        self.worker_health: Dict[str, Any] = {}

        # Dynamic Events State
        self._secret_word = None
        self._loot_box_active = False

        # Sub-Services
        self.viewers = ViewerService()
        self.viewers.bot = self
        self.moderation = ModerationService(sb_ws_getter=lambda: self.sb_ws, config_loader=self.load_config)
        self.ai_handler = AIHandler(self.ai_engine)
        self.gambling = GambleService(self.audio)
        self.boss_fight = BossFightService()

        # Meme Redeem Service
        self.redeem_svc = RedeemService()
        
        # Native API Services
        self.youtube_api = YouTubeService(config_loader=self.load_config)
        
        # Tunnel Service (Native)
        if tunnel_available:
            self.tunnel = TunnelService(port=8000)
        else:
            self.tunnel = None

        # Email Verification Service
        if email_available:
            self.email = EmailService(self.load_config)
            self.email_status = "Unknown" # Connected | Disconnected | Error
        else:
            self.email = None
            self.email_status = "Disabled (Service not installed)"

        # Cloud Alert Client Service (outbound connection for Pi to receive cloud alerts)
        if cloud_alert_available:
            self.cloud_alert_client = CloudAlertClientService(self)
        else:
            self.cloud_alert_client = None
        
        # Google Sheets Service
        self.sheets = GoogleSheetsService(self.load_config)

        # Brain Service (Memory)
        self.brain = BrainService()

        # Agent Service (Telegram Control)
        # Pass 'self' so Agent can access all other services (viewers, mod, config, etc.)
        self.agent = AgentService(self)

        # YouTube Memory (7-day retention)
        self.yt_memory_enabled = True

        # Global Locks (moved from service to orchestrator if shared, but mod is per author)
        self.mod_locks = {} # {username: Lock}
        
        # Session Analytics
        self.session_stats: dict[str, Any] = {
            "start_time": time.time(),
            "messages_processed": 0,
            "timeouts_triggered": 0,
            "ai_responses": 0,
            "total_commands": 0,
            "peak_viewers": 0,
            "top_chatter": {"name": None, "count": 0}
        }
        self.session_chatters: dict[str, int] = {} # {name: count}
        
        # Subscriber Tracking
        # Try to load from a persistent file or config, else 0
        self.subscriber_count = 0 
        self._load_subscriber_count()
        self.on_subscriber_update = None # Callback function

        # Message Deduplication
        self.message_dedup_cache = collections.deque(maxlen=100)
        
        # Transaction Deduplication (Persistent, capped at 5000)
        self.processed_transactions = collections.OrderedDict()
        self._load_processed_ids()

        # Custom Command Cooldowns
        self._custom_cmd_cooldowns: dict[str, float] = {}
        
        # Live YouTube Stream Likes
        self.live_likes_count = -1

    @property
    def is_sb_connected(self):
        """Returns True if Streamer.bot WebSocket is connected."""
        if not getattr(self, "sb_ws", None):
            return False
            
        # Check standard property
        is_open = getattr(self.sb_ws, "open", False)
        
        # Check websockets 10+ State.OPEN
        if not is_open:
            from websockets.protocol import State
            if hasattr(self.sb_ws, "state") and self.sb_ws.state == State.OPEN:
                is_open = True
                
        return bool(is_open)

    def load_config(self):
        return ConfigManager.get_config()

    def _load_processed_ids(self):
        try:
            history = self.get_donation_history()
            for entry in history:
                if "transaction_id" in entry and entry["transaction_id"]:
                    self.processed_transactions[entry["transaction_id"]] = True
            # Cap at 5000 entries
            while len(self.processed_transactions) > 5000:
                self.processed_transactions.popitem(last=False)
            logger.info(f"Loaded {len(self.processed_transactions)} processed transaction IDs.")
        except Exception as e:
            logger.warning(f"Failed to load processed IDs: {e}")

    def _load_subscriber_count(self):
        try:
            if os.path.exists("subscriber_count.json"):
                with open("subscriber_count.json", "r") as f:
                    data = json.load(f)
                    self.subscriber_count = data.get("count", 0)
            logger.info(f"Loaded Subscriber Count: {self.subscriber_count}")
        except Exception as e:
            logger.warning(f"Failed to load subscriber count: {e}")

    def _save_subscriber_count(self):
        try:
            with open("subscriber_count.json", "w") as f:
                json.dump({"count": self.subscriber_count}, f)
        except Exception as e:
            logger.error(f"Failed to save subscriber count: {e}")

    def set_subscriber_count(self, count, save=True):
        self.subscriber_count = count
        if save:
            self._save_subscriber_count()
        if callable(self.on_subscriber_update):
            asyncio.create_task(self.on_subscriber_update(self.subscriber_count))

    def stop(self):
        """Gracefully stop the bot service and all sub-services."""
        logger.info("Stopping BotService...")
        self.is_running = False

        # Close YouTube Chat
        if self.chat is not None and hasattr(self.chat, "is_alive") and self.chat.is_alive():
            if hasattr(self.chat, "terminate"):
                self.chat.terminate()
        self.chat = None

        # Close Streamer.bot WS
        if getattr(self, "sb_ws", None):
            asyncio.create_task(self.sb_ws.close())

        # Stop sub-services
        if getattr(self, "tunnel", None):
            self.tunnel.stop()
        if getattr(self, "cloud_alert_client", None):
            self.cloud_alert_client.stop()

        # Save Session Report
        try:
            report = self.session_stats.copy()
            report["end_time"] = time.time()
            start_time = float(report.get("start_time") or report["end_time"])
            report["duration_seconds"] = float(report["end_time"]) - start_time
            if self.session_chatters:
                top = max(self.session_chatters.items(), key=lambda x: x[1])
                report["top_chatter"] = {"name": top[0], "count": top[1]}
            with open("session_report.json", "w") as f:
                json.dump(report, f, indent=2)
            logger.info("Session Report Saved")
        except Exception as e:
            logger.error(f"Failed to save session report: {e}")

        logger.info("Bot Service Stopped")

    def _spawn_task(self, coro):
        task = asyncio.create_task(coro)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        return task

    def _spawn_managed_loop(self, name: str, coro_func: Callable):
        """Spawns an async loop with health tracking and auto-restart capabilities."""
        self.worker_health[name] = {"status": "starting", "last_active": time.time(), "restarts": 0}
        
        async def _wrapper():
            while self.is_running:
                try:
                    self.worker_health[name]["status"] = "running"
                    self.worker_health[name]["last_active"] = time.time()
                    await coro_func()
                    if self.is_running:
                        logger.warning(f"Worker '{name}' exited prematurely. Restarting in 5s...")
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    self.worker_health[name]["status"] = "error"
                    logger.error(f"Worker '{name}' crashed: {e}")
                    logger.error(traceback.format_exc())
                
                if not self.is_running:
                    break
                    
                self.worker_health[name]["restarts"] += 1
                await asyncio.sleep(5)
                
        return self._spawn_task(_wrapper())

    async def start(self, broadcast_func):
        self.broadcast_func = broadcast_func
        self.is_running = True
        
        # Pass broadcast_func to AudioService
        if self.audio:
            self.audio.broadcast_func = broadcast_func

        # Pass broadcast_func to ViewerService for live Loyalty updates
        self.viewers._broadcast_func = broadcast_func

        # Start ViewerService background tasks (auto-save loop)
        await self.viewers.start()
            
        logger.info("Bot Service Started")
        # Auto-Connect Sheets (blocking start to ensure data safety)
        try:
             logger.info("Auto-connecting to Google Sheets...")
             await self.sheets.connect()
        except Exception as e:
             logger.error(f"Sheet Auto-Connect Failed: {e}")

        if os.environ.get("RUN_MODE") == "cloud":
            logger.info("Running in Cloud Mode. Minimal services started. Skipping local loops.")
            return

        # Always start SB loop so it can dynamically connect when enabled via UI
        self.sb_ws_task = self._spawn_managed_loop("sb_ws", self._sb_ws_loop)
        if self.tunnel:
            self._spawn_task(self.tunnel.start())
        if self.cloud_alert_client:
            await self.cloud_alert_client.start()
        self._spawn_managed_loop("email_monitor", self._email_monitor_loop)
        self.dynamic_engagement_task = self._spawn_managed_loop("dynamic_engagement", self._dynamic_engagement_loop)
        self._spawn_managed_loop("stream_context", self._stream_context_loop)


        # Start Memory Cleanup Loop (YouTube + Brain)
        self._spawn_managed_loop("memory_cleanup", self._memory_cleanup_loop)

        # Start YouTube Stats Loop (Subscriber Count auto-update)
        self._spawn_managed_loop("youtube_stats", self._youtube_stats_loop)

        # Start Rewards Expiration Loop
        self._spawn_managed_loop("rewards_expiration", self._rewards_expiration_loop)

        # Start Leaderboard Top 3 Mod Sync Loop
        self._spawn_managed_loop("leaderboard_mod_sync", self._leaderboard_mod_sync_loop)
        
        # Start Goals Monitoring Loop
        self._spawn_managed_loop("goal_monitoring", self._goal_monitoring_loop)
        
        # Start YouTube Monitor Loop (Pytchat standalone fallback)
        self._spawn_managed_loop("youtube_monitor", self._monitor_loop)

        # Start Auto-Message Loop
        self._spawn_managed_loop("auto_message", self._auto_message_loop)

    async def _monitor_loop(self):
        """Direct connection to YouTube live chat when Streamer.bot is disconnected or disabled."""
        while self.is_running:
            try:
                config = self.load_config()
                sb_enabled = config.get("streamer_bot", {}).get("enabled", False)
                
                # If Streamer.bot is enabled but disconnected, we pause the direct YouTube chat listener
                if sb_enabled and not self.is_sb_connected:
                    if getattr(self, "chat", None) and self.chat.is_alive():
                        self.chat.terminate()
                        self.chat = None
                        await self._log_ui("SYSTEM", "Streamer.bot is enabled but disconnected. Direct YouTube chat listener paused.")
                    await asyncio.sleep(5)
                    continue

                if sb_enabled and self.is_sb_connected:
                    if getattr(self, "chat", None) and self.chat.is_alive():
                        self.chat.terminate()
                        self.chat = None
                        await self._log_ui("SYSTEM", "Streamer.bot connected. Pausing direct YouTube chat listener.")
                    await asyncio.sleep(5)
                    continue

                video_id = config.get("youtube", {}).get("video_id")
                if not video_id:
                    await asyncio.sleep(5)
                    continue

                if not self.chat or not self.chat.is_alive():
                    logger.info(f"Connecting to YouTube Chat: {video_id}")
                    if self.broadcast_func:
                        await self._log_ui("SYSTEM", f"Connecting to Video ID: {video_id} (Direct)")
                    self.chat = pytchat.create(video_id=video_id)

                if self.chat.is_alive():
                    for c in self.chat.get().sync_items():
                        try:
                            await self._handle_message(c)
                        except Exception as msg_err:
                            logger.error(f"[HANDLE_MESSAGE] Unhandled error for msg from {getattr(getattr(c, 'author', None), 'name', 'unknown')}: {msg_err}")
                            logger.error(traceback.format_exc())
                
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Monitor Loop Error: {e}")
                await asyncio.sleep(5)

    async def _auto_message_loop(self):
        """Sends scheduled auto-messages at configured intervals."""
        message_timers = {}  # {id: last_sent_time}
        while self.is_running:
            try:
                config = self.load_config()
                auto = config.get("auto_messages", {})
                if auto.get("enabled"):
                    for msg in auto.get("messages", []):
                        if not msg.get("enabled"):
                            continue
                        msg_id = msg["id"]
                        interval = msg.get("interval_minutes", 15) * 60
                        last = message_timers.get(msg_id, 0)
                        if time.time() - last >= interval:
                            await self._send_chat(msg["text"])
                            await self._log_ui("AUTO_MSG", msg["text"], author="AutoBot")
                            message_timers[msg_id] = time.time()
                            await asyncio.sleep(2)  # Small gap between messages
            except Exception as e:
                logger.error(f"[AutoMsg] Error: {e}")
            await asyncio.sleep(30)  # Check every 30 seconds

    async def _memory_cleanup_loop(self):
        """Purge YouTube memory & brain chat_history older than 7 days. Runs every 6 hours."""
        while self.is_running:
            try:
                yt_deleted = youtube_memory.cleanup_old_messages(7)
                brain_deleted = self.brain.cleanup_old_chats(7)
                if yt_deleted or brain_deleted:
                    await self._log_ui("SYSTEM", f"Memory Cleanup: {yt_deleted} YT + {brain_deleted} brain messages purged (>7 days)")
            except Exception as e:
                logger.error(f"Memory Cleanup Error: {e}")
            await asyncio.sleep(6 * 3600)  # Every 6 hours

    async def _rewards_expiration_loop(self):
        """Checks for expired temporary rewards (like 7-day YouTube Moderator). Runs every minute."""
        rewards_file = os.path.join(os.path.dirname(__file__), "..", "data", "active_rewards.json")
        while self.is_running:
            try:
                if os.path.exists(rewards_file):
                    with open(rewards_file, "r") as f:
                        rewards = json.load(f)
                    
                    now = time.time()
                    updated_rewards = []
                    changed = False
                    
                    for r in rewards:
                        if r.get("expires_at") and now > r["expires_at"]:
                            logger.info(f"Reward Expired for {r.get('author')}: {r.get('reward_type')}")
                            revoke_ok = False
                            # Execute removal logic
                            if r.get("reward_type") == "youtube_mod":
                                success, msg = await self.youtube_api.remove_moderator(r.get("mod_id"))
                                if success:
                                    await self._log_ui("SYSTEM", f"Revoked expired YouTube Moderator from {r.get('author')} (Wrench Taken)")
                                    revoke_ok = True
                                else:
                                    logger.warning(f"Failed to revoke expired YouTube Mod for {r.get('author')}: {msg}")
                                    await self._log_ui("WARNING", f"Failed to revoke expired mod for {r.get('author')}: {msg} — will retry")
                            else:
                                revoke_ok = True  # Unknown type, just clean up
                            
                            if revoke_ok:
                                changed = True  # Don't keep this entry
                            else:
                                updated_rewards.append(r)  # Keep for retry
                        else:
                            updated_rewards.append(r)
                            
                    if changed:
                        with open(rewards_file, "w") as f:
                            json.dump(updated_rewards, f, indent=4)

            except Exception as e:
                logger.error(f"Rewards Expiration Error: {e}")
            
            await asyncio.sleep(300)  # Check every 5 minutes (rewards expire in days)

    async def _leaderboard_mod_sync_loop(self):
        """Automatically manages YouTube Mod status for the Top 3 leaderboard viewers. Runs every 5 minutes."""
        rewards_file = os.path.join(os.path.dirname(__file__), "..", "data", "active_rewards.json")
        while self.is_running:
            try:
                # 1. Fetch current top 3
                leaderboard = self.viewers.get_leaderboard(limit=3)
                top_3_names = [v['name'] for v in leaderboard]
                
                # 2. Load existing rewards
                rewards = []
                if os.path.exists(rewards_file):
                    with open(rewards_file, "r") as f:
                        rewards = json.load(f)
                
                # 3. Find current top 3 mods in the file
                current_top3_mods = [r for r in rewards if r.get("reward_type") == "youtube_mod_leaderboard"]
                current_mod_names = [r.get("author") for r in current_top3_mods]
                
                updated_rewards = [r for r in rewards if r.get("reward_type") != "youtube_mod_leaderboard"]
                needs_save = False
                assigned_mods = []
                
                # 4. Revoke mod from users who dropped out of top 3
                for mod in current_top3_mods:
                    if mod.get("author") not in top_3_names:
                        logger.info(f"Revoking Top 3 Mod status from {mod.get('author')}")
                        if mod.get("mod_id"):
                            success, msg = await self.youtube_api.remove_moderator(mod.get("mod_id"))
                            if success:
                                await self._log_ui("SYSTEM", f"Revoked Top 3 Mod from {mod.get('author')} (Dropped from Leaderboard)")
                                needs_save = True
                            else:
                                # Keep the entry so we retry next cycle
                                logger.warning(f"Failed to revoke mod for {mod.get('author')}: {msg}")
                                await self._log_ui("WARNING", f"Failed to revoke mod for {mod.get('author')}: {msg} — will retry")
                                assigned_mods.append(mod)
                        else:
                            # No mod_id — can't revoke via API, just drop the entry
                            await self._log_ui("WARNING", f"Cannot revoke mod for {mod.get('author')}: No mod_id stored")
                            needs_save = True

                # 5. Grant mod to new top 3 members
                for name in top_3_names:
                    existing_mod = next((m for m in current_top3_mods if m.get("author") == name), None)
                    if existing_mod:
                        assigned_mods.append(existing_mod)
                    else:
                        viewer_data = self.viewers.get_viewer(name)
                        channel_id = viewer_data.get("channel_id")
                        
                        if channel_id == "NOT_FOUND":
                            logger.info(f"Skipping Top 3 Mod sync for {name} (channel_id previously failed to resolve)")
                            continue
                            
                        if channel_id:
                            logger.info(f"Granting Top 3 Mod status to {name} ({channel_id})")
                            success, mod_id_or_err = await self.youtube_api.add_moderator(channel_id)
                            if success:
                                assigned_mods.append({
                                    "author": name,
                                    "reward_type": "youtube_mod_leaderboard",
                                    "mod_id": mod_id_or_err,
                                    "expires_at": None
                                })
                                await self._log_ui("SYSTEM", f"Granted Top 3 Mod status to {name} 👑")
                                needs_save = True
                            else:
                                logger.warning(f"Failed to add mod for {name}: {mod_id_or_err}")
                                if "No active live stream found" not in mod_id_or_err:
                                    await self._log_ui("WARNING", f"Failed to grant Top 3 Mod to {name}: {mod_id_or_err}")
                        else:
                            # Try to resolve it automatically via YouTube Search API
                            logger.info(f"Attempting to automatically resolve channel_id for legacy user: {name}")
                            channel_id = await self.youtube_api.resolve_channel_id(name)
                            if channel_id:
                                logger.info(f"Successfully resolved channel_id for {name}: {channel_id}")
                                viewer_data["channel_id"] = channel_id
                                self.viewers.mark_dirty()
                                
                                logger.info(f"Granting Top 3 Mod status to {name} ({channel_id})")
                                success, mod_id_or_err = await self.youtube_api.add_moderator(channel_id)
                                if success:
                                    assigned_mods.append({
                                        "author": name,
                                        "reward_type": "youtube_mod_leaderboard",
                                        "mod_id": mod_id_or_err,
                                        "expires_at": None
                                    })
                                    await self._log_ui("SYSTEM", f"Granted Top 3 Mod status to {name} 👑")
                                    needs_save = True
                                else:
                                    logger.warning(f"Failed to add mod for {name}: {mod_id_or_err}")
                                    if "No active live stream found" not in mod_id_or_err:
                                        await self._log_ui("WARNING", f"Failed to grant Top 3 Mod to {name}: {mod_id_or_err}")
                            else:
                                logger.warning(f"Cannot grant Top 3 Mod status to {name}: Missing channel_id")
                                await self._log_ui("WARNING", f"Top 3 Mod: Missing channel ID for {name}. They need to chat once while the bot is active.")
                                
                                # Cache failure to prevent quota drain
                                viewer_data["channel_id"] = "NOT_FOUND"
                                self.viewers.mark_dirty()
                                
                                # Send Chat Notification if we haven't already
                                if not hasattr(self, '_notified_missing_mod'):
                                    self._notified_missing_mod = set()
                                if name not in self._notified_missing_mod:
                                    self._notified_missing_mod.add(name)
                                    asyncio.create_task(self._send_chat(f"🏆 @{name}, you are in the Top 3 Leaderboard! Please send a message in chat so I can automatically give you your Moderator status!"))
                
                # 6. Save if changes were made
                if needs_save:
                    updated_rewards.extend(assigned_mods)
                    with open(rewards_file, "w") as f:
                        json.dump(updated_rewards, f, indent=4)

            except Exception as e:
                logger.error(f"Leaderboard Mod Sync Error: {e}")
            
            await asyncio.sleep(300) # Check every 5 minutes

    async def _goal_monitoring_loop(self):
        """Periodically checks goal progress and activates reward windows.

        SD Card Protection:
        - WebSocket broadcasts happen every cycle (2s) for real-time UI updates
        - Config saves ONLY happen when a goal is achieved or a reward window
          expires — NOT on every subscriber count tick.  This protects the Pi's
          SD card from excessive writes.
        """
        while self.is_running:
            try:
                cfg = self.load_config()
                goals_cfg = cfg.get("goals", {})
                if not goals_cfg.get("enabled", True):
                    await asyncio.sleep(10)
                    continue

                active_goals = goals_cfg.get("active_goals", [])
                needs_save = False  # Only True for achievement / window expiry
                now = time.time()
                
                # Setup rewarded set if not exists
                if not hasattr(self, "_goal_claims"):
                    self._goal_claims = {}

                for goal in active_goals:
                    # Sync current progress dynamically (broadcast only, no disk write)
                    if goal.get("type") == "subscribers":
                        goal["current"] = self.subscriber_count

                        # Broadcast websocket event for goal_update (real-time UI)
                        if self.broadcast_func:
                            asyncio.create_task(self.broadcast_func({"type": "goal_update", "goal": goal}))
                            
                    elif goal.get("type") == "likes":
                        current_likes = getattr(self, "live_likes_count", -1)
                        goal["current"] = current_likes

                        # Broadcast websocket event for goal_update (real-time UI)
                        if self.broadcast_func:
                            asyncio.create_task(self.broadcast_func({"type": "goal_update", "goal": goal}))

                    # Check achievement — THIS triggers a save (rare event)
                    if not goal.get("achieved") and goal.get("current", 0) >= goal.get("target", 1):
                        goal["achieved"] = True
                        goal["reward_window_active"] = True
                        goal["reward_window_end"] = now + goal.get("duration", 300)
                        # Clear tracking set for this goal
                        goal_id = str(goal.get("id", "default"))
                        if goal_id in getattr(self, "_goal_claims", {}):
                            self._goal_claims[goal_id].clear()
                        needs_save = True
                        if self.broadcast_func:
                            asyncio.create_task(self.broadcast_func({"type": "goal_achieved", "goal": goal}))
                            
                    # Check window expiration — THIS triggers a save (rare event)
                    elif goal.get("reward_window_active") and now > goal.get("reward_window_end", 0):
                        goal["reward_window_active"] = False
                        needs_save = True
                        if self.broadcast_func:
                            asyncio.create_task(self.broadcast_func({"type": "goal_ended", "goal": goal}))

                # Only write to SD card when something actually changed state
                if needs_save:
                    cfg["goals"]["active_goals"] = active_goals
                    ConfigManager.save_config(cfg)
                    logger.info("Goal state saved (achievement or window change)")
                
            except Exception as e:
                logger.error(f"Goal Monitoring Loop Error: {e}")
                
            await asyncio.sleep(2) # Frequent checks for real-time progress

    async def _email_monitor_loop(self):
        """
        Periodically checks email connectivity status (every 60s).
        Does not keep connection open, just checks readability.
        """
        logger.info("Starting Email Monitor Loop...")
        while self.is_running:
            try:
                if not self.email:
                    self.email_status = "Disabled (Service not installed)"
                    await asyncio.sleep(60)
                    continue

                config = self.load_config()
                email_cfg = config.get("email_verification", {})
                
                if not email_cfg.get("enabled"):
                    self.email_status = "Disabled"
                    await asyncio.sleep(10)
                    continue

                # Run blocking check in thread
                success, msg = await asyncio.to_thread(self.email.check_connection)
                
                if success:
                    self.email_status = "Connected"
                else:
                    self.email_status = f"Disconnected: {msg}"
                    logger.warning(f"Email Monitor: {self.email_status}")
            
            except Exception as e:
                self.email_status = f"Error: {str(e)}"
                logger.error(f"Email Monitor Error: {e}")
            
            await asyncio.sleep(60)

    async def connect_email(self):
        """Manually enable and connect email service"""
        logger.info("Manual Email Connect Request")
        if not self.email:
            return {"status": "Error", "success": False, "error": "Email Service not installed"}
        try:
            # Update Config
            config = self.load_config()
            if not config.get("email_verification", {}).get("enabled"):
                config.setdefault("email_verification", {})["enabled"] = True
                ConfigManager.save_config(config)
            
            # Check Connection Immediately
            self.email_status = "Connecting..."
            success, msg = await asyncio.to_thread(self.email.check_connection)
            
            if success:
                self.email_status = "Connected"
            else:
                self.email_status = f"Disconnected: {msg}"
                
            return {"status": self.email_status, "success": success}
        except Exception as e:
            logger.error(f"Error in connect_email: {e}")
            logger.error(traceback.format_exc())
            self.email_status = "Error"
            return {"status": "Error", "success": False, "error": str(e)}

    async def disconnect_email(self):
        """Manually disable and disconnect email service"""
        logger.info("Manual Email Disconnect Request")
        if not self.email:
            self.email_status = "Disabled (Service not installed)"
            return {"status": "Disabled", "success": True}
        
        # Update Config
        config = self.load_config()
        if config.get("email_verification", {}).get("enabled"):
            config["email_verification"]["enabled"] = False
            ConfigManager.save_config(config)
            
        self.email._disconnect()
        self.email_status = "Disabled"
        return {"status": "Disabled", "success": True}

    async def check_integrations(self):
        # 1. Streamer.bot (OBS)
        sb_status = "Disconnected"
        sb_meta = "WebSocket Closed"
        
        # Check if SB WS exists
        if self.is_sb_connected:
                sb_status = "Connected"
                remote = "Unknown"
                try:
                    remote = self.sb_ws.remote_address[0]
                except: pass
                
                sb_meta = f"Host: {remote}"
                # Verify send capability
                try:
                    await self.sb_ws.send(json.dumps({"request": "GetInfo", "id": "TestPing"}))
                except Exception as e:
                    sb_status = "Degraded"
                    sb_meta = f"Connected but send failed: {e}"
        # 2. YouTube Chat
        yt_status = "Offline"
        yt_meta = "Streamer.bot disconnected"
        if self.is_sb_connected:
            yt_status = "Monitoring"
            yt_meta = "Via Streamer.bot WS"
        
        # 3. Audio Engine
        audio_status = "Inactive"
        if self.audio:
            audio_status = "Active"

        return {
            "streamer_bot": {"status": sb_status, "meta": sb_meta},
            "youtube": {"status": yt_status, "meta": yt_meta},
            "audio": {"status": audio_status, "meta": "TTS Ready"},
            "viewers": {"status": "Tracking", "meta": f"{len(self.viewers.viewers)} stored"},
            "google_sheets": {
                "status": "Connected" if self.sheets.connected else "Disconnected",
                "meta": self.sheets.sheet.title if self.sheets.sheet else (self.sheets.last_error or "Not Connected")
            }
        }

    async def send_test_chat(self):
        msg = "🧪 Pi Bot System Check: Test Message Success!"
        await self._send_chat(msg)
        return {"status": "sent", "message": msg}

    def get_status(self):
        sb_connected = False
        try:
             # Robust Check matching check_integrations
             sb_connected = self.is_sb_connected
        except Exception as e:
            logger.error(f"[STATUS CHECK] Error: {e}")

        return {
            "is_running": self.is_running,
            "streamer_bot_connected": sb_connected,
            "youtube_monitored": sb_connected,  # Uses Streamer.bot to monitor chat
            "email_status": self.email_status,
            "start_time": self.session_stats.get("start_time"),
            "uptime": time.time() - self.session_stats.get("start_time", time.time()),
            "subscriber_count": self.subscriber_count,
            "live_likes_count": getattr(self, "live_likes_count", -1),
            "workers": getattr(self, "worker_health", {})
        }



    async def _sb_ws_loop(self):
        while self.is_running:
            try:
                config = self.load_config()
                sb_cfg = config.get("streamer_bot", {})
                if not sb_cfg.get("enabled"):
                    await asyncio.sleep(10)
                    continue

                host = sb_cfg.get("host", "127.0.0.1")
                port = sb_cfg.get("port", 8080)
                uri = f"ws://{host}:{port}/"

                logger.info(f"Connecting to Streamer.bot WS: {uri}")
                import websockets
                
                try:
                    async with websockets.connect(uri) as ws:
                        self.sb_ws = ws
                        self.worker_health["streamerbot"] = {
                            "status": "connected",
                            "last_error": None,
                            "last_heartbeat": time.time(),
                            "restart_count": self.worker_health.get("streamerbot", {}).get("restart_count", 0)
                        }
                        await self._log_ui("SYSTEM", "Connected to Streamer.bot WS")
                        
                        subscribe_msg: Dict[str, Any] = {
                            "request": "Subscribe",
                            "id": "PiBotSubs",
                            "events": {
                                "YouTube": ["Message", "YouTubeMessage", "SuperChat", "SuperSticker", "NewSubscriber", "Member", "GiftSub", "*"],
                                "youTube": ["*"],
                                "Youtube": ["*"],
                                "general": ["Custom", "Alert", "*"],
                                "Twitch": ["ChatMessage", "RewardRedemption", "*"]
                            }
                        }
                        await ws.send(json.dumps(subscribe_msg))
                        logger.info(f"[SB] Subscription request sent for events: {list(subscribe_msg['events'].keys())}")

                        # Attempt to fetch initial state / info
                        # Some versions of SB support GetBroadcaster or GetMonitor
                        await ws.send(json.dumps({
                            "request": "GetBroadcaster",
                            "id": "InitialStateFetch",
                            "producer": "YouTube"
                        }))

                        # Check config periodically loop
                        while True:
                            try:
                                # Wait for message with timeout to allow config check
                                msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                                
                                try:
                                    data = json.loads(msg)
                                    await self._handle_sb_event(data)
                                except Exception as process_err:
                                    logger.error(f"SB Event Error: {process_err}")
                                    
                            except asyncio.TimeoutError:
                                # Timeout reached, check if we should still be connected
                                if not self.load_config().get("streamer_bot", {}).get("enabled"):
                                    logger.info("Streamer.bot disabled in config. Closing connection...")
                                    await ws.close()
                                    break
                                # If still enabled, just continue waiting
                                continue
                            
                            except websockets.exceptions.ConnectionClosed:
                                logger.info("Streamer.bot Connection Closed.")
                                break
                                
                            # Also check after receiving a message (fast disconnect)
                            if not self.load_config().get("streamer_bot", {}).get("enabled"):
                                await ws.close()
                                break
                finally:
                     # Critical: Reset ws object so status checks fail appropriately
                     self.sb_ws = None
                     if "streamerbot" not in self.worker_health:
                         self.worker_health["streamerbot"] = {"restart_count": 0}
                     self.worker_health["streamerbot"]["status"] = "disconnected"
                     await self._log_ui("SYSTEM", "Streamer.bot WS Connection Closed.")

            except Exception as e:
                self.sb_ws = None
                if "streamerbot" not in self.worker_health:
                    self.worker_health["streamerbot"] = {"restart_count": 0}
                self.worker_health["streamerbot"]["status"] = "error"
                self.worker_health["streamerbot"]["last_error"] = str(e)
                logger.warning(f"Streamer.bot WS Error: {e}")
                await self._log_ui("SYSTEM", "Streamer.bot WS Disconnected. Retrying...")
                await asyncio.sleep(5)

    async def _handle_sb_event(self, data):
        # Log ALL incoming events for diagnostics
        event = data.get("event", {})
        source = event.get("source")
        etype = event.get("type")
        
        # Log Streamer.bot responses (subscribe confirmations, action results, errors)
        if "status" in data:
            req_id = data.get("id", "Unknown")
            if data["status"] == "error":
                logger.error(f"[SB Response Error] ID: {req_id} | Error: {data.get('error', 'unknown error')}")
            else:
                logger.info(f"[SB Response] ID: {req_id} | Status: {data['status']}")
        
        # Log every event we receive from SB so we can diagnose missing chat messages
        if source or etype:
            logger.info(f"[SB Event] Source: {source} | Type: {etype} | Keys: {list(data.keys())}")
        
        is_msg = etype in ["Message", "YouTubeMessage"]
        is_alert = etype in [
            "Member", "YouTubeMember", "YouTubeMemberMilestone", "MemberMileStone",
            "GiftSub", "YouTubeGiftMembershipReceived", "YouTubeMembershipGift", "GiftMembershipReceived", "MembershipGift",
            "SuperChat", "YouTubeSuperChat",
            "SuperSticker", "YouTubeSuperSticker",
            "NewSubscriber", "YouTubeNewSubscriber", "NewSponsor",
            "RANK_UP", "LOYALTY"
        ]

        if source and source.lower() in ["youtube", "general"]:
            if is_msg:
                # ... existing message handling ...
                msg_data = data.get("data", {})
                
                author = msg_data.get("user", {}).get("name") or msg_data.get("userName") or msg_data.get("user")
                message = msg_data.get("message") or msg_data.get("msg") or msg_data.get("text")
                msg_id = msg_data.get("msgId") or msg_data.get("eventId")
                
                # ENHANCED ID EXTRACTION: Try all known fields for YouTube Channel ID
                user_id = (
                    msg_data.get("user", {}).get("id") or 
                    msg_data.get("userId") or 
                    msg_data.get("channelId") or
                    msg_data.get("user", {}).get("channelId")
                )

                if author and message:
                    # Parse member/sub status from SB payload
                    logger.info(f"DEBUG RAW SB USER DATA: {msg_data.get('user', {})}")
                    u = msg_data.get("user", {})
                    is_sponsor = u.get("isSponsor", False) or msg_data.get("isSponsor", False) or u.get("role") == "sponsor"
                    is_sub = u.get("isSubscriber", False) or msg_data.get("isSubscriber", False) or u.get("isSubscribed", False) or msg_data.get("isSubscribed", False)
                    
                    class MockChat:
                        class Author:
                            def __init__(self, name, channel_id=None, sponsor=False, sub=False): 
                                self.name = name
                                self.channelId = channel_id
                                self.is_sponsor = sponsor
                                self.is_subscriber = sub
                        def __init__(self, author, message, msg_id, channel_id, sponsor=False, sub=False):
                            self.author = self.Author(author, channel_id, sponsor, sub)
                            self.message = message
                            self.msg_id = msg_id
                    
                    await self._handle_message(MockChat(author, message, msg_id, user_id, is_sponsor, is_sub))
            
            elif is_alert:
                # Forward to Cloud Server if running as local client
                is_client = self.cloud_alert_client.is_running and os.environ.get("RUN_MODE") != "cloud"
                if is_client:
                    if getattr(self, "cloud_alert_client", None):
                        self._spawn_task(self.cloud_alert_client.send_event({
                            "type": "sb_event",
                            "data": data
                        }))
                    return

                msg_data = data.get("data", {})
                logger.info(f"RAW ROOT: {data}") # Log to Terminal
                await self._log_ui("DEBUG", f"RAW ROOT: {data}") # Log to UI
                
                # CRASH-SAFE EXTRACTION
                raw_user = msg_data.get("user")
                name_from_user = None

                if isinstance(raw_user, dict):
                    name_from_user = raw_user.get("name")
                elif isinstance(raw_user, str):
                    name_from_user = raw_user
                    
                author = (
                    (str(name_from_user) if name_from_user else None)
                    or msg_data.get("userName")
                    or msg_data.get("username")
                    or msg_data.get("user")
                    or "Someone (Fallback)"
                )
                
                config = self.load_config()
                ignore_list = [u.lower().replace("@", "").strip() for u in config.get("moderation", {}).get("ignore_list", [])]
                author_clean = author.lower().replace("@", "").strip()
                if author_clean in ignore_list:
                    return
                
                display_type = etype.replace("YouTube", "")
                
                # TEMPLATED MESSAGES
                # Customize these to match the bot's personality
                templates = {
                    "NewSubscriber": [
                        "Welcome to the family, {author}! Thanks for subscribing! 🎉",
                        "HYPE! {author} just subscribed! Welcome! 🚀",
                        "A wild {author} appeared! Thanks for the sub! 👾"
                    ],
                    "SuperChat": [
                        "💰 WOW! {author} just dropped a Super Chat! Thank you!!",
                        "INCREDIBLE! {author} supports the stream with a Super Chat! ❤️",
                        "Cha-Ching! 🤑 Thank you {author} for the generic support!"
                    ],
                    "Member": [
                        "💎 Welcome to the VIPs, {author}! Thanks for becoming a Member!",
                        "{author} just joined the Member squad! Let's go! 🛡️"
                    ],
                    "GiftSub": [
                        "🎁 OMG! {author} just gifted a sub! You are amazing!",
                        "Calculated Charity! {author} gifts a sub! 🤓"
                    ]
                }
                
                # random is imported at top level
                if display_type in templates:
                    alert_msg = random.choice(templates[display_type]).format(author=author)
                else:
                    # Generic Fallback
                    alert_msg = f"Alert! {author} triggered {display_type}! 🚀"
                
                await self._log_ui("ALERT", alert_msg, meta=data)
                
                # FIX: Send alert to YouTube chat via Streamer.bot (NOT direct YouTube API)
                await self._send_chat(alert_msg)
                
                if self.audio:
                    # For TTS, keep it slightly simpler or same
                    await self.audio.speak(f"Thank you {author} for the {display_type}!", "public")
                
                # Map specific events to granular actions
                action_map = {
                    "NewSubscriber": "YouTube Subscriber",
                    "NewSponsor": "YouTube Subscriber", # Sometimes used for subs
                    "Member": "YouTube Member",
                    "MemberMilestone": "YouTube Member",
                    "SuperChat": "YouTube Super Chat",
                    "SuperSticker": "YouTube Super Sticker",
                    "GiftSub": "YouTube Gift Sub",
                    "MembershipGift": "YouTube Gift Sub",
                    "GiftMembershipReceived": "YouTube Gift Received",
                    "RANK_UP": "Bot Rank Up",
                    "LOYALTY": "Bot Loyalty"
                }
                
                # Default fallback
                target_action = "YouTube Alerts"
                
                # Check mapping
                clean_type = display_type.replace("YouTube", "") # e.g. YouTubeSuperChat -> SuperChat
                for key, action in action_map.items():
                    if key in clean_type:
                        target_action = action
                        break
                
                # Determine event category for _fire_sb_alert
                event_category = "Monetization" if clean_type in ["SuperChat", "SuperSticker"] else "Engagement"
                
                # Trigger the specific action
                await self._fire_sb_alert(display_type.upper(), alert_msg, author, event_category, action_name=target_action)

                # SUBSCRIBER COUNT UPDATE (REAL-TIME INCREMENT)
                if display_type in ["NewSubscriber", "NewSponsor"]:
                    # Increment immediately
                    self.subscriber_count += 1
                    
                    # Log for debugging
                    logger.info(f"REAL-TIME UPDATE: Subscriber Count incremented to {self.subscriber_count}")
                    
                    # Persist & Broadcast (Force broadcast even if save fails)
                    self._save_subscriber_count()
                    if callable(self.on_subscriber_update):
                        # Broadcast immediately to all connected overlays
                        await self.on_subscriber_update(self.subscriber_count)

                # LOGGING TO SHEETS AND LOYALTY POINTS (Super Chat / Member / Gift)
                config = self.load_config()
                loyalty_cfg = config.get("loyalty", {})
                
                # Membership Points
                if display_type in ["NewSponsor", "Member", "MemberMilestone"]:
                    # Try to extract tier
                    tier_str = str(msg_data.get("tier", "")).lower()
                    if "4" in tier_str:
                        pts = loyalty_cfg.get("points_per_membership_l4", 0)
                    elif "3" in tier_str:
                        pts = loyalty_cfg.get("points_per_membership_l3", 0)
                    elif "2" in tier_str:
                        pts = loyalty_cfg.get("points_per_membership_l2", 0)
                    else:
                        pts = loyalty_cfg.get("points_per_membership_l1", 0)
                    
                    if pts > 0:
                        self.viewers.add_points(author, pts)
                        logger.info(f"Awarded {pts} points to {author} for Membership ({tier_str})")
                        
                elif display_type in ["GiftSub", "MembershipGift", "YouTubeMembershipGift"]:
                    # Try to extract number of gifts
                    try:
                        count = int(msg_data.get("count", msg_data.get("giftCount", 1)))
                    except Exception:
                        count = 1
                    
                    base_pts = loyalty_cfg.get("points_per_gifted_membership", 0)
                    pts = base_pts * count
                    if pts > 0:
                        self.viewers.add_points(author, pts)
                        logger.info(f"Awarded {pts} points to {author} for Gifting {count} Memberships")

                # SuperChats & Stickers
                if display_type in ["SuperChat", "YouTubeSuperChat", "SuperSticker", "YouTubeSuperSticker"]:
                    # Extract Amount if possible
                    # Data structure varies, usually in msg_data
                    amount_str = msg_data.get("amount") or msg_data.get("displayString") or "Unknown"
                    
                    # Award Loyalty Points based on amount
                    try:
                        # re is imported at top level
                        # Extract numeric value from strings like "₹100.00" or "$5.00"
                        amount_match = re.search(r'[\d.,]+', amount_str)
                        if amount_match:
                            amount_val = float(amount_match.group().replace(',', ''))
                            if display_type in ["SuperChat", "YouTubeSuperChat"]:
                                pts_per_rupee = loyalty_cfg.get("points_per_superchat_rupee", 0)
                            else:
                                pts_per_rupee = loyalty_cfg.get("points_per_supersticker_rupee", 0)
                                
                            if pts_per_rupee > 0:
                                pts_to_add = int(amount_val * pts_per_rupee)
                                self.viewers.add_points(author, pts_to_add)
                                logger.info(f"Awarded {pts_to_add} points to {author} for {amount_str} {display_type}")
                    except Exception as e:
                        logger.error(f"Failed to award points for {display_type}: {e}")

                    # Only log Monetization types to sheets
                    await self.sheets.log_transaction({
                        "user": author,
                        "amount": amount_str,
                        "type": "Super Chat" if "SuperChat" in display_type else "Super Sticker",
                        "message": msg_data.get("message") or msg_data.get("comment") or "",
                        "transaction_id": msg_data.get("eventId") or f"sc_{int(time.time())}"
                    })

        # Handle Responses to our requests
        rid = data.get("id", "")
        if rid == "InitialStateFetch":
            # Try to parse broadcaster info
            # Format depends on SB version, usually data.broadcaster.subscriberCount or similar
            try:
                # Log structure to understand it
                # await self._log_ui("DEBUG", f"SB Info: {str(data)[:200]}...") 
                
                # Broadcaster Info Response logic
                broadcaster = data.get("broadcaster", {})
                if not broadcaster:
                     broadcaster = data.get("data", {}) # Sometimes directly in data
                
                sub_count = broadcaster.get("subscriberCount") or broadcaster.get("subscriber_count")
                
                if sub_count is not None:
                    self.subscriber_count = int(sub_count)
                    self._save_subscriber_count()
                    logger.info(f"Updated Subscriber Count from SB: {self.subscriber_count}")
                    if callable(self.on_subscriber_update):
                        await self.on_subscriber_update(self.subscriber_count)
            except Exception as e:
                logger.warning(f"Failed to parse SB Broadcaster Info: {e}")



    async def test_super_chat(self, data):
        """
        Manually triggers a Super Chat alert for testing.
        Does NOT log to Google Sheets.
        """
        author = data.get("user", "Test User")
        amount = data.get("amount", "₹100")
        message = data.get("message", "This is a test Super Chat!")
        
        # Calculate tier color/style based on amount is handled by frontend mostly, 
        # but we pass raw data matching SB format.
        
        # Trigger the alert via the same mechanism as real events
        # "SUPERCHAT" is the display_type expected by _fire_sb_alert logic if we were parsing it, 
        # but here we call _fire_sb_alert directly.
        
        await self._fire_sb_alert(
            "SUPERCHAT", 
            f"💰 {author} dropped {amount}!", 
            author, 
            "Monetization", 
            action_name="YouTube Super Chat",
            extra_data={
                "amount": amount,
                "message": message,
                "tier": data.get("tier", "blue"), # Optional tier color hint
                "displayString": amount 
            }
        )
        return {"status": "success", "message": "Test Super Chat Triggered"}


    async def _trigger_sb_action(self, action_name):
        """Callback for AI to trigger Streamer.bot actions"""
        if not self.is_sb_connected:
            logger.warning("Cannot trigger action: SB Disconnected")
            return

        try:
            # We assume the action name matches exactly an action in SB, OR we map it.
            # For flexibility, let's assume the AI sends the exact name OR a mapped key.
            # Example: <action name="Scare" /> -> triggers action named "Scare"
            
            payload = {
                "request": "DoAction",
                "action": {"name": action_name},
                "id": "AITriggeredAction"
            }
            if self.sb_ws is not None:
                await self.sb_ws.send(json.dumps(payload))
            logger.info(f"Sent Action to SB: {action_name}")
        except Exception as e:
            logger.error(f"Failed to trigger action {action_name}: {e}")

    async def _handle_message(self, chat_obj, force_ai=False):
        author = chat_obj.author.name.lower()
        channel_id = getattr(chat_obj.author, 'channelId', None)
        message = chat_obj.message
        
        # 0. Check Ignore Text List (Silent Ignore)
        config = self.load_config()
        mod_cfg = config.get("moderation", {})
        ignore_text_list = mod_cfg.get("ignore_text_list", [])
        msg_lower = message.lower()
        for ignore_text in ignore_text_list:
            if ignore_text and ignore_text.lower() in msg_lower:
                logger.info(f"Silently ignoring message from {author} containing ignored text: '{ignore_text}'")
                return None
        
        # Unique ID for Deduplication
        msg_id = getattr(chat_obj, 'msg_id', None) or getattr(chat_obj, 'id', None)
        if not msg_id:
            # Fallback: Hash of author + message + timestamp (approx)
            # Use higher precision if forcing, to allow rapid manual testing
            ts_window = int(time.time()/5) if not force_ai else time.time()
            msg_id = f"{author}:{message}:{ts_window}"
            
        if msg_id in self.message_dedup_cache and not force_ai:
            logger.info(f"Duplicate Message Ignored: {msg_id}")
            return None
        
        self.message_dedup_cache.append(msg_id)

        # GOALS LOGIC - REWARD WINDOW
        try:
            cfg = self.load_config()
            goals_cfg = cfg.get("goals", {})
            if goals_cfg.get("enabled", True):
                active_goals = goals_cfg.get("active_goals", [])
                for goal in active_goals:
                    kw = goal.get("keyword", "")
                    if goal.get("reward_window_active") and kw and kw.lower() in message.lower():
                        reward_pts = goal.get("reward", 0)
                        if reward_pts > 0:
                            # Avoid duplicate reward per goal per user
                            goal_id = str(goal.get("id", "default"))
                            if not hasattr(self, "_goal_claims"):
                                self._goal_claims = {}
                            if goal_id not in self._goal_claims:
                                self._goal_claims[goal_id] = set()
                            
                            aut_lower = author.lower()
                            if aut_lower not in self._goal_claims[goal_id]:
                                self._goal_claims[goal_id].add(aut_lower)
                                self.viewers.add_points(author, reward_pts)
                                asyncio.create_task(self._send_chat(f"🎉 @{author} collected {reward_pts} Points from the {goal.get('name')} goal!"))
                                asyncio.create_task(self._log_ui("LOYALTY", f"Goal Reward: {author} +{reward_pts} Points"))
        except Exception as e:
            logger.error(f"Goal Logic Error: {e}")

        # BRAIN: Remember everything
        self.brain.remember(author, message, user_id=getattr(chat_obj, 'msg_id', None))

        # YOUTUBE MEMORY: Save message (7-day retention)
        yt_row_id = None
        if self.yt_memory_enabled:
            try:
                yt_row_id = youtube_memory.save_message(author, message, user_id=channel_id)
            except Exception as e:
                logger.error(f"YouTube Memory Save Error: {e}")


        # Analytics
        self.session_stats["messages_processed"] = int(self.session_stats.get("messages_processed", 0)) + 1
        self.session_chatters[author] = int(self.session_chatters.get(author, 0)) + 1
        
        # Track Peak Viewers
        current_viewers = len(self.viewers.viewers)
        peak = int(self.session_stats.get("peak_viewers", 0))
        if current_viewers > peak:
            self.session_stats["peak_viewers"] = current_viewers
        
        # Track Commands
        if message.startswith("!"):
            self.session_stats["total_commands"] = int(self.session_stats.get("total_commands", 0)) + 1

        now = time.time()
        is_muted = self.moderation.is_user_muted(author)

        config = self.load_config()
        mod_cfg = config.get("moderation", {})
        ignore_list = [u.lower().replace("@", "").strip() for u in mod_cfg.get("ignore_list", [])]
        author_clean = author.replace("@", "").strip()
        if author_clean in ignore_list and not force_ai:
            return None
        
        # 1. Viewer Tracking & Loyalty
        viewer_data = self.viewers.update_viewer(
            author, 
            trigger_welcome_cb=self._trigger_welcome,
            trigger_rank_up_cb=self._trigger_rank_up,
            check_loyalty_cb=self._check_loyalty,
            channel_id=channel_id
        )
        rank_info = self.viewers.get_rank(viewer_data.get("points", 0))
        
        # 2. Moderation Filters
        if mod_cfg.get("enabled", True):
            if author not in self.mod_locks:
                self.mod_locks[author] = asyncio.Lock()
                # Cap mod_locks dict at 500 entries to prevent memory leak safely
                if len(self.mod_locks) > 500:
                    # Try to remove an unlocked lock to avoid race conditions
                    removed = False
                    for k, v in list(self.mod_locks.items()):
                        if not v.locked():
                            self.mod_locks.pop(k, None)
                            removed = True
                            break
                    if not removed:
                        # All locks are active (very rare), just let it grow temporarily
                        pass
                
            async with self.mod_locks[author]:
                caught, reason = await self.moderation.run_filters(author, message, mod_cfg)
            
            if caught and not force_ai:
                logic = mod_cfg.get("protection_logic", {})
                max_warnings = logic.get("max_warnings", 2)
                warning_window = logic.get("warning_window", 60)
                
                # Retrieve warning history
                warning_history = viewer_data.get("warning_history", [])
                if not isinstance(warning_history, list):
                    warning_history = []
                    
                # Append current time
                warning_history.append(now)
                
                # Filter history by warning window
                warning_history = [t for t in warning_history if now - t <= warning_window]
                
                viewer_data["warning_history"] = warning_history
                new_warns = len(warning_history)
                viewer_data["warnings"] = new_warns
                self.viewers._save_viewers()

                if new_warns < max_warnings:
                    if not is_muted:
                        warn_msg = reason.replace("{author}", author)
                        remaining = max_warnings - new_warns
                        await self._send_chat(f"⚠️ @{author} {warn_msg} (Warning {new_warns}/{max_warnings} in {warning_window}s — {remaining} more before timeout!)")
                        await self._log_ui("MOD", f"WARNING {new_warns}/{max_warnings}: {author} - {reason}")
                        self.moderation.set_user_mute(author, now + 2)
                else:
                    duration = logic.get("timeout_duration", 60)
                    await self.moderation.trigger_timeout(author, duration, channel_id=channel_id)
                    
                    self.session_stats["timeouts_triggered"] = int(self.session_stats.get("timeouts_triggered", 0)) + 1
                    
                    mins = duration // 60
                    dur_str = f"{mins} minute{'s' if mins != 1 else ''}" if mins >= 1 else f"{duration} seconds"
                    msg = f"🚫 @{author} You have been timed out for {dur_str} (Broken {max_warnings} rules in {warning_window}s). Reason: {reason}"
                    await self._send_chat(msg)
                    await self._log_ui("MOD", f"TIMEOUT: {author} for {duration}s. Reason: {reason}")
                    
                    viewer_data["warnings"] = 0
                    viewer_data["warning_history"] = []
                    self.moderation.set_user_mute(author, now + duration + 5)
                    self.viewers._save_viewers()
                return 1

        await self._log_ui("CHAT", f"[{rank_info['emoji']}] {author}: {message}", author=author, meta={"msg_id": msg_id, "channel_id": channel_id})
        
        if self.audio and not message.strip().startswith(("!", "/")):
            await self.audio.speak(f"{author} says: {message}", "secret")

        is_client = self.cloud_alert_client.is_running and os.environ.get("RUN_MODE") != "cloud"
        if is_client:
            if getattr(self, "cloud_alert_client", None):
                self._spawn_task(self.cloud_alert_client.send_event({
                    "type": "chat_message",
                    "author": author,
                    "message": message,
                    "msg_id": msg_id,
                    "channel_id": channel_id,
                    "is_sponsor": getattr(chat_obj.author, 'is_sponsor', False),
                    "is_sub": getattr(chat_obj.author, 'is_subscriber', False)
                }))
            return None

        # Secret Word Check (Dynamic Event)
        if getattr(self, "_secret_word_active", False) and self._secret_word and self._secret_word.lower() in message.lower():
            if not message.startswith(("!", "/")):
                self._secret_word_active = False
                self.viewers.add_points(author, 1000)
                msg = f"🎉 @{author} just guessed the Secret Word '{self._secret_word}' and won 1000 Points!"
                await self._send_chat(msg)
                await self._log_ui("LOYALTY", msg)

        # 3. AI Triggers
        should_respond = force_ai
        prompt = message
        
        # Explicit Trigger Rule — Agent ONLY replies when specifically called
        msg_lower = message.lower().strip()
        # Strict phrases: message must START with "bot" (followed by space), or contain specific call phrases
        bot_call_phrases = ["hey bot", "pi bot", "@bot", "@pi bot", "bot bhai", "bot bata", "bot batao"]
        if msg_lower.startswith("bot ") or any(phrase in msg_lower for phrase in bot_call_phrases):
            should_respond = True
            
        # Highly Engaging Commands (Handled by AI)
        if msg_lower.startswith("bot roast") or msg_lower.startswith("bot hype"):
            should_respond = True
            force_ai = True # Override cooldowns for these explicit commands
        
        # Gate by Streamer.bot connection status (unless forced for testing/manual chat)
        sb_enabled = config.get("streamer_bot", {}).get("enabled", False)
        if sb_enabled and not self.is_sb_connected and not force_ai:
            should_respond = False

        if message.startswith("!"):
                await self._handle_command(author, message, chat_obj)
        elif should_respond:
            # Check cooldowns (skip if forced)
            if not force_ai:
                allowed, reason = self.ai_handler.check_cooldowns_for_api(author, config, force_ai)
                if not allowed:
                     return None # Silent fail for chat triggers

            # BRAIN: Try Recall First
            cached_reply = self.brain.recall_answer(prompt)
            if cached_reply and not force_ai:
                logger.info(f"BRAIN: Recalled answer for '{prompt}'")
                await self._send_chat(f"@{author} {cached_reply}")
                await self._log_ui("BRAIN", f"Recalled: {cached_reply}", author="Pi Bot")
                if self.audio:
                    await self.audio.speak(cached_reply)
                return cached_reply

            # YOUTUBE MEMORY: Restore History (7-day context)
            async def _history_loader(user):
                 # Use YouTube memory for richer 7-day context
                 return await asyncio.to_thread(youtube_memory.get_user_history_as_chat, user, 20)
            
            await self.ai_handler.ensure_history(author, _history_loader)

            # AI Processing
            context_kwargs = {}
            if getattr(self, "_live_context", None):
                context_kwargs["live_context"] = self._live_context
                
            response = await self.ai_handler.process_ai(
                author, prompt, config, self.viewers, self.audio, self._log_ui, self._send_chat,
                trigger_action_cb=self._trigger_sb_action,
                **context_kwargs
            )
            if response:
                self.session_stats["ai_responses"] = int(self.session_stats.get("ai_responses", 0)) + 1

                # YOUTUBE MEMORY: Update AI reply
                if yt_row_id and self.yt_memory_enabled:
                    try:
                        youtube_memory.update_ai_reply(yt_row_id, response)
                    except Exception as e:
                        logger.error(f"YouTube Memory Reply Update Error: {e}")


                
                # BRAIN: Learn from AI
                if response:
                    self.brain.learn(prompt, response)

            return response
            
        return None

    async def _handle_command(self, author, message, chat_obj=None):
        parts = message.split(" ")
        cmd = parts[0].lower()
        args = parts[1:] if len(parts) > 1 else []

        if cmd == "!claim":
            if getattr(self, "_loot_box_active", False):
                self._loot_box_active = False
                pts = random.randint(100, 1000)
                self.viewers.add_points(author, pts)
                await self._send_chat(f"🎁 @{author} claimed the Loot Box and got {pts} Points!")
                await self._log_ui("LOYALTY", f"{author} claimed loot box: +{pts}")
            else:
                await self._send_chat(f"@{author} There is no active Loot Box right now!")
        elif cmd == "!points":
            v = self.viewers.get_viewer(author)
            pts = v.get("points", 0)
            
            # Find next rank
            cfg = self.load_config().get("loyalty", {})
            ranks = cfg.get("ranks", self.viewers.ranks)
            sorted_ranks = sorted(ranks, key=lambda x: int(x.get("min_points", 0)))
            
            rank_obj = self.viewers.get_rank(pts)
            rank = rank_obj["name"]
            emoji = rank_obj.get("emoji", "")
            
            next_rank = None
            for r in sorted_ranks:
                if int(r.get("min_points", 0)) > pts:
                    next_rank = r
                    break
                
            if next_rank:
                req = int(next_rank.get("min_points", 0)) - pts
                await self._send_chat(f"@{author} You have {pts} Points! Rank: {rank} {emoji}. {req} Points until {next_rank['name']}!")
            else:
                await self._send_chat(f"@{author} You have {pts} Points! Rank: {rank} {emoji}. You are at the max rank!")
        
        elif cmd == "!give":
            if not self.gambling._is_game_enabled("give"):
                await self._send_chat(f"@{author} The !give command is currently disabled by the streamer.")
                return
                
            if len(args) < 2:
                await self._send_chat(f"@{author} Usage: !give <username> <amount>")
                return
            target = args[0].replace('@', '')
            try:
                amount = int(args[1])
                success = self.viewers.transfer_points(author, target, amount)
                if success:
                    self.gambling._log_economy_action(author, "give", amount, target=target, win=True, payout=amount)
                    await self._send_chat(f"@{author} successfully gave {amount} Points to {target}!")
                else:
                    await self._send_chat(f"@{author} transfer failed! Do you have enough points?")
            except ValueError:
                await self._send_chat(f"@{author} Please enter a valid number for amount.")

        elif cmd == "!rob":
            if not args:
                await self._send_chat(f"@{author} Usage: !rob <username>")
                return
            target = args[0].replace('@', '')
            
            # Cooldown check for rob (to prevent spam)
            cooldown_key = f"rob_{author}"
            last_used = self._custom_cmd_cooldowns.get(cooldown_key, 0)
            if time.time() - last_used < 60:
                await self._send_chat(f"@{author} The cops are still looking for you! Wait 1 minute before robbing again.")
                return
            
            self._custom_cmd_cooldowns[cooldown_key] = time.time()
            result = await self.gambling.rob(author, target, self.viewers)
            await self._send_chat(result["message"])

        elif cmd == "!buy":
            if not args:
                await self._send_chat(f"@{author} Usage: !buy <item_name>. Use !shop to see available rewards.")
                return
            
            # Map !buy to !redeem
            redeem_name = " ".join(args)
            await self._handle_redeem_cmd(author, redeem_name, chat_obj)

        elif cmd == "!gamble":
            if not args:
                await self._send_chat(f"@{author} Usage: !gamble <amount>")
                return
            try:
                amount = int(args[0])
                v = self.viewers.get_viewer(author)
                result = await self.gambling.gamble(author, amount, v.get("points", 0), self.viewers)
                await self._send_chat(result["message"])
                if result.get("win"):
                     await self._fire_sb_alert("GAMBLE WIN", f"{author} won {amount} points!", author, "Gamble")
            except ValueError:
                await self._send_chat(f"@{author} Please enter a valid number.")

        elif cmd == "!slots":
            if not args:
                await self._send_chat(f"@{author} Usage: !slots <amount>")
                return
            try:
                amount = int(args[0])
                v = self.viewers.get_viewer(author)
                result = await self.gambling.slots(author, amount, v.get("points", 0), self.viewers)
                await self._send_chat(result["message"])
            except ValueError:
                await self._send_chat(f"@{author} Please enter a valid number.")

        elif cmd == "!bowl":
            if not args:
                await self._send_chat(f"@{author} Usage: !bowl <amount>")
                return
            try:
                amount = int(args[0])
                v = self.viewers.get_viewer(author)
                result = await self.gambling.bowl(author, amount, v.get("points", 0), self.viewers)
                await self._send_chat(result["message"])
            except ValueError:
                await self._send_chat(f"@{author} Please enter a valid number.")

        elif cmd == "!bat":
            amount = None
            if args:
                try:
                    amount = int(args[0])
                except ValueError:
                    await self._send_chat(f"@{author} Please enter a valid number.")
                    return
            v = self.viewers.get_viewer(author)
            result = await self.gambling.bat(author, amount, v.get("points", 0), self.viewers)
            await self._send_chat(result["message"])
                

        elif cmd == "!attack":
            if not args:
                await self._send_chat(f"@{author} Usage: !attack <amount>")
                return
            try:
                amount = int(args[0])
                v = self.viewers.get_viewer(author)
                result = self.boss_fight.attack_boss(author, amount, v.get("points", 0), self.viewers)
                
                if not result["success"]:
                    await self._send_chat(f"@{author} {result['message']}")
                    return
                
                # Send websocket event for damage
                if self.broadcast_func:
                    asyncio.create_task(self.broadcast_func({
                        "type": "boss_attacked",
                        "attacker": author,
                        "damage": result["actual_damage"],
                        "current_hp": result["current_hp"]
                    }))
                    
                if result["defeated"]:
                    rewards = self.boss_fight.process_rewards(self.viewers)
                    top_msg = ", ".join([f"{r[0]} (+{r[1]})" for r in rewards["top_rewards"]])
                    await self._send_chat(f"🏆 BOSS DEFEATED! Top Attackers: {top_msg}. {rewards['others_count']} others got {rewards['others_reward']} pts!")
                    if self.broadcast_func:
                        asyncio.create_task(self.broadcast_func({
                            "type": "boss_defeated",
                            "top_rewards": rewards["top_rewards"]
                        }))
            except ValueError:
                await self._send_chat(f"@{author} Please enter a valid number.")

        elif cmd in ["!top", "!leaderboard"]:
            top = self.viewers.get_leaderboard(5)
            msg = "🏆 TOP LOYAL VIEWERS: " + ", ".join([f"{i+1}. {x['name']} ({x['points']})" for i, x in enumerate(top)])
            await self._send_chat(msg)

        elif cmd == "!shop":
            await self._handle_memes_cmd(author)

        elif cmd == "!redeem":
            if not args:
                await self._handle_memes_cmd(author)
                return
            
            redeem_name = " ".join(args)
            await self._handle_redeem_cmd(author, redeem_name, chat_obj)

        elif cmd == "!memes" or cmd == "!rewards":
            await self._handle_memes_cmd(author)

        else:
            # Custom Commands Fallback
            config = self.load_config()
            custom = config.get("custom_commands", {})
            if cmd in custom:
                entry = custom[cmd]
                if entry.get("enabled", True):
                    # Per-command cooldown check
                    cooldown = entry.get("cooldown", 30)
                    # _custom_cmd_cooldowns initialized in __init__
                    last_used = self._custom_cmd_cooldowns.get(cmd, 0)
                    if time.time() - last_used >= cooldown:
                        await self._send_chat(entry["response"])
                        self._custom_cmd_cooldowns[cmd] = time.time()

    async def _stream_context_loop(self):
        """Fetches live stream context periodically for AI awareness."""
        self._live_context = None
        while self.is_running:
            try:
                if self.is_sb_connected:
                    context = await self.youtube_api.get_live_stream_context()
                    if context:
                        self._live_context = context
                        logger.info(f"Updated Live Context: {context['title']}")
                else:
                    self._live_context = None
            except Exception as e:
                logger.error(f"Stream Context Loop Error: {e}")
            await asyncio.sleep(300)

    async def _dynamic_engagement_loop(self):
        """Randomly triggers engagement events (Promotions, Loot Drops, Rivalries)"""
        # Secret word setup
        words = ["op", "noob", "headshot", "camper", "rush", "chicken", "gg", "hacker", "pro"]
        self._secret_word = random.choice(words)
        logger.info(f"Secret Word selected for this session: {self._secret_word}")

        while self.is_running:
            try:
                # Check Streamer.bot dependency (only trigger if stream is active)
                if not self.is_sb_connected:
                    await asyncio.sleep(60)
                    continue
                    
                # Random sleep between 15 to 30 minutes
                await asyncio.sleep(random.randint(900, 1800))
                
                # Double check after sleep
                if not self.is_sb_connected:
                    continue

                # Weighted event selection: 80% game promotion, 20% subscribe/like/shop
                # Within game promotion, further split: game_promo(50%), loot_drop(15%), rivalry(15%)
                roll = random.random()
                if roll < 0.50:
                    choice = "game_promo"
                elif roll < 0.65:
                    choice = "loot_drop"
                elif roll < 0.80:
                    choice = "rivalry"
                else:
                    choice = "subscribe_remind"

                if choice == "game_promo":
                    # Rotate through different game promotions with detailed Hinglish explanations
                    game_promos = [
                        # Gamble
                        "🎰 Bhai points bahut hain? `!gamble 500` laga ke dekho! 50-50 chance hai — jeetoge to DOUBLE milega, haroge to sab jayega! Himmat hai? 💪🔥",
                        "🎲 Boring ho raha hai? `!gamble <amount>` try karo! Ek pal mein crorepati ya kangaal — full thrill! 🤑",
                        # Slots
                        "🍒 Slots try kiya kya? `!slots 200` lagao — Triple 7️⃣ aaye to 10x JACKPOT milega! 🍒🔔💎 Aaj lucky ho kya? ✨",
                        "🎰 `!slots <amount>` mein 3 reels spin hote hain — Triple 💎 = 5x, Triple koi bhi = 3x, Pair = 1.5x! Bas ek spin door hai jackpot! 🚀",
                        # Rob
                        "🥷 Kisi ke points chori karne ka mann hai? `!rob <username>` se dusre ke points le lo — lekin pakde gaye to FINE lagega! 40% chance hai success ka, himmat hai? 😈",
                        "🚨 `!rob @target` — Chori ka game! 40% chance jeetoge aur target ke 10% points tumhare. Lekin fail hue to tumhare points target ko milenge! Risk loge? 🤔",
                        # Cricket (Bowl/Bat)
                        "🏏 Cricket lovers! `!bowl 1000` se challenge do — koi `!bat` karke accept karega to 1v1 match! Winner sab le jaata hai! Kisme hai dum? 💥",
                        "🏏 `!bat 500` try karo! Solo batting mein Chakka (SIX) maaro to 3x points milenge! Out hue to sab jayega. Chauka = 2x, Double = 1.5x! Full cricket vibes! 🔥",
                        "🏏 Cricket ka maza! `!bowl <amount>` se ball dalo, 30 seconds mein koi `!bat` karega. 50-50 duel — jeetega batsman ya bowler? Try karo! 🏆",
                        # Boss Fight (explain only)
                        "⚔️ Boss Fight kya hai? Streamer ek powerful Boss spawn karta hai. Sab milke `!attack <amount>` se maarte hain. Top 3 attackers ko bada reward milta hai. Tayaar raho! 🛡️",
                        # General game hype
                        "🎮 Games try kiye? `!gamble`, `!slots`, `!rob`, `!bowl`, `!bat` — sab available hain! Points lagao aur jeeto ya haro — full entertainment! Kaunsa kheloge? 💎",
                        "💰 Points kaise use karein? `!gamble` se bet lagao, `!slots` pe spin karo, `!rob` se chori karo, ya `!bowl`/`!bat` se cricket khelo! Sab commands ready hain! 🎯",
                    ]
                    promo_text = random.choice(game_promos)
                    await self._send_chat(promo_text)
                    await self._log_ui("AUTO_MSG", promo_text, author="AutoBot (Game Promo)")

                elif choice == "subscribe_remind":
                    # 20% — Subscribe/Like/Shop reminders
                    subscribe_promos = [
                        "❤️ Stream pasand aa raha hai? Like button daba do aur Subscribe karo — FREE hai! 🔔",
                        "🛒 Points hain? `!shop` mein dekho kya kya rewards available hain! `!redeem <name>` se kharido! 🎁",
                        "🔔 Subscribe karna mat bhoolna bhai! Notification bell ON karo taaki koi stream miss na ho! 🎮",
                        "👍 Ek Like se streamer ka JOSH badh jaata hai! Like karo aur Subscribe karo — aur points se `!shop` explore karo! 🔥",
                    ]
                    promo_text = random.choice(subscribe_promos)
                    await self._send_chat(promo_text)
                    await self._log_ui("AUTO_MSG", promo_text, author="AutoBot (Promo)")
                    
                elif choice == "loot_drop":
                    self._loot_box_active = True
                    drop_msg = "🎁 LOOT BOX drop hua hai! Pehle `!claim` karo aur 100-1000 random Points jeeto! Jaldi karo, 60 seconds hain! ⏰"
                    await self._send_chat(drop_msg)
                    await self._log_ui("AUTO_MSG", drop_msg, author="AutoBot (Loot Drop)")
                    
                    # Auto-expire loot box after 60 seconds if no one claims
                    asyncio.create_task(self._expire_loot_box())
                    
                elif choice == "rivalry":
                    # Find two active viewers with close points
                    leaderboard = self.viewers.get_leaderboard(limit=10)
                    if len(leaderboard) >= 2:
                        # Pick random two adjacent users
                        idx = random.randint(0, len(leaderboard) - 2)
                        u1 = leaderboard[idx]
                        u2 = leaderboard[idx + 1]
                        diff = abs(u1.get('points', 0) - u2.get('points', 0))
                        msg = f"⚔️ @{u1['name']} aur @{u2['name']} ke beech sirf {diff} points ka fark hai! Koi `!rob` karega ya `!gamble` se aage niklega? 🔥"
                        await self._send_chat(msg)
                        await self._log_ui("AUTO_MSG", msg, author="AutoBot (Rivalry)")
                        
            except Exception as e:
                logger.error(f"[Dynamic Engagement] Error: {e}")
                await asyncio.sleep(60)

    async def _expire_loot_box(self):
        await asyncio.sleep(60)
        if self._loot_box_active:
            self._loot_box_active = False
            await self._send_chat("💨 The Loot Box disappeared because nobody claimed it in time!")

    async def _handle_memes_cmd(self, author):
        available = [r for r in self.redeem_svc.redeems if r.get("enabled")]
        if not available:
            await self._send_chat(f"@{author} No rewards available right now!")
        else:
            names = [f"{r['name']} ({r['cost']} Points)" for r in available]
            chunk = []
            for name in names:
                if len(", ".join(chunk + [name])) > 150:
                    await self._send_chat(f"🛒 REWARDS: {', '.join(chunk)}")
                    chunk = [name]
                else:
                    chunk.append(name)
            if chunk:
                await self._send_chat(f"🛒 REWARDS: {', '.join(chunk)} — Use !redeem <name>")

    async def _handle_redeem_cmd(self, author, redeem_name, chat_obj=None):
        reward = self.redeem_svc.get_by_name(redeem_name)
        if not reward:
            await self._send_chat(f"@{author} Unknown reward '{redeem_name}'. Use !shop to see list.")
            return
        
        result = await self.redeem_svc.trigger(
            reward["id"],
            author,
            viewer_service=self.viewers,
            sb_ws=self.sb_ws,
            broadcast_func=self.broadcast_func,
        )
        if result["ok"]:
            reward_obj = result.get("reward", reward)
            reward_type = reward_obj.get("type", "obs")
            
            # Execute native rewards
            if reward_type != "obs":
                error_msg = await self._apply_api_reward(author, reward_type, reward_obj, chat_obj)
                if error_msg:
                    self.viewers.add_points(author, reward_obj["cost"])
                    self.redeem_svc._cooldowns.pop(reward["id"], None) # Clear cooldown
                    await self._send_chat(f"@{author} {error_msg} (Refunded {reward_obj['cost']} Points)")
                    return
                
            if "custom_message" in result and result["custom_message"]:
                await self._send_chat(result["custom_message"])
            else:
                await self._send_chat(f"🎉 {author} redeemed {reward_obj['name']}! 🔥")
                
            await self._log_ui("REWARD", f"{author} redeemed {reward_obj['name']} for {reward_obj['cost']} Points")
        else:
            await self._send_chat(f"@{author} {result['error']}")

    async def handle_sb_chat(self, user, message, force_ai=False, payload=None):
        channel_id = None
        msg_id = None
        is_sponsor = False
        is_sub = False
        if payload:
            channel_id = payload.get("userId") or payload.get("author", {}).get("id")
            msg_id = payload.get("msgId") or payload.get("eventId") or payload.get("id")
            u = payload.get("user", {})
            is_sponsor = u.get("isSponsor", False) or payload.get("isSponsor", False) or u.get("role") == "sponsor"
            is_sub = u.get("isSubscriber", False) or payload.get("isSubscriber", False) or u.get("isSubscribed", False) or payload.get("isSubscribed", False)

        class MockChat:
            class Author:
                def __init__(self, name, channel_id=None, sponsor=False, sub=False): 
                    self.name = name
                    self.channelId = channel_id
                    self.is_sponsor = sponsor
                    self.is_subscriber = sub
            def __init__(self, author, message, msg_id, channel_id, sponsor=False, sub=False):
                self.author = self.Author(author, channel_id, sponsor, sub)
                self.message = message
                self.msg_id = msg_id
                self.id = msg_id
        
        # If force_ai is true, we want to ensure we get a response, so we pass that along.
        # Note: We rely on _handle_message's deduplication logic now.
        response = await self._handle_message(MockChat(user, message, msg_id, channel_id, is_sponsor, is_sub), force_ai=force_ai)
        
        if response:
             return {"botReply": response}
             
        return {"botReply": ""}

    async def _send_youtube_chat(self, message):
        """
        Send a message to YouTube Live Chat.
        ALWAYS routes via Streamer.bot - no direct YouTube API calls.
        Streamer.bot must have a 'PiBot Chat' action configured to send
        a YouTube chat message using the %message% argument.
        """
        await self._send_chat(message)

    async def _send_chat(self, message):
        """
        Send a chat message to YouTube via Streamer.bot.
        Streamer.bot MUST have a 'PiBot Reply' action that posts
        the %message% arg to YouTube chat.
        No YouTube API is used — SB handles the platform connection.
        """
        # Cloud Server: Broadcast back to connected local Pi clients
        if os.environ.get("RUN_MODE") == "cloud":
            if getattr(self, "pi_clients", None):
                asyncio.create_task(self.pi_clients.broadcast({
                    "type": "send_chat",
                    "message": message
                }))
            return

        config = self.load_config()
        sb_cfg = config.get("streamer_bot", {})
        if not sb_cfg.get("enabled"):
            logger.debug("[CHAT] Streamer.bot disabled — skipping chat message.")
            return

        payload = json.dumps({
            "request": "SendMessage",
            "message": message[:200],
            "id": "PiBotChatMsg"
        })

        # Fallback: DoAction if SendMessage not supported by this SB version
        action_payload = json.dumps({
            "request": "DoAction",
            "action": {"name": "PiBot Reply"},
            "args": {"message": message[:200]},
            "id": "PiBotReply"
        })

        is_connected = self.is_sb_connected

        # Method A: Main WS Connection — try DoAction
        if is_connected:
            try:
                if self.sb_ws is not None:
                    await self.sb_ws.send(action_payload)
                logger.info(f"[CHAT] Sent via SB DoAction: {message[:80]}")
                return
            except Exception as e:
                logger.warning(f"[CHAT] SB DoAction failed: {e}")
                is_connected = False

        # Method B: Ephemeral WS connection
        if not is_connected:
            try:
                host = sb_cfg.get("host", "127.0.0.1")
                port = sb_cfg.get("port", 8080)
                uri = f"ws://{host}:{port}/"
                import websockets
                async with websockets.connect(uri) as temp_ws:
                    try:
                        await temp_ws.send(action_payload)
                        logger.info(f"[CHAT] Sent via ephemeral SB DoAction: {message[:60]}")
                    except Exception as e:
                        logger.warning(f"[CHAT-TEMP] SendMessage failed: {e}")
            except Exception as e:
                logger.error(f"[CHAT] All Streamer.bot methods failed: {e}")

    async def handle_pi_client_event(self, event, websocket=None):
        etype = event.get("type")
        if etype == "chat_message":
            author = event.get("author")
            message = event.get("message")
            msg_id = event.get("msg_id")
            channel_id = event.get("channel_id")
            is_sponsor = event.get("is_sponsor", False)
            is_sub = event.get("is_sub", False)
            
            class MockChat:
                class Author:
                    def __init__(self, name, channel_id=None, sponsor=False, sub=False): 
                        self.name = name
                        self.channelId = channel_id
                        self.is_sponsor = sponsor
                        self.is_subscriber = sub
                def __init__(self, author, message, msg_id, channel_id, sponsor=False, sub=False):
                    self.author = self.Author(author, channel_id, sponsor, sub)
                    self.message = message
                    self.msg_id = msg_id
                    self.id = msg_id
            
            await self._handle_message(MockChat(author, message, msg_id, channel_id, is_sponsor, is_sub))
            
        elif etype == "sb_event":
            sb_data = event.get("data")
            if sb_data:
                await self._handle_sb_event(sb_data)

        elif etype == "viewer_api_action":
            action = event.get("action")
            params = event.get("params", {})
            logger.info(f"Executing viewer API action from Pi: {action} with params {params}")
            if action == "add_points":
                self.viewers.add_points(params.get("author"), params.get("amount"))
            elif action == "redeem":
                self.viewers.redeem(params.get("author"), params.get("cost"))
            elif action == "deduct_points":
                self.viewers.deduct_points(params.get("author"), params.get("amount"))
            elif action == "set_points":
                self.viewers.set_points(params.get("author"), params.get("amount"))
            elif action == "transfer_points":
                self.viewers.transfer_points(params.get("sender"), params.get("receiver"), params.get("amount"))
            elif action == "delete_viewer":
                self.viewers.delete_viewer(params.get("author"))
            elif action == "reset_viewer":
                self.viewers.reset_viewer(params.get("author"))
            elif action == "import_viewers":
                new_viewers = params.get("viewers", {})
                logger.info(f"Importing {len(new_viewers)} viewers from Pi client backup...")
                self.viewers.viewers = new_viewers
                self.viewers.mark_dirty()
                self.viewers._save_viewers()

        elif etype == "request_viewer_sync":
            if websocket:
                logger.info("Pi client requested viewer sync. Sending full database...")
                await websocket.send_json({
                    "type": "full_viewer_sync",
                    "viewers": self.viewers.viewers
                })

    async def _log_ui(self, type, message, author=None, meta=None):
        # Always coerce message to string to prevent frontend crashes
        # (e.g. if an object is accidentally passed instead of a string)
        if not isinstance(message, str):
            message = str(message)
        if callable(self.broadcast_func):
            await self.broadcast_func({
                "type": "log",
                "timestamp": time.time(),
                "category": type,
                "message": message,
                "author": author,
                "meta": meta
            })

    async def _fire_sb_alert(self, title, message, author, type="General", action_name="Bot Alerts", extra_data=None):
        """Unified Helper to trigger actions in Streamer.bot"""
        # 1. Voice
        # (Reserved for Voice Alerts)
        
        # 1. ALWAYS broadcast to internal UI/Overlay (Decoupled from Streamer.bot)
        # Verify if it's a Super Chat to send the specific payload structure overlay expects
        if title == "SUPERCHAT" or type == "Monetization":
             # Construct overlay-compatible payload — guard extra_data to prevent crashes
             overlay_data = {
                 "amount": extra_data.get("amount") if extra_data else 0,
                 "currency": "INR",
                 "message": message,
                 "author": author,
                 "tier": extra_data.get("tier") if extra_data else "blue"
             }
             # Broadcast with category "SUPERCHAT" so overlay picks it up
             await self._log_ui("SUPERCHAT", message, author=author, meta=overlay_data)
        else:
             # Broadcast other events (Subscriber, Member, Gift, etc.)
             await self._log_ui("ALERT", message, meta={"type": type, "action": action_name})


        # 2. Trigger SB Action (If connected)
        is_connected = self.is_sb_connected

        if is_connected:
            try:
                logger.info(f"Firing SB Action: {action_name} | Args: {title}, {author}")
                
                args = {
                    "alertTitle": title,
                    "alertMessage": message,
                    "author": author,
                    "user": author,      # Alias for %user%
                    "userName": author,  # Alias for %userName%
                    "msg_author": author,# Alias for %msg_author%
                    "type": type
                }
                
                if extra_data:
                    args.update(extra_data)

                payload = {
                    "request": "DoAction",
                    "action": {"name": action_name},
                    "args": args,
                    "id": "PiBotAlert"
                }
                if self.sb_ws is not None:
                    await self.sb_ws.send(json.dumps(payload))
                await self._log_ui("DEBUG", f"Sent Action: '{action_name}' to Streamer.bot")
            except Exception as e:
                logger.warning(f"Failed to send Alert to SB: {e}")
                # Don't log error to UI if we already showed the alert, just debug log
    
        else:
            logger.warning("Streamer.bot Disconnected (Alert handled internally)")

    async def _trigger_welcome(self, author):
        msg = f"WELCOME {author}! Thank you for joining your first stream here! 🙏"
        await self._log_ui("LOYALTY", msg)
        if self.audio:
            await self.audio.speak(f"Welcome {author}! Thanks for joining your first stream!", "public")
        await self._send_chat(msg)
        
        # SEPARATE ACTION: Bot Alerts
        await self._fire_sb_alert("WELCOME", msg, author, "Welcome", action_name="Bot Alerts")

    async def _trigger_rank_up(self, author, rank):
        msg = f"CONGRATULATIONS! {author} has ranked up to {rank['emoji']} {rank['name']}!"
        await self._log_ui("RANK_UP", msg)
        if self.audio:
            await self.audio.speak(f"Alert! {author} just leveled up to {rank['name']} rank! Poggers!", "public")
        await self._send_chat(msg)

        # SEPARATE ACTION: Bot Alerts
        await self._fire_sb_alert("RANK UP", msg, author, "RankUpdate", action_name="Bot Alerts")
        
        # Check for Native API Rewards tied to this rank
        native_reward = rank.get("native_reward")
        if native_reward:
             await self._apply_api_reward(author, native_reward.get("type"), native_reward)

        # Check for our new top-level YouTube Mod rank rewards
        if rank.get("yt_mod"):
             await self._apply_api_reward(author, "youtube_mod_rank", {"duration": rank.get("mod_duration_days", 7)})

    async def _apply_api_reward(self, author, reward_type, parameters, chat_obj=None):
        """Applies a Native API reward to a user (YouTube Mod, Giveaway Ticket). Returns error string on failure."""
        if reward_type in ["youtube_mod", "youtube_mod_rank"]:
            duration_days = int(parameters.get("duration", parameters.get("mod_duration_days", 7)))
            duration_sec = duration_days * 86400
            
            v = self.viewers.get_viewer(author)
            channel_id = v.get("channel_id")
            if not channel_id:
                await self._log_ui("ERROR", f"Mod Reward Failed: Missing Channel ID for {author}")
                return "Mod reward failed: missing channel ID."
                
            success, result_id = await self.youtube_api.add_moderator(channel_id)
            if success:
                # Add to active_rewards.json for expiration
                rewards_file = os.path.join(os.path.dirname(__file__), "..", "data", "active_rewards.json")
                try:
                    os.makedirs(os.path.dirname(rewards_file), exist_ok=True)
                    rewards = []
                    if os.path.exists(rewards_file):
                        with open(rewards_file, "r") as f:
                            rewards = json.load(f)
                    
                    rewards.append({
                        "author": author,
                        "reward_type": reward_type,
                        "mod_id": result_id,
                        "expires_at": time.time() + duration_sec
                    })
                    
                    with open(rewards_file, "w") as f:
                        json.dump(rewards, f, indent=4)
                        
                    await self._log_ui("REWARD", f"Gave YouTube Wrench to {author} for {duration_days} day(s)!")
                    await self._send_chat(f"@{author} 🎉 You have been granted Temporary Moderator for {duration_days} day(s)!")
                except Exception as e:
                    logger.error(f"Failed to log temporary reward: {e}")
            else:
                await self._log_ui("ERROR", f"Mod Reward Failed: {result_id}")
                return f"Mod reward failed: {result_id}"
            
        elif reward_type == "giveaway_ticket":
            # 1. Eligibility Check
            eligibility = parameters.get("eligibility", "everyone").lower()
            is_sponsor = getattr(chat_obj.author, 'is_sponsor', False) if chat_obj else False
            
            if "member" in eligibility and not is_sponsor:
                return "This giveaway is for Members Only."
                
            # 2. Check if already entered
            from backend.services.giveaway_service import GiveawayService
            status = GiveawayService.add_participant(author)
            if not status['ok']:
                return status['error']
            
            # Send specific broadcast to inform overlay immediately
            if self.broadcast_func:
                await self.broadcast_func({"type": "giveaway_update", "action": "new_entry", "author": author})
            
            # Change custom message logic to have a nicer response via chat
            # We don't return error here because it succeeded. Wait, I should just return None
            # and let the _handle_redeem_cmd print the success message.
            return None


    async def _check_loyalty(self, author, v, last_date, today, now):
        if not last_date: return
        from datetime import datetime
        d1, d2 = datetime.strptime(last_date, "%Y-%m-%d"), datetime.strptime(today, "%Y-%m-%d")
        delta_days = (d2 - d1).days

        eng_text = None
        hindi_voice = None

        if delta_days == 1:
            # Streak Continues
            streak = v.get("consecutive_days", 1) + 1
            v["consecutive_days"] = streak
            
            if streak == 2:
                eng_text = f"WELCOME BACK {author}! 2 days in a row! Amazing consistency! 🔥"
                hindi_voice = f"Swagat hai {author}! Aap kal bhi aaye thhe, dekhkar khushi hui!"
            elif streak == 3:
                eng_text = f"HAT-TRICK! 🧢 {author} is here for the 3rd day in a row!"
                hindi_voice = f"Swagat hai {author}! Lagataar teesre din! Kya baat hai!"
            elif streak == 7:
                eng_text = f"🏆 WEEKLY LEGEND: {author} has reached a 7-DAY STREAK! 🏆"
                hindi_voice = f"Badhai ho {author}! Aapne pure 7 din ka streak pura kar liya hai!"
            else:
                eng_text = f"Welcome back {author}! Day {streak} streak! Keep it up! 🚀"
                hindi_voice = f"Namaste {author}! Swaagat hai waapas!"

        elif delta_days > 1:
            # Streak Broken
            v["consecutive_days"] = 1
            
            if delta_days >= 30:
                 eng_text = f"WHOA! {author} returns after {delta_days} days! A true legend returns! 🛡️"
                 hindi_voice = f"Baap re! {author} pure {delta_days} din baad laute hain!"
            elif delta_days >= 7:
                 eng_text = f"Long time no see {author}! Welcome back to the stream! ❤️"
                 hindi_voice = f"Arey {author}! Bohot din baad dikhe! Swagat hai!"
            else:
                 eng_text = f"Welcome back {author}! Good to see you again! 👋"
                 hindi_voice = f"Swagat hai waapas {author}! Dekhkar achha laga!"
        
        # Save updates
        self.viewers.viewers[author] = v
        
        # Dispatch generic "Welcome Back" if text defined
        if eng_text:
            await self._trigger_special_announcement(hindi_voice, eng_text)

    async def _trigger_special_announcement(self, hindi_voice, eng_text):
        await self._log_ui("LOYALTY", eng_text)
        
        if self.audio:
            await self.audio.speak(hindi_voice, "public", voice="hi-IN-MadhurNeural")
        
        await self._send_chat(eng_text)
        
        # SEPARATE ACTION: Bot Alerts
        await self._fire_sb_alert("LOYALTY", eng_text, "System", "Loyalty", action_name="Bot Alerts")

    async def trigger_donation_alert(self, user, amount, message, transaction_id=None, skip_verification=False, source="Oracle Cloud Tip Page"):
        """
        Public method to trigger the full donation flow:
        1. TTS Audio (Priority)
        2. OBS Alert (via Streamer.bot)
        3. YouTube Chat Message
        """
        # Deduplication Check (if ID provided)
        if transaction_id and transaction_id in self.processed_transactions:
            logger.warning(f"Duplicate Transaction Ignored: {transaction_id}")
            return {"status": "duplicate", "reason": "Already processed"}


        is_cloud = (os.environ.get("RUN_MODE") == "cloud")
        is_client = getattr(self, "cloud_alert_client", None) and self.cloud_alert_client.is_running

        verified_tag = ""
        # 0. Email Verification (if enabled)
        config = self.load_config()
        email_cfg = config.get("email_verification", {})
        if email_available and email_cfg.get("enabled", False) and not skip_verification:
            # Check if this is a "Test" user or bypass? No, specific check.
            logger.info(f"Verifying payment for {user}: {amount}")
            verified, reason, msg_id = await asyncio.to_thread(self.email.verify_payment, amount, sender_hint=user)
            
            if not verified:
                logger.warning(f"Payment Verification Failed for {user}: {reason}")
                await self._log_ui("ERROR", f"Payment Failed: {reason}", author=user)
                return {"status": "failed", "reason": reason}
            
            # If verified internally, use the found Message-ID as transaction_id
            if not transaction_id and msg_id:
                transaction_id = msg_id
                
            # Re-check Deduplication (in case we just found an ID that was already processed)
            if transaction_id and transaction_id in self.processed_transactions:
                logger.warning(f"Duplicate Transaction Ignored (Verified Email Re-use): {transaction_id}")
                return {"status": "duplicate", "reason": "Email already used"}

            
            # If verified, we track it for logs but keep the public message clean
            verified_tag = " (Verified ✅)"

        # Mark as processed immediately to prevent race conditions
        if transaction_id:
            self.processed_transactions[transaction_id] = True
            # Cap at 5000 entries
            while len(self.processed_transactions) > 5000:
                self.processed_transactions.popitem(last=False)

        # 1. Log to Dashboard (Include Verified Tag)
        log_msg = f"DONATION: {user} tipped Rs.{amount}: {message}{verified_tag}"
        await self._log_ui("DONATION", log_msg, author=user, meta={"amount": amount})
        logger.info(log_msg)

        # 1.5 Log to Google Sheets (Only if verified or explicit skip_verification with trusted source)
        # Only log to Sheets if we are NOT in client mode (so Cloud logs it, Pi client skips it)
        if not is_client:
            if verified_tag or (skip_verification and transaction_id and not transaction_id.startswith("test_")):
                 await self.sheets.log_transaction({
                    "user": user,
                    "amount": amount,
                    "type": "Tip",
                    "message": message,
                    "transaction_id": transaction_id or f"tip_{int(time.time())}"
                })

        # Forward to Pi clients if running as Cloud server
        if is_cloud:
            if getattr(self, "pi_clients", None):
                logger.info("Forwarding alert to Cloud Pi Clients...")
                asyncio.create_task(self.pi_clients.broadcast({
                    "type": "donation_alert",
                    "user": user,
                    "amount": amount,
                    "message": message,
                    "transaction_id": transaction_id
                }))
            
            # Send HTTP Webhook to local Pi
            asyncio.create_task(self._send_local_pi_webhook({
                "original_provider": "app" if skip_verification else "email",
                "sender": user,
                "amount": amount,
                "message": message,
                "transaction_id": transaction_id
            }))
            
            # Award loyalty points on the cloud!
            try:
                pts_per_tip = config.get("loyalty", {}).get("points_per_tip_rupee", 0)
                if pts_per_tip > 0:
                    pts_to_add = int(float(amount) * pts_per_tip)
                    self.viewers.add_points(user, pts_to_add)
                    logger.info(f"Awarded {pts_to_add} points to {user} for Rs.{amount} Tip on Cloud")
            except Exception as e:
                logger.error(f"Failed to award points for tip: {e}")

            # Save History as played=False on the cloud
            self._save_donation_history(user, amount, message + verified_tag, transaction_id, played=False)
            return {"status": "success", "processed": True, "queued": True}

        # --- LOCAL ACTIONS (Only executed if NOT cloud server, meaning local Pi) ---

        # 2. TTS Audio (Clean Message)
        audio_cfg = config.get("audio", {})
        if self.audio and audio_cfg.get("enabled", True):
            # Speak the message clearly - NO "Verified" tag
            tts_text = f"Donation! {user} sent {amount} rupees! {message}"
            await self.audio.speak(tts_text, "public")

        # 3. Streamer.bot Action (Visuals) (Clean Message)
        await self._fire_sb_alert(
            title=f"New Donation: Rs.{amount}",
            message=message, # Clean message
            author=user,
            type="Donation",
            action_name="DonationAlert"
        )

        # 4. YouTube Chat Thank You (Clean Message)
        chat_msg = f"Thank you {user} for the Rs.{amount} tip! ❤️ {message}"
        await self._send_chat(chat_msg)

        # 4.5 Award Loyalty Points for Tip (Only on local Pi if NOT client mode, since cloud already did it)
        if not is_client:
            try:
                pts_per_tip = config.get("loyalty", {}).get("points_per_tip_rupee", 0)
                if pts_per_tip > 0:
                    pts_to_add = int(float(amount) * pts_per_tip)
                    self.viewers.add_points(user, pts_to_add)
                    logger.info(f"Awarded {pts_to_add} points to {user} for Rs.{amount} Tip")
            except Exception as e:
                logger.error(f"Failed to award points for tip: {e}")

        # 5. Save History (local history is saved as played=True)
        self._save_donation_history(user, amount, message + verified_tag, transaction_id, played=True, source=source)

        return {"status": "success", "processed": True}

    async def trigger_app_alert(self, user, amount, do_tts=True, source="App Webhook"):
        """
        Specialized flow exclusively for generic app notifications (Paytm, PhonePe, GPay, etc).
        Triggers a distinct overlay categorization ("APP_NOTIFICATION")
        """
        message = "Tip via App"
        log_msg = f"APP NOTIFICATION: {user} tipped ₹{amount}"
        tx_id = f"app_alert_{int(time.time())}"
        
        is_cloud = (os.environ.get("RUN_MODE") == "cloud")
        is_client = getattr(self, "cloud_alert_client", None) and self.cloud_alert_client.is_running

        # 1. Broadast with type "APP_NOTIFICATION"
        await self._log_ui("APP_NOTIFICATION", log_msg, author=user, meta={"amount": amount})
        logger.info(log_msg)

        # 2. Log Transaction (Only if NOT client mode)
        if not is_client:
            await self.sheets.log_transaction({
                "user": user,
                "amount": amount,
                "type": "App Notification",
                "message": message,
                "transaction_id": tx_id
            })

        # Forward to Pi clients if running as Cloud server
        if is_cloud:
            if getattr(self, "pi_clients", None):
                logger.info("Forwarding app alert to Cloud Pi Clients...")
                asyncio.create_task(self.pi_clients.broadcast({
                    "type": "app_alert",
                    "user": user,
                    "amount": amount,
                    "do_tts": do_tts,
                    "transaction_id": tx_id
                }))
            
            # Send HTTP Webhook to local Pi
            asyncio.create_task(self._send_local_pi_webhook({
                "original_provider": "app",
                "sender": user,
                "amount": amount,
                "message": message,
                "transaction_id": tx_id
            }))
            
            # Award loyalty points on the cloud!
            try:
                config = self.load_config()
                pts_per_tip = config.get("loyalty", {}).get("points_per_tip_rupee", 0)
                if pts_per_tip > 0:
                    pts_to_add = int(amount * pts_per_tip)
                    self.viewers.add_points(user, pts_to_add)
                    logger.info(f"Awarded {pts_to_add} points to {user} for Rs.{amount} App Tip on Cloud")
            except Exception as e:
                logger.error(f"Failed to award points for app tip: {e}")

            # Save History as played=False on the cloud
            self._save_donation_history(user, amount, message, tx_id, played=False)
            return {"status": "success", "processed": True, "queued": True}

        # --- LOCAL ACTIONS (Only executed if NOT cloud server, meaning local Pi) ---

        # 3. Audio Announcement
        config = self.load_config()
        audio_cfg = config.get("audio", {})
        if self.audio and audio_cfg.get("enabled", True) and do_tts:
             tts_text = f"New payment of {amount} rupees from {user}. Thank you!"
             await self.audio.speak(tts_text, "public")

        # 4. Optional Streamer.bot Action
        await self._fire_sb_alert(
            title=f"Notification: Rs.{amount}",
            message=message,
            author=user,
            type="App Notification",
            action_name="AppAlert"
        )
        
        # 5. Chat Thank you
        chat_msg = f"Thank you {user} for the Rs.{amount} Tip! 💙"
        await self._send_chat(chat_msg)
        
        # 5.5 Award Loyalty Points for App Tip (Only on local Pi if NOT client mode, since cloud already did it)
        if not is_client:
            try:
                pts_per_tip = config.get("loyalty", {}).get("points_per_tip_rupee", 0)
                if pts_per_tip > 0:
                    pts_to_add = int(amount * pts_per_tip)
                    self.viewers.add_points(user, pts_to_add)
                    logger.info(f"Awarded {pts_to_add} points to {user} for Rs.{amount} App Tip")
            except Exception as e:
                logger.error(f"Failed to award points for app tip: {e}")

        # 6. History (local history is saved as played=True)
        self._save_donation_history(user, amount, message, tx_id, played=True, source=source)
        
        return {"status": "success", "processed": True}

    async def _send_local_pi_webhook(self, payload):
        """Send an HTTP POST webhook to the local Raspberry Pi if configured."""
        try:
            config = self.load_config()
            local_pi = config.get("local_pi", {})
            if not local_pi.get("enabled", False):
                return
            
            webhook_url = local_pi.get("webhook_url", "").strip()
            if not webhook_url:
                return
                
            logger.info(f"Sending webhook to Local Pi: {webhook_url}")
            import aiohttp
            async with aiohttp.ClientSession() as session:
                # Fire and forget with a short timeout
                async with session.post(webhook_url, json=payload, timeout=5.0) as resp:
                    if resp.status != 200:
                        logger.warning(f"Local Pi Webhook returned {resp.status}")
        except Exception as e:
            logger.error(f"Failed to send local Pi webhook: {e}")

    def _save_donation_history(self, user, amount, message, transaction_id=None, played=True, source="App Notification"):
        """
        Saves Tip Page donations to json.
        Used by the 'Recent Transactions' OBS Overlay.
        """
        try:
            file_path = "data/donations.json"
            history: list[dict[str, Any]] = []
            
            if not os.path.exists("data"):
                os.makedirs("data")

            if os.path.exists(file_path):
                try:
                    with open(file_path, "r") as f:
                        loaded = json.load(f)
                        if isinstance(loaded, list):
                            history = loaded
                except (json.JSONDecodeError, OSError):
                    history = []
            
            entry = {
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "user": user,
                "amount": amount,
                "message": message,
                "transaction_id": transaction_id,
                "played": played,
                "source": source
            }
            # Prepend (Newest First)
            history.insert(0, entry)
            
            # Limit to last 1000
            history = history[:1000]
            
            with open(file_path, "w") as f:
                json.dump(history, f, indent=2)
                
        except Exception as e:
            logger.error(f"Failed to save donation history: {e}")

    def get_pending_donations(self):
        try:
            file_path = "data/donations.json"
            if os.path.exists(file_path):
                with open(file_path, "r") as f:
                    history = json.load(f)
                    return [item for item in history if not item.get("played", True)]
            return []
        except Exception:
            return []

    def mark_donation_as_played(self, transaction_id):
        try:
            file_path = "data/donations.json"
            if not os.path.exists(file_path):
                return
            with open(file_path, "r") as f:
                history = json.load(f)
            updated = False
            for entry in history:
                if entry.get("transaction_id") == transaction_id and not entry.get("played", True):
                    entry["played"] = True
                    updated = True
            if updated:
                with open(file_path, "w") as f:
                    json.dump(history, f, indent=2)
                logger.info(f"Marked transaction {transaction_id} as played in cloud history.")
        except Exception as e:
            logger.error(f"Failed to mark donation as played: {e}")

    def get_donation_history(self, limit=100):
        try:
            file_path = "data/donations.json"
            if os.path.exists(file_path):
                with open(file_path, "r") as f:
                    history = json.load(f)
                    return history[:limit]
            return []
        except Exception:
            return []

    def clear_donation_history(self):
        try:
            file_path = "data/donations.json"
            if not os.path.exists("data"):
                os.makedirs("data")
            with open(file_path, "w") as f:
                json.dump([], f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Failed to clear donation history: {e}")
            return False

    def delete_donation_history_item(self, timestamp: str, user: str, amount: float):
        try:
            file_path = "data/donations.json"
            if not os.path.exists(file_path):
                return False
                
            with open(file_path, "r") as f:
                history = json.load(f)
                
            original_len = len(history)
            
            # Delete only the first matching item to prevent mass wipe of identical tips
            new_history = []
            deleted = False
            for entry in history:
                if not deleted and entry.get("timestamp") == timestamp and entry.get("user") == user and entry.get("amount") == amount:
                    deleted = True
                    # If this item was in the processed cache, remove it so it can trigger again if recreated (optional conceptually)
                    tx_id = entry.get("transaction_id")
                    if tx_id and tx_id in self.processed_transactions:
                        self.processed_transactions.pop(tx_id, None)
                else:
                    new_history.append(entry)
                    
            if len(new_history) < original_len:
                with open(file_path, "w") as f:
                    json.dump(new_history, f, indent=2)
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete donation history item: {e}")
            return False

    async def simulate_alert(self, etype, author, message=None):
        # Compatibility for the simulate_alert route in api.py
        # Added Mock ID to better simulate real payload
        data = {
            "event": {"source": "YouTube", "type": etype},
            "data": {
                "user": {"name": author, "id": "MockId_12345"}, 
                "message": message,
                "userName": author # Legacy field some SB scripts might use
            }
        }
        await self._log_ui("DEBUG", f"SIMULATING ALERT: {etype} from {author}")
        logger.info(f"Simulating Alert: {json.dumps(data)}")
        await self._handle_sb_event(data)
        return {"status": "simulated"}
    async def _youtube_stats_loop(self):
        """Periodic loop to fetch YouTube stats"""
        while self.is_running:
            try:
                # 1. Fetch Stats
                await self.fetch_youtube_stats()
                
                # 2. Determine Sleep Interval
                config = self.load_config()
                # Default to 60 seconds (was 600s/10m)
                interval = config.get("youtube", {}).get("fetch_interval", 60)
                
                # Safety Limit: Minimum 30s to avoid IP bans if user sets it too low
                if interval < 30:
                    interval = 30
                    
                await asyncio.sleep(int(interval))
            except Exception as e:
                logger.error(f"YouTube Stats Loop Error: {e}")
                await asyncio.sleep(60) # Fallback sleep on error

    async def fetch_youtube_stats_scraping(self, channel_id):
        """Fetch subscriber count by extracting channel flat info via yt-dlp (Fallback)"""
        url = f"https://www.youtube.com/channel/{channel_id}"
        logger.info(f"Extracting Channel Info using yt-dlp: {url}")
        
        def _extract():
            import yt_dlp
            ydl_opts = {
                'extract_flat': True,
                'quiet': True,
                'no_warnings': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=False)
                
        try:
            info = await asyncio.to_thread(_extract)
            if info:
                count = info.get("channel_follower_count")
                if count is not None:
                    # We can't reliably get the logo from this basic fast extract, we'll return None for logo
                    return int(count), None
                else:
                    logger.warning("yt-dlp could not find channel_follower_count.")
            else:
                logger.warning("yt-dlp extract_info returned None.")
        except Exception as e:
            logger.error(f"Error extracting YouTube stats with yt-dlp: {e}")
            
        return None, None

    async def fetch_youtube_stats(self):
        """Fetch subscriber count based on configured method"""
        config = self.load_config()
        sb_cfg = config.get("streamer_bot", {})
        if sb_cfg.get("enabled", False) and not self.is_sb_connected:
            logger.debug("Streamer.bot is enabled but disconnected. Skipping YouTube stats fetch.")
            return
        yt_cfg = config.get("youtube", {})
        method = yt_cfg.get("fetch_method", "api") # 'api', 'scrape', or 'oauth'
        channel_id = yt_cfg.get("channel_id")
        
        # Scrape Method
        if method == "scrape":
            if not channel_id: return
            count, logo_url = await self.fetch_youtube_stats_scraping(channel_id)
            
            if count is not None:
                self.set_subscriber_count(count, save=True)
                logger.info(f"Updated Subscriber Count (Scraped): {count}")
                
                # Save Logo if found
                if logo_url and logo_url != yt_cfg.get("logo_url"):
                    yt_cfg["logo_url"] = logo_url
                    config["youtube"] = yt_cfg
                    ConfigManager.save_config(config)
                    logger.info(f"Updated Logo URL (Scraped): {logo_url}")
            return

        # OAuth Method (New)
        if method == "oauth":
            creds_dict = yt_cfg.get("oauth_credentials")
            if not creds_dict:
                logger.warning("OAuth selected but no credentials found.")
                return

            try:
                # Reconstruct credentials
                from google.oauth2.credentials import Credentials
                from google.auth.transport.requests import Request as AuthRequest
                from googleapiclient.discovery import build
                
                expiry_val = None
                if creds_dict.get("expiry"):
                    try:
                        from datetime import datetime as dt
                        expiry_str = creds_dict.get("expiry")
                        if expiry_str.endswith('Z'):
                            expiry_str = expiry_str[:-1] + '+00:00'
                        expiry_val = dt.fromisoformat(expiry_str)
                    except Exception as parse_err:
                        logger.warning(f"Failed to parse expiry: {parse_err}")

                creds = Credentials(
                    token=creds_dict.get("token"),
                    refresh_token=creds_dict.get("refresh_token"),
                    token_uri=creds_dict.get("token_uri"),
                    client_id=creds_dict.get("client_id"),
                    client_secret=creds_dict.get("client_secret"),
                    scopes=creds_dict.get("scopes"),
                    expiry=expiry_val
                )
                
                # Auto-refresh if expired
                if creds.expired and creds.refresh_token:
                    logger.info("OAuth token expired, refreshing...")
                    creds.refresh(AuthRequest())
                    # Save refreshed token back to config
                    config["youtube"]["oauth_credentials"]["token"] = creds.token
                    if creds.expiry:
                        config["youtube"]["oauth_credentials"]["expiry"] = creds.expiry.isoformat()
                    try:
                        ConfigManager.save_config(config)
                        logger.info("Refreshed OAuth token and expiry saved to config.")
                    except Exception as save_err:
                        logger.warning(f"Failed to save refreshed token: {save_err}")
                elif not creds.refresh_token:
                    logger.warning("No refresh_token available. Token cannot be renewed. User should re-login with Google.")
                
                # Build service and fetch (synchronous call — run in thread to avoid blocking)
                def _fetch_stats_sync():
                    nonlocal creds
                    try:
                        service = build('youtube', 'v3', credentials=creds)
                        ch_resp = service.channels().list(part="statistics,snippet", mine=True).execute()
                    except Exception as err:
                        if creds.refresh_token:
                            logger.info(f"YouTube OAuth fetch failed: {err}. Attempting token refresh and retry...")
                            try:
                                creds.refresh(AuthRequest())
                                config["youtube"]["oauth_credentials"]["token"] = creds.token
                                if creds.expiry:
                                    config["youtube"]["oauth_credentials"]["expiry"] = creds.expiry.isoformat()
                                ConfigManager.save_config(config)
                                
                                # Retry
                                service = build('youtube', 'v3', credentials=creds)
                                ch_resp = service.channels().list(part="statistics,snippet", mine=True).execute()
                            except Exception as retry_err:
                                logger.error(f"Retry after YouTube token refresh failed: {retry_err}")
                                raise retry_err
                        else:
                            raise err

                    # Also fetch live_chat_id AND video_id from the currently active broadcast
                    live_chat_id = None
                    live_video_id = None
                    live_likes_temp = -1
                    try:
                        bc_resp = service.liveBroadcasts().list(
                            part="snippet",
                            broadcastStatus="active",
                            broadcastType="all",
                            maxResults=1
                        ).execute()
                        bc_items = bc_resp.get("items", [])
                        if bc_items:
                            live_chat_id = bc_items[0].get("snippet", {}).get("liveChatId")
                            live_video_id = bc_items[0].get("id")  # This IS the video ID
                            
                            # Fetch video stats for the likes
                            if live_video_id:
                                try:
                                    vresp = service.videos().list(part="statistics", id=live_video_id).execute()
                                    if vresp.get("items"):
                                        stats_vid = vresp["items"][0].get("statistics", {})
                                        live_likes_temp = int(stats_vid.get("likeCount", 0))
                                except Exception as e_v:
                                    logger.error(f"Error fetching live video stats: {e_v}")
                    except Exception as bc_err:
                        logger.debug(f"Could not fetch liveChatId: {bc_err}")
                    return ch_resp, live_chat_id, live_video_id, live_likes_temp
                
                response, live_chat_id, live_video_id, live_likes_val = await asyncio.to_thread(_fetch_stats_sync)
                
                # Update like count
                self.live_likes_count = live_likes_val
                
                items = response.get("items", [])
                if items:
                    stats = items[0].get("statistics", {})
                    snippet = items[0].get("snippet", {})
                    
                    # Update Channel ID/Name if missing or changed
                    found_id = items[0].get("id")
                    found_name = snippet.get("title")
                    found_logo = snippet.get("thumbnails", {}).get("high", {}).get("url")
                    
                    should_save = False
                    if found_id and found_id != channel_id:
                        yt_cfg["channel_id"] = found_id
                        should_save = True
                        
                    if found_name and found_name != yt_cfg.get("channel_name"):
                         yt_cfg["channel_name"] = found_name
                         should_save = True
                         
                    if found_logo and found_logo != yt_cfg.get("logo_url"):
                         yt_cfg["logo_url"] = found_logo
                         should_save = True

                    # Save live_chat_id so _send_youtube_chat() can post alerts directly to live chat
                    if live_chat_id and live_chat_id != yt_cfg.get("live_chat_id"):
                        yt_cfg["live_chat_id"] = live_chat_id
                        should_save = True
                        logger.info(f"Updated live_chat_id: {live_chat_id}")
                    
                    # Auto-set video_id from active broadcast so pytchat monitor starts automatically
                    if live_video_id and live_video_id != yt_cfg.get("video_id"):
                        yt_cfg["video_id"] = live_video_id
                        should_save = True
                        logger.info(f"Auto-detected live video_id: {live_video_id}")
                    elif not live_video_id and yt_cfg.get("video_id"):
                        # Clear video_id when no active broadcast (stream ended)
                        yt_cfg["video_id"] = ""
                        should_save = True
                        logger.info("No active broadcast — cleared video_id")
                    
                    if should_save:
                        config["youtube"] = yt_cfg
                        ConfigManager.save_config(config)
                        logger.info(f"Updated Channel Info: {found_name} | Logo Updated")
                    
                    sub_count = stats.get("subscriberCount")
                    if sub_count:
                        self.set_subscriber_count(int(sub_count), save=True)
                        logger.info(f"Fetched Subscriber Count via OAuth: {sub_count} (Channel: {found_name})")
                else:
                    logger.warning("OAuth: No channel found for authorized user.")
            
            except Exception as e:
                logger.error(f"OAuth Fetch Error: {e}")
            return

        # Fallback: API Key Method
        api_key = yt_cfg.get("api_key")
        if not api_key:
            return

        if not channel_id: return

        url = f"https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id={channel_id}&key={api_key}"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    items = data.get("items", [])
                    if items:
                        stats = items[0].get("statistics", {})
                        snippet = items[0].get("snippet", {})
                        
                        found_name = snippet.get("title")
                        found_logo = snippet.get("thumbnails", {}).get("high", {}).get("url")
                        
                        should_save = False
                        if found_name and found_name != yt_cfg.get("channel_name"):
                             yt_cfg["channel_name"] = found_name
                             should_save = True

                        if found_logo and found_logo != yt_cfg.get("logo_url"):
                             yt_cfg["logo_url"] = found_logo
                             should_save = True
                        
                        if should_save:
                             config["youtube"] = yt_cfg
                             ConfigManager.save_config(config)
                             logger.info(f"Updated Channel Info via API: {found_name}")

                        sub_count = stats.get("subscriberCount")
                        if sub_count:
                            self.set_subscriber_count(int(sub_count), save=True)
                            logger.info(f"Fetched Subscriber Count from YouTube API: {sub_count}")
                            
                        # Also attempt to get likes if video_id is set
                        vid_id = yt_cfg.get("video_id")
                        if vid_id:
                            vid_url = f"https://www.googleapis.com/youtube/v3/videos?part=statistics&id={vid_id}&key={api_key}"
                            try:
                                vresp = await client.get(vid_url)
                                if vresp.status_code == 200:
                                    vdata = vresp.json()
                                    if vdata.get("items"):
                                        like_cnt = int(vdata["items"][0].get("statistics", {}).get("likeCount", 0))
                                        self.live_likes_count = like_cnt
                                        logger.info(f"Fetched Live Likes via API: {like_cnt}")
                            except Exception as e_v:
                                logger.error(f"Error fetching likes via API key method: {e_v}")
                        else:
                            self.live_likes_count = -1
                else:
                    logger.warning(f"Failed to fetch YouTube stats: {resp.status_code} {resp.text}")
        except Exception as e:
            logger.error(f"Error fetching YouTube stats: {e}")

