import sys
import asyncio
import logging
import time as _time
from typing import List, Dict, Any, Optional

# Force Proactor Loop for Windows (Must be before any asyncio usage)
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Response, Request
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import psutil
import httpx
from .bot_service import BotService
from .ai_service import AIEngine
from .audio_service import AudioService
from .config_manager import ConfigManager
from .services.redeem_service import RedeemService
from fastapi.responses import JSONResponse
import re

logger = logging.getLogger(__name__)

# Track application start time for uptime reporting
_START_TIME = _time.time()

# Read version from VERSION file if present
_VERSION_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "VERSION")
APP_VERSION = open(_VERSION_FILE).read().strip() if os.path.exists(_VERSION_FILE) else "unknown"

# --- CONFIG ALIAS (always read from ConfigManager) ---
def _get_config() -> dict:
    return ConfigManager.get_config()

# --- APP SETUP ---
app = FastAPI(title="Pi YouTube Bot", version=APP_VERSION)

# --- REQUEST LOGGING ---
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.debug("→ %s %s", request.method, request.url.path)
    try:
        response = await call_next(request)
        logger.debug("← %d %s", response.status_code, request.url.path)
        return response
    except Exception as exc:
        logger.exception("Middleware error for %s", request.url.path)
        return JSONResponse(status_code=500, content={"error": str(exc)})

# --- SECURITY UTILS ---
import time
from collections import defaultdict

class RateLimiter:
    def __init__(self, limit=60, window=60):
        self.limit = limit
        self.window = window
        self.requests = defaultdict(list)
        self._last_cleanup = time.time()
        self._cleanup_interval = 300  # Clean stale IPs every 5 minutes

    def is_allowed(self, ip):
        now = time.time()
        
        # Periodic cleanup: remove IPs with no recent activity
        if now - self._last_cleanup > self._cleanup_interval:
            stale_ips = [k for k, v in self.requests.items() if not v or now - v[-1] > self.window]
            for k in stale_ips:
                self.requests.pop(k, None)  # type: ignore
            self._last_cleanup = now
        
        # Clean up old requests for this IP
        self.requests[ip] = [t for t in self.requests[ip] if now - t < self.window]
        
        if len(self.requests[ip]) < self.limit:
            self.requests[ip].append(now)
            return True
        return False

rate_limiter = RateLimiter(limit=60, window=60) # 60 req / min

# --- WEBHOOK LOGGER ---
class WebhookLogger:
    def __init__(self, max_size=50):
        self.max_size = max_size
        self.logs = [] # [ {timestamp, provider, status, message, payload_summary} ]

    def log(self, provider, status, message, payload=None):
        entry = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "provider": provider,
            "status": status,
            "message": message,
            "payload_summary": str(payload)[:100] if payload else "N/A"  # type: ignore
        }
        self.logs.insert(0, entry) # Prepend
        if len(self.logs) > self.max_size:
            self.logs.pop()

webhook_logger = WebhookLogger()

# --- SECURITY MIDDLEWARE ---
def _is_public_request(request: Request) -> bool:
    """Determine if a request comes from the public internet (via Cloudflare Tunnel)."""
    host = request.headers.get("host", "").lower()
    cfg = _get_config()
    # Allow configurable tunnel domains
    tunnel_domains = cfg.get("security", {}).get(
        "tunnel_domains", ["trycloudflare.com", "qzz.io", "pbherotip"]
    )
    if any(domain in host for domain in tunnel_domains):
        return True
    # Cloudflare-specific headers (set by CF proxy, not spoofable from outside)
    if request.headers.get("cf-connecting-ip"):
        return True
    if request.headers.get("cf-ray"):
        return True
    return False

class TunnelSecurityASGIMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
            
        request = Request(scope, receive=receive)
        
        # 1. Identify if request is from Cloudflare Tunnel
        is_public = _is_public_request(request)
        cf_ip = request.headers.get("cf-connecting-ip")
        path = request.url.path
        
        cfg = _get_config()
        security_cfg = cfg.get("security", {})
        allowed_paths = security_cfg.get("allowed_public_paths", [
            "/tip", "/tip/", "/api/donate", "/api/webhook/*", "/api/config", "/assets", "/favicon.ico", "/manifest.json"
        ])
        
        is_allowed_public = (
            path.startswith("/assets")
            or path.startswith("/uploads")
            or path.startswith("/api/payment/")
            or path.startswith("/api/donate")
            or path in ["/favicon.ico", "/manifest.json", "/api/health", "/tip", "/tip/",
                        "/logo.jpg", "/Background.jpg", "/vite.svg", "/ws/pi-client"]
            or path.startswith("/api/webhook/")
            or path in allowed_paths
            or "*" in allowed_paths
            or any(
                (path.startswith(a[:-1]) if a.endswith("*") else path.startswith(a + "/"))
                for a in allowed_paths
            )
        )

        # 2. Check basic auth if this is an admin path and password is configured
        is_public_bypass = False
        if not is_allowed_public:
            db_password = security_cfg.get("dashboard_password") or os.environ.get("DASHBOARD_PASSWORD")
            if db_password:
                auth_header = request.headers.get("authorization")
                authenticated = False
                if auth_header and auth_header.startswith("Basic "):
                    try:
                        import base64
                        encoded = auth_header.split(" ", 1)[1]
                        decoded = base64.b64decode(encoded).decode("utf-8")
                        if ":" in decoded:
                            user, pwd = decoded.split(":", 1)
                            if user == "admin" and pwd == db_password:
                                authenticated = True
                    except Exception as e:
                        logger.error("Basic auth decoding error: %s", e)
                
                if not authenticated:
                    response = Response(
                        status_code=401,
                        headers={"WWW-Authenticate": 'Basic realm="PiBot Dashboard"'},
                        content="Unauthorized"
                    )
                    await response(scope, receive, send)
                    return
                # Authenticated admin gets full access
                is_public_bypass = True

        # Inject state for endpoints
        scope["state"] = {"is_public": is_public and not is_public_bypass}

        if is_public and not is_public_bypass:
            # AUTO-REDIRECT ROOT TO TIP
            if path in ("/", ""):
                response = RedirectResponse("/tip")
                await response(scope, receive, send)
                return

            # RATE LIMITING
            client_ip = cf_ip or (request.client.host if request.client else "unknown")
            if not rate_limiter.is_allowed(client_ip):
                logger.warning("Rate limit exceeded for %s", client_ip)
                response = JSONResponse(status_code=429, content={"error": "Too Many Requests. Slow down."})
                await response(scope, receive, send)
                return

            # ALWAYS ALLOW ASSETS & HEALTH CHECK & TIP PAGE & WS CLIENTS
            if (
                path.startswith("/assets")
                or path.startswith("/uploads")
                or path.startswith("/api/payment/")
                or path.startswith("/api/donate")
                or path == "/api/config"
                or path in ["/favicon.ico", "/manifest.json", "/api/health", "/tip", "/tip/",
                            "/logo.jpg", "/Background.jpg", "/vite.svg", "/ws/pi-client"]
            ):
                return await self.app(scope, receive, send)

            # WEBHOOK SECURITY SHORT-CIRCUIT
            if path.startswith("/api/webhook/"):
                required_secret = security_cfg.get("webhook_secret")
                if required_secret:
                    query_secret = request.query_params.get("secret")
                    header_secret = request.headers.get("x-webhook-secret")
                    if query_secret != required_secret and header_secret != required_secret:
                        webhook_logger.log("Unknown", "Failed", f"Invalid Secret for {path}")
                        logger.warning("Invalid webhook secret for %s from %s", path, client_ip)
                        response = JSONResponse(status_code=401, content={"error": "Unauthorized Webhook"})
                        await response(scope, receive, send)
                        return

            # PERMISSIONS CHECK
            is_allowed = (
                path in allowed_paths
                or "*" in allowed_paths
                or any(
                    (path.startswith(a[:-1]) if a.endswith("*") else path.startswith(a + "/"))
                    for a in allowed_paths
                )
            )

            if not is_allowed:
                logger.warning("Blocked external access to: %s from %s", path, client_ip)
                response = JSONResponse(status_code=403, content={"error": "Access Denied via Public Internet", "path": path})
                await response(scope, receive, send)
                return

        return await self.app(scope, receive, send)

app.add_middleware(TunnelSecurityASGIMiddleware)

