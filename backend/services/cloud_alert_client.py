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
                    logger.info("Successfully connected to Cloud Alert WebSocket!")
                    self.connected = True
                    await self.bot._log_ui("SYSTEM", "Connected to Cloud Alert server")
                    
                    while self.is_running:
                        msg = await ws.recv()
                        try:
                            event = json.loads(msg)
                            await self._handle_cloud_event(event)
                        except Exception as parse_err:
                            logger.error(f"Error parsing cloud event: {parse_err}")
            except Exception as e:
                self.connected = False
                logger.warning(f"Cloud Alert Client connection lost: {e}. Retrying in 5 seconds...")
                await self.bot._log_ui("SYSTEM", "Cloud Alert connection lost. Reconnecting...")
                await asyncio.sleep(5)

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
        elif etype == "app_alert":
            user = event.get("user")
            amount = event.get("amount")
            do_tts = event.get("do_tts", True)
            
            await self.bot.trigger_app_alert(
                user=user,
                amount=amount,
                do_tts=do_tts
            )

    def stop(self):
        self.is_running = False
        if self.task:
            self.task.cancel()
        logger.info("Cloud Alert Client stopped.")
