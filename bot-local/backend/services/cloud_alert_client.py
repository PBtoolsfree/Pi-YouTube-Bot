import asyncio
import logging
import websockets
import json
import os

logger = logging.getLogger(__name__)

class CloudAlertClientService:
    def __init__(self, bot_service):
        self.bot = bot_service
        self.task = None
        self.is_running = False
        self.connected = False

    async def start(self):
        config = self.bot.load_config()
        
        # Check if enabled
        enabled = config.get("cloud_alert_enabled", True)
        if not enabled:
            logger.info("Cloud Connection disabled in settings.")
            return

        cloud_ws_url = config.get("cloud_alert_url") or os.environ.get("CLOUD_ALERT_URL")
        if not cloud_ws_url:
            logger.info("CLOUD_ALERT_URL not set in config or environment. Standing by in local mode.")
            return

        self.is_running = True
        self.task = asyncio.create_task(self._connect_loop(cloud_ws_url))
        logger.info(f"Cloud Alert Client started. Target: {cloud_ws_url}")

    async def _connect_loop(self, url):
        config = self.bot.load_config()
        secret = config.get("security", {}).get("webhook_secret") or os.environ.get("WEBHOOK_SECRET")
        
        # Build URL with token parameter for auth if secret configured
        if "?token=" in url:
            connect_url = url
        else:
            connect_url = f"{url}?token={secret}" if secret else url

        while self.is_running:
            try:
                logger.info(f"Connecting to Cloud WebSocket: {url}...")
                async with websockets.connect(connect_url) as ws:
                    self.ws = ws
                    logger.info("Successfully connected to Cloud Alert WebSocket!")
                    self.connected = True
                    if not hasattr(self.bot, "worker_health"):
                        self.bot.worker_health = {}
                    self.bot.worker_health["cloud_client"] = {"status": "connected"}
                    await self.bot._log_ui("SYSTEM", "Connected to Cloud Alert server")
                    
                    # Request initial viewers sync immediately
                    await self.send_event({"type": "request_viewer_sync"})
                    await self.send_event({"type": "request_history_sync"})
                    await self.send_event({"type": "request_qr_sync"})
                    
                    while self.is_running:
                        msg = await ws.recv()
                        try:
                            event = json.loads(msg)
                            await self._handle_cloud_event(event)
                        except Exception as parse_err:
                            logger.error(f"Error parsing cloud event: {parse_err}")
            except Exception as e:
                self.ws = None
                self.connected = False
                if not hasattr(self.bot, "worker_health"):
                    self.bot.worker_health = {}
                self.bot.worker_health["cloud_client"] = {"status": "disconnected"}
                logger.warning(f"Cloud Alert Client connection lost: {e}. Retrying in 5 seconds...")
                await self.bot._log_ui("SYSTEM", "Cloud Alert connection lost. Reconnecting...")
                await asyncio.sleep(5)

    async def send_event(self, event):
        if self.connected and getattr(self, "ws", None):
            try:
                await self.ws.send(json.dumps(event))
            except Exception as e:
                logger.error(f"Error sending event to Cloud: {e}")

    async def _handle_cloud_event(self, event):
        etype = event.get("type")
        logger.info(f"Received cloud event: {etype}")
        if etype == "donation_alert":
            user = event.get("user")
            amount = event.get("amount")
            message = event.get("message")
            tx_id = event.get("transaction_id")
            
            # Trigger alert locally on the Pi
            # skip_verification=True bypasses IMAP check as it was already verified in the cloud!
            await self.bot.trigger_donation_alert(
                user=user,
                amount=amount,
                message=message,
                transaction_id=tx_id,
                skip_verification=True
            )
            if tx_id:
                asyncio.create_task(self.send_event({
                    "type": "ack_alert",
                    "transaction_id": tx_id
                }))
        elif etype == "app_alert":
            user = event.get("user")
            amount = event.get("amount")
            do_tts = event.get("do_tts", True)
            tx_id = event.get("transaction_id")
            
            await self.bot.trigger_app_alert(
                user=user,
                amount=amount,
                do_tts=do_tts,
                transaction_id=tx_id
            )
            if tx_id:
                asyncio.create_task(self.send_event({
                    "type": "ack_alert",
                    "transaction_id": tx_id
                }))
        elif etype == "sync_action":
            action = event.get("action")
            logger.info(f"Sync action received: {action}")
            if action == "clear_history":
                self.bot.clear_donation_history()
            elif action == "delete_history_item":
                self.bot.delete_donation_history_item(
                    timestamp=event.get("timestamp"),
                    user=event.get("user"),
                    amount=event.get("amount")
                )
            
            # Force UI overlays to fetch new data
            if hasattr(self.bot, "_log_ui"):
                await self.bot._log_ui("DONATION", "History sync update")

        elif etype == "sync_config":
            key = event.get("key")
            value = event.get("value")
            if key == "stream_offline":
                cfg = self.bot.load_config()
                cfg["stream_offline"] = value
                from backend.config_manager import ConfigManager
                ConfigManager.save_config(cfg)
                logger.info(f"Local config synced from Cloud: stream_offline={value}")
                
                # Broadcast to Local UI
                try:
                    from backend.api import broadcast_log
                    asyncio.create_task(broadcast_log({"type": "config_update", "config": cfg}))
                except ImportError:
                    pass

        elif etype == "sync_qr":
            filename = event.get("filename")
            b64_data = event.get("data")
            if filename and b64_data:
                try:
                    import base64
                    from backend.config_manager import ConfigManager
                    img_data = base64.b64decode(b64_data)
                    
                    uploads_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads")
                    os.makedirs(uploads_dir, exist_ok=True)
                    filepath = os.path.join(uploads_dir, filename)
                    
                    with open(filepath, "wb") as f:
                        f.write(img_data)
                        
                    cfg = self.bot.load_config()
                    if "tip_page" not in cfg:
                        cfg["tip_page"] = {}
                    cfg["tip_page"]["custom_qr_path"] = f"/uploads/{filename}"
                    ConfigManager.save_config(cfg)
                    logger.info(f"Successfully synced QR code from cloud: {filename}")
                    
                    # Force UI to fetch new QR
                    try:
                        from backend.api import broadcast_log
                        asyncio.create_task(broadcast_log({"type": "config_update", "config": cfg}))
                    except ImportError:
                        pass
                except Exception as e:
                    logger.error(f"Failed to sync QR code from cloud: {e}")
                    
        elif etype == "viewer_point_update":
            username = event.get("username")
            data = event.get("data")
            if username and data:
                self.bot.viewers.viewers[username] = data
                self.bot.viewers._notify_viewer_update(username, "viewer_point_update")
                # Trigger immediate mod sync
                asyncio.create_task(self.bot.sync_leaderboard_mods())

        elif etype == "full_viewer_sync":
            viewers_data = event.get("viewers", {})
            self.bot.viewers.viewers = viewers_data
            logger.info(f"Successfully synced {len(viewers_data)} viewers from Cloud Database!")
            self.bot.viewers._notify_viewer_update(event="full_viewer_sync")
            # Trigger immediate mod sync
            asyncio.create_task(self.bot.sync_leaderboard_mods())

        elif etype == "send_chat":
            msg = event.get("message")
            if msg:
                asyncio.create_task(self.bot._send_chat(msg))

        elif etype == "play_tts":
            text = event.get("text")
            channel = event.get("channel", "public")
            voice = event.get("voice")
            if text and self.bot.audio:
                asyncio.create_task(self.bot.audio.speak(text, channel=channel, voice=voice))

        elif etype == "trigger_action":
            action_name = event.get("action_name")
            if action_name and hasattr(self.bot, "_trigger_sb_action"):
                asyncio.create_task(self.bot._trigger_sb_action(action_name))

        elif etype == "log":
            category = event.get("category")
            msg = event.get("message")
            author = event.get("author")
            meta = event.get("meta")
            
            # Ignore log categories that are natively generated by the Local Pi 
            # when it processes the forwarded 'app_alert' or 'donation_alert' events.
            if category in ["DONATION", "APP_NOTIFICATION", "ALERT"]:
                return
                
            if category and msg and hasattr(self.bot, "_log_ui"):
                asyncio.create_task(self.bot._log_ui(category, msg, author=author, meta=meta))

        elif etype == "subscriber_count_sync":
            count = event.get("count", 0)
            self.bot.set_subscriber_count(count, save=True)

        elif etype == "full_history_sync":
            history = event.get("history", [])
            logger.info(f"Successfully synced {len(history)} history logs from Cloud Server!")
            try:
                history_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "gambling_history.json")
                os.makedirs(os.path.dirname(history_file), exist_ok=True)
                with open(history_file, "w") as f:
                    json.dump(history, f, indent=4)
                self.bot.viewers._notify_viewer_update(event="history_sync")
            except Exception as e:
                logger.error(f"Failed to write synced history logs: {e}")

        elif etype == "new_history_entry":
            entry = event.get("entry")
            if entry:
                logger.info(f"Received new history log entry from Cloud: {entry.get('user')} - {entry.get('game')}")
                try:
                    history_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "gambling_history.json")
                    os.makedirs(os.path.dirname(history_file), exist_ok=True)
                    history = []
                    if os.path.exists(history_file):
                        with open(history_file, "r") as f:
                            try:
                                loaded = json.load(f)
                                if isinstance(loaded, list):
                                    history = loaded
                            except Exception:
                                pass
                    history.insert(0, entry)
                    if len(history) > 1000:
                        history = history[:1000]
                    with open(history_file, "w") as f:
                        json.dump(history, f, indent=4)
                    self.bot.viewers._notify_viewer_update(event="new_history_entry")
                except Exception as e:
                    logger.error(f"Failed to write new history log entry: {e}")

    def stop(self):
        self.is_running = False
        if self.task:
            self.task.cancel()
        self.ws = None
        logger.info("Cloud Alert Client stopped.")