_CORS_ORIGINS = ConfigManager.get_config().get("security", {}).get(
    "cors_origins", ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SINGLETONS ---
audio = AudioService()
ai_engine = AIEngine()
bot = BotService(audio=audio, ai=ai_engine)
redeem_svc = bot.redeem_svc
active_websockets: List[WebSocket] = []
active_overlay_websockets: List[WebSocket] = [] # Dedicated for OBS overlays
active_pi_websockets: List[WebSocket] = []


# --- MODELS ---
class ConfigUpdate(BaseModel):
    config: Dict[str, Any]

class SpeakRequest(BaseModel):
    text: str
    channel: str = "public"
    voice: Optional[str] = None

# --- UTILS ---
from collections import deque
log_history = deque(maxlen=200)

async def broadcast_log(data: dict):
    # Only store actual displayable logs in history (sent by _log_ui with type="log")
    # Other events (goal_update, tts_event, overlay data, etc.) are still broadcast
    # to WebSocket clients for real-time overlays but don't belong in the log table.
    if data.get("type") == "log":
        log_history.append(data)
    
    to_remove = []
    for ws in active_websockets:
        try:
            # Non-blocking send
            asyncio.create_task(ws.send_json(data))
        except Exception as e:
            print(f">>> [WS] Send failed: {e}")
            to_remove.append(ws)
    for ws in to_remove:
        active_websockets.remove(ws)
        
    to_remove_overlay = []
    for ws in active_overlay_websockets:
        try:
            asyncio.create_task(ws.send_json(data))
        except Exception:
            to_remove_overlay.append(ws)
    for ws in to_remove_overlay:
        active_overlay_websockets.remove(ws)

@app.get("/api/logs/history")
async def get_log_history():
    return list(log_history)

async def broadcast_to_pi_clients(event: dict):
    if not active_pi_websockets:
        logger.info("No Pi clients connected. Alert queued in database.")
        return
        
    logger.info("Sending alert to connected Pi clients...")
    success = False
    for ws in list(active_pi_websockets):
        try:
            await ws.send_json(event)
            success = True
        except Exception as e:
            logger.error(f"Failed to send alert to a Pi client: {e}")
            
    if success and event.get("transaction_id"):
        bot.mark_donation_as_played(event["transaction_id"])

async def cloud_queue_processor():
    logger.info("Cloud Queue Processor task started.")
    while True:
        try:
            if active_pi_websockets:
                pending = bot.get_pending_donations()
                if pending:
                    # Take the oldest unplayed donation (pending is returned newest-first, so pending[-1] is oldest)
                    item = pending[-1]
                    logger.info(f"Draining queued alert: {item['user']} - {item['amount']}")
                    
                    # Construct correct payload based on type
                    payload = {
                        "user": item["user"],
                        "amount": item["amount"],
                        "message": item["message"],
                        "transaction_id": item["transaction_id"]
                    }
                    if item.get("message") == "Tip via App" or (item.get("transaction_id") or "").startswith("app_alert_"):
                        payload["type"] = "app_alert"
                        payload["do_tts"] = True
                    else:
                        payload["type"] = "donation_alert"
                        
                    await broadcast_to_pi_clients(payload)
                    # wait 15 seconds to avoid Pi hanging
                    await asyncio.sleep(15)
                else:
                    await asyncio.sleep(2)
            else:
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in cloud queue processor: {e}")
            await asyncio.sleep(5)

# --- METADATA ---
@app.on_event("startup")
async def startup_event():
    logger.info("Pi YouTube Bot v%s starting...", APP_VERSION)
    # Validate config at startup
    warnings = ConfigManager.get_instance().validate_config()
    for w in warnings:
        if "CRITICAL" in w:
            logger.critical("FATAL STARTUP ERROR: %s", w)
            sys.exit(1)  # Fail fast so systemd can restart the bot
            
    try:
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        dist_path = os.path.join(project_root, "frontend", "dist")
        if os.path.exists(dist_path):
            logger.info("Frontend dist found: %s", dist_path)
        else:
            logger.warning("frontend/dist NOT FOUND — dashboard will not load")

        if os.environ.get("RUN_MODE") != "cloud":
            await audio.start()
            logger.info("Audio service active.")
            bot.audio = audio
        else:
            logger.info("Cloud Mode: Skipping local Audio Engine initialization.")
        bot.on_subscriber_update = broadcast_overlay
        if os.environ.get("RUN_MODE") == "cloud":
            bot.on_cloud_alert = broadcast_to_pi_clients
            asyncio.create_task(cloud_queue_processor())
        await bot.start(broadcast_log)
        logger.info("Bot service active.")
    except Exception as exc:
        logger.exception("CRITICAL STARTUP ERROR: %s", exc)
        sys.exit(1)

@app.on_event("shutdown")
def shutdown_event():
    bot.stop()
    audio.stop()

# --- DEBUG ROUTES ---
@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring and systemd/Docker health probes."""
    uptime_secs = round(_time.time() - _START_TIME)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_path = os.path.join(project_root, "frontend", "dist")
    return {
        "status": "ok",
        "version": APP_VERSION,
        "uptime_seconds": uptime_secs,
        "services": {
            "bot": bot.is_running if hasattr(bot, 'is_running') else True,
            "audio": not audio._shutdown,
            "frontend_built": os.path.exists(dist_path),
        },
    }

@app.get("/api/version")
async def get_version():
    return {"version": APP_VERSION}

@app.get("/api/debug/fs")
async def debug_fs():
    """List files in frontend/dist to verify deployment."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_path = os.path.join(project_root, "frontend", "dist")
    if not os.path.exists(dist_path):
        return {"error": "frontend/dist not found", "cwd": os.getcwd()}
    files = []
    for root, _dirs, filenames in os.walk(dist_path):
        for f in filenames:
            files.append(os.path.relpath(os.path.join(root, f), dist_path))
    return {
        "cwd": os.getcwd(),
        "files": files,
        "assets_exists": os.path.exists(os.path.join(dist_path, "assets")),
    }

# --- ROUTES ---

@app.get("/api/config")
async def get_config(request: Request):
    full_config = ConfigManager.get_config()
    is_cloud = (os.environ.get("RUN_MODE") == "cloud")
    
    # SECURITY: If public (Tunnel), sanitize the config to hide secrets (API Keys, etc)
    if getattr(request.state, "is_public", False):
        # Deep Copy & Sanitize Tip Config
        tip_config = full_config.get("tip_page", {}).copy()
        if "gateway" in tip_config:
            gateway = tip_config["gateway"].copy()
            # Generic Sanitization: Remove sensitive keys
            sensitive_terms = ["key", "secret", "password", "token", "salt"]
            keys_to_remove = [k for k in gateway.keys() if any(term in k.lower() for term in sensitive_terms)]
            for k in keys_to_remove:
                gateway.pop(k, None)
            tip_config["gateway"] = gateway

        # Safe YouTube Config (Name & Logo only)
        yt_safe = {
            "channel_name": full_config.get("youtube", {}).get("channel_name"),
            "logo_url": full_config.get("youtube", {}).get("logo_url")
        }

        # Safe audio config: Only expose non-sensitive audio metadata
        audio_safe = {}
        audio_full = full_config.get("audio", {})
        if audio_full:
            audio_safe = {
                "enabled": audio_full.get("enabled"),
                "tts_engine": audio_full.get("tts_engine"),
                "voice": audio_full.get("voice"),
                "volume": audio_full.get("volume"),
                "rate": audio_full.get("rate"),
                "priority_mode": audio_full.get("priority_mode"),
                "gaming_pc_ip": audio_full.get("gaming_pc_ip"),
                "udp_ports": audio_full.get("udp_ports"),
                "local_playback": audio_full.get("local_playback"),
                "udp_mode": audio_full.get("udp_mode"),
            }

        return {
            "tip_page": tip_config,
            "youtube": yt_safe,
            "upi_vpa": full_config.get("upi_vpa"),
            "upi_name": full_config.get("upi_name"),
            "audio": audio_safe,
            "paytm_alerts": full_config.get("paytm_alerts", {"enabled": False, "min_amount": 0, "tts_enabled": True}),
            "security": {"allowed_public_paths": full_config.get("security", {}).get("allowed_public_paths", [])}, # Let frontend know what's allowed
            "is_cloud": is_cloud
        }
        
    cfg_copy = full_config.copy()
    cfg_copy["is_cloud"] = is_cloud
    return cfg_copy

@app.post("/api/config")
async def update_config(payload: ConfigUpdate):
    try:
        saved = ConfigManager.save_config(payload.config)
        if not saved:
            raise HTTPException(500, "Failed to save config")
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error saving config")
        raise HTTPException(500, str(exc))

@app.post("/api/sb/chat")
@app.post("/chat")
async def streamer_bot_chat(payload: Dict[str, Any]):
    user = payload.get("user", "Someone")
    message = payload.get("message")
    if not message:
        raise HTTPException(400, "Message required")
    return await bot.handle_sb_chat(user, message, payload=payload)

@app.post("/api/chat")
async def manual_chat(payload: Dict[str, str]):
    prompt = payload.get("prompt")
    if not prompt: raise HTTPException(400, "Prompt required")
    return await bot.handle_sb_chat("Tester", prompt, force_ai=True)

@app.get("/api/audio/status")
async def get_audio_status():
    return audio.get_status()

@app.get("/api/viewers")
async def get_viewers():
    return bot.viewers.viewers

@app.post("/api/loyalty/add")
async def add_points(payload: Dict[str, Any]):
    user = payload.get("user")
    amount = payload.get("amount", 0)
    if not user: raise HTTPException(400, "User required")
    
    bot.viewers.add_points(user, amount)
    return {"status": "added", "new_balance": bot.viewers.get_viewer(user).get("points", 0)}

@app.post("/api/loyalty/redeem")
async def redeem_reward(payload: Dict[str, Any]):
    user = payload.get("user")
    cost = payload.get("cost", 0)
    reward = payload.get("reward", "Unknown Reward")
    
    if not user: raise HTTPException(400, "User required")
    
    success = bot.viewers.redeem(user, cost)
    if success:
        # Chat-only notification (no TTS/OBS alerts)
        await bot._send_chat(f"🎉 {user} redeemed {reward} for {cost} Points!")
        await bot._log_ui("REWARD", f"{user} redeemed {reward}")
        return {"status": "success"}
    return {"status": "insufficient_funds"}

@app.get("/api/loyalty/leaderboard")
async def get_leaderboard():
    return bot.viewers.get_leaderboard(limit=50)

@app.get("/api/loyalty/stats")
async def get_viewer_stats():
    return bot.viewers.get_viewer_stats()



@app.get("/api/loyalty/gambling-history")
async def get_gambling_history():
    history_file = os.path.join(os.path.dirname(__file__), "..", "data", "gambling_history.json")
    history = []
    if os.path.exists(history_file):
        try:
            with open(history_file, "r") as f:
                loaded = json.load(f)
                if isinstance(loaded, list):
                    history = loaded
        except Exception:
            pass
    valid_gambles = [item for item in history if isinstance(item, dict) and item.get("game") in ["gamble", "slots", "rob", "boss_fight"]]
    total_bets = len(history)
    total_winnings = sum(item.get("payout", 0) for item in valid_gambles if item.get("win"))
    biggest_win = max([item.get("payout", 0) for item in valid_gambles if item.get("win")] or [0])
    
    return {
        "stats": {
            "total_bets": total_bets,
            "total_winnings": total_winnings,
            "biggest_win": biggest_win
        },
        "history": history[:100]
    }

@app.put("/api/viewers/{name}/points")
async def set_viewer_points(name: str, payload: Dict[str, Any]):
    action = payload.get("action", "set")  # set | add | deduct
    amount = int(payload.get("amount", 0))
    if action == "add":
        bot.viewers.add_points(name, amount)
    elif action == "deduct":
        if not bot.viewers.deduct_points(name, amount):
            raise HTTPException(400, "Insufficient points")
    else:
        if not bot.viewers.set_points(name, amount):
            raise HTTPException(404, "Viewer not found")
    return {"status": "ok", "points": bot.viewers.get_viewer(name).get("points", 0)}

@app.delete("/api/viewers/{name}")
async def delete_viewer(name: str):
    if not bot.viewers.delete_viewer(name):
        raise HTTPException(404, "Viewer not found")
    return {"status": "deleted"}

@app.post("/api/viewers/{name}/reset")
async def reset_viewer(name: str):
    if not bot.viewers.reset_viewer(name):
        raise HTTPException(404, "Viewer not found")
    return {"status": "reset"}

@app.get("/api/loyalty/config")
async def get_loyalty_config():
    cfg = ConfigManager.get_config()
    return cfg.get("loyalty", {
        "points_per_message": 10,
        "bonus_daily_return": 50,
        "bonus_streak_multiplier": 1.5,
        "points_per_tip_rupee": 0,
        "points_per_superchat_rupee": 0,
        "points_per_supersticker_rupee": 0,
        "points_per_membership_l1": 0,
        "points_per_membership_l2": 0,
        "points_per_membership_l3": 0,
        "points_per_membership_l4": 0,
        "points_per_gifted_membership": 0,
        "ranks": [
            {"name": "Noob", "emoji": "🐣", "min_points": 0, "yt_mod": False, "mod_duration_days": 0},
            {"name": "Bronze", "emoji": "🥉", "min_points": 100, "yt_mod": False, "mod_duration_days": 0},
            {"name": "Silver", "emoji": "🥈", "min_points": 500, "yt_mod": False, "mod_duration_days": 0},
            {"name": "Gold", "emoji": "🥇", "min_points": 2000, "yt_mod": False, "mod_duration_days": 0},
            {"name": "Diamond", "emoji": "💎", "min_points": 5000, "yt_mod": True, "mod_duration_days": 7},
            {"name": "GOD", "emoji": "👑", "min_points": 10000, "yt_mod": True, "mod_duration_days": 30}
        ],
        "rewards": []
    })


@app.post("/api/loyalty/config")
async def save_loyalty_config(payload: Dict[str, Any]):
    cfg = ConfigManager.get_config()
    cfg["loyalty"] = payload
    ConfigManager.save_config(cfg)
    return {"status": "saved"}

@app.post("/api/moderation/timeout")
async def moderation_timeout(payload: Dict[str, Any]):
    user = payload.get("user")
    duration = int(payload.get("duration", 60))
    channel_id = payload.get("channel_id")
    if not user:
        raise HTTPException(400, "Username (user) is required")
    try:
        await bot.moderation.trigger_timeout(user, duration, channel_id=channel_id)
        await bot._log_ui("MOD", f"Manual Timeout: {user} timed out for {duration}s by moderator")
        return {"status": "success", "message": f"Timed out {user} for {duration} seconds."}
    except Exception as e:
        logger.exception("Error triggering timeout")
        raise HTTPException(500, str(e))

@app.post("/api/moderation/delete")
async def moderation_delete(payload: Dict[str, Any]):
    msg_id = payload.get("msg_id")
    if not msg_id:
        raise HTTPException(400, "Message ID (msg_id) is required")
    try:
        await bot.moderation.trigger_delete(msg_id)
        await bot._log_ui("MOD", f"Manual Message Delete: {msg_id} by moderator")
        return {"status": "success", "message": f"Deleted message {msg_id}."}
    except Exception as e:
        logger.exception("Error triggering message delete")
        raise HTTPException(500, str(e))

@app.post("/api/loyalty/start_boss")
async def start_boss(payload: Dict[str, Any]):
    hp = payload.get("hp", 5000)
    boss_type = payload.get("boss_type", "thanos")
    
    result = bot.boss_fight.spawn_boss(hp, boss_type)
    
    # Broadcast to overlays
    if bot.broadcast_func:
        asyncio.create_task(bot.broadcast_func({
            "type": "boss_spawned",
            "hp": hp,
            "boss_type": boss_type
        }))
        
    # Send chat message to YouTube
    asyncio.create_task(bot._send_chat(result["message"]))
    
    return {"status": "success", "message": result["message"]}

# --- MEME REDEEMS CRUD ---

# --- GOALS CRUD ---

@app.get("/api/goals")
async def list_goals():
    cfg = ConfigManager.get_config()
    return cfg.get("goals", {"enabled": True, "active_goals": []})

@app.post("/api/goals")
async def create_goal(payload: Dict[str, Any]):
    cfg = ConfigManager.get_config()
    goals = cfg.get("goals", {"enabled": True, "active_goals": []})
    
    import uuid
    new_goal = {
        "id": str(uuid.uuid4()),
        "name": payload.get("name", "New Goal"),
        "type": payload.get("type", "subscribers"), # subscribers, tips, likes, discord
        "target": payload.get("target", 100),
        "current": payload.get("current", 0),
        "keyword": payload.get("keyword", "hi"),
        "reward": payload.get("reward", 500),
        "duration": payload.get("duration", 300),
        "color": payload.get("color", "#ff0000"),
        "text_color": payload.get("text_color", "#ffffff"),
        "layout": payload.get("layout", "classic"),
        "achieved": False,
        "reward_window_active": False,
        "reward_window_end": None
    }
    goals["active_goals"].append(new_goal)
    cfg["goals"] = goals
    ConfigManager.save_config(cfg)
    return {"status": "created", "goal": new_goal}

@app.put("/api/goals/{goal_id}")
async def update_goal(goal_id: str, payload: Dict[str, Any]):
    cfg = ConfigManager.get_config()
    goals = cfg.get("goals", {"enabled": True, "active_goals": []})
    
    updated = False
    for goal in goals["active_goals"]:
        if goal["id"] == goal_id:
            for k, v in payload.items():
                if k != "id": # Prevent ID overwrite
                    goal[k] = v
            updated = goal
            break
            
    if not updated:
        raise HTTPException(404, "Goal not found")
        
    cfg["goals"] = goals
    ConfigManager.save_config(cfg)
    return {"status": "updated", "goal": updated}

@app.delete("/api/goals/{goal_id}")
async def delete_goal(goal_id: str):
    cfg = ConfigManager.get_config()
    goals = cfg.get("goals", {"enabled": True, "active_goals": []})
    
    original_len = len(goals["active_goals"])
    goals["active_goals"] = [g for g in goals["active_goals"] if g["id"] != goal_id]
    
    if len(goals["active_goals"]) == original_len:
        raise HTTPException(404, "Goal not found")
        
    cfg["goals"] = goals
    ConfigManager.save_config(cfg)
    return {"status": "deleted"}

@app.post("/api/goals/toggle")
async def toggle_goals():
    cfg = ConfigManager.get_config()
    goals = cfg.get("goals", {"enabled": True, "active_goals": []})
    goals["enabled"] = not goals.get("enabled", True)
    cfg["goals"] = goals
    ConfigManager.save_config(cfg)
    return {"status": "success", "enabled": goals["enabled"]}

# --- GIVEAWAY CRUD ---

from backend.services.giveaway_service import GiveawayService

@app.get("/api/giveaway/participants")
async def get_giveaway_participants():
    return GiveawayService.get_participants()

@app.get("/api/giveaway/history")
async def get_giveaway_history():
    return GiveawayService.get_history()

@app.post("/api/giveaway/clear")
async def clear_giveaway():
    GiveawayService.clear_giveaway()
    if bot.broadcast_func:
        await bot.broadcast_func({"type": "giveaway_update", "action": "clear"})
    return {"status": "cleared"}

@app.post("/api/giveaway/remove")
async def remove_giveaway_participant(payload: Dict[str, Any]):
    author = payload.get("author")
    if not author:
        raise HTTPException(400, "Author required")
    success = GiveawayService.remove_participant(author)
    if success and bot.broadcast_func:
        await bot.broadcast_func({"type": "giveaway_update", "action": "remove", "author": author})
    return {"status": "success" if success else "not_found"}

@app.post("/api/giveaway/spin")
async def spin_giveaway():
    if bot.broadcast_func:
        await bot.broadcast_func({"type": "giveaway_update", "action": "spin"})
    return {"status": "success"}

@app.post("/api/giveaway/announce")
async def announce_giveaway_winners(payload: Dict[str, Any]):
    winners = payload.get("winners", [])
    prize = payload.get("prize", "")
    if not winners:
        return {"status": "error"}
        
    GiveawayService.add_history(winners)
    
    names = ", ".join(winners)
    if prize:
        msg = f"🎉 CONGRATULATIONS to {names} for winning the giveaway! 🎁 They won: {prize}!"
        speech = f"Congratulations to {names} for winning {prize} in the giveaway!"
    else:
        msg = f"🎉 CONGRATULATIONS to {names} for winning the giveaway! 🎁"
        speech = f"Congratulations to {names} for winning the giveaway!"
        
    await bot._send_chat(msg)
    
    if bot.audio:
        await bot.audio.speak(speech, "public")
        
    return {"status": "success"}

@app.get("/api/redeems")
async def list_redeems():
    return redeem_svc.get_all()

@app.post("/api/redeems")
async def create_redeem(payload: Dict[str, Any]):
    reward = redeem_svc.create(payload)
    return {"status": "created", "reward": reward}

@app.put("/api/redeems/{reward_id}")
async def update_redeem(reward_id: str, payload: Dict[str, Any]):
    updated = redeem_svc.update(reward_id, payload)
    if not updated:
        raise HTTPException(404, "Reward not found")
    return {"status": "updated", "reward": updated}

@app.delete("/api/redeems/{reward_id}")
async def delete_redeem(reward_id: str):
    if not redeem_svc.delete(reward_id):
        raise HTTPException(404, "Reward not found")
    return {"status": "deleted"}

@app.post("/api/redeems/{reward_id}/test")
async def test_redeem(reward_id: str):
    """Trigger a redeem without spending points (for testing)."""
    result = await redeem_svc.trigger(
        reward_id,
        author="[TEST]",
        viewer_service=bot.viewers,
        sb_ws=bot.sb_ws,
        broadcast_func=broadcast_log,
        skip_cost=True,
    )
    if not result["ok"]:
        raise HTTPException(400, result["error"])
    return result

@app.get("/api/status")
async def get_system_status():
    mem = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=None)
    
    temp = None
    # Try to get temp on Raspberry Pi
    try:
        if sys.platform == "linux":
             temps = psutil.sensors_temperatures()
             if "cpu_thermal" in temps:
                 temp = temps["cpu_thermal"][0].current
             elif "coretemp" in temps:
                 temp = temps["coretemp"][0].current
    except Exception:
        pass

    # Compile consolidated status
    bot_stats = bot.get_status()
    audio_stats = audio.get_status()
    cfg = ConfigManager.get_config()
    
    # Streamerbot mapping
    obs_cfg = cfg.get("streamer_bot", {})
    sb_enabled = obs_cfg.get("enabled", False)
    
    # Get status directly from worker_health managed by BotService connection loop
    sb_worker = bot_stats.get("workers", {}).get("streamerbot", {})
    sb_health_status = sb_worker.get("status", "disconnected")
    sb_last_error = sb_worker.get("last_error", None)
    
    if not sb_enabled:
        sb_status = "disabled"
    else:
        sb_status = sb_health_status

    # YouTube Monitor mapping (Uses StreamerBot or direct pytchat fallback)
    yt_enabled = True
    yt_worker = bot_stats.get("workers", {}).get("youtube_monitor", {})
    yt_health_status = yt_worker.get("status", "disconnected")
    
    if sb_enabled and sb_status == "connected":
        yt_status = "running"
    elif yt_health_status == "running":
        yt_status = "running"
    elif sb_enabled and sb_status == "error":
        yt_status = "error"
    elif not sb_enabled and not cfg.get("youtube", {}).get("video_id"):
        yt_status = "config_missing"
    else:
        yt_status = yt_health_status

    # Audio Engine mapping
    audio_cfg = cfg.get("audio", {})
    audio_enabled = audio_cfg.get("enabled", True)
    audio_health = audio_stats.get("health_status", "error")
    audio_err = (audio_stats.get("last_error") or {}).get("message") if audio_health != "healthy" else None

    # Email Alerts mapping
    email_cfg = cfg.get("email_verification", {})
    email_enabled = email_cfg.get("enabled", False)
    email_stat = bot_stats.get("email_status", "Unknown").lower()
    if not email_enabled:
        email_status = "disabled"
    elif "connected" in email_stat:
        email_status = "connected"
    else:
        email_status = "error"

    # AI Engine mapping
    ai_cfg = cfg.get("ai_topology", {})
    ai_enabled = ai_cfg.get("enabled", True)
    
    response_data = {
        "bot": {
            "email_status": bot_stats.get("email_status", "Unknown")
        },
        "bot_core": {
            "enabled": True,
            "status": "running" if bot_stats.get("is_running") else "stopped",
            "last_error": None
        },
        "workers": {
            "youtube_monitor": {
                "enabled": yt_enabled,
                "status": yt_status,
                "last_error": None,
                "last_heartbeat": None,
                "restart_count": 0
            },
            "ai_engine": {
                "enabled": ai_enabled,
                "status": "running" if ai_enabled else "disabled",
                "last_error": None
            },
            "tts_audio": {
                "enabled": audio_enabled,
                "status": "running" if audio_enabled and audio_health == "healthy" else ("disabled" if not audio_enabled else "error"),
                "last_error": audio_err
            },
            "email_alerts": {
                "enabled": email_enabled,
                "status": email_status,
                "detail": bot_stats.get("email_status", "Unknown"),
                "last_error": bot_stats.get("email_status") if email_status == "error" else None
            },
            "streamerbot": {
                "enabled": sb_enabled,
                "status": sb_status,
                "last_error": sb_last_error,
                "last_heartbeat": sb_worker.get("last_heartbeat"),
                "restart_count": sb_worker.get("restart_count", 0)
            },
            "cloud_client": {
                "enabled": True,
                "status": "connected" if (os.environ.get("RUN_MODE") == "cloud" and len(active_pi_websockets) > 0) else bot_stats.get("workers", {}).get("cloud_client", {}).get("status", "disconnected")
            }
        },
        "system": {
            "cpu": cpu,
            "memory": mem.percent,
            "disk": psutil.disk_usage('/').percent,
            "temp": temp,
            "uptime_seconds": int(time.time() - _START_TIME)
        },
        "tunnel": {
            "is_running": hasattr(bot, "tunnel") and bot.tunnel is not None and bot.tunnel.get_status().get("is_running", False)
        },
        "warnings": []
    }
    
    logger.debug(f"[API STATUS] bot_core: {response_data['bot_core']['status']} | "
                 f"streamerbot: {response_data['workers']['streamerbot']['status']} | "
                 f"youtube: {response_data['workers']['youtube_monitor']['status']}")
                 
    return response_data

