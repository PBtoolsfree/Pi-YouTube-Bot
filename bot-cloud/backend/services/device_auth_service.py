"""
PB HERO Smart Donation System - Dual Security & Device Authentication Service
Manages:
1. Website Integration Secret Keys (for Tip Page backend signing)
2. Android Device Pairing & Device-Specific Credentials (for PB HERO Notification Bridge)
3. 5-minute Single-Use Pairing Sessions with QR codes
4. Replay protection, timestamp skew validation, and HMAC-SHA256 signature checks
5. Security Audit Logging (never storing raw secret values)
"""

import os
import json
import time
import hmac
import hashlib
import secrets
import logging
from typing import Dict, Any, Optional, Tuple, List

logger = logging.getLogger(__name__)

DEVICES_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "bridge_devices.json")
WEBSITE_KEY_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "website_security.json")
AUDIT_LOG_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "security_audit.json")


class DeviceAuthService:
    def __init__(
        self,
        devices_file: str = DEVICES_FILE,
        website_key_file: str = WEBSITE_KEY_FILE,
        audit_file: str = AUDIT_LOG_FILE,
        data_file: Optional[str] = None
    ):
        self.devices_file = os.path.abspath(data_file or devices_file)
        self.website_key_file = os.path.abspath(website_key_file)
        self.audit_file = os.path.abspath(audit_file)

        self.devices: Dict[str, Dict[str, Any]] = {}
        self.website_key_data: Dict[str, Any] = {}
        self.pairing_sessions: Dict[str, Dict[str, Any]] = {}  # pairing_code -> session info
        self.processed_events: Dict[str, float] = {}  # event_id -> timestamp (replay prevention)

        self._load_all()

    def _load_all(self):
        self._load_devices()
        self._load_website_key()

    def _load_devices(self):
        try:
            if os.path.exists(self.devices_file):
                with open(self.devices_file, "r", encoding="utf-8") as f:
                    self.devices = json.load(f)
                logger.info(f"[DeviceAuth] Loaded {len(self.devices)} registered devices.")
            else:
                self.devices = {}
                self._save_devices()
        except Exception as e:
            logger.error(f"[DeviceAuth] Error loading devices file: {e}")
            self.devices = {}

    def _save_devices(self):
        try:
            os.makedirs(os.path.dirname(self.devices_file), exist_ok=True)
            with open(self.devices_file, "w", encoding="utf-8") as f:
                json.dump(self.devices, f, indent=2)
        except Exception as e:
            logger.error(f"[DeviceAuth] Error saving devices file: {e}")

    def _load_website_key(self):
        try:
            if os.path.exists(self.website_key_file):
                with open(self.website_key_file, "r", encoding="utf-8") as f:
                    self.website_key_data = json.load(f)
            else:
                self.website_key_data = {
                    "active_key": None,
                    "history": []
                }
                self._save_website_key()
        except Exception as e:
            logger.error(f"[DeviceAuth] Error loading website key file: {e}")
            self.website_key_data = {"active_key": None, "history": []}

    def _save_website_key(self):
        try:
            os.makedirs(os.path.dirname(self.website_key_file), exist_ok=True)
            with open(self.website_key_file, "w", encoding="utf-8") as f:
                json.dump(self.website_key_data, f, indent=2)
        except Exception as e:
            logger.error(f"[DeviceAuth] Error saving website key file: {e}")

    def log_audit(self, event_type: str, details: Dict[str, Any], actor: str = "Admin", status: str = "SUCCESS"):
        """Records a timestamped security audit entry without raw secret data."""
        entry = {
            "timestamp": time.time(),
            "time_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
            "event_type": event_type,
            "actor": actor,
            "status": status,
            "details": details
        }
        try:
            os.makedirs(os.path.dirname(self.audit_file), exist_ok=True)
            logs = []
            if os.path.exists(self.audit_file):
                with open(self.audit_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            logs.insert(0, entry)
            # Retain last 500 audit entries
            logs = logs[:500]
            with open(self.audit_file, "w", encoding="utf-8") as f:
                json.dump(logs, f, indent=2)
        except Exception as e:
            logger.error(f"[DeviceAuth] Error writing audit log: {e}")

    def get_audit_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            if os.path.exists(self.audit_file):
                with open(self.audit_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
                return logs[:limit]
        except Exception:
            pass
        return []

    # =========================================================================
    # 1. WEBSITE INTEGRATION KEY MANAGEMENT (Tip Page Backend <-> Cloud)
    # =========================================================================

    def generate_website_key(self, actor: str = "Admin") -> Dict[str, Any]:
        """
        Generates a 256-bit secure Website Integration Secret Key.
        Only a SHA-256 hash/verifier is stored persistently.
        The plaintext secret is returned ONCE to the administrator.
        """
        raw_secret = "pbh_web_" + secrets.token_hex(32)  # 256 bits of entropy
        key_id = f"PBH-WEB-{secrets.token_hex(4).upper()}"
        key_hash = hashlib.sha256(raw_secret.encode("utf-8")).hexdigest()
        now = time.time()
        # Default 90 days validity (or configurable)
        expires_at = now + (90 * 86400)

        # Archive current key if active
        if self.website_key_data.get("active_key"):
            old = self.website_key_data["active_key"]
            old["status"] = "ROTATED"
            old["rotated_at"] = now
            self.website_key_data.setdefault("history", []).insert(0, old)

        key_info = {
            "key_id": key_id,
            "key_hash": key_hash,
            "key_preview": raw_secret[:12] + "..." + raw_secret[-6:],
            "created_at": now,
            "expires_at": expires_at,
            "last_used": None,
            "is_active": True,
            "status": "ACTIVE",
            "permissions": ["tip_page", "donation_intents"]
        }

        self.website_key_data["active_key"] = key_info
        self._save_website_key()

        self.log_audit(
            event_type="WEBSITE_KEY_GENERATED",
            details={"key_id": key_id, "key_preview": key_info["key_preview"]},
            actor=actor
        )

        # Return full raw_secret only once!
        return {
            "key_id": key_id,
            "secret_key": raw_secret,  # One-time disclosure
            "key_preview": key_info["key_preview"],
            "created_at": now,
            "expires_at": expires_at,
            "status": "ACTIVE"
        }

    def rotate_website_key(self, actor: str = "Admin") -> Dict[str, Any]:
        """Rotates the active website key, revoking previous credentials immediately."""
        now = time.time()
        old_id = self.website_key_data.get("active_key", {}).get("key_id", "none")
        res = self.generate_website_key(actor=actor)
        self.log_audit(
            event_type="WEBSITE_KEY_ROTATED",
            details={"old_key_id": old_id, "new_key_id": res["key_id"]},
            actor=actor
        )
        return res

    def revoke_website_key(self, actor: str = "Admin") -> bool:
        """Revokes the active website key immediately."""
        active = self.website_key_data.get("active_key")
        if not active:
            return False
        active["is_active"] = False
        active["status"] = "REVOKED"
        active["revoked_at"] = time.time()
        self._save_website_key()
        self.log_audit(
            event_type="WEBSITE_KEY_REVOKED",
            details={"key_id": active["key_id"]},
            actor=actor
        )
        return True

    def get_website_key_status(self) -> Dict[str, Any]:
        """Returns safe metadata about the website key without raw secret."""
        active = self.website_key_data.get("active_key")
        if not active:
            return {
                "has_key": False,
                "status": "INACTIVE",
                "message": "No Website Integration Key has been generated yet."
            }

        now = time.time()
        is_expired = active.get("expires_at") and now > active["expires_at"]
        status = "EXPIRED" if is_expired else ("ACTIVE" if active.get("is_active") else "REVOKED")

        return {
            "has_key": True,
            "key_id": active.get("key_id"),
            "key_preview": active.get("key_preview"),
            "status": status,
            "is_active": (status == "ACTIVE"),
            "created_at": active.get("created_at"),
            "expires_at": active.get("expires_at"),
            "last_used": active.get("last_used"),
            "permissions": active.get("permissions", ["tip_page"])
        }

    def verify_website_request(self, token_or_key: str) -> Tuple[bool, str]:
        """
        Validates a Website Integration Key from the Tip Page backend.
        Rejects revoked, expired, or non-matching keys.
        """
        active = self.website_key_data.get("active_key")
        if not active:
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "No website key configured"}, status="FAILED")
            return False, "No active Website Key configured on Cloud Bot."

        if not active.get("is_active"):
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Website key revoked", "key_id": active.get("key_id")}, status="FAILED")
            return False, "Website Integration Key has been revoked."

        if active.get("expires_at") and time.time() > active["expires_at"]:
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Website key expired", "key_id": active.get("key_id")}, status="FAILED")
            return False, "Website Integration Key has expired."

        # Compute hash and compare with stored constant-time hash
        candidate_hash = hashlib.sha256(token_or_key.strip().encode("utf-8")).hexdigest()
        if not hmac.compare_digest(candidate_hash, active["key_hash"]):
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Invalid website key digest"}, status="FAILED")
            return False, "Invalid Website Integration Key."

        # Update last used
        active["last_used"] = time.time()
        self._save_website_key()
        return True, "Valid"

    # =========================================================================
    # 2. ANDROID PAIRING SESSIONS & DEVICE REGISTRATION
    # =========================================================================

    def create_pairing_session(self, server_url: Optional[str] = None, actor: str = "Admin") -> Dict[str, Any]:
        """
        Generates a 5-minute single-use pairing code and QR code payload.
        """
        now = time.time()
        # Clean up expired pairing sessions older than 10 minutes
        self.pairing_sessions = {
            k: v for k, v in self.pairing_sessions.items()
            if v.get("expires_at", 0) > (now - 600) and not v.get("is_used")
        }

        # 6-digit numeric pairing code for convenient manual entry
        pairing_code = str(secrets.randbelow(900000) + 100000)
        session_id = f"PBH-PAIR-{secrets.token_hex(3).upper()}"
        expires_at = now + 300  # Exactly 5 minutes validity

        effective_server = (server_url or "https://pbhero.qzz.io").strip().rstrip("/")

        qr_payload = {
            "action": "pbhero_bridge_pair",
            "session_id": session_id,
            "pairing_code": pairing_code,
            "server_url": effective_server,
            "expires_at": int(expires_at)
        }

        session_data = {
            "session_id": session_id,
            "pairing_code": pairing_code,
            "created_at": now,
            "expires_at": expires_at,
            "is_used": False,
            "server_url": effective_server,
            "qr_data": json.dumps(qr_payload)
        }

        self.pairing_sessions[pairing_code] = session_data

        self.log_audit(
            event_type="ANDROID_PAIRING_CREATED",
            details={"session_id": session_id, "pairing_code": pairing_code, "expires_in": 300},
            actor=actor
        )

        return session_data

    def pair_device_with_code(
        self,
        pairing_code: str,
        device_name: str = "Android Device",
        app_version: str = "1.0.1",
        device_id_override: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Validates single-use 5-minute pairing code, provisions device credentials,
        and saves into registered devices.
        """
        code = pairing_code.strip()
        session = self.pairing_sessions.get(code)
        now = time.time()

        if not session:
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Unknown pairing code", "code": code}, status="FAILED")
            return False, "Invalid or non-existent pairing code.", None

        if session.get("is_used"):
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Pairing code already used", "code": code}, status="FAILED")
            return False, "Pairing code has already been used.", None

        if now > session.get("expires_at", 0):
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Pairing code expired", "code": code}, status="FAILED")
            return False, "Pairing code has expired (5-minute window exceeded).", None

        # Mark single-use as consumed immediately
        session["is_used"] = True
        session["used_at"] = now

        device_id = device_id_override if (device_id_override and len(device_id_override.strip()) >= 3) else f"PBH-ANDROID-{secrets.token_hex(4).upper()}"
        secret_key = secrets.token_hex(32)  # 256-bit device secret

        device_info = {
            "device_id": device_id,
            "device_name": device_name,
            "app_version": app_version,
            "secret_key": secret_key,
            "created_at": now,
            "last_seen": now,
            "is_active": True,
            "delivery_count": 0,
            "paired_via_session": session.get("session_id")
        }

        self.devices[device_id] = device_info
        self._save_devices()

        self.log_audit(
            event_type="ANDROID_DEVICE_REGISTERED",
            details={"device_id": device_id, "device_name": device_name, "version": app_version},
            actor="Android Bridge App"
        )

        return True, "Pairing Successful", {
            "status": "success",
            "device_id": device_id,
            "secret_key": secret_key,
            "device_name": device_name,
            "server_url": session.get("server_url"),
            "webhook_path": "/api/webhook/paytm-bridge"
        }

    def register_device(self, device_id: str, device_name: str = "Android Device", admin_token: Optional[str] = None) -> Dict[str, Any]:
        """Legacy direct registration for internal backwards-compatibility."""
        if not device_id or len(device_id.strip()) < 3:
            device_id = f"PBH-ANDROID-{secrets.token_hex(4).upper()}"

        secret_key = secrets.token_hex(32)
        now = time.time()

        device_info = {
            "device_id": device_id,
            "device_name": device_name,
            "app_version": "1.0.1",
            "secret_key": secret_key,
            "created_at": now,
            "last_seen": now,
            "is_active": True,
            "delivery_count": 0
        }

        self.devices[device_id] = device_info
        self._save_devices()
        self.log_audit("ANDROID_DEVICE_REGISTERED", {"device_id": device_id, "device_name": device_name})
        return device_info

    def revoke_device(self, device_id: str, actor: str = "Admin") -> bool:
        """Immediately revokes an Android device by setting is_active = False."""
        dev = self.devices.get(device_id)
        if not dev:
            return False
        dev["is_active"] = False
        dev["revoked_at"] = time.time()
        self._save_devices()
        self.log_audit("ANDROID_DEVICE_REVOKED", {"device_id": device_id}, actor=actor)
        return True

    def regenerate_device_credentials(self, device_id: str, actor: str = "Admin") -> Optional[Dict[str, Any]]:
        """Rotates credentials for an existing device."""
        dev = self.devices.get(device_id)
        if not dev:
            return None
        new_secret = secrets.token_hex(32)
        dev["secret_key"] = new_secret
        dev["is_active"] = True
        dev["rotated_at"] = time.time()
        self._save_devices()
        self.log_audit("ANDROID_DEVICE_CREDENTIALS_ROTATED", {"device_id": device_id}, actor=actor)
        return {
            "device_id": device_id,
            "secret_key": new_secret,
            "device_name": dev.get("device_name")
        }

    def get_device(self, device_id: str) -> Optional[Dict[str, Any]]:
        return self.devices.get(device_id)

    def list_devices(self) -> List[Dict[str, Any]]:
        results = []
        now = time.time()
        for dev in self.devices.values():
            last_seen = dev.get("last_seen", 0)
            # Active heartbeat if seen within 2 minutes
            is_online = (now - last_seen) < 120 if last_seen else False

            results.append({
                "device_id": dev["device_id"],
                "device_name": dev.get("device_name", "Android"),
                "app_version": dev.get("app_version", "1.0.1"),
                "created_at": dev.get("created_at"),
                "last_seen": last_seen,
                "is_active": dev.get("is_active", True),
                "is_online": is_online,
                "delivery_count": dev.get("delivery_count", 0),
                "secret_preview": (dev.get("secret_key", "")[:8] + "...") if dev.get("secret_key") else ""
            })
        return results

    # =========================================================================
    # 3. REQUEST VERIFICATION (HMAC-SHA256, Replay & Skew Protection)
    # =========================================================================

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
        Strict Android Device Request Verification:
        1. Confirms device_id is a registered, ACTIVE Android device (NOT a website key)
        2. Timestamp within +/- max_skew_seconds (5 minutes)
        3. Replay prevention via event_id
        4. Constant-time HMAC-SHA256 signature verification
        """
        # Role guard: Website keys cannot act as Android devices
        if device_id.startswith("PBH-WEB"):
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Website key attempted device webhook", "device_id": device_id}, status="BLOCKED")
            return False, "Access Denied: Website Integration Keys cannot authenticate as Android Devices."

        device = self.devices.get(device_id)
        if not device:
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Unregistered device", "device_id": device_id}, status="FAILED")
            return False, f"Device '{device_id}' is not registered."

        if not device.get("is_active", True):
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Revoked device attempted connection", "device_id": device_id}, status="REVOKED")
            return False, f"Device '{device_id}' has been revoked by the administrator."

        # 1. Timestamp validation
        try:
            req_ts = float(timestamp_str)
        except (ValueError, TypeError):
            return False, "Invalid timestamp format in request headers."

        current_ts = time.time()
        if abs(current_ts - req_ts) > max_skew_seconds:
            return False, f"Request timestamp skewed or expired (server: {int(current_ts)}, request: {int(req_ts)})."

        # 2. Replay check via event_id
        if event_id:
            if event_id in self.processed_events:
                self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Replay detected", "event_id": event_id}, status="REPLAY_BLOCKED")
                return False, f"Duplicate event '{event_id}' has already been processed (Replay Protection)."

        # 3. HMAC-SHA256 signature verification
        secret = device["secret_key"].encode("utf-8")
        msg = f"{device_id}:{timestamp_str}:".encode("utf-8") + raw_body
        expected_sig = hmac.new(secret, msg, hashlib.sha256).hexdigest()

        if not hmac.compare_digest(expected_sig.lower(), signature.strip().lower()):
            self.log_audit("SECURITY_VALIDATION_FAILED", {"reason": "Invalid HMAC signature", "device_id": device_id}, status="FAILED")
            return False, "Invalid HMAC-SHA256 signature."

        # Passed all checks - update device metrics
        device["last_seen"] = current_ts
        device["delivery_count"] = device.get("delivery_count", 0) + 1
        self._save_devices()

        if event_id:
            self.processed_events[event_id] = current_ts
            if len(self.processed_events) > 10000:
                cutoff = current_ts - 86400
                self.processed_events = {k: v for k, v in self.processed_events.items() if v > cutoff}

        return True, "Valid"

    def record_heartbeat(self, device_id: str) -> bool:
        dev = self.devices.get(device_id)
        if not dev or not dev.get("is_active"):
            return False
        dev["last_seen"] = time.time()
        self._save_devices()
        return True


# Global singleton instance
device_auth_service = DeviceAuthService()
