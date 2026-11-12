"""
PB HERO Smart Donation System - Central Donation Matching Engine
Coordinates Tip Page Intents, Android Notification Signals, and Paytm Business Emails.
Ensures strict verification, deduplication, state machine progression, and dual announcement dispatch.
"""

import os
import json
import time
import asyncio
import logging
import uuid
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger(__name__)

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "donations.json")


class DonationState:
    CREATED = "CREATED"
    WAITING_FOR_PAYMENT = "WAITING_FOR_PAYMENT"
    RECEIVED = "RECEIVED"
    PENDING_EMAIL = "PENDING_EMAIL"
    PENDING_NOTIFICATION = "PENDING_NOTIFICATION"
    MATCHED = "MATCHED"
    VERIFIED = "VERIFIED"
    NEEDS_MANUAL_REVIEW = "NEEDS_MANUAL_REVIEW"
    ANNOUNCED = "ANNOUNCED"
    FAILED = "FAILED"


class DeliveryState:
    PENDING = "PENDING"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"


class DonationManager:
    def __init__(self, data_file: str = DATA_FILE, bot_instance=None):
        self.data_file = os.path.abspath(data_file)
        self.bot = bot_instance
        self.lock = asyncio.Lock()

        # In-memory stores persisted to JSON
        self.intents: Dict[str, Dict[str, Any]] = {}
        self.notifications: Dict[str, Dict[str, Any]] = {}
        self.emails: Dict[str, Dict[str, Any]] = {}
        self.verified_donations: Dict[str, Dict[str, Any]] = {}
        self.announced_events: Dict[str, Dict[str, Any]] = {}
        self.config: Dict[str, Any] = {
            "strict_mode": True,
            "match_window_seconds": 600,  # 10 minutes
            "min_amount": 1.0,
            "email_retry_intervals": [15, 30, 60, 90, 120],  # Retry points in seconds
            "auto_announce": True
        }

        self._load()

    def set_bot(self, bot_instance):
        self.bot = bot_instance

    def _load(self):
        try:
            if os.path.exists(self.data_file):
                with open(self.data_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.intents = data.get("intents", {})
                    self.notifications = data.get("notifications", {})
                    self.emails = data.get("emails", {})
                    self.verified_donations = data.get("verified_donations", {})
                    self.announced_events = data.get("announced_events", {})
                    self.config.update(data.get("config", {}))
                logger.info(f"[DonationManager] Loaded {len(self.verified_donations)} verified donations from store.")
            else:
                self._save()
        except Exception as e:
            logger.error(f"[DonationManager] Failed to load data: {e}")

    def _save(self):
        try:
            os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
            payload = {
                "intents": self.intents,
                "notifications": self.notifications,
                "emails": self.emails,
                "verified_donations": self.verified_donations,
                "announced_events": self.announced_events,
                "config": self.config
            }
            with open(self.data_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception as e:
            logger.error(f"[DonationManager] Failed to save data: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # 1. TIP PAGE INTENT MANAGEMENT
    # ─────────────────────────────────────────────────────────────────────────

    async def create_intent(self, amount: float, donor_name: str, message: str = "", is_test: bool = False) -> Dict[str, Any]:
        """
        Creates a Donation Intent when a viewer clicks Next on the Tip Page.
        """
        async with self.lock:
            intent_id = f"PBH-INTENT-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"
            intent = {
                "intent_id": intent_id,
                "amount": float(amount),
                "donor_name": donor_name.strip() or "Anonymous",
                "message": message.strip(),
                "created_at": time.time(),
                "status": DonationState.WAITING_FOR_PAYMENT,
                "matched_donation_id": None,
                "is_test": is_test
            }
            self.intents[intent_id] = intent
            self._save()
            logger.info(f"[DonationManager] Created Intent {intent_id} for ₹{amount} from {donor_name} (is_test={is_test})")
            return intent

    async def get_intent_status(self, intent_id: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            intent = self.intents.get(intent_id)
            if not intent:
                return None

            donation = None
            if intent.get("matched_donation_id"):
                donation = self.verified_donations.get(intent["matched_donation_id"])

            return {
                "intent_id": intent["intent_id"],
                "status": intent["status"],
                "amount": intent["amount"],
                "donor_name": intent["donor_name"],
                "is_verified": intent["status"] in [DonationState.VERIFIED, DonationState.ANNOUNCED],
                "donation": donation
            }

    # ─────────────────────────────────────────────────────────────────────────
    # 2. ANDROID NOTIFICATION SIGNAL INGESTION
    # ─────────────────────────────────────────────────────────────────────────

    async def ingest_notification(self, notification_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ingests a verified Paytm Business notification from PB HERO Notification Bridge Android app.
        Schedules asynchronous background email corroboration and attempts matching.
        """
        async with self.lock:
            event_id = notification_data.get("event_id") or f"NOTIF-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"
            if event_id in self.notifications:
                return {"status": "duplicate", "event_id": event_id, "message": "Notification already ingested."}

            amount = float(notification_data.get("amount", 0.0))
            if amount < float(self.config.get("min_amount", 1.0)):
                return {"status": "ignored", "reason": f"Amount ₹{amount} is below minimum threshold."}

            notif_record = {
                "event_id": event_id,
                "device_id": notification_data.get("device_id"),
                "package_name": notification_data.get("package_name"),
                "notification_title": notification_data.get("notification_title"),
                "notification_text": notification_data.get("notification_text"),
                "amount": amount,
                "currency": notification_data.get("currency", "INR"),
                "payer_name": notification_data.get("payer_name"),
                "ref_info": notification_data.get("ref_info"),
                "received_at": time.time(),
                "status": DonationState.PENDING_EMAIL,
                "matched_email_id": None
            }
            self.notifications[event_id] = notif_record
            self._save()
            logger.info(f"[DonationManager] Ingested Notification {event_id}: ₹{amount} (Payer: {notif_record['payer_name']})")

        # Trigger immediate matching check against existing emails/intents
        match_result = await self.evaluate_match(event_id=event_id)

        # If not yet verified, schedule asynchronous background email checks
        if match_result.get("status") != DonationState.VERIFIED:
            asyncio.create_task(self._schedule_email_checks(event_id, amount))

        return {
            "status": "accepted",
            "event_id": event_id,
            "donation_state": self.notifications[event_id]["status"]
        }

    # ─────────────────────────────────────────────────────────────────────────
    # 3. EMAIL SIGNAL INGESTION
    # ─────────────────────────────────────────────────────────────────────────

    async def ingest_email(self, email_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ingests a parsed transaction email from EmailService.
        """
        async with self.lock:
            msg_id = email_data.get("message_id") or f"EMAIL-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"
            if msg_id in self.emails:
                return {"status": "duplicate", "message_id": msg_id}

            amount = float(email_data.get("amount", 0.0))
            email_record = {
                "message_id": msg_id,
                "amount": amount,
                "payer_name": email_data.get("payer_name"),
                "utr": email_data.get("utr"),
                "order_id": email_data.get("order_id"),
                "status": email_data.get("status", "SUCCESS"),
                "received_at": email_data.get("timestamp", time.time()),
                "subject": email_data.get("subject", ""),
                "is_matched": False
            }
            self.emails[msg_id] = email_record
            self._save()
            logger.info(f"[DonationManager] Ingested Email {msg_id}: ₹{amount} (Payer: {email_record['payer_name']}, UTR: {email_record['utr']})")

        return await self.evaluate_match(msg_id=msg_id)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. BACKGROUND EMAIL RETRY SCHEDULER
    # ─────────────────────────────────────────────────────────────────────────

    async def _schedule_email_checks(self, notif_event_id: str, amount: float):
        """
        Asynchronously checks for Paytm Business emails at configured intervals (e.g. 15s, 30s, 60s, 90s, 120s).
        Does not block the main webhook request!
        """
        intervals = self.config.get("email_retry_intervals", [15, 30, 60, 90, 120])
        logger.info(f"[DonationManager] Scheduling background email checks for {notif_event_id} (₹{amount}) at {intervals}s")

        for delay in intervals:
            await asyncio.sleep(delay)

            # Check if notification is already verified
            async with self.lock:
                notif = self.notifications.get(notif_event_id)
                if not notif or notif.get("status") in [DonationState.VERIFIED, DonationState.ANNOUNCED]:
                    logger.info(f"[DonationManager] {notif_event_id} already satisfied. Stopping email checks.")
                    return

            # Check via EmailService
            try:
                if self.bot and hasattr(self.bot, "email"):
                    email_service = self.bot.email
                else:
                    from .email_service import EmailService
                    email_service = EmailService(self.bot.load_config if self.bot else lambda: {})

                # Run IMAP fetch in thread to avoid freezing async loop
                records = await asyncio.to_thread(
                    email_service.search_paytm_emails,
                    time_window_minutes=15,
                    target_amount=amount,
                    processed_ids=list(self.emails.keys())
                )

                if records:
                    logger.info(f"[DonationManager] Background check found {len(records)} matching email(s) for ₹{amount}!")
                    for rec in records:
                        await self.ingest_email(rec)

                    # Re-check status
                    async with self.lock:
                        if self.notifications.get(notif_event_id, {}).get("status") in [DonationState.VERIFIED, DonationState.ANNOUNCED]:
                            return
            except Exception as e:
                logger.error(f"[DonationManager] Background email check error: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # 5. DONATION MATCHING & VERIFICATION ENGINE
    # ─────────────────────────────────────────────────────────────────────────

    async def evaluate_match(self, event_id: Optional[str] = None, msg_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Core matching logic prioritizing:
        1. Exact UTR / Transaction ID (if present in both)
        2. Amount + Time Window (10 min) + Consistent signals
        3. Correlating Tip Page Intent for customized viewer message and name
        """
        async with self.lock:
            window = self.config.get("match_window_seconds", 600)
            strict = self.config.get("strict_mode", True)

            candidates_notif = [n for n in self.notifications.values() if n["status"] not in [DonationState.VERIFIED, DonationState.ANNOUNCED]]
            candidates_email = [e for e in self.emails.values() if not e.get("is_matched", False)]

            for notif in candidates_notif:
                matched_email = None

                # 1. Search for matching email
                for em in candidates_email:
                    if abs(notif["amount"] - em["amount"]) < 0.01:
                        # Time window check
                        time_diff = abs(notif["received_at"] - em["received_at"])
                        if time_diff <= window:
                            # If UTR is in ref_info and matches, absolute match
                            if notif.get("ref_info") and em.get("utr") and str(em["utr"]) in str(notif["ref_info"]):
                                matched_email = em
                                break
                            # Otherwise amount + time within window
                            if matched_email is None:
                                matched_email = em

                # Verification decision
                if matched_email:
                    # Successfully corroborated!
                    matched_email["is_matched"] = True
                    notif["status"] = DonationState.VERIFIED
                    notif["matched_email_id"] = matched_email["message_id"]

                    # Determine canonical donor name
                    final_name = matched_email.get("payer_name") or notif.get("payer_name") or "Supporter"
                    utr = matched_email.get("utr") or notif.get("ref_info")

                    # Search for associated Tip Page Intent
                    matched_intent = None
                    for intent in self.intents.values():
                        if intent["status"] == DonationState.WAITING_FOR_PAYMENT:
                            if abs(intent["amount"] - notif["amount"]) < 0.01:
                                if abs(notif["received_at"] - intent["created_at"]) <= window:
                                    matched_intent = intent
                                    break

                    message = "Donation via Paytm UPI QR"
                    if matched_intent:
                        matched_intent["status"] = DonationState.VERIFIED
                        if matched_intent.get("donor_name") and matched_intent["donor_name"] != "Anonymous":
                            final_name = f"{matched_intent['donor_name']} ({final_name})"
                        if matched_intent.get("message"):
                            message = matched_intent["message"]

                    donation_id = f"PBH-DONATION-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"
                    canonical_event = {
                        "event_type": "donation_verified",
                        "event_id": donation_id,
                        "donor_name": final_name,
                        "amount": notif["amount"],
                        "currency": "INR",
                        "message": message,
                        "utr": utr,
                        "order_id": matched_email.get("order_id"),
                        "notification_event_id": notif["event_id"],
                        "email_message_id": matched_email["message_id"],
                        "intent_id": matched_intent["intent_id"] if matched_intent else None,
                        "verified_timestamp": time.time(),
                        "status": DonationState.VERIFIED,
                        "cloud_overlay_status": DeliveryState.PENDING,
                        "local_tts_status": DeliveryState.PENDING
                    }

                    if matched_intent:
                        matched_intent["matched_donation_id"] = donation_id

                    self.verified_donations[donation_id] = canonical_event
                    self._save()
                    logger.info(f"[DonationManager] ✅ VERIFIED DONATION: {donation_id} — {final_name} donated ₹{notif['amount']} (UTR: {utr})")

                    # Dispatch dual announcements
                    if self.config.get("auto_announce", True):
                        asyncio.create_task(self.dispatch_announcements(donation_id))

                    return {"status": DonationState.VERIFIED, "donation": canonical_event}

                elif not strict:
                    # Non-strict mode: Notification alone can be verified if permitted by admin
                    notif["status"] = DonationState.VERIFIED
                    final_name = notif.get("payer_name") or "Supporter"
                    donation_id = f"PBH-DONATION-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"
                    canonical_event = {
                        "event_type": "donation_verified",
                        "event_id": donation_id,
                        "donor_name": final_name,
                        "amount": notif["amount"],
                        "currency": "INR",
                        "message": "Donation via Paytm UPI QR",
                        "utr": notif.get("ref_info"),
                        "notification_event_id": notif["event_id"],
                        "email_message_id": None,
                        "intent_id": None,
                        "verified_timestamp": time.time(),
                        "status": DonationState.VERIFIED,
                        "cloud_overlay_status": DeliveryState.PENDING,
                        "local_tts_status": DeliveryState.PENDING
                    }
                    self.verified_donations[donation_id] = canonical_event
                    self._save()
                    if self.config.get("auto_announce", True):
                        asyncio.create_task(self.dispatch_announcements(donation_id))
                    return {"status": DonationState.VERIFIED, "donation": canonical_event}

            return {"status": "PENDING_EVALUATION"}

    # ─────────────────────────────────────────────────────────────────────────
    # 6. DUAL ANNOUNCEMENT DISPATCHER (CLOUD OBS OVERLAY & LOCAL EDGE-TTS)
    # ─────────────────────────────────────────────────────────────────────────

    async def dispatch_announcements(self, donation_id: str):
        """
        Dispatches verified donation independently to:
        1. Cloud Bot OBS Overlay (/ws/overlay & CustomOverlayService)
        2. Local Bot WebSocket (/ws/pi-client) for Edge-TTS on Streaming PC
        Tracks delivery states independently and prevents any duplicate announcements.
        """
        async with self.lock:
            donation = self.verified_donations.get(donation_id)
            if not donation:
                return

            if donation_id in self.announced_events:
                logger.warning(f"[DonationManager] Duplicate announcement prevented for {donation_id}")
                return

            self.announced_events[donation_id] = {
                "announced_at": time.time(),
                "donor_name": donation["donor_name"],
                "amount": donation["amount"]
            }

        donor_name = donation["donor_name"]
        amount = donation["amount"]
        message = donation["message"]
        utr = donation.get("utr") or ""

        # ── Destination A: Cloud Bot OBS Overlay ─────────────────────────────
        try:
            if self.bot and hasattr(self.bot, "broadcast_func") and self.bot.broadcast_func:
                logger.info(f"[DonationManager] Broadcasting to Cloud OBS Overlay for {donation_id}...")
                await self.bot.broadcast_func({
                    "type": "donation_alert",
                    "source": "PB_HERO_SMART_DONATION",
                    "user": donor_name,
                    "amount": amount,
                    "message": message,
                    "utr": utr,
                    "transaction_id": donation_id
                })
                donation["cloud_overlay_status"] = DeliveryState.DELIVERED
            else:
                logger.warning("[DonationManager] Cloud overlay broadcast function unavailable.")
                donation["cloud_overlay_status"] = DeliveryState.FAILED
        except Exception as e:
            logger.error(f"[DonationManager] Cloud overlay broadcast error: {e}")
            donation["cloud_overlay_status"] = DeliveryState.FAILED

        # ── Destination B: Local Bot Edge-TTS (via WebSocket) ───────────────
        try:
            tts_text = f"Thank you {donor_name} for {int(amount)} rupees donation! {message}"
            is_cloud = (os.environ.get("RUN_MODE") == "cloud")

            if is_cloud:
                # Forward to connected Local Pi / PC via pi_clients WebSocket
                if self.bot and getattr(self.bot, "pi_clients", None) and len(self.bot.pi_clients.active_connections) > 0:
                    logger.info(f"[DonationManager] Forwarding verified alert to Local Bot for TTS...")
                    await self.bot.pi_clients.broadcast({
                        "type": "donation_alert",
                        "source": "PB_HERO_SMART_DONATION",
                        "event_id": donation_id,
                        "user": donor_name,
                        "amount": amount,
                        "message": message,
                        "tts_text": tts_text,
                        "do_tts": True,
                        "transaction_id": donation_id
                    })
                    donation["local_tts_status"] = DeliveryState.DELIVERED
                else:
                    logger.warning("[DonationManager] Local Bot is currently offline; queuing TTS delivery.")
                    donation["local_tts_status"] = DeliveryState.PENDING
            else:
                # Running directly on Local Pi / PC
                if self.bot and hasattr(self.bot, "audio") and self.bot.audio:
                    logger.info(f"[DonationManager] Playing Local Edge-TTS: {tts_text}")
                    await self.bot.audio.speak(tts_text, "public")
                    donation["local_tts_status"] = DeliveryState.DELIVERED
                else:
                    donation["local_tts_status"] = DeliveryState.PENDING
        except Exception as e:
            logger.error(f"[DonationManager] Local TTS dispatch error: {e}")
            donation["local_tts_status"] = DeliveryState.FAILED

        # Update final state
        async with self.lock:
            donation["status"] = DonationState.ANNOUNCED
            self._save()

    def get_dashboard_summary(self) -> Dict[str, Any]:
        """Provides statistics and lists for the Admin Dashboard."""
        return {
            "total_intents": len(self.intents),
            "total_notifications": len(self.notifications),
            "total_emails": len(self.emails),
            "total_verified": len(self.verified_donations),
            "total_announced": len(self.announced_events),
            "strict_mode": self.config.get("strict_mode", True),
            "recent_verified": list(self.verified_donations.values())[-20:],
            "pending_notifications": [n for n in self.notifications.values() if n["status"] != DonationState.VERIFIED][-10:],
            "unmatched_emails": [e for e in self.emails.values() if not e.get("is_matched")][-10:],
            "recent_intents": list(self.intents.values())[-10:]
        }


# Global singleton instance
donation_manager = DonationManager()