# --- QUICK BOT CONTROLS ---

@app.post("/api/bot/toggle-ai")
async def toggle_ai():
    cfg = ConfigManager.get_config(force_reload=True)
    topo = cfg.get("ai_topology", {})
    topo["enabled"] = not topo.get("enabled", True)
    cfg["ai_topology"] = topo
    ConfigManager.save_config(cfg)
    return {"status": "success", "ai_enabled": topo["enabled"]}

@app.post("/api/bot/toggle-tts")
async def toggle_tts():
    cfg = ConfigManager.get_config(force_reload=True)
    audio_cfg = cfg.get("audio", {})
    audio_cfg["enabled"] = not audio_cfg.get("enabled", True)
    cfg["audio"] = audio_cfg
    ConfigManager.save_config(cfg)
    return {"status": "success", "tts_enabled": audio_cfg["enabled"]}

@app.post("/api/bot/restart")
async def restart_bot():
    try:
        bot.stop()
        await asyncio.sleep(1)
        await bot.start(broadcast_log)
        return {"status": "success", "message": "Bot restarted successfully"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- INTEGRATIONS CONTROL ---

@app.post("/api/integrations/telegram/restart")
async def restart_telegram():
    try:
        await bot.telegram.stop()
        await bot.telegram.start()
        return {"status": "success", "message": "Telegram Service Restarted"}
    except Exception as e:
        raise HTTPException(500, f"Failed to restart Telegram: {e}")

# --- CUSTOM COMMANDS CRUD ---

@app.get("/api/commands")
async def get_custom_commands():
    cfg = bot.load_config()
    return cfg.get("custom_commands", {})

@app.post("/api/commands")
async def save_custom_command(payload: Dict[str, Any]):
    command = payload.get("command", "").strip().lower()
    response = payload.get("response", "").strip()
    cooldown = payload.get("cooldown", 30)
    enabled = payload.get("enabled", True)

    if not command or not response:
        raise HTTPException(400, "Command and response are required")
    if not command.startswith("!"):
        command = "!" + command

    cfg = bot.load_config()
    if "custom_commands" not in cfg:
        cfg["custom_commands"] = {}

    cfg["custom_commands"][command] = {
        "response": response,
        "cooldown": cooldown,
        "enabled": enabled
    }
    ConfigManager.save_config(cfg)
    return {"status": "success", "commands": cfg["custom_commands"]}

@app.delete("/api/commands/{name}")
async def delete_custom_command(name: str):
    cmd_name = name if name.startswith("!") else "!" + name
    cfg = bot.load_config()
    custom = cfg.get("custom_commands", {})
    if cmd_name in custom:
        del custom[cmd_name]
        cfg["custom_commands"] = custom
        ConfigManager.save_config(cfg)
        return {"status": "deleted", "commands": custom}
    raise HTTPException(404, f"Command {cmd_name} not found")

# --- AUTO-MESSAGES CRUD ---

@app.get("/api/auto-messages")
async def get_auto_messages():
    cfg = bot.load_config()
    return cfg.get("auto_messages", {"enabled": False, "messages": []})

@app.post("/api/auto-messages")
async def save_auto_message(payload: Dict[str, Any]):
    msg_id = payload.get("id", "").strip()
    text = payload.get("text", "").strip()
    interval = payload.get("interval_minutes", 15)
    enabled = payload.get("enabled", True)

    if not msg_id or not text:
        raise HTTPException(400, "ID and text are required")

    cfg = bot.load_config()
    if "auto_messages" not in cfg:
        cfg["auto_messages"] = {"enabled": True, "messages": []}

    messages = cfg["auto_messages"].get("messages", [])
    # Update existing or add new
    found = False
    for m in messages:
        if m["id"] == msg_id:
            m["text"] = text
            m["interval_minutes"] = interval
            m["enabled"] = enabled
            found = True
            break
    if not found:
        messages.append({"id": msg_id, "text": text, "interval_minutes": interval, "enabled": enabled})
    cfg["auto_messages"]["messages"] = messages

    ConfigManager.save_config(cfg)
    return {"status": "success", "auto_messages": cfg["auto_messages"]}

@app.delete("/api/auto-messages/{msg_id}")
async def delete_auto_message(msg_id: str):
    cfg = bot.load_config()
    auto = cfg.get("auto_messages", {"enabled": False, "messages": []})
    original_len = len(auto.get("messages", []))
    auto["messages"] = [m for m in auto.get("messages", []) if m["id"] != msg_id]
    if len(auto["messages"]) == original_len:
        raise HTTPException(404, f"Message {msg_id} not found")
    cfg["auto_messages"] = auto
    ConfigManager.save_config(cfg)
    return {"status": "deleted", "auto_messages": auto}

@app.post("/api/auto-messages/toggle")
async def toggle_auto_messages():
    cfg = bot.load_config()
    auto = cfg.get("auto_messages", {"enabled": False, "messages": []})
    auto["enabled"] = not auto.get("enabled", False)
    cfg["auto_messages"] = auto
    ConfigManager.save_config(cfg)
    return {"status": "success", "enabled": auto["enabled"]}

@app.post("/api/audio/speak")
async def manual_speak(payload: SpeakRequest):
    print(f">>> [API] Manual Speak Request: {payload.text} ({payload.channel})")
    # Log to UI so overlays can see it
    await bot._log_ui("TTS", payload.text, author="System")
    await audio.speak(payload.text, payload.channel, voice=payload.voice)
    return {"status": "queued"}

@app.post("/api/audio/skip")
async def skip_audio():
    result = await audio.skip_current()
    if result:
        return {"status": "skipped"}
    return {"status": "idle"}

@app.post("/api/audio/pause")
async def pause_audio():
    await audio.toggle_pause(True)
    return {"status": "paused"}

@app.post("/api/audio/resume")
async def resume_audio():
    await audio.toggle_pause(False)
    return {"status": "resumed"}

class PriorityRequest(BaseModel):
    mode: str # 'public' or 'secret'

@app.post("/api/audio/priority")
async def set_audio_priority(payload: PriorityRequest):
    # Update config
    cfg = bot.load_config()
    if "audio" not in cfg: cfg["audio"] = {}
    cfg["audio"]["priority_mode"] = payload.mode
    
    # Save
    ConfigManager.save_config(cfg)
    
    return {"status": "updated", "mode": payload.mode}

class QueuePauseRequest(BaseModel):
    channel: str
    paused: bool

@app.post("/api/audio/queue/pause")
async def set_queue_pause(payload: QueuePauseRequest):
    audio.set_queue_pause(payload.channel, payload.paused)
    return {"status": "updated", "channel": payload.channel, "paused": payload.paused}

class ReorderRequest(BaseModel):
    channel: str
    items: List[str] # List of IDs

@app.post("/api/audio/queue/reorder")
async def reorder_queue(payload: ReorderRequest):
    audio.reorder_queue(payload.channel, payload.items)
    return {"status": "reordered"}

class RemoveRequest(BaseModel):
    channel: str
    id: str

@app.post("/api/audio/queue/remove")
async def remove_queue_item(payload: RemoveRequest):
    audio.remove_from_queue(payload.channel, payload.id)
    return {"status": "removed"}

@app.post("/api/audio/clear")
async def clear_audio_queue(payload: Optional[Dict[str, str]] = None):
    channel = payload.get("channel") if payload else None
    audio.clear_queue(channel)
    return {"status": "cleared", "channel": channel or "all"}

@app.post("/api/audio/config")
async def update_audio_config(payload: Dict[str, Any]):
    """Update audio-specific config (rate, volume, max_play_duration, banned_words)."""
    cfg = ConfigManager.get_config()
    audio_cfg = cfg.get("audio", {})
    
    if "rate" in payload:
        audio_cfg["rate"] = payload["rate"]
    if "volume" in payload:
        audio_cfg["volume"] = payload["volume"]
    if "max_play_duration" in payload:
        audio_cfg["max_play_duration"] = int(payload["max_play_duration"])
    if "banned_words" in payload:
        if isinstance(payload["banned_words"], list):
            audio_cfg["banned_words"] = payload["banned_words"]
    
    cfg["audio"] = audio_cfg
    ConfigManager.save_config(cfg)
    return {"status": "updated", "audio": {
        "rate": audio_cfg.get("rate"),
        "volume": audio_cfg.get("volume"),
        "max_play_duration": audio_cfg.get("max_play_duration", 30),
        "banned_words": audio_cfg.get("banned_words", []),
    }}


@app.get("/api/test/audio")
async def test_audio(request: Request):
    if not bot.audio:
        return JSONResponse({"status": "error", "message": "Audio Engine not initialized"}, status_code=500)
    
    await bot.audio.speak("This is a test of the emergency broadcast system. Audio is working!", "public")
    return {"status": "success", "message": "Test audio queued"}

@app.post("/api/providers/test/{provider_id}")
async def test_provider(provider_id: str, payload: Optional[Dict[str, Any]] = None):
    # 1. Get Provider Config (from body or load from saved config)
    if payload:
        provider = payload
    else:
        config = bot.load_config()
        provider = next((p for p in config["ai_topology"]["providers"] if p["id"] == provider_id), None)
    
    if not provider:
        raise HTTPException(404, "Provider configuration not found. Please save first or send configuration in body.")
    
    # 2. Call AI Engine test
    return await ai_engine.test_connection(provider)



class DonationRequest(BaseModel):
    user: str
    amount: float
    message: Optional[str] = "Support"

@app.post("/api/donate")
async def receive_donation(payload: DonationRequest):
    print(f">>> [API] Donation Received: {payload.user} - Rs.{payload.amount}")
    return await bot.trigger_donation_alert(payload.user, payload.amount, payload.message, skip_verification=True)

@app.get("/api/donations")
async def get_donations_route(limit: int = 100):
    return bot.get_donation_history(limit=limit)

@app.delete("/api/donations")
async def clear_donations_route():
    success = bot.clear_donation_history()
    if success:
        bot.processed_transactions.clear() # Clear deduplication cache to allow old tips again
        return {"status": "success", "message": "History cleared"}
    raise HTTPException(500, "Failed to clear history")

class DeleteDonationRequest(BaseModel):
    timestamp: str
    user: str
    amount: float

@app.delete("/api/donations/item")
async def delete_donation_item_route(payload: DeleteDonationRequest):
    success = bot.delete_donation_history_item(payload.timestamp, payload.user, payload.amount)
    if success:
        return {"status": "success", "message": "Item deleted"}
    raise HTTPException(404, "Item not found or failed to delete")

@app.post("/api/test/alert")
async def simulate_alert(payload: Dict[str, Any]):
    etype = payload.get("type", "NewSubscriber")
    author = payload.get("author", "Test User")
    message = payload.get("message")
    return await bot.simulate_alert(etype, author, message)

@app.post("/api/test/superchat")
async def test_superchat(payload: Dict[str, Any]):
    """
    Manually triggers a Super Chat alert for testing.
    Does NOT log to Google Sheets.
    """
    return await bot.test_super_chat(payload)

@app.post("/api/test/system")
async def check_system_integrity():
    return await bot.check_integrations()

@app.post("/api/test/send_chat")
async def send_test_chat():
    return await bot.send_test_chat()

from fastapi import Body

@app.post("/api/test/email")
async def test_email_connection(payload: Optional[Dict[str, str]] = Body(None)):
    # Allow testing with payload credentials OR saved config
    temp_config = {}
    if payload:
        temp_config = {"email_verification": payload}
    
    # Use the service to test connection
    # We create a temporary service instance or use the bot's
    from backend.services.email_service import EmailService
    
    # Mock config loader if payload provided
    loader = bot.load_config
    if payload:
        loader = lambda: temp_config
        
    service = EmailService(loader)
    success = await asyncio.to_thread(service._connect)
    if success:
        service._disconnect()
        return {"status": "success", "message": "Connected to IMAP successfully!"}
    
    error_msg = service.last_error if hasattr(service, 'last_error') else "Unknown Error"
    return {"status": "failed", "message": f"Connection Failed: {error_msg}"}

@app.get("/api/debug/email")
async def debug_email_check():
    """
    Runs a live check of the last 10 emails and returns a log of what it sees.
    """
    try:
        # Lazy import to prevent server crash if service is broken
        try:
            from backend.services.email_service import EmailService
        except ImportError as e:
            return {"status": "error", "message": f"Failed to import EmailService: {e}"}

        service = EmailService(bot.load_config)
        
        if not service._connect():
            return {"status": "error", "message": f"Could not connect: {service.last_error}"}
            
        service.mail.select("inbox")
        import datetime
        date_str = (datetime.date.today()).strftime("%d-%b-%Y")
        status, messages = service.mail.search(None, f'(SINCE "{date_str}")')
        
        logs = []
        if status == "OK":
            email_ids = messages[0].split()
            recent_ids = email_ids[-10:] if len(email_ids) > 10 else email_ids
            
            for e_id in reversed(recent_ids):
                try:
                    res, msg_data = service.mail.fetch(e_id, "(RFC822)")
                    for response_part in msg_data:
                        if isinstance(response_part, tuple):
                            import email
                            from email.header import decode_header
                            msg = email.message_from_bytes(response_part[1])
                            subject = decode_header(msg["Subject"])[0][0]
                            if isinstance(subject, bytes):
                                subject = subject.decode()
                            logs.append(f"ID {e_id.decode()}: {subject}")
                except Exception as ex:
                    logs.append(f"Error fetching {e_id}: {str(ex)}")
        else:
            logs.append("No emails found today via SEARCH command.")
            
        service._disconnect()
        return {"status": "success", "logs": logs}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- TUNNEL ROUTES ---
@app.get("/api/tunnel")
async def get_tunnel_status():
    if not hasattr(bot, "tunnel") or bot.tunnel is None:
        return {"is_running": False, "url": None}
    return bot.tunnel.get_status()

@app.post("/api/tunnel/start")
async def start_tunnel():
    logger.info("Tunnel start requested")
    return await bot.tunnel.start()

@app.post("/api/tunnel/stop")
async def stop_tunnel():
    logger.info("Tunnel stop requested")
    bot.tunnel.stop()
    return {"status": "stopped"}

@app.get("/api/ip")
async def get_local_ip():
    import socket
    try:
        # Trick: Connect to a public DNS IP (doesn't send data) to get the interface IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return {"ip": ip}
    except Exception:
        # Fallback
        return {"ip": "127.0.0.1"}

@app.post("/api/webhook/{provider}")
async def payment_webhook(provider: str, payload: dict):
    """
    Generic Webhook Receiver for Payment Gateways (e.g. razorpay, phonepe)
    The Tunnel must allow access to this path.
    """
    logger.info("Webhook event from %s", provider)

    # Custom Payment Notification Logic (Universal App Alerts)
    if provider in ["paytm", "phonepe", "gpay", "app"]:
        app_cfg = _get_config().get("app_alerts", {})
        if not app_cfg.get("enabled", False):
            return {"status": "ignored", "reason": f"App alerts disabled (app_alerts switch)"}

        # Handle various common payload structures from Notification2Webhook or Android App
        text      = payload.get("text",        payload.get("content",  "")) or ""
        title     = payload.get("title",       payload.get("appName",  "")) or ""
        ticker    = payload.get("tickerText",  "") or ""
        subtext   = payload.get("subText",     "") or ""
        bigtext   = payload.get("bigText",     "") or ""
        textlines = payload.get("textLines",   "") or ""

        combined_text = f"{text} {title} {ticker} {subtext} {bigtext} {textlines}".replace('None', ' ')
        combined_lower = combined_text.lower()

        # ── SERVER-SIDE PAYMENT KEYWORD GATE ──────────────────────────────
        # Even if the Android app sends something, verify it looks like a payment
        # before doing anything, so non-payment notifications are silently ignored.
        PAYMENT_KEYWORDS = [
            "paid", "received", "credited", "debited",
            "\u20b9", "rs.", "inr", "upi", "payment",
            "transfer", "sent", "transaction", "cashback",
            "refund", "withdrawn", "deposited"
        ]
        if not any(kw in combined_lower for kw in PAYMENT_KEYWORDS):
            webhook_logger.log(provider, "Ignored", "Non-payment notification dropped", payload)
            print(f">>> [Webhook] Ignoring non-payment notification from {provider}: {combined_text[:80]}")  # type: ignore
            return {"status": "ignored", "reason": "No payment keywords found in notification text"}
        # ──────────────────────────────────────────────────────────────────

        try:
            amount = 0.0

            # Strip currency symbols before running amount regex
            # Handle encoded & literal rupee sign, Rs., INR
            cleaned_text = re.sub(
                r'(?:\u20b9|\u20B9|\\u20b9|\\u20B9|Rs\.?|INR|\bRs\b)',
                '', combined_text, flags=re.IGNORECASE
            ).strip()

            # Find amount: first number sequence (digits, commas, optional decimal)
            amount_match = re.search(r'([\d,]+(?:\.\d+)?)', cleaned_text)
            if amount_match:
                try:
                    raw_amount_str = amount_match.group(1).replace(',', '').strip()
                    amount = float(raw_amount_str)
                except Exception as e:
                    logger.warning("Webhook/%s: failed to cast amount: %s", provider, e)
            else:
                logger.warning("Webhook/%s: no amount found in: %.120r", provider, combined_text)
                return {"status": "ignored", "reason": f"Could not parse amount from text: {repr(combined_text[:120])}"}  # type: ignore

            if amount <= 0:
                logger.warning("Webhook/%s: amount<=0, ignoring. Text: %.120r", provider, combined_text)
                return {"status": "ignored", "reason": "Parsed amount was zero or negative"}

            # Filter by minimum amount
            min_amount = float(app_cfg.get("min_amount", 0))
            if amount < min_amount:
                return {"status": "ignored", "reason": f"amount {amount} less than min_amount {min_amount}"}

            # ── Sender Extraction ──────────────────────────────────────────
            # Search in full combined_text (not just `text`) so ticker/bigtext are included
            sender = "Someone"
            for search_text in [text, combined_text]:
                m = re.search(r'(?:from|by)\s+([A-Za-z][A-Za-z0-9 ]{1,40})(?:[\.|\n]|$)', search_text, re.IGNORECASE)
                if m:
                    sender = m.group(1).strip()
                    break
                m2 = re.search(r'received\s+([A-Za-z0-9 ]+?)\s+has sent', search_text, re.IGNORECASE)
                if m2:
                    sender = m2.group(1).strip()
                    break

            # Clean up trailing noise
            for pattern in [r'\s+on paytm.*', r'\s+on phonepe.*', r'\s+for order.*',
                            r'\s+via upi.*', r'\s+using.*']:
                sender = re.sub(pattern, '', sender, flags=re.IGNORECASE).strip()

            do_tts = app_cfg.get("tts_enabled", True)

            print(f">>> [Webhook/{provider}] Alert: {sender} paid \u20b9{amount}")
            webhook_logger.log(provider, "Success", f"{sender} paid \u20b9{amount}", payload)

            asyncio.create_task(bot.trigger_app_alert(sender, amount, do_tts=do_tts))
            return {"status": "success", "amount": amount, "sender": sender}

        except Exception as e:
            import traceback
            err_msg = traceback.format_exc()
            print(f">>> [Webhook/{provider}] CRASH: {err_msg}")
            return {"status": "error", "reason": f"Internal Server Error: {str(e)}"}

    # ── Generic / other providers ──────────────────────────────────────────
    amount  = float(payload.get("amount", 0))
    sender  = payload.get("sender", "Unknown")
    message = payload.get("message", f"Payment via {provider}")

    if provider == "cloud":
        original_provider = payload.get("original_provider", "email")
        if original_provider == "app":
            asyncio.create_task(bot.trigger_app_alert(sender, amount, do_tts=True))
        else:
            await bot.trigger_donation_alert(sender, amount, message, skip_verification=True)
        return {"status": "received", "provider": "cloud"}

    if amount > 1000:
        amount = amount / 100

    await bot.trigger_donation_alert(sender, amount, message, skip_verification=True)
    return {"status": "received", "provider": provider}


@app.get("/api/webhook/logs")
async def get_webhook_logs():
    """Return the last N webhook events captured by webhook_logger."""
    return {"logs": webhook_logger.logs}


@app.post("/api/webhook/test/app")
async def test_app_webhook(payload: Optional[Dict[str, Any]] = None):
    """
    Send a fake Generic App payment notification to test the full alert pipeline.
    Bypasses the enabled check so you can test even when the switch is OFF.
    """
    data = payload or {}
    sender = data.get("sender", "Test Donor")
    amount = float(data.get("amount", 99.0))
    do_tts = data.get("tts", True)

    webhook_logger.log("app", "Test", f"Test alert: {sender} ₹{amount}")
    asyncio.create_task(bot.trigger_app_alert(sender, amount, do_tts=do_tts))
    return {"status": "success", "message": f"Test alert fired: {sender} ₹{amount}"}


# --- PHONEPE ENDPOINTS ---
try:
    from backend.services.phonepe_service import PhonePeService
    phonepe_service = PhonePeService(bot.load_config)
    phonepe_available = True
except ImportError:
    phonepe_service = None
    phonepe_available = False

class PhonePeInitiateRequest(BaseModel):
    amount: float
    user: str

@app.post("/api/payment/phonepe/initiate")
async def initiate_phonepe_payment(payload: PhonePeInitiateRequest, request: Request):
    if not phonepe_available or phonepe_service is None:
        raise HTTPException(503, "PhonePe Gateway service is not available on this instance.")
    try:
        # Determine redirect URL based on request origin
        # Force HTTP as requested by user to resolve OBS/Cloudflare issues
        host = request.headers.get("host", "localhost:8000")
        protocol = "http"
        base_url = f"{protocol}://{host}"
        
        callback_url = f"{base_url}/api/webhook/phonepe"
        redirect_url = f"{base_url}/tip?status=success" # Frontend handles this query param
        
        result = await phonepe_service.initiate_payment(payload.amount, payload.user, callback_url, redirect_url)
        return {"redirectUrl": result["url"], "orderId": result["order_id"]}
    except Exception as exc:
        logger.exception("PhonePe initiation error")
        raise HTTPException(500, str(exc))

@app.get("/api/payment/phonepe/status/{order_id}")
async def check_phonepe_status(order_id: str):
    if not phonepe_available or phonepe_service is None:
        raise HTTPException(503, "PhonePe Gateway service is not available on this instance.")
    res = await phonepe_service.verify_status(order_id)
    return res


@app.post("/api/payment/verify-email")
async def verify_payment_via_email(payload: Dict[str, Any]):
    amount = payload.get("amount")
    if not amount:
        raise HTTPException(400, "Amount required")
    
    timestamp = payload.get("timestamp") # New: Transaction Start Time

    try:
        from backend.services.email_service import EmailService
    except ImportError:
        raise HTTPException(503, "Email Verification service is not available on this instance.")

    # Use a temporary service instance to check
    # In production, might want a persistent one or connection pooling
    service = EmailService(bot.load_config)
    
    # Run in thread to avoid blocking async loop
    try:
        result = await asyncio.to_thread(service.check_for_payment_email, amount, min_timestamp=timestamp)
        
        # If verified, trigger alert!
        if result["verified"]:
            user = payload.get("user", "Anonymous")
            message = payload.get("message", "Donation via UPI")
            
            # Trigger Alert with Transaction ID (Message-ID) for Deduplication
            msg_id = result.get("message_id")
            
            # Trigger Alert
            await bot.trigger_donation_alert(user, float(amount), message, transaction_id=msg_id, skip_verification=True)
            
        return result
    finally:
        service._disconnect()

@app.post("/api/email/connect")
async def email_connect_manual():
    return await bot.connect_email()

@app.post("/api/email/disconnect")
async def email_disconnect_manual():
    return await bot.disconnect_email()


@app.post("/api/sheets/creds")
async def upload_sheets_creds(payload: Dict[str, str]):
    """
    Saves service account JSON to service_account.json
    """
    json_content = payload.get("json_content")
    if not json_content:
        raise HTTPException(400, "JSON content required")
    
    try:
        # Validate JSON
        parsed = json.loads(json_content)
        if "type" not in parsed or parsed["type"] != "service_account":
             # Loose validation, but good enough
             pass
        
        with open("service_account.json", "w") as f:
            f.write(json_content) # Just write raw text to preserve formatting/keys
            
        return {"status": "success", "message": "Credentials saved to service_account.json"}
    except json.JSONDecodeError:
         raise HTTPException(400, "Invalid JSON format")
    except Exception as e:
         raise HTTPException(500, str(e))

@app.get("/api/sheets/status")
async def get_sheets_status():
    """
    Checks if creds file exists and if enabled
    """
    has_sa_creds = os.path.exists("service_account.json")
    config = bot.load_config()
    sheets_config = config.get("google_sheets", {})
    enabled = sheets_config.get("enabled", False)
    sheet_id = sheets_config.get("sheet_id", "")
    
    # Check for OAuth creds
    has_oauth_creds = "oauth_credentials" in sheets_config
    
    # Fallback check (YouTube creds) - optional, but good for UI state
    yt_oauth = "oauth_credentials" in config.get("youtube", {})
    
    return {
        "has_credentials": has_sa_creds or has_oauth_creds or yt_oauth,
        "using_oauth": has_oauth_creds,
        "enabled": enabled,
        "sheet_id": sheet_id,
        "connected": bot.sheets.connected,
        "last_error": bot.sheets.last_error
    }

@app.post("/api/sheets/test")
async def test_sheets_connection():
    """
    Forces a connection attempt
    """
    success = await bot.sheets.connect()
    if success:
        return {"status": "success", "message": f"Connected to Sheet: {bot.sheets.sheet.title if bot.sheets.sheet else 'Unknown'}"}
    else:
        return {"status": "error", "message": bot.sheets.last_error or "Unknown Error"}

@app.get("/api/sheets/list")
async def list_user_spreadsheets():
    """
    Fetches list of Google Sheets for the authenticated user via Drive API.
    Requires OAuth connection (Specific to Sheets or fall back to YouTube).
    """
    try:
        config = bot.load_config()
        yt_config = config.get("youtube", {})
        sheets_config = config.get("google_sheets", {})
        
        oauth_creds = None
        
        # 1. Prefer specific Sheets credentials
        if "oauth_credentials" in sheets_config:
            oauth_creds = sheets_config["oauth_credentials"]
        # 2. Fallback to YouTube credentials (if they have scopes, which they might if user didn't separate)
        elif "oauth_credentials" in yt_config:
            oauth_creds = yt_config["oauth_credentials"]
            
        if not oauth_creds:
            raise HTTPException(400, "by authenticating in the Google Sheets tab.")
            
        # Create Credentials object
        from google.oauth2.credentials import Credentials
        creds = Credentials(
            token=oauth_creds.get("token"),
            refresh_token=oauth_creds.get("refresh_token"),
            token_uri=oauth_creds.get("token_uri"),
            client_id=oauth_creds.get("client_id"),
            client_secret=oauth_creds.get("client_secret"),
            scopes=oauth_creds.get("scopes")
        )
        
        # Use Google Drive API to list sheets
        # mimetype = 'application/vnd.google-apps.spreadsheet'
        def _fetch_drive_files():
            from googleapiclient.discovery import build
            service = build('drive', 'v3', credentials=creds)
            return service.files().list(
                q="mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
                fields="nextPageToken, files(id, name)",
                pageSize=20
            ).execute()

        results = await asyncio.to_thread(_fetch_drive_files)  # type: ignore
        
        items = results.get('files', [])
        return {"status": "success", "sheets": items}
        
    except Exception as e:
        print(f"List Sheets Error: {e}")
        raise HTTPException(500, f"Failed to list sheets: {str(e)}")

@app.post("/api/sheets/create")
async def create_sheets_template(payload: Optional[Dict[str, str]] = None):
    """
    Creates a new Google Sheet with the correct headers for transaction logging.
    Returns the new sheet ID so the frontend can auto-select it.
    """
    try:
        config = bot.load_config()
        sheets_config = config.get("google_sheets", {})
        yt_config = config.get("youtube", {})

        oauth_creds = None
        if "oauth_credentials" in sheets_config:
            oauth_creds = sheets_config["oauth_credentials"]
        elif "oauth_credentials" in yt_config:
            oauth_creds = yt_config["oauth_credentials"]

        if not oauth_creds:
            raise HTTPException(400, "No OAuth credentials found. Connect your Google account first.")

        from google.oauth2.credentials import Credentials as UserCredentials
        creds = UserCredentials(
            token=oauth_creds.get("token"),
            refresh_token=oauth_creds.get("refresh_token"),
            token_uri=oauth_creds.get("token_uri"),
            client_id=oauth_creds.get("client_id"),
            client_secret=oauth_creds.get("client_secret"),
            scopes=oauth_creds.get("scopes")
        )

        # Auto-refresh if needed
        if not creds.token or (hasattr(creds, 'expired') and creds.expired):
            from google.auth.transport.requests import Request as AuthRequest
            creds.refresh(AuthRequest())

        sheet_name = (payload or {}).get("name", "Pi Bot Transactions")

        def _create_sheet():
            import gspread
            gc = gspread.authorize(creds)
            spreadsheet = gc.create(sheet_name)

            # Add headers
            headers = ["Date", "Time", "User", "Amount", "Type", "Message", "Transaction ID"]
            sheet = spreadsheet.sheet1
            sheet.append_row(headers)

            # Format header row (bold + freeze)
            sheet.format("A1:G1", {
                "textFormat": {"bold": True},
                "backgroundColor": {"red": 0.2, "green": 0.2, "blue": 0.2},
                "horizontalAlignment": "CENTER"
            })
            sheet.freeze(rows=1)

            # Auto-resize columns
            sheet.columns_auto_resize(0, 7)

            return spreadsheet.id, spreadsheet.title

        sheet_id, title = await asyncio.to_thread(_create_sheet)

        # Auto-save the sheet_id to config
        config["google_sheets"]["sheet_id"] = sheet_id
        ConfigManager.save_config(config)

        # Auto-connect to the new sheet
        await bot.sheets.connect()

        return {
            "status": "success",
            "sheet_id": sheet_id,
            "title": title,
            "message": f"Created sheet '{title}' with headers and connected!"
        }
    except Exception as e:
        print(f"Create Sheet Error: {e}")
        raise HTTPException(500, f"Failed to create sheet: {str(e)}")

@app.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket):
    # Block public access to logs WebSocket
    if websocket.headers.get("cf-connecting-ip") or websocket.headers.get("cf-ray"):
        await websocket.close(code=1008, reason="Access Denied")
        return
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)

