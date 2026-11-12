import imaplib
import email
from email.header import decode_header
import re
import datetime
import logging
import time
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self, config_loader):
        self.config_loader = config_loader
        self.mail = None
        self.connected = False
        self.last_check = 0
        self.last_error = None

    def _connect(self):
        try:
            self.last_error = None
            config = self.config_loader()
            email_cfg = config.get("email_verification", {})

            username = email_cfg.get("email") or email_cfg.get("user")
            password = email_cfg.get("app_password") or email_cfg.get("password")
            imap_server = email_cfg.get("imap_server") or email_cfg.get("host", "imap.gmail.com")
            port = int(email_cfg.get("port", 993))

            if not username or not password:
                self.last_error = "Missing email or app_password"
                logger.warning(self.last_error)
                return False

            self.mail = imaplib.IMAP4_SSL(imap_server, port)
            self.mail.login(username, password)
            self.connected = True
            logger.info(f"Connected to IMAP as {username}")
            return True
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"IMAP Connection Failed: {e}")
            self.connected = False
            self.mail = None
            return False

    def _ensure_connected(self) -> bool:
        """
        Validates existing connection with NOOP; reconnects freshly if dropped or stale.
        """
        if self.mail and self.connected:
            try:
                status, _ = self.mail.noop()
                if status == "OK":
                    return True
            except Exception:
                self._disconnect()
        return self._connect()

    def check_connection(self):
        """
        Quickly checks if credentials are valid and server is reachable.
        Returns: (bool, str) -> (Success, Message)
        """
        if self._connect():
            self._disconnect()
            return True, "Connected Successfully"
        return False, self.last_error or "Connection Failed"

    def _disconnect(self):
        if self.mail:
            try:
                self.mail.close()
            except Exception:
                pass
            try:
                self.mail.logout()
            except Exception:
                pass
        self.connected = False
        self.mail = None

    @staticmethod
    def parse_transaction_content(subject: str, body: str, msg_id: str, email_date: Optional[datetime.datetime] = None) -> Optional[Dict[str, Any]]:
        """
        Robustly parses email subject and body (HTML or plain text) to extract:
        amount, payer_name, utr, order_id, status, timestamp.
        Supports Paytm for Business, PhonePe, and generic UPI notifications in English and Hindi.
        """
        full_text = f"{subject} \n {body}"
        clean_text = " ".join(full_text.split())
        clean_lower = clean_text.lower()

        # Check for failure indications first
        if any(w in clean_lower for w in ["payment failed", "transaction failed", "payment declined", "declined by bank", "refunded"]):
            status = "FAILED"
        else:
            status = "SUCCESS"

        # 1. Amount Extraction
        amount = 0.0
        amount_patterns = [
            r'(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)',
            r'([\d,]+(?:\.\d{1,2})?)\s*(?:₹|Rs\.?|INR)',
            r'(?:payment of|received|credited with|amount of)\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)',
            r'(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:प्राप्त|सफल|credited)'
        ]
        for pat in amount_patterns:
            m = re.search(pat, clean_text, re.IGNORECASE)
            if m:
                try:
                    val = float(m.group(1).replace(',', '').strip())
                    if val > 0:
                        amount = val
                        break
                except Exception:
                    pass

        if amount <= 0:
            return None

        # 2. Payer Name Extraction
        payer_name = None
        name_patterns = [
            r'(?:Customer Name|Payer Name|Paid by|Sender Name)\s*[:\-]?\s*([A-Za-z0-9._\-@ ]{2,40}?)(?:[,\n\r<|]|\s+via\b|\s+on\b|\s+using\b|\s+in account of\b|$)',
            r'(?:From)\s*[:\-]?\s*(?:BHIM\s*UPI\s*)?([A-Za-z0-9._\-@ ]{2,40}?)(?:[,\n\r<|]|\s+via\b|\s+on\b|\s+using\b|\s+in account of\b|$)',
            r'\b(?:from|by)\s+([A-Za-z0-9._\-@ ]{2,40}?)(?:[,\n\r<|]|\s+via\b|\s+on\b|\s+using\b|\s+in account of\b|$)',
            r'received\s+from\s+([A-Za-z0-9._\-@ ]{2,40}?)(?:[,\n\r<|]|\s+on\b|\s+via\b|\s+using\b|\s+in account of\b|$)',
            r'(?:payment from|sent by)\s+([A-Za-z0-9._\-@ ]{2,40}?)(?:[,\n\r<|]|\s+on\b|\s+via\b|$)',
            r'([A-Za-z0-9\u0900-\u097F ]{2,40})\s+ने\s+(?:₹|Rs\.?)?[\d,.]+\s+(?:का भुगतान|भेजे)',
            r'([A-Za-z0-9\u0900-\u097F ]{2,40})\s+से\s+(?:₹|Rs\.?)?[\d,.]+\s+प्राप्त'
        ]
        for pat in name_patterns:
            m = re.search(pat, clean_text, re.IGNORECASE)
            if m:
                cand = m.group(1).strip()
                # Clean up noise
                cand = re.sub(r'^(mr\.|mrs\.|ms\.|shri)\s+', '', cand, flags=re.IGNORECASE).strip()
                cand = re.sub(r'^bhim\s+upi\s+', '', cand, flags=re.IGNORECASE).strip()
                if len(cand) >= 2 and not any(k in cand.lower() for k in ['paytm', 'phonepe', 'bank', 'wallet', 'nodal', 'soundbox']):
                    payer_name = cand
                    break

        # 3. UTR / UPI Ref / Transaction ID Extraction
        utr = None
        utr_patterns = [
            r'(?:UPI\s*Ref(?:erence)?(?:\s*No\.?|\s*ID)?|Bank\s*Ref(?:erence)?(?:\s*No\.?|\s*ID)?|UTR(?:\s*No\.?)?|Txn\s*ID|Transaction\s*ID|Ref\s*No\.?)\s*[:\-]?\s*([0-9]{10,24})',
            r'\b(?:UPI|UTR)[/\-]?([0-9]{12})\b',
            r'Reference\s*Number\s*[:\-]?\s*([0-9]{10,24})'
        ]
        for pat in utr_patterns:
            m = re.search(pat, clean_text, re.IGNORECASE)
            if m:
                utr = m.group(1).strip()
                break

        # 4. Order ID Extraction
        order_id = None
        order_patterns = [
            r'Order\s*(?:ID|No\.?)\s*[:\-]?\s*([A-Za-z0-9_\-]{6,48})',
            r'Merchant\s*Ref\s*[:\-]?\s*([A-Za-z0-9_\-]{6,48})'
        ]
        for pat in order_patterns:
            m = re.search(pat, clean_text, re.IGNORECASE)
            if m:
                order_id = m.group(1).strip()
                break

        ts = email_date.timestamp() if email_date else time.time()

        return {
            "amount": amount,
            "payer_name": payer_name,
            "utr": utr,
            "order_id": order_id,
            "status": status,
            "timestamp": ts,
            "message_id": msg_id,
            "subject": subject
        }

    def search_paytm_emails(
        self,
        time_window_minutes: int = 60,
        target_amount: Optional[float] = None,
        min_timestamp: Optional[float] = None,
        processed_ids: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetches and parses Paytm/UPI payment confirmation emails received within time_window_minutes.
        Returns a list of parsed transaction records.
        """
        if not self._ensure_connected():
            logger.error(f"[EmailService] Could not connect: {self.last_error}")
            return []

        records = []
        try:
            status, _ = self.mail.select("inbox")
            if status != "OK":
                self._disconnect()
                if not self._connect():
                    return []
                status, _ = self.mail.select("inbox")

            date_str = (datetime.date.today() - datetime.timedelta(days=1)).strftime("%d-%b-%Y")
            status, messages = self.mail.search(None, f'(SINCE "{date_str}")')
            if status != "OK" or not messages or not messages[0]:
                status, messages = self.mail.search(None, "ALL")

            if status != "OK" or not messages or not messages[0]:
                return []

            email_ids = messages[0].split()
            recent_ids = email_ids[-40:] if len(email_ids) > 40 else email_ids

            now = datetime.datetime.now(datetime.timezone.utc)
            cutoff = now - datetime.timedelta(minutes=time_window_minutes)

            for e_id in reversed(recent_ids):
                try:
                    res, msg_data = self.mail.fetch(e_id, "(RFC822)")
                    for response_part in msg_data:
                        if isinstance(response_part, tuple):
                            msg = email.message_from_bytes(response_part[1])
                            msg_id = msg.get("Message-ID", "").strip() or f"NO_ID_{e_id.decode()}"

                            # Deduplication check
                            if processed_ids and msg_id in processed_ids:
                                continue

                            # Subject decoding
                            raw_subject = msg["Subject"] or ""
                            decoded_parts = decode_header(raw_subject)
                            subject = ""
                            for text_chunk, enc in decoded_parts:
                                if isinstance(text_chunk, bytes):
                                    subject += text_chunk.decode(enc or 'utf-8', errors='replace')
                                else:
                                    subject += str(text_chunk)

                            # Date check
                            from email.utils import parsedate_to_datetime
                            try:
                                email_date = parsedate_to_datetime(msg["Date"])
                                if email_date.tzinfo is None:
                                    email_date = email_date.replace(tzinfo=datetime.timezone.utc)
                                else:
                                    email_date = email_date.astimezone(datetime.timezone.utc)
                                if email_date < cutoff:
                                    continue
                            except Exception:
                                email_date = now

                            # Body extraction
                            body = ""
                            if msg.is_multipart():
                                for part in msg.walk():
                                    ctype = part.get_content_type()
                                    cdispo = str(part.get("Content-Disposition"))
                                    if ctype == "text/plain" and "attachment" not in cdispo:
                                        payload = part.get_payload(decode=True)
                                        if payload:
                                            body += payload.decode('utf-8', errors='replace') + "\n"
                                    elif ctype == "text/html" and "attachment" not in cdispo:
                                        payload = part.get_payload(decode=True)
                                        if payload:
                                            html_text = payload.decode('utf-8', errors='replace')
                                            if BeautifulSoup:
                                                soup = BeautifulSoup(html_text, "html.parser")
                                                body += soup.get_text() + "\n"
                                            else:
                                                body += re.sub(r'<[^>]+>', ' ', html_text) + "\n"
                            else:
                                payload = msg.get_payload(decode=True)
                                if payload:
                                    body = payload.decode('utf-8', errors='replace')

                            parsed = self.parse_transaction_content(subject, body, msg_id, email_date)
                            if parsed and parsed["status"] == "SUCCESS":
                                if target_amount is not None:
                                    if abs(parsed["amount"] - float(target_amount)) < 0.01:
                                        records.append(parsed)
                                else:
                                    records.append(parsed)
                except Exception as ex:
                    logger.warning(f"[EmailService] Error checking email {e_id}: {ex}")
                    continue

        except Exception as e:
            logger.error(f"[EmailService] search_paytm_emails failed: {e}")
            self._disconnect()

        return records

    def verify_payment(self, expected_amount, sender_hint=None, time_window_minutes=10, min_timestamp=None, processed_ids=None):
        """
        Searches for a payment confirmation email matching expected_amount.
        Preserves backwards compatibility with existing callers.
        Returns: (Verified (bool), Details (dict/str), Message-ID (str/None))
        """
        records = self.search_paytm_emails(
            time_window_minutes=time_window_minutes,
            target_amount=expected_amount,
            min_timestamp=min_timestamp,
            processed_ids=processed_ids
        )

        if records:
            match = records[0]
            desc = f"Verified via email: {match['subject']} (Payer: {match.get('payer_name') or 'Unknown'}, UTR: {match.get('utr') or 'N/A'})"
            return True, desc, match["message_id"]

        return False, "No matching payment found in recent emails.", None

    def check_for_payment_email(self, amount, time_window=60, min_timestamp=None, processed_ids=None):
        """
        Public wrapper for verify_payment used by API routes.
        Returns a dict enriched with payer_name, utr, and details.
        """
        records = self.search_paytm_emails(
            time_window_minutes=time_window,
            target_amount=amount,
            min_timestamp=min_timestamp,
            processed_ids=processed_ids
        )

        if records:
            match = records[0]
            return {
                "verified": True,
                "message": f"Verified via email: {match['subject']}",
                "message_id": match["message_id"],
                "payer_name": match.get("payer_name"),
                "utr": match.get("utr"),
                "details": match
            }

        return {
            "verified": False,
            "message": "No matching payment email found.",
            "message_id": None,
            "payer_name": None,
            "utr": None,
            "details": None
        }
