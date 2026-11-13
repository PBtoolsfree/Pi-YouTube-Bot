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
import re
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger(__name__)

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "smart_donations.json")


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


async def _run_in_thread(func, *args, **kwargs):
    """Compatible with Python 3.8+ (asyncio.to_thread requires Python 3.9+)."""
    import functools
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, functools.partial(func, *args, **kwargs))

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

    def _resolve_email_service(self):
        if self.bot and hasattr(self.bot, "email") and self.bot.email:
            return self.bot.email
        from .email_service import EmailService
        def _get_config():
            if self.bot and hasattr(self.bot, "load_config") and callable(self.bot.load_config):
                cfg = self.bot.load_config()
                if cfg:
                    return cfg
            for p in ["config.json", "../config.json", "data/config.json", "/home/ubuntu/pibot/bot-cloud/config.json", "/home/pradip/pibot/bot-local/config.json"]:
                if os.path.exists(p):
                    try:
                        with open(p, "r", encoding="utf-8") as f:
                            return json.load(f)
                    except Exception:
                        pass
            return {}
        return EmailService(_get_config)

    def set_bot(self, bot_instance):
        self.bot = bot_instance

    def _load(self):
        try:
            legacy_donations_file = os.path.join(os.path.dirname(self.data_file), "donations.json")
            if os.path.exists(self.data_file):
                with open(self.data_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self.intents = data.get("intents", {})
                        self.notifications = data.get("notifications", {})
                        self.emails = data.get("emails", {})
                        self.verified_donations = data.get("verified_donations", {})
                        self.announced_events = data.get("announced_events", {})
                        self.config.update(data.get("config", {}))
                logger.info(f"[DonationManager] Loaded {len(self.verified_donations)} verified donations from store.")
            elif os.path.exists(legacy_donations_file):
                # Migrate if legacy file holds a dict from previous DonationManager saving
                try:
                    with open(legacy_donations_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if isinstance(data, dict) and "verified_donations" in data:
                        self.intents = data.get("intents", {})
                        self.notifications = data.get("notifications", {})
                        self.emails = data.get("emails", {})
                        self.verified_donations = data.get("verified_donations", {})
                        self.announced_events = data.get("announced_events", {})
                        self.config.update(data.get("config", {}))
                        self._save()
                        with open(legacy_donations_file, "w", encoding="utf-8") as f:
                            json.dump([], f, indent=2)
                        logger.info(f"[DonationManager] Migrated {len(self.verified_donations)} donations to smart_donations.json")
                    else:
                        self._save()
                except Exception:
                    self._save()
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

            # Backend Semantic Deduplication Guard (Prevents identical alerts within 120s)
            notif_title = (notification_data.get("notification_title") or "").strip()
            notif_text = (notification_data.get("notification_text") or "").strip()
            notif_ref = (notification_data.get("ref_info") or "").strip()
            now_ts = time.time()

            for existing_id, existing in list(self.notifications.items()):
                if abs(existing.get("amount", 0.0) - amount) < 0.01:
                    # Match by ref_info if both have it
                    if notif_ref and existing.get("ref_info") and notif_ref == existing["ref_info"]:
                        logger.warning(f"[DonationManager] Duplicate notification rejected by ref_info: {notif_ref}")
                        return {"status": "duplicate", "event_id": existing_id, "message": "Duplicate notification by reference ID"}
                    # Match by identical title within 120 seconds
                    time_diff = abs(now_ts - existing.get("received_at", now_ts))
                    if time_diff <= 120:
                        ex_title = (existing.get("notification_title") or "").strip()
                        if notif_title and ex_title and notif_title == ex_title:
                            logger.warning(f"[DonationManager] Duplicate notification rejected: identical content within {time_diff:.1f}s")
                            return {"status": "duplicate", "event_id": existing_id, "message": "Duplicate notification within 120 seconds"}

            # Clean raw payer name
            raw_payer = notification_data.get("payer_name") or ""
            clean_payer = re.sub(r'\s+received\b.*', '', raw_payer, flags=re.IGNORECASE).strip()
            clean_payer = re.sub(r'^(?:payment\s+from|from|by)\s+', '', clean_payer, flags=re.IGNORECASE).strip()

            notif_record = {
                "event_id": event_id,
                "device_id": notification_data.get("device_id"),
                "package_name": notification_data.get("package_name"),
                "notification_title": notification_data.get("notification_title"),
                "notification_text": notification_data.get("notification_text"),
                "amount": amount,
                "currency": notification_data.get("currency", "INR"),
                "payer_name": clean_payer if clean_payer else (notification_data.get("payer_name") or "Paytm Payer"),
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
                email_service = self._resolve_email_service()

                # Run IMAP fetch in thread to avoid freezing async loop
                records = await _run_in_thread(
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

    async def sync_pending_emails(self) -> int:
        """
        Actively queries IMAP for emails to corroborate any pending notifications.
        Returns the count of verified donations.
        """
        async with self.lock:
            pending = [n for n in self.notifications.values() if n.get("status") == DonationState.PENDING_EMAIL]

        if not pending:
            return 0

        verified_count = 0
        try:
            # 1. First evaluate match against already stored unmatched emails
            first_match = await self.evaluate_match()
            if first_match.get("status") == DonationState.VERIFIED:
                verified_count += 1

            # 2. Re-check if any pending notifications remain
            async with self.lock:
                pending = [n for n in self.notifications.values() if n.get("status") == DonationState.PENDING_EMAIL]

            if not pending:
                return verified_count

            # 3. Search recent emails from IMAP
            email_service = self._resolve_email_service()
            records = await _run_in_thread(
                email_service.search_paytm_emails,
                time_window_minutes=60,
                target_amount=None,
                processed_ids=list(self.emails.keys())
            )

            if records:
                logger.info(f"[DonationManager] sync_pending_emails found {len(records)} recent email(s)!")
                for rec in records:
                    match_res = await self.ingest_email(rec)
                    if match_res.get("status") == DonationState.VERIFIED:
                        verified_count += 1
        except Exception as e:
            logger.error(f"[DonationManager] sync_pending_emails error: {e}")

        return verified_count

    # ─────────────────────────────────────────────────────────────────────────
    # 5. DONATION MATCHING & VERIFICATION ENGINE (UNIFIED DEDUPLICATION PROTOCOL)
    # ─────────────────────────────────────────────────────────────────────────

    async def evaluate_match(self, event_id: Optional[str] = None, msg_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Comprehensive Unified Deduplication & Matching Protocol:
        Correlates signals across:
        1. Android App Notifications (PB HERO Notification Bridge)
        2. Bank / Paytm Business Emails (EmailService / IMAP)
        3. Tip Page Intents (Viewer initiated payment)
        
        Guarantees:
        - Absolute deduplication across channels (No duplicate alerts/TTS/history)
        - Tip Page custom donor name & message preservation
        - Real-time loyalty points crediting
        - Simultaneous synchronized overlay + TTS dispatch
        """
        async with self.lock:
            window = max(self.config.get("match_window_seconds", 600), 3600)
            strict = self.config.get("strict_mode", True)
            now_ts = time.time()

            candidates_notif = [n for n in self.notifications.values() if n.get("status") not in [DonationState.VERIFIED, DonationState.ANNOUNCED, "DUPLICATE_RESOLVED", "duplicate"]]
            candidates_email = [e for e in self.emails.values() if not e.get("is_matched", False)]
            active_intents = [i for i in self.intents.values() if i.get("status") == DonationState.WAITING_FOR_PAYMENT and (now_ts - i.get("created_at", now_ts)) <= window]

            # Helper for deduplication check against already verified donations
            def is_already_verified(amt: float, utr_val: Optional[str], ref_val: Optional[str], check_ts: float) -> Optional[Dict[str, Any]]:
                for v_id, v_d in self.verified_donations.items():
                    v_utr = str(v_d.get("utr") or "").strip()
                    # 1. Exact UTR match is a duplicate
                    if utr_val and v_utr and v_utr != "—" and v_utr == str(utr_val).strip():
                        return v_d
                    if ref_val and v_utr and v_utr != "—" and (v_utr in str(ref_val) or str(ref_val) in v_utr):
                        return v_d
                    # 2. If both have distinct UTRs, they are NOT duplicates!
                    has_distinct_utrs = (utr_val and v_utr and v_utr != "—" and utr_val != "—" and str(utr_val).strip() != v_utr)
                    if has_distinct_utrs:
                        continue
                    # 3. Same amount without distinct UTRs within 180s debounce
                    if abs(float(v_d.get("amount", 0.0)) - float(amt)) < 0.01:
                        v_time = float(v_d.get("verified_timestamp") or v_d.get("raw_time") or 0)
                        if abs(check_ts - v_time) <= 180:
                            return v_d
                return None

            # Helper to finalize and record verified donation
            def record_verified(donor_name: str, amount: float, message: str, utr_val: Optional[str],
                                notif_obj: Optional[Dict[str, Any]], email_obj: Optional[Dict[str, Any]],
                                intent_obj: Optional[Dict[str, Any]]) -> Dict[str, Any]:
                donation_id = f"PBH-DONATION-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"
                source_label = "Tip Page (Paytm QR)" if intent_obj else "Paytm Business QR"

                canonical_event = {
                    "event_type": "donation_verified",
                    "event_id": donation_id,
                    "donor_name": donor_name,
                    "amount": float(amount),
                    "currency": "INR",
                    "message": message,
                    "utr": utr_val or "—",
                    "order_id": (email_obj.get("order_id") if email_obj else None) or "—",
                    "notification_event_id": notif_obj.get("event_id") if notif_obj else None,
                    "email_message_id": email_obj.get("message_id") if email_obj else None,
                    "intent_id": intent_obj.get("intent_id") if intent_obj else None,
                    "verified_timestamp": time.time(),
                    "status": DonationState.VERIFIED,
                    "source": source_label,
                    "cloud_overlay_status": DeliveryState.PENDING,
                    "local_tts_status": DeliveryState.PENDING
                }

                if intent_obj:
                    intent_obj["status"] = DonationState.VERIFIED
                    intent_obj["matched_donation_id"] = donation_id

                if notif_obj:
                    notif_obj["status"] = DonationState.VERIFIED
                    notif_obj["matched_donation_id"] = donation_id
                    if email_obj:
                        notif_obj["matched_email_id"] = email_obj.get("message_id")

                if email_obj:
                    email_obj["is_matched"] = True
                    email_obj["matched_donation_id"] = donation_id

                # Deduplicate any other pending notifications with identical amount within 180s
                for dup_notif in list(self.notifications.values()):
                    if (not notif_obj or dup_notif["event_id"] != notif_obj["event_id"]) and dup_notif.get("status") == DonationState.PENDING_EMAIL:
                        # If both have distinct ref_info/UTR, they are distinct transactions! Do not auto-resolve!
                        dup_ref = str(dup_notif.get("ref_info") or "").strip()
                        obj_ref = str((notif_obj.get("ref_info") if notif_obj else None) or utr_val or "").strip()
                        if dup_ref and obj_ref and dup_ref != "—" and obj_ref != "—" and dup_ref != obj_ref:
                            continue
                        if abs(dup_notif.get("amount", 0.0) - float(amount)) < 0.01:
                            if abs(dup_notif.get("received_at", 0.0) - (notif_obj.get("received_at", now_ts) if notif_obj else now_ts)) <= 180:
                                logger.info(f"[DonationManager] Auto-resolving duplicate notification {dup_notif['event_id']}")
                                dup_notif["status"] = "DUPLICATE_RESOLVED"

                self.verified_donations[donation_id] = canonical_event

                # Award loyalty points
                if self.bot and hasattr(self.bot, "viewers") and self.bot.viewers:
                    try:
                        cfg = self.bot.load_config() if hasattr(self.bot, "load_config") else {}
                        pts_per_tip = cfg.get("loyalty", {}).get("points_per_tip_rupee", 0)
                        if pts_per_tip > 0:
                            pts_to_add = int(float(amount) * pts_per_tip)
                            target_user = intent_obj.get("donor_name") if (intent_obj and intent_obj.get("donor_name") != "Anonymous") else donor_name
                            clean_user = re.sub(r'\(.*?\)', '', target_user).strip() or target_user
                            self.bot.viewers.add_points(clean_user, pts_to_add)
                            logger.info(f"[DonationManager] Awarded {pts_to_add} loyalty points to {clean_user} for ₹{amount}")
                    except Exception as e:
                        logger.error(f"[DonationManager] Failed to award loyalty points: {e}")

                # Sync to legacy bot history
                if self.bot and hasattr(self.bot, "_save_donation_history"):
                    try:
                        self.bot._save_donation_history(donor_name, amount, message, donation_id, played=True, source=source_label)
                    except Exception as e:
                        logger.warning(f"Failed to sync to bot legacy history: {e}")

                if self.bot and hasattr(self.bot, "processed_transactions"):
                    self.bot.processed_transactions[donation_id] = True
                    if utr_val:
                        self.bot.processed_transactions[str(utr_val)] = True

                self._save()
                logger.info(f"[DonationManager] ✅ VERIFIED DONATION: {donation_id} — {donor_name} donated ₹{amount} (UTR: {utr_val})")

                # Dispatch dual announcements
                if self.config.get("auto_announce", True):
                    asyncio.create_task(self.dispatch_announcements(donation_id))

                return canonical_event

            # ── PATH 1: Match Notification with Email / Intent ───────────────
            for notif in candidates_notif:
                # Check if this notification already matches an existing verified donation
                already_v = is_already_verified(notif["amount"], notif.get("ref_info"), notif.get("ref_info"), notif.get("received_at", now_ts))
                if already_v:
                    logger.info(f"[DonationManager] Notification {notif['event_id']} matches existing verified donation {already_v['event_id']}. Marking DUPLICATE_RESOLVED.")
                    notif["status"] = "DUPLICATE_RESOLVED"
                    notif["matched_donation_id"] = already_v["event_id"]
                    self._save()
                    continue

                matched_email = None
                for em in candidates_email:
                    if abs(notif["amount"] - em["amount"]) < 0.01:
                        time_diff = abs(notif["received_at"] - em.get("received_at", notif["received_at"]))
                        if time_diff <= window:
                            if notif.get("ref_info") and em.get("utr") and str(em["utr"]) in str(notif["ref_info"]):
                                matched_email = em
                                break
                            if matched_email is None:
                                matched_email = em

                # Check for matching active Tip Page Intent
                matched_intent = None
                candidate_intents = [
                    i for i in active_intents
                    if abs(i["amount"] - notif["amount"]) < 0.01
                    and abs(notif["received_at"] - i.get("created_at", notif["received_at"])) <= window
                ]
                if candidate_intents:
                    candidate_intents.sort(key=lambda x: abs(notif["received_at"] - x.get("created_at", notif["received_at"])))
                    matched_intent = candidate_intents[0]

                # Decide if verification criteria met
                # Condition: Corroborated by Email OR Corroborated by active Intent OR (non-strict mode)
                if matched_email or matched_intent or not strict:
                    em_name = (matched_email.get("payer_name") or "").strip() if matched_email else ""
                    notif_name = (notif.get("payer_name") or "").strip()
                    notif_clean = re.sub(r'\s+received\b.*', '', notif_name, flags=re.IGNORECASE).strip()
                    notif_clean = re.sub(r'^(?:payment\s+from|from|by)\s+', '', notif_clean, flags=re.IGNORECASE).strip()

                    if em_name and (not notif_clean or notif_clean in ["Paytm Payer", "Supporter"]):
                        final_payer = em_name
                    else:
                        final_payer = notif_clean or em_name or "Supporter"
                    utr = (matched_email.get("utr") if matched_email else None) or notif.get("ref_info") or "—"

                    msg = "Donation via Paytm UPI QR"
                    final_donor = final_payer
                    if matched_intent:
                        if matched_intent.get("donor_name") and matched_intent["donor_name"] != "Anonymous":
                            final_donor = f"{matched_intent['donor_name']} ({final_payer})" if final_payer != "Supporter" and final_payer != matched_intent["donor_name"] else matched_intent["donor_name"]
                        if matched_intent.get("message"):
                            msg = matched_intent["message"]

                    canon = record_verified(final_donor, notif["amount"], msg, utr, notif, matched_email, matched_intent)
                    return {"status": DonationState.VERIFIED, "donation": canon}

            # ── PATH 2: Match Email with Intent (When Android notification wasn't received) ──
            for em in candidates_email:
                already_v = is_already_verified(em["amount"], em.get("utr"), em.get("utr"), em.get("received_at", now_ts))
                if already_v:
                    em["is_matched"] = True
                    em["matched_donation_id"] = already_v["event_id"]
                    if already_v.get("utr") in [None, "—", ""] and em.get("utr"):
                        already_v["utr"] = em["utr"]
                    self._save()
                    continue

                matched_intent = None
                candidate_intents = [
                    i for i in active_intents
                    if abs(i["amount"] - em["amount"]) < 0.01
                    and abs(em.get("received_at", now_ts) - i.get("created_at", now_ts)) <= window
                ]
                if candidate_intents:
                    candidate_intents.sort(key=lambda x: abs(em.get("received_at", now_ts) - x.get("created_at", now_ts)))
                    matched_intent = candidate_intents[0]

                if matched_intent:
                    payer = (em.get("payer_name") or "").strip() or "Supporter"
                    final_donor = matched_intent.get("donor_name") or payer
                    if final_donor != payer and payer != "Supporter":
                        final_donor = f"{final_donor} ({payer})"
                    msg = matched_intent.get("message") or "Donation via Paytm UPI QR"
                    utr = em.get("utr") or "—"

                    canon = record_verified(final_donor, em["amount"], msg, utr, None, em, matched_intent)
                    return {"status": DonationState.VERIFIED, "donation": canon}

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
            alert_payload = {
                "type": "donation_alert",
                "category": "DONATION",
                "source": "PB_HERO_SMART_DONATION",
                "user": donor_name,
                "author": donor_name,
                "donor_name": donor_name,
                "amount": amount,
                "message": message,
                "utr": utr,
                "transaction_id": donation_id,
                "timestamp": time.time(),
                "currency": "INR",
                "tier": "gold" if amount >= 500 else "cyan" if amount >= 100 else "blue"
            }
            if self.bot and hasattr(self.bot, "broadcast_func") and self.bot.broadcast_func:
                logger.info(f"[DonationManager] Broadcasting to Cloud OBS Overlay for {donation_id}...")
                await self.bot.broadcast_func(alert_payload)
                if self.bot and hasattr(self.bot, "_log_ui"):
                    await self.bot._log_ui("DONATION", f"DONATION: {donor_name} tipped ₹{amount}: {message}", author=donor_name, meta=alert_payload)
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

    async def get_unified_history(self, limit: int = 100, legacy_history: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        """
        Builds a comprehensive, rich transaction history for the Tip Page Settings History tab.
        Includes:
        - VERIFIED / ANNOUNCED donations (Green - Matched & corroborated)
        - PENDING_EMAIL notifications (Yellow - Android notification captured, waiting for Paytm email confirmation)
        - WAITING_FOR_PAYMENT intents (Blue - QR intent initiated on tip page)
        - EXPIRED intents / notifications (Gray)
        - Legacy transactions from bot_service
        """
        async with self.lock:
            unified: List[Dict[str, Any]] = []
            seen_ids = set()

            # 1. Verified & Announced Donations
            for d_id, d in self.verified_donations.items():
                ts = d.get("verified_timestamp") or time.time()
                time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
                item = {
                    "id": d_id,
                    "timestamp": time_str,
                    "raw_time": ts,
                    "user": d.get("donor_name", "Supporter"),
                    "amount": float(d.get("amount", 0.0)),
                    "message": d.get("message", ""),
                    "status": "VERIFIED",
                    "status_label": "Verified",
                    "source": d.get("source") or ("Tip Page (Paytm QR)" if d.get("intent_id") else "Paytm Business QR"),
                    "utr": d.get("utr") or "—",
                    "order_id": d.get("order_id") or "—",
                    "is_test": d.get("is_test", False)
                }
                unified.append(item)
                seen_ids.add(d_id)
                if d.get("notification_event_id"):
                    seen_ids.add(d["notification_event_id"])
                if d.get("intent_id"):
                    seen_ids.add(d["intent_id"])
                if d.get("email_message_id"):
                    seen_ids.add(d["email_message_id"])

            # 2. Notifications pending email corroboration
            now = time.time()
            pending_buckets = set()
            for n_id, n in self.notifications.items():
                if n_id in seen_ids or n.get("status") in [DonationState.VERIFIED, DonationState.ANNOUNCED, "DUPLICATE_RESOLVED", "duplicate"]:
                    continue

                ts = n.get("received_at") or now
                # Check if expired (> 2 hours)
                age = now - ts
                status = "PENDING_EMAIL" if age <= 7200 else "EXPIRED"
                status_label = "Pending (Waiting for Email)" if status == "PENDING_EMAIL" else "Expired"

                raw_user = n.get("payer_name") or "Paytm Payer"
                clean_user = re.sub(r'\s+received\b.*', '', raw_user, flags=re.IGNORECASE).strip()
                clean_user = re.sub(r'^(?:payment\s+from|from|by)\s+', '', clean_user, flags=re.IGNORECASE).strip()
                user = clean_user if clean_user else "Paytm Payer"
                n_amount = round(float(n.get("amount", 0.0)), 2)

                # If this notification's amount and time match an already verified donation, skip it
                is_already_verified = False
                for v_don in self.verified_donations.values():
                    if abs(v_don.get("amount", 0.0) - n_amount) < 0.01:
                        v_time = v_don.get("verified_timestamp") or v_don.get("timestamp_epoch") or 0
                        if abs(v_time - ts) <= 600:
                            is_already_verified = True
                            break
                if is_already_verified:
                    continue

                # Deduplicate pending notifications within 120s window so duplicates never show
                bucket_key = (n_amount, user, int(ts / 120))
                if bucket_key in pending_buckets:
                    continue
                pending_buckets.add(bucket_key)

                time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
                item = {
                    "id": n_id,
                    "timestamp": time_str,
                    "raw_time": ts,
                    "user": user,
                    "amount": float(n.get("amount", 0.0)),
                    "message": n.get("notification_text") or "Payment detected from phone notification",
                    "status": status,
                    "status_label": status_label,
                    "source": "Paytm App Notification",
                    "utr": n.get("ref_info") or "—",
                    "order_id": "—",
                    "is_test": n.get("is_test", False)
                }
                unified.append(item)
                seen_ids.add(n_id)

            # 3. Intents created on tip page still waiting for payment
            for i_id, intent in self.intents.items():
                if i_id in seen_ids or intent.get("status") in [DonationState.VERIFIED, DonationState.ANNOUNCED]:
                    continue
                age = now - intent.get("created_at", now)
                status = "WAITING_FOR_PAYMENT" if age <= 600 else "EXPIRED"
                status_label = "Waiting for Payment" if status == "WAITING_FOR_PAYMENT" else "Expired"
                ts = intent.get("created_at") or now
                time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))
                item = {
                    "id": i_id,
                    "timestamp": time_str,
                    "raw_time": ts,
                    "user": intent.get("donor_name") or "Anonymous",
                    "amount": float(intent.get("amount", 0.0)),
                    "message": intent.get("message") or "Tip page QR code scanned",
                    "status": status,
                    "status_label": status_label,
                    "source": "Tip Page QR Intent",
                    "utr": "—",
                    "order_id": "—",
                    "is_test": intent.get("is_test", False)
                }
                unified.append(item)
                seen_ids.add(i_id)

            # 4. Include any legacy transactions
            if legacy_history:
                for leg in legacy_history:
                    leg_id = leg.get("transaction_id") or f"LEGACY-{leg.get('timestamp')}-{leg.get('user')}"
                    if leg_id not in seen_ids:
                        unified.append({
                            "id": leg_id,
                            "timestamp": leg.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S")),
                            "raw_time": 0,
                            "user": leg.get("user", "Supporter"),
                            "amount": float(leg.get("amount", 0.0)),
                            "message": leg.get("message", ""),
                            "status": "VERIFIED",
                            "status_label": "Verified",
                            "source": leg.get("source") or "Direct Payment",
                            "utr": leg.get("transaction_id") or "—",
                            "order_id": "—",
                            "is_test": False
                        })
                        seen_ids.add(leg_id)

            # If there are any pending notifications waiting for email, trigger a background email sync
            has_pending = any(n.get("status") == DonationState.PENDING_EMAIL for n in self.notifications.values())
            if has_pending:
                asyncio.create_task(self.sync_pending_emails())

            # Sort newest first by raw_time, then string timestamp
            unified.sort(key=lambda x: (x.get("raw_time") or 0, x.get("timestamp") or ""), reverse=True)
            return unified[:limit]

    async def delete_history_item(self, target_id: Optional[str] = None, timestamp: Optional[str] = None, user: Optional[str] = None, amount: Optional[float] = None) -> bool:
        """Deletes a specific history item from intents, notifications, or verified donations."""
        async with self.lock:
            found = False
            if target_id:
                if target_id in self.verified_donations:
                    del self.verified_donations[target_id]
                    found = True
                if target_id in self.notifications:
                    del self.notifications[target_id]
                    found = True
                if target_id in self.intents:
                    del self.intents[target_id]
                    found = True

            if not found and user and amount is not None:
                for k, v in list(self.verified_donations.items()):
                    if v.get("donor_name") == user and abs(float(v.get("amount", 0.0)) - float(amount)) < 0.01:
                        del self.verified_donations[k]
                        found = True
                        break
                for k, v in list(self.notifications.items()):
                    if v.get("payer_name") == user and abs(float(v.get("amount", 0.0)) - float(amount)) < 0.01:
                        del self.notifications[k]
                        found = True
                        break
                for k, v in list(self.intents.items()):
                    if v.get("donor_name") == user and abs(float(v.get("amount", 0.0)) - float(amount)) < 0.01:
                        del self.intents[k]
                        found = True
                        break

            if found:
                self._save()
            return found

    async def clear_all_history(self):
        """Clears all historical donations, notifications, and intents."""
        async with self.lock:
            self.verified_donations.clear()
            self.notifications.clear()
            self.intents.clear()
            self.emails.clear()
            self.announced_events.clear()
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