# --- OVERLAY WEBSOCKET ---
async def broadcast_overlay(count: int, type: str = "subscriber_count"):
    payload = {"type": type, "count": count}
    to_remove = []
    for ws in active_overlay_websockets:
        try:
            await ws.send_json(payload)
        except Exception:
            to_remove.append(ws)
    for ws in to_remove:
        active_overlay_websockets.remove(ws)

@app.websocket("/ws/overlay")
async def websocket_overlay_endpoint(websocket: WebSocket):
    # Block public access to overlay WebSocket
    if websocket.headers.get("cf-connecting-ip") or websocket.headers.get("cf-ray"):
        await websocket.close(code=1008, reason="Access Denied")
        return
    await websocket.accept()
    active_overlay_websockets.append(websocket)
    try:
        # Send initial state
        await websocket.send_json({"type": "subscriber_count", "count": bot.subscriber_count})
        while True:
            await websocket.receive_text() # Keep alive
    except WebSocketDisconnect:
        if websocket in active_overlay_websockets:
            active_overlay_websockets.remove(websocket)

@app.websocket("/ws/pi-client")
async def websocket_pi_client_endpoint(websocket: WebSocket):
    # Security Token Check
    cfg = _get_config()
    secret = cfg.get("security", {}).get("webhook_secret")
    if secret:
        token = websocket.query_params.get("token")
        if token != secret:
            logger.warning("Pi client WebSocket connection rejected: Invalid Token")
            await websocket.close(code=1008, reason="Unauthorized")
            return
            
    await websocket.accept()
    active_pi_websockets.append(websocket)
    logger.info("Local Pi Bot connected to Cloud WebSocket.")
    
    # Push pending/queued tips upon connection
    try:
        pending = bot.get_pending_donations()
        # Draining oldest-first (reverse of pending newest-first)
        for item in reversed(pending):
            logger.info(f"Draining pending alert: {item['user']} - {item['amount']}")
            payload = {
                "user": item["user"],
                "amount": item["amount"],
                "message": item["message"],
                "transaction_id": item["transaction_id"]
            }
            if item.get("message") == "Tip via App" or (item.get("transaction_id") or "").startswith("app_alert_"):
                payload["type"] = "app_alert"
                payload["do_tts"] = True
            else:
                payload["type"] = "donation_alert"
                
            await websocket.send_json(payload)
            bot.mark_donation_as_played(item["transaction_id"])
            # Small delay between historical queued alerts
            await asyncio.sleep(15)
            
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in active_pi_websockets:
            active_pi_websockets.remove(websocket)
        logger.info("Local Pi Bot disconnected from Cloud WebSocket.")

