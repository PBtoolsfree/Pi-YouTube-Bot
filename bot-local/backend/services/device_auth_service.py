"""
PB HERO Smart Donation System - Device Authentication & Security Service
Manages device pairing, HMAC-SHA256 request verification, timestamp validation,
and replay protection for PB HERO Notification Bridge Android devices.
"""

import os
import json
import time
import hmac
import hashlib
import secrets
import logging
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

DEVICES_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "bridge_devices.json")


class DeviceAuthService:
    def __init__(self, data_file: str = DEVICES_FILE):
        self.data_file = os.path.abspath(data_file)
        self.devices: Dict[str, Dict[str, Any]] = {}
        self.processed_events: Dict[str, float] = {}  # event_id -> timestamp (for replay prevention)
        self._load()

    def _load(self):
        try:
            if os.path.exists(self.data_file):
                with open(self.data_file, "r", encoding="utf-8") as f:
                    self.devices = json.load(f)
                logger.info(f"[DeviceAuth] Loaded {len(self.devices)} registered devices.")
            else:
                self.devices = {}
                self._save()
        except Exception as e:
            logger.error(f"[DeviceAuth] Error loading devices file: {e}")
            self.devices = {}

    def _save(self):
        try:
            os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
            with open(self.data_file, "w", encoding="utf-8") as f:
                json.dump(self.devices, f, indent=2)
        except Exception as e:
            logger.error(f"[DeviceAuth] Error saving devices file: {e}")

    def register_device(self, device_id: str, device_name: str = "Android Device", admin_token: Optional[str] = None) -> Dict[str, Any]:
        """
        Registers a new device or rotates credentials for an existing device.
        Returns the provisioned secret_key to be securely stored in Android Keystore.
        """
        if not device_id or len(device_id.strip()) < 3:
            device_id = f"PBH-ANDROID-{secrets.token_hex(4).upper()}"

        secret_key = secrets.token_hex(32)  # 256-bit secret
        now = time.time()

        device_info = {
            "device_id": device_id,
            "device_name": device_name,
            "secret_key": secret_key,
            "created_at": now,
            "last_seen": now,
            "is_active": True,
            "delivery_count": 0
        }

        self.devices[device_id] = device_info
        self._save()
        logger.info(f"[DeviceAuth] Registered device {device_id} ({device_name})")
        return device_info

    def get_device(self, device_id: str) -> Optional[Dict[str, Any]]:
        return self.devices.get(device_id)

    def list_devices(self) -> list:
        # Strip secret_key in admin listing for safety
        results = []
        for dev in self.devices.values():
            results.append({
                "device_id": dev["device_id"],
                "device_name": dev.get("device_name", "Android"),
                "created_at": dev.get("created_at"),
                "last_seen": dev.get("last_seen"),
                "is_active": dev.get("is_active", True),
                "delivery_count": dev.get("delivery_count", 0),
                "secret_preview": dev.get("secret_key", "")[:8] + "..." if dev.get("secret_key") else ""
            })
        return results

    def verify_request(
        self,
        device_id: str,
        timestamp_str: str,
        signature: str,
        raw_body: bytes,
        event_id: Optional[str] = None,
        max_skew_seconds: int = 300
    ) -> Tuple[bool, str]:
        """
        Verifies:
        1. Device is registered and active
        2. Timestamp is within max_skew_seconds (default 5 minutes)
        3. Event has not been previously processed (replay protection)
        4. HMAC-SHA256 signature matches expected digest
        """
        device = self.devices.get(device_id)
        if not device:
            return False, f"Device '{device_id}' is not registered."

        if not device.get("is_active", True):
            return False, f"Device '{device_id}' is deactivated."

        # 1. Timestamp validation
        try:
            req_ts = float(timestamp_str)
        except (ValueError, TypeError):
            return False, "Invalid timestamp format."

        current_ts = time.time()
        if abs(current_ts - req_ts) > max_skew_seconds:
            return False, f"Request timestamp expired or skewed (server: {int(current_ts)}, request: {int(req_ts)})."

        # 2. Replay check via event_id
        if event_id:
            if event_id in self.processed_events:
                return False, f"Duplicate event '{event_id}' has already been processed."

        # 3. HMAC-SHA256 signature verification
        # Payload string = f"{device_id}:{timestamp_str}:{raw_body.decode('utf-8', errors='replace')}"
        secret = device["secret_key"].encode("utf-8")
        msg = f"{device_id}:{timestamp_str}:".encode("utf-8") + raw_body
        expected_sig = hmac.new(secret, msg, hashlib.sha256).hexdigest()

        if not hmac.compare_digest(expected_sig.lower(), signature.strip().lower()):
            return False, "Invalid HMAC signature."

        # Passed all checks - update device metrics
        device["last_seen"] = current_ts
        device["delivery_count"] = device.get("delivery_count", 0) + 1
        self._save()

        if event_id:
            self.processed_events[event_id] = current_ts
            # Cleanup old events past 24 hours
            if len(self.processed_events) > 10000:
                cutoff = current_ts - 86400
                self.processed_events = {k: v for k, v in self.processed_events.items() if v > cutoff}

        return True, "Valid"


# Global singleton instance
device_auth_service = DeviceAuthService()
