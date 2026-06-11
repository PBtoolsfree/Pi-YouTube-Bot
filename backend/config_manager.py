import copy
import json
import os
import time
import logging
import threading
from typing import Any, Dict, List, Optional

# Load .env if present (before any config reads)
try:
    from dotenv import load_dotenv
    load_dotenv(override=False)
except ImportError:
    pass

logger = logging.getLogger(__name__)

# ── Required config keys with their dotted paths ──────────────────────────────
_REQUIRED_KEYS: List[str] = []  # Extend as needed, e.g. ["youtube.channel_id"]

_SENSITIVE_ENV_MAP: Dict[str, str] = {
    # config key path → env var name
    "ai_topology.providers": None,  # handled individually
}


class ConfigManager:
    """
    Thread-safe singleton config manager.

    - Reads config.json from project root (resolved relative to this file).
    - Caches the config and reloads only when file is modified.
    - Merges environment variables over config values.
    - Provides startup validation.
    """

    _instance: Optional["ConfigManager"] = None
    _config_cache: Optional[Dict[str, Any]] = None
    _last_load_time: float = 0.0
    _file_mtime: float = 0.0
    _config_path: str = "config.json"
    _lock: threading.Lock = threading.Lock()

    # ── Singleton Factory ──────────────────────────────────────────────────────

    @classmethod
    def get_instance(cls) -> "ConfigManager":
        if cls._instance is None:
            cls._instance = ConfigManager()
        return cls._instance

    # ── Constructor ────────────────────────────────────────────────────────────

    def __init__(self) -> None:
        if ConfigManager._instance is not None:
            return  # Silently return — callers should use get_instance()

        ConfigManager._instance = self

        # Resolve project root from this file:
        #   backend/config_manager.py → parent = backend → parent = project root
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(backend_dir)

        candidates = [
            os.path.join(project_root, "config.json"),
            os.path.join(os.getcwd(), "config.json"),
        ]
        for path in candidates:
            if os.path.exists(path):
                ConfigManager._config_path = path
                logger.debug("Config path resolved: %s", path)
                break
        else:
            logger.warning(
                "config.json not found in any search path. Searched: %s",
                candidates,
            )
            ConfigManager._config_path = candidates[0]

    # ── Public API ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_config(force_reload: bool = False) -> Dict[str, Any]:
        """Return a **deep copy** of the cached configuration dict.

        Callers receive their own independent copy, so mutating the
        returned dict will never corrupt the shared cache.  This
        eliminates the race condition where two concurrent callers
        modify the same dict and one overwrites the other's changes.
        """
        now = time.time()

        # Fast-path: return copy of cache if fresh (< 10 s old — optimised for Pi SD-card I/O)
        if (
            not force_reload
            and ConfigManager._config_cache is not None
            and (now - ConfigManager._last_load_time < 10)
        ):
            return copy.deepcopy(ConfigManager._config_cache)

        with ConfigManager._lock:
            # Double-check after acquiring lock (another thread may have reloaded)
            now = time.time()
            if (
                not force_reload
                and ConfigManager._config_cache is not None
                and (now - ConfigManager._last_load_time < 10)
            ):
                return copy.deepcopy(ConfigManager._config_cache)

            try:
                if not os.path.exists(ConfigManager._config_path):
                    logger.error("config.json not found at: %s", ConfigManager._config_path)
                    cache = ConfigManager._config_cache or {}
                    return copy.deepcopy(cache)

                mtime = os.path.getmtime(ConfigManager._config_path)

                if (
                    force_reload
                    or ConfigManager._config_cache is None
                    or mtime > ConfigManager._file_mtime
                ):
                    with open(ConfigManager._config_path, "r", encoding="utf-8") as fh:
                        new_cfg = json.load(fh)

                    ConfigManager._config_cache = new_cfg
                    ConfigManager._file_mtime = mtime
                    logger.debug("Config loaded/reloaded from disk.")

            except json.JSONDecodeError:
                logger.error(
                    "config.json contains invalid JSON — keeping last known good config."
                )
            except OSError as exc:
                logger.error("Failed to read config.json: %s", exc)
            finally:
                ConfigManager._last_load_time = time.time()

        return copy.deepcopy(ConfigManager._config_cache or {})

    @staticmethod
    def save_config(new_config: Dict[str, Any]) -> bool:
        """Atomically save configuration to disk (thread-safe)."""
        with ConfigManager._lock:
            try:
                tmp_path = ConfigManager._config_path + ".tmp"
                with open(tmp_path, "w", encoding="utf-8") as fh:
                    json.dump(new_config, fh, indent=4, ensure_ascii=False)

                # Atomic replace
                os.replace(tmp_path, ConfigManager._config_path)

                # Store a deep copy so the caller can't mutate our cache
                ConfigManager._config_cache = copy.deepcopy(new_config)
                ConfigManager._file_mtime = os.path.getmtime(ConfigManager._config_path)
                ConfigManager._last_load_time = time.time()
                logger.info("Config saved successfully.")
                return True
            except OSError as exc:
                logger.error("Error saving config: %s", exc)
                # Clean up temp file if it exists
                try:
                    if os.path.exists(ConfigManager._config_path + ".tmp"):
                        os.remove(ConfigManager._config_path + ".tmp")
                except OSError:
                    pass
                return False

    @staticmethod
    def validate_config() -> list:
        """
        Validate config at startup. Disables features with missing required configs in memory.
        Returns a list of warning strings (empty list = all OK).
        """
        cfg = ConfigManager.get_config()
        warnings = []
        needs_memory_update = False

        # 1. Check strict required keys (if any critical enough to fail completely)
        for key_path in _REQUIRED_KEYS:
            value = cfg
            for part in key_path.split("."):
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    value = None
                    break
            if not value:
                msg = f"CRITICAL: Required key '{key_path}' is missing or empty."
                logger.error("Config validation FAILED: %s", msg)
                warnings.append(msg)
                # If a truly critical key is missing, we might want to raise an exception here
                # to trigger the systemd restart. For now, we rely on api.py to handle warnings.

        # AI Providers
        if cfg.get("ai_topology", {}).get("enabled", False):
            providers = cfg["ai_topology"].get("providers", {})
            has_valid_provider = False
            for p, pcfg in providers.items():
                if pcfg.get("enabled") and pcfg.get("api_key"):
                    has_valid_provider = True
                    break
            if not has_valid_provider:
                msg = "AI enabled but no valid provider with an 'api_key' found. Disabling AI in memory."
                logger.warning(msg)
                warnings.append(msg)
                cfg["ai_topology"]["enabled"] = False
                needs_memory_update = True

        # Audio / TTS
        if cfg.get("audio", {}).get("enabled", False):
            udp_mode = cfg["audio"].get("udp_mode", "push")
            gaming_ip = cfg["audio"].get("gaming_pc_ip")
            if udp_mode == "push" and not gaming_ip:
                msg = "Audio enabled in 'push' mode but 'gaming_pc_ip' missing. Disabling audio in memory."
                logger.warning(msg)
                warnings.append(msg)
                cfg["audio"]["enabled"] = False
                needs_memory_update = True

        # YouTube
        if cfg.get("youtube", {}).get("enabled", True):
            if not cfg["youtube"].get("channel_id"):
                msg = "YouTube enabled but 'channel_id' missing. Bot may fail to moderate/sync."
                logger.warning(msg)
                warnings.append(msg)
                # Not disabling entirely as chat might still work via Streamer.bot

        # Apply memory update if features were gracefully disabled
        if needs_memory_update:
            with ConfigManager._lock:
                # Update cache without writing to disk
                if ConfigManager._config_cache is not None:
                    ConfigManager._config_cache = copy.deepcopy(cfg)
            logger.info("Disabled missing features in memory.")

        if not warnings:
            logger.info("Config validation passed.")
        return warnings