# --- SUBSCRIBER API ---
class SubscriberUpdate(BaseModel):
    count: int
    save: bool = True # Default to True for API calls

@app.get("/api/subscriber")
async def get_subscriber_count():
    return {"count": bot.subscriber_count}

@app.post("/api/youtube/test")
async def test_youtube_api(payload: Dict[str, str]):
    """
    Test YouTube API or Scraper Connection.
    """
    method = payload.get("fetch_method", "api")
    channel_id = payload.get("channel_id")
    
    if not channel_id:
        raise HTTPException(400, "Missing Channel ID")

    if method == "scrape":
        # Test Scrape
        result = await bot.fetch_youtube_stats_scraping(channel_id)
        if result and result[0] is not None:
             count = result[0]
             bot.set_subscriber_count(count, save=True)
             return {"status": "success", "statistics": {"subscriberCount": count}, "method": "scrape"}
        else:
             return {"status": "error", "message": "Failed to scrape channel. Check ID or try API method."}

    # API Method
    api_key = payload.get("api_key")
    if not api_key:
        raise HTTPException(400, "Missing API Key")
        
    url = f"https://www.googleapis.com/youtube/v3/channels?part=statistics&id={channel_id}&key={api_key}"
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        data = resp.json()
        
        if resp.status_code != 200:
            return {"status": "error", "code": resp.status_code, "error": data}
            
        items = data.get("items", [])
        if not items:
            return {"status": "error", "message": "Channel not found via API. Check ID."}
            
        stats = items[0].get("statistics", {})
        sub_count = stats.get("subscriberCount")
        
        if sub_count:
            bot.set_subscriber_count(int(sub_count), save=True)
            
        return {"status": "success", "statistics": stats, "channel_id": channel_id, "method": "api"}

