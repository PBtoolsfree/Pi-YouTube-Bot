"""
Pi YouTube Bot — Entry Point
Starts the FastAPI server with proper logging and config.
"""
import gc
import os
import sys
import json
import logging
import logging.handlers

# ── GC tuning for Raspberry Pi 4 (4 GB RAM) ───────────────────────────────
# Raise thresholds to reduce GC pause frequency on a long-running bot.
gc.set_threshold(50000, 50, 10)

# ── Load .env FIRST (before any config reads) ─────────────────────────────
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(_env_path):
        load_dotenv(_env_path, override=False)  # override=False: OS env vars win
        # Don't log here — logging not set up yet
except ImportError:
    pass  # python-dotenv not installed; secrets must be set as real env vars

if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def _setup_logging() -> None:
    """Configure structured logging with timestamps and levels."""
    log_fmt = "[%(levelname)-8s] %(asctime)s  %(name)s — %(message)s"
    date_fmt = "%Y-%m-%d %H:%M:%S"

    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter(log_fmt, date_fmt))

    # Rotating file handler (10 MB × 5 backups)
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)
    file_handler = logging.handlers.RotatingFileHandler(
        os.path.join(log_dir, "pibot.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(log_fmt, date_fmt))

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(console)
    root_logger.addHandler(file_handler)

    # Quieten noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def _load_server_config() -> tuple:
    """Read host/port from config.json with env-var overrides.
    Priority: ENV VAR > config.json > defaults
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(current_dir, "config.json")

    host = "0.0.0.0"
    port = 8000

    if not os.path.exists(config_path):
        config_path = "config.json"  # CWD fallback

    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as fh:
                cfg = json.load(fh)
            host = cfg.get("server", {}).get("host", host)
            port = int(cfg.get("server", {}).get("port", port))
        except (json.JSONDecodeError, OSError, ValueError) as exc:
            logging.warning("Could not read server config: %s — using defaults", exc)

    # Env vars take precedence over config.json
    host = os.environ.get("HOST", host)
    port = int(os.environ.get("PORT", port))

    return host, port


def _read_version() -> str:
    version_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "VERSION")
    if os.path.exists(version_file):
        with open(version_file, encoding="utf-8") as fh:
            return fh.read().strip()
    return "unknown"


if __name__ == "__main__":
    import uvicorn
    from backend.config_manager import ConfigManager

    _setup_logging()

    log = logging.getLogger("main")
    version = _read_version()
    log.info("=" * 60)
    log.info("  Pi YouTube Bot  v%s", version)
    log.info("  Starting on Raspberry Pi / local machine")
    log.info("=" * 60)

    # Validate config at startup — warns about missing required keys
    try:
        warnings = ConfigManager.validate_config()
        if warnings:
            log.warning("Config warnings (%d):", len(warnings))
            for w in warnings:
                log.warning("  ⚠  %s", w)
        else:
            log.info("Config validated: OK")
    except Exception as exc:
        log.warning("Config validation skipped: %s", exc)

    host, port = _load_server_config()
    log.info("Server config: host=%s  port=%d", host, port)

    # Confirm .env loaded
    if os.path.exists(".env"):
        log.info("Environment: .env loaded")
    else:
        log.info("Environment: no .env file (using OS env vars or config.json)")

    uvicorn.run(
        "backend.api:app",
        host=host,
        port=port,
        reload=False,          # NEVER use reload=True in production (CPU hog on Pi)
        log_level="warning",   # Let our own logging handle verbosity
        access_log=False,      # Reduces noise; our middleware logs what matters
    )