@app.post("/api/subscriber")
async def set_subscriber_count(payload: SubscriberUpdate):
    # Only allow saving from this endpoint if explicitly requested (usually True)
    # But wait, we wanted to DISABLE manual updates. 
    # Actually, we can just force save=False if we want to prevent manual persistence, 
    # but the user might still want to manually correct it if the API is broken.
    # The requirement was "Remove manual input". 
    # So we can keep this endpoint for Internal/Testing use or just respect the flag.
    bot.set_subscriber_count(payload.count, save=payload.save)
    return {"status": "updated", "count": payload.count}

@app.get("/api/auth/status")
async def auth_status():
    """Check if client_secret.json exists and OAuth is configured."""
    has_credentials = os.path.exists("client_secret.json")
    current_config = bot.load_config()
    yt_cfg = current_config.get("youtube", {})
    is_oauth_connected = yt_cfg.get("fetch_method") == "oauth"
    oauth_creds = yt_cfg.get("oauth_credentials", {})
    has_refresh_token = bool(oauth_creds.get("refresh_token"))
    scopes = oauth_creds.get("scopes", [])
    has_mod_scopes = "https://www.googleapis.com/auth/youtube" in scopes
    fetch_interval = yt_cfg.get("fetch_interval", 60)
    return {
        "has_credentials": has_credentials,
        "is_connected": is_oauth_connected,
        "has_refresh_token": has_refresh_token,
        "has_mod_scopes": has_mod_scopes,
        "fetch_interval": fetch_interval,
        "streamer_bot_connected": bot.is_sb_connected,
        "redirect_uris": _get_required_redirect_uris()
    }

def _get_required_redirect_uris():
    """Auto-detect server IPs and return all required OAuth redirect URIs."""
    import socket
    scheme = "http"
    uris = [
        f"{scheme}://localhost:8000/api/auth/youtube/callback",
        f"{scheme}://localhost:8000/api/auth/sheets/callback"
    ]
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(('8.8.8.8', 80))
        lan_ip = s.getsockname()[0]
        s.close()
        nip_host = lan_ip.replace(".", "-") + ".nip.io"
        uris.append(f"{scheme}://{nip_host}:8000/api/auth/youtube/callback")
        uris.append(f"{scheme}://{nip_host}:8000/api/auth/sheets/callback")
    except Exception:
        pass
    return uris

@app.post("/api/auth/disconnect")
async def disconnect_auth():
    """Disconnect OAuth — remove credentials and reset fetch method."""
    try:
        current_config = bot.load_config()
        yt_cfg = current_config.get("youtube", {})
        
        # Remove OAuth credentials
        if "oauth_credentials" in yt_cfg:
            del yt_cfg["oauth_credentials"]
        
        # Reset fetch method to 'scrape' (default fallback)
        yt_cfg["fetch_method"] = "scrape"
        
        current_config["youtube"] = yt_cfg
        ConfigManager.save_config(current_config)
        
        return {"status": "success", "message": "YouTube OAuth disconnected."}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/auth/setup")
async def setup_auth(payload: Dict[str, Any]):
    """
    Saves the client_secret.json file from the dashboard.
    Accepts either:
      1. Simple { client_id, client_secret } fields (auto-generates full JSON)
      2. Legacy raw { client_secret_json: "..." } paste
    """
    client_id = payload.get("client_id")
    client_secret = payload.get("client_secret")
    client_secret_content = payload.get("client_secret_json")

    try:
        if client_id and client_secret:
            # Auto-construct the proper Google client_secret.json format
            # Detect server LAN IP for nip.io redirect URI
            import socket
            redirect_uris = [
                "http://localhost:8000/api/auth/youtube/callback",
                "http://localhost:8000/api/auth/sheets/callback"
            ]
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.settimeout(0.2)
                s.connect(('8.8.8.8', 80))
                lan_ip = s.getsockname()[0]
                s.close()
                nip_host = lan_ip.replace(".", "-") + ".nip.io"
                redirect_uris.append(f"http://{nip_host}:8000/api/auth/youtube/callback")
                redirect_uris.append(f"http://{nip_host}:8000/api/auth/sheets/callback")
            except Exception:
                pass
            
            data = {
                "web": {
                    "client_id": client_id.strip(),
                    "project_id": "pi-youtube-bot",
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "client_secret": client_secret.strip(),
                    "redirect_uris": redirect_uris
                }
            }
        elif client_secret_content:
            # Legacy: raw JSON paste
            if isinstance(client_secret_content, str):
                data = json.loads(client_secret_content)
            else:
                data = client_secret_content
            if "installed" not in data and "web" not in data:
                if "client_id" in data and "client_secret" in data:
                    data = {"web": data}
                else:
                    raise ValueError("Invalid format. Must contain client_id and client_secret.")
        else:
            raise HTTPException(400, "Provide client_id + client_secret, or client_secret_json.")

        # Write to file
        with open("client_secret.json", "w") as f:
            json.dump(data, f, indent=4)

        return {"status": "success", "message": "Credentials saved! You can now Sign In with Google."}

    except json.JSONDecodeError:
         raise HTTPException(400, "Invalid JSON format")
    except Exception as e:
        raise HTTPException(500, str(e))


import re
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

def _convert_ip_to_nip_io(host: str) -> str:
    """Convert IP-based hosts to nip.io domains for OAuth compatibility.
    Google OAuth rejects raw IP addresses as redirect URIs.
    e.g. '172.168.30.135:8000' -> '172-168-30-135.nip.io:8000'
    """
    # Split host and port
    if ":" in host:
        parts = host.rsplit(":", 1)
        hostname, port = parts[0], parts[1]
    else:
        hostname, port = host, None
    
    # Check if hostname is an IP address (not localhost)
    ip_pattern = re.compile(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$')
    if ip_pattern.match(hostname) and hostname != "127.0.0.1":
        nip_host = hostname.replace(".", "-") + ".nip.io"
        return f"{nip_host}:{port}" if port else nip_host
    
    return host

def _is_ssl_enabled():
    """Check if SSL certificates exist (server running HTTPS)."""
    # Disabled for now to enforce HTTP
    return False


@app.get("/api/auth/youtube/login")
async def login_youtube(request: Request):
    try:
        from backend.services.auth_service import AuthService
        # Load config to check for force_localhost
        current_config = bot.load_config()
        auth = AuthService(lambda: current_config)
        
        # Build redirect URI dynamically from the request
        host = request.headers.get("host", "localhost:8000")
        
        # Check if forced localhost redirect is enabled
        use_localhost = current_config.get("force_localhost_redirect", False)
        
        if use_localhost:
            host = "localhost:8000"
        else:
            host = _convert_ip_to_nip_io(host)  # Convert raw IPs to nip.io

        # Detect scheme: use http strictly
        scheme = "http"
        redirect_uri = f"{scheme}://{host}/api/auth/youtube/callback"
        
        url, state = auth.get_auth_url(redirect_uri=redirect_uri)
        return {"url": url, "redirect_uri": redirect_uri}
    except FileNotFoundError:
        return {"error": "Missing client_secret.json. Please add it to the bot folder."}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/auth/youtube/callback")
async def callback_youtube(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    import urllib.parse
    import traceback
    print(f">>> [OAuth Callback] HIT! code={code is not None}, state={state is not None}, error={error}")
    
    # Handle Google-side errors (user denied access, etc.)
    if error:
        return RedirectResponse(f"/settings?oauth=error&message={urllib.parse.quote(error)}")
    
    if not code:
        return RedirectResponse("/settings?oauth=error&message=No%20authorization%20code%20received")
    
    try:
        from backend.services.auth_service import AuthService
        # Load config
        current_config = bot.load_config()
        auth = AuthService(lambda: current_config)
        
        # Build redirect URI dynamically from the request (must match what was used in login)
        host = request.headers.get("host", "localhost:8000")
        
        # Check if forced localhost redirect is enabled
        use_localhost = current_config.get("force_localhost_redirect", False)
        
        if use_localhost:
            host = "localhost:8000"
        else:
            host = _convert_ip_to_nip_io(host)  # Convert raw IPs to nip.io

        # Detect scheme: use http strictly
        scheme = "http"
        redirect_uri = f"{scheme}://{host}/api/auth/youtube/callback"
        
        # Run in thread — exchange_code uses synchronous 'requests' library internally
        # which blocks the event loop and causes ERR_EMPTY_RESPONSE
        creds = await asyncio.to_thread(auth.exchange_code, code, redirect_uri)
        
        # Save credentials to config
        if "youtube" not in current_config: current_config["youtube"] = {}
        current_config["youtube"]["oauth_credentials"] = creds
        current_config["youtube"]["fetch_method"] = "oauth" # Switch to OAuth method
        ConfigManager.save_config(current_config)
        
        # Config is managed via ConfigManager — no module-level 'config' var needed

        return RedirectResponse("/settings?oauth=success") 
    except Exception as e:
        # Log full traceback to server console for debugging
        print(f">>> [OAuth Callback] ERROR: {e}")
        traceback.print_exc()
        
        error_msg = str(e)
        # Build the actual redirect URI for the error message
        host = request.headers.get("host", "localhost:8000")
        scheme = request.url.scheme
        actual_redirect = f"{scheme}://{host}/api/auth/youtube/callback"
        
        # Make common Google errors more user-friendly
        if "invalid_client" in error_msg:
            error_msg = "Invalid Client ID or Secret. Make sure you copied the OAuth CLIENT SECRET (starts with GOCSPX-), NOT the API Key (starts with AIza)."
        elif "redirect_uri_mismatch" in error_msg:
            error_msg = f"Redirect URI mismatch. Add {actual_redirect} as an Authorized Redirect URI in Google Cloud Console."
        elif "invalid_grant" in error_msg:
            error_msg = "Authorization code expired or already used. Please try signing in again."
        return RedirectResponse(f"/settings?oauth=error&message={urllib.parse.quote(error_msg)}")

# --- SHEETS AUTHENTICATION (SEPARATE ACCOUNT) ---
SHEETS_CLIENT_SECRET = "sheets_client_secret.json"

@app.post("/api/auth/sheets/setup")
async def setup_sheets_auth(payload: Dict[str, Any]):
    """
    Saves a separate client_secret.json for Google Sheets OAuth.
    Accepts { client_id, client_secret } for the Sheets-specific OAuth client.
    """
    client_id = payload.get("client_id")
    client_secret = payload.get("client_secret")
    
    if not client_id or not client_secret:
        raise HTTPException(400, "Provide both client_id and client_secret for your Sheets OAuth client.")
    
    try:
        import socket
        redirect_uris = ["http://localhost:8000/api/auth/sheets/callback"]
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.2)
            s.connect(('8.8.8.8', 80))
            lan_ip = s.getsockname()[0]
            s.close()
            nip_host = lan_ip.replace(".", "-") + ".nip.io"
            redirect_uris.append(f"http://{nip_host}:8000/api/auth/sheets/callback")
        except Exception:
            pass
        
        data = {
            "web": {
                "client_id": (client_id or "").strip(),
                "project_id": "pi-youtube-bot-sheets",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_secret": (client_secret or "").strip(),
                "redirect_uris": redirect_uris
            }
        }
        
        with open(SHEETS_CLIENT_SECRET, "w") as f:
            json.dump(data, f, indent=4)
        
        return {"status": "success", "message": "Sheets credentials saved! You can now connect Google Sheets."}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/auth/sheets/credentials-status")
async def sheets_credentials_status():
    """Check if sheets_client_secret.json exists."""
    return {
        "has_sheets_credentials": os.path.exists(SHEETS_CLIENT_SECRET),
        "has_youtube_credentials": os.path.exists("client_secret.json")
    }


@app.get("/api/auth/sheets/login")
async def login_sheets(request: Request):
    try:
        from backend.services.auth_service import AuthService
        current_config = bot.load_config()
        auth = AuthService(lambda: current_config)
        
        # Use separate client secret for Sheets if it exists, otherwise fall back
        sheets_secret = SHEETS_CLIENT_SECRET if os.path.exists(SHEETS_CLIENT_SECRET) else None
        
        # Build redirect URI dynamically
        host = request.headers.get("host", "localhost:8000")
        use_localhost = current_config.get("force_localhost_redirect", False)
        
        if use_localhost:
            host = "localhost:8000"
        else:
            host = _convert_ip_to_nip_io(host)

        scheme = "http"
        redirect_uri = f"{scheme}://{host}/api/auth/sheets/callback"
        
        # SPECIFIC SCOPES FOR SHEETS
        sheets_scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        
        url, state = auth.get_auth_url(redirect_uri=redirect_uri, scopes=sheets_scopes, client_secrets_file=sheets_secret)
        return RedirectResponse(url)
    except FileNotFoundError:
        return {"error": "Missing sheets_client_secret.json (or client_secret.json). Please add it to the bot folder."}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/auth/sheets/callback")
async def callback_sheets(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    import urllib.parse
    import traceback
    print(f">>> [Sheets OAuth Callback] HIT! code={code is not None}, state={state is not None}, error={error}")
    
    if error:
        return RedirectResponse(f"/settings?oauth_sheets=error&message={urllib.parse.quote(error)}")
    
    if not code:
        return RedirectResponse("/settings?oauth_sheets=error&message=No%20authorization%20code%20received")
    
    try:
        from backend.services.auth_service import AuthService
        current_config = bot.load_config()
        auth = AuthService(lambda: current_config)
        
        # Use separate client secret for Sheets if it exists
        sheets_secret = SHEETS_CLIENT_SECRET if os.path.exists(SHEETS_CLIENT_SECRET) else None
        
        host = request.headers.get("host", "localhost:8000")
        use_localhost = current_config.get("force_localhost_redirect", False)
        
        if use_localhost:
            host = "localhost:8000"
        else:
            host = _convert_ip_to_nip_io(host)

        scheme = "http"
        redirect_uri = f"{scheme}://{host}/api/auth/sheets/callback"
        
        sheets_scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        
        # Exchange code for tokens
        print(f">>> DEBUG: Calling auth.exchange_code with scopes={sheets_scopes}")
        try:
             creds = auth.exchange_code(code, redirect_uri, sheets_scopes, client_secrets_file=sheets_secret)
        except Exception as e:
             print(f">>> DEBUG: Error inside exchange_code call: {e}")
             raise e
        
        # Save credentials to config under 'google_sheets'
        if "google_sheets" not in current_config: current_config["google_sheets"] = {}
        current_config["google_sheets"]["oauth_credentials"] = creds
        current_config["google_sheets"]["enabled"] = True
        ConfigManager.save_config(current_config)
        
        # Config is managed via ConfigManager — no module-level 'config' var needed
        # Note: sheets_service needs to reload config to see this. It usually does on each connect call.

        return RedirectResponse("/settings?oauth_sheets=success") 
    except Exception as e:
        print(f">>> [Sheets OAuth Callback] ERROR: {e}")
        traceback.print_exc()
        return RedirectResponse(f"/settings?oauth_sheets=error&message={urllib.parse.quote(str(e))}")





# --- YOUTUBE MEMORY ENDPOINTS ---
from backend.services import youtube_memory

@app.get("/api/youtube-memory/users")
async def get_yt_memory_users():
    """List all YouTube users with message counts."""
    try:
        users = youtube_memory.get_all_users()
        return {"users": users}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/youtube-memory/user/{username}")
async def get_yt_memory_user(username: str, limit: int = 50):
    """Get conversation history for a specific user."""
    try:
        messages = youtube_memory.get_user_messages(username, limit)
        return {"user": username, "messages": messages, "count": len(messages)}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/api/youtube-memory/user/{username}")
async def delete_yt_memory_user(username: str):
    """Delete all history for a user."""
    try:
        deleted = youtube_memory.delete_user_history(username)
        return {"status": "success", "deleted": deleted}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/youtube-memory/stats")
async def get_yt_memory_stats():
    """Get YouTube memory statistics."""
    try:
        return youtube_memory.get_memory_stats()
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/youtube-memory/cleanup")
async def trigger_yt_memory_cleanup():
    """Manually trigger cleanup of messages older than 7 days."""
    try:
        yt_deleted = youtube_memory.cleanup_old_messages(7)
        brain_deleted = bot.brain.cleanup_old_chats(7)
        return {
            "status": "success",
            "youtube_deleted": yt_deleted,
            "brain_deleted": brain_deleted,
            "message": f"Cleaned up {yt_deleted + brain_deleted} old messages"
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ---------------------------------------------------------------------------

@app.get("/api/chat/logs")
async def get_chat_logs(n: int = 50):
    """Return the last N chat messages from YouTube Memory."""
    try:
        # Get all users' recent messages combined
        all_users = youtube_memory.get_all_users()
        all_msgs = []
        for u in all_users:
            msgs = youtube_memory.get_user_messages(u["user"], limit=n)
            all_msgs.extend(msgs)
        # Sort by timestamp desc, take top N
        all_msgs.sort(key=lambda m: m.get("timestamp", 0), reverse=True)
        return all_msgs[:n]
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/chat/logs/stats")
async def get_chat_log_stats():
    """Return chat session stats from YouTube Memory."""
    try:
        return youtube_memory.get_memory_stats()
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/chat/logs/files")
async def list_chat_log_files():
    """Deprecated — YouTube Memory uses SQLite, no file list."""
    return {"files": [], "note": "Migrated to YouTube Memory (SQLite)"}


@app.get("/api/chat/logs/export")
async def export_chat_logs_csv():
    """Export YouTube Memory as CSV."""
    import csv
    import tempfile
    try:
        all_users = youtube_memory.get_all_users()
        all_msgs = []
        for u in all_users:
            all_msgs.extend(youtube_memory.get_user_messages(u["user"], limit=500))
        all_msgs.sort(key=lambda m: m.get("timestamp", 0))

        if not all_msgs:
            raise HTTPException(404, "No messages in YouTube Memory.")

        from fastapi.responses import FileResponse as FR
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, newline='')
        writer = csv.writer(tmp)
        writer.writerow(["timestamp", "user", "message", "ai_reply"])
        for m in all_msgs:
            from datetime import datetime
            ts = datetime.fromtimestamp(m.get("timestamp", 0)).strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow([ts, m.get("user", ""), m.get("message", ""), m.get("ai_reply", "")])
        tmp.close()
        return FR(tmp.name, media_type="text/csv", filename="youtube_memory_export.csv")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# --- BACKUP SYSTEM ---
import zipfile
import shutil
import tempfile
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse
import io

_PROJECT_ROOT_BACKUP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files and directories to include in a backup zip
_BACKUP_FILES = [
    "config.json",
    "client_secret.json",
    "sheets_client_secret.json",
    "service_account.json",
    ".env",
    ".env.bak",
    "viewers.json",
    "viewers.json.bak",
    "viewers.db",
    "subscriber_count.json",
]
_BACKUP_DIRS = [
    "data",
]

def _get_backups_dir() -> str:
    d = os.path.join(_PROJECT_ROOT_BACKUP, "backups")
    os.makedirs(d, exist_ok=True)
    return d

def _create_backup_zip(buf: io.BytesIO):
    """Write all backed-up files/dirs into buf as a zip archive."""
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in _BACKUP_FILES:
            fpath = os.path.join(_PROJECT_ROOT_BACKUP, fname)
            if os.path.exists(fpath):
                zf.write(fpath, fname)
        for dname in _BACKUP_DIRS:
            dpath = os.path.join(_PROJECT_ROOT_BACKUP, dname)
            if os.path.isdir(dpath):
                for root, _, files in os.walk(dpath):
                    for f in files:
                        abs_f = os.path.join(root, f)
                        rel_f = os.path.relpath(abs_f, _PROJECT_ROOT_BACKUP)
                        zf.write(abs_f, rel_f)

def _restore_backup_zip(zip_bytes: bytes):
    """Extract a backup zip back to the project root."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        for member in zf.namelist():
            # Only allow whitelisted paths for security
            safe = any(
                member == f or member.startswith(d + "/") or member.startswith(d + "\\")
                for f in _BACKUP_FILES
                for d in _BACKUP_DIRS
                # also allow the directory entries themselves
            ) or any(
                member.startswith(d + "/") or member.startswith(d + "\\")
                for d in _BACKUP_DIRS
            ) or member in _BACKUP_FILES
            if safe:
                dest = os.path.join(_PROJECT_ROOT_BACKUP, member)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with zf.open(member) as src, open(dest, "wb") as dst:
                    dst.write(src.read())

@app.get("/api/backup/export")
async def backup_export():
    """Download a full backup of all critical files as a zip."""
    try:
        buf = io.BytesIO()
        _create_backup_zip(buf)
        buf.seek(0)
        ts = time.strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"pi-bot-backup-{ts}.zip"
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.exception("Backup export failed")
        raise HTTPException(500, f"Backup failed: {e}")

@app.post("/api/backup/save")
async def backup_save(payload: Dict[str, Any]):
    """Save a named backup to the server-side backups/ directory."""
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Backup name is required")
    # Sanitize name
    name = re.sub(r"[^a-zA-Z0-9_\-]", "_", name)
    try:
        buf = io.BytesIO()
        _create_backup_zip(buf)
        ts = time.strftime("%Y-%m-%d_%H-%M-%S")
        filename = f"{name}_{ts}.zip"
        dest = os.path.join(_get_backups_dir(), filename)
        with open(dest, "wb") as f:
            f.write(buf.getvalue())
        return {"status": "saved", "filename": filename}
    except Exception as e:
        logger.exception("Backup save failed")
        raise HTTPException(500, f"Save failed: {e}")

@app.get("/api/backup/list")
async def backup_list():
    """List all server-side saved backups."""
    try:
        d = _get_backups_dir()
        backups = []
        for fname in sorted(os.listdir(d), reverse=True):
            if fname.endswith(".zip"):
                fpath = os.path.join(d, fname)
                stat = os.stat(fpath)
                backups.append({
                    "filename": fname,
                    "size_bytes": stat.st_size,
                    "created_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
                })
        return {"backups": backups}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/backup/restore/{filename}")
async def backup_restore(filename: str):
    """Restore a saved server-side backup by filename."""
    # Sanitize and validate
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid filename")
    fpath = os.path.join(_get_backups_dir(), filename)
    if not os.path.exists(fpath):
        raise HTTPException(404, f"Backup '{filename}' not found")
    try:
        with open(fpath, "rb") as f:
            _restore_backup_zip(f.read())
        # Reload config after restore
        ConfigManager.get_config(force_reload=True)
        # Close SQLite database connections & reload memory
        bot.viewers.reload()
        bot.brain.close_conn()
        from backend.services import youtube_memory
        youtube_memory.close_conn()
        return {"status": "restored", "filename": filename}
    except Exception as e:
        logger.exception("Backup restore failed")
        raise HTTPException(500, f"Restore failed: {e}")

@app.delete("/api/backup/delete/{filename}")
async def backup_delete(filename: str):
    """Delete a saved server-side backup."""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid filename")
    fpath = os.path.join(_get_backups_dir(), filename)
    if not os.path.exists(fpath):
        raise HTTPException(404, f"Backup '{filename}' not found")
    os.remove(fpath)
    return {"status": "deleted", "filename": filename}

@app.post("/api/backup/import")
async def backup_import(file: UploadFile = File(...)):
    """Upload a backup zip file and restore it immediately."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(400, "Only .zip backup files are supported")
    try:
        contents = await file.read()
        _restore_backup_zip(contents)
        ConfigManager.get_config(force_reload=True)
        # Close SQLite database connections & reload memory
        bot.viewers.reload()
        bot.brain.close_conn()
        from backend.services import youtube_memory
        youtube_memory.close_conn()
        return {"status": "imported", "filename": file.filename}
    except Exception as e:
        logger.exception("Backup import failed")
        raise HTTPException(500, f"Import failed: {e}")

from fastapi import UploadFile, File

@app.post("/api/upload/qr")
async def upload_qr(file: UploadFile = File(...)):
    """Upload a custom QR code for the rotating OBS widget."""
    if not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
        raise HTTPException(400, "Unsupported image format")
    try:
        # Save to data/uploads
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        uploads_dir = os.path.join(project_root, "data", "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        
        # Use a fixed filename so it overwrites the old one
        ext = os.path.splitext(file.filename)[1]
        filename = f"custom_qr{ext}"
        filepath = os.path.join(uploads_dir, filename)
        
        contents = await file.read()
        with open(filepath, "wb") as f:
            f.write(contents)
            
        # Update config with the path
        cfg = ConfigManager.get_config(force_reload=True)
        if "tip_page" not in cfg:
            cfg["tip_page"] = {}
        cfg["tip_page"]["custom_qr_path"] = f"/uploads/{filename}"
        ConfigManager.save_config(cfg)
        
        return {"status": "uploaded", "path": f"/uploads/{filename}"}
    except Exception as e:
        logger.exception("QR upload failed")
        raise HTTPException(500, f"Upload failed: {e}")

class PiClientManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error broadcasting to Pi client: {e}")

pi_clients = PiClientManager()
bot.pi_clients = pi_clients

@app.websocket("/ws/pi-client")
async def websocket_pi_client_endpoint(websocket: WebSocket):
    # Security Token Check
    cfg = _get_config()
    secret = cfg.get("security", {}).get("webhook_secret")
    if secret:
        token = websocket.query_params.get("token")
        if token != secret:
            logger.warning("Pi client WebSocket connection rejected: Invalid Token")
            await websocket.close(code=1008, reason="Unauthorized")
            return
            
    await pi_clients.connect(websocket)
    logger.info("Pi client connected successfully!")
    try:
        while True:
            # We don't expect messages from the Pi, but we keep the connection open
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        pi_clients.disconnect(websocket)
        logger.info("Pi client disconnected.")
    except Exception as e:
        pi_clients.disconnect(websocket)
        logger.error(f"Pi client error: {e}")

# --- FRONTEND STATIC SERVING ---
# Order matters: API/WS routes are defined above.
# Mount /assets specifically for static files (JS/CSS)
# Use absolute path so it works from any working directory (e.g. systemd)
import pathlib as _pathlib
PROJECT_ROOT = _pathlib.Path(__file__).parent.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

if FRONTEND_DIST.exists():
    assets_path = str(FRONTEND_DIST / "assets")
    print(f">>> [API] Mounting Assets from: {assets_path}")
    from fastapi.staticfiles import StaticFiles
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    # Mount uploads directory
    uploads_dir = PROJECT_ROOT / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # 1. Block API/WS shadowing
        if full_path and (full_path.startswith("api") or full_path.startswith("ws")):
             # If it's a 404 on API, don't serve HTML
            return Response(status_code=404)
        
        # 2. Check if specific file exists in dist (favicon.ico, vite.svg, etc)
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))

        # 3. Default to index.html for everything else (SPA)
        response = FileResponse(str(FRONTEND_DIST / "index.html"))
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
else:
    @app.get("/{full_path:path}")
    async def no_dist_error(full_path: str):
        return Response(content="Frontend 'dist' not found. Run 'cd frontend && npm run build'.", status_code=502)


