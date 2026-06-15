import imaplib
import email
from email.header import decode_header
import re
import datetime
import logging
import time
from bs4 import BeautifulSoup

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
            
            username = email_cfg.get("email")
            password = email_cfg.get("app_password")
            imap_server = email_cfg.get("imap_server", "imap.gmail.com")
            
            if not username or not password:
                self.last_error = "Missing email or app_password"
                logger.warning(self.last_error)
                return False
                
            self.mail = imaplib.IMAP4_SSL(imap_server)
            self.mail.login(username, password)
            self.connected = True
            logger.info(f"Connected to IMAP as {username}")
            return True
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"IMAP Connection Failed: {e}")
            self.connected = False
            return False

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
                self.mail.close() # Close selected mailbox first if any
            except Exception:
                pass
            try:
                self.mail.logout() # Goodbye
            except Exception:
                pass
        self.connected = False
        self.mail = None

    def verify_payment(self, expected_amount, sender_hint=None, time_window_minutes=10, min_timestamp=None):
        """
        Searches for a payment confirmation email matching the amount within the last X minutes.
        If min_timestamp (float/int unix epoch) is provided, emails before this time are ignored.
        Returns: (Verified (bool), Details (dict/str), Message-ID (str/None))
        """
        if not self.connected:
            if not self._connect():
                return False, f"Could not connect: {self.last_error or 'Unknown Error'}", None

        try:
            self.mail.select("inbox")
            
            # IMAP Search is by DATE (Day granularity). So we fetch today's emails first.
            date_str = (datetime.date.today()).strftime("%d-%b-%Y")
            logger.info(f"Searching emails since: {date_str}")
            status, messages = self.mail.search(None, f'(SINCE "{date_str}")')
            
            if status != "OK":
                logger.warning("IMAP Search Failed or No Emails")
                return False, "No emails found today", None

            email_ids = messages[0].split()
            logger.info(f"Found {len(email_ids)} emails today")
            # Look at the last 20 emails
            recent_ids = email_ids[-20:] if len(email_ids) > 20 else email_ids
            
            # Regex Patterns for Common UPI Apps
            patterns = [
                r"received\s+₹?(\d+(?:\.\d{1,2})?)", 
                r"received\s+Rs\.?\s*(\d+(?:\.\d{1,2})?)",
                r"credited\s+with\s+₹?(\d+(?:\.\d{1,2})?)",
                r"payment\s+of\s+₹?(\d+(?:\.\d{1,2})?)\s+received",
                r"Rs\.\s*(\d+(?:\.\d{1,2})?)\s+paid", # Paytm Business: "Rs. 1.00 paid at..."
                r"Payment\s+Received\s+₹\s*(\d+(?:\.\d{1,2})?)", # Paytm Business subject tail
                r"received\s+₹\s*(\d+(?:\.\d{1,2})?)", # Generic "received ₹ 1.00"
                r"paid\s+at.*Rs\.\s*(\d+(?:\.\d{1,2})?)" # "paid at ... Rs. 1.00"
            ]

            now = datetime.datetime.now(datetime.timezone.utc) # Use UTC for reference
            cutoff = now - datetime.timedelta(minutes=time_window_minutes)

            # Convert min_timestamp to UTC Aware Datetime
            min_dt = None
            if min_timestamp:
                try:
                    ts = float(min_timestamp)
                    if ts > 1e11: ts /= 1000 # Convert ms to seconds
                    # Creates UTC aware datetime from timestamp
                    min_dt = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc)
                    logger.info(f"Filtering emails before {min_dt} (UTC)")
                except Exception as e:
                    logger.warning(f"Invalid min_timestamp: {e}")

            for e_id in reversed(recent_ids):
                try:
                    res, msg_data = self.mail.fetch(e_id, "(RFC822)")
                    for response_part in msg_data:
                        if isinstance(response_part, tuple):
                            msg = email.message_from_bytes(response_part[1])
                            
                            # Extract Message-ID
                            msg_id = msg.get("Message-ID", "").strip()
                            if not msg_id:
                                msg_id = f"NO_ID_{e_id.decode()}" # Fallback
                            
                            # Parse Subject
                            subject = decode_header(msg["Subject"])[0][0]
                            if isinstance(subject, bytes):
                                subject = subject.decode()
                            
                            logger.info(f"Checking Email ID {e_id.decode()} (Msg-ID: {msg_id}): {subject}")
                            
                            # Strict Date Check
                            try:
                                from email.utils import parsedate_to_datetime
                                email_date = parsedate_to_datetime(msg["Date"])
                                
                                # Ensure email_date is comparable (UTC)
                                if email_date.tzinfo is None:
                                    # Fallback for naive date: assume server local, convert to UTC?
                                    # But parsedate usually returns aware.
                                    email_date = email_date.replace(tzinfo=datetime.timezone.utc)
                                else:
                                    email_date = email_date.astimezone(datetime.timezone.utc)

                                logger.info(f"  -> Email Date: {email_date}")

                                # 1. Check Window (sanity check)
                                if email_date < cutoff:
                                    continue # Too old
                                
                                # 2. Check Min Timestamp (Transaction Start) - STRICT
                                if min_dt: 
                                    # Allow 1-2 seconds of clock skew/latency tolerance? 
                                    # No, let's keep it strict. 
                                    # If email came BEFORE transaction started -> Invalid.
                                    if email_date < min_dt:
                                        logger.info(f"  -> Skipped: Email date {email_date} is before transaction start {min_dt}")
                                        continue
                                    
                            except Exception as e_date:
                                logger.warning(f"Date parsing failed: {e_date}")
                                # If critical timestamp check is required but failed, skip to be safe?
                                if min_timestamp: 
                                    continue
                                pass

                            # Filter by Subject keywords
                            subject_lower = subject.lower()
                            keywords = ["payment", "received", "credited", "sent you", "money", "rupees", "rs.", "paytm", "phonepe", "gpay", "google pay", "paid"]
                            if not any(k in subject_lower for k in keywords):
                                continue

                            # Get Body
                            body = ""
                            if msg.is_multipart():
                                for part in msg.walk():
                                    ctype = part.get_content_type()
                                    cdispo = str(part.get("Content-Disposition"))

                                    if ctype == "text/plain" and "attachment" not in cdispo:
                                        body = part.get_payload(decode=True).decode()
                                        break 
                                    elif ctype == "text/html" and "attachment" not in cdispo:
                                        html = part.get_payload(decode=True).decode()
                                        soup = BeautifulSoup(html, "html.parser")
                                        body = soup.get_text()
                            else:
                                body = msg.get_payload(decode=True).decode()

                            # Regex Check Amount
                            full_text = f"{subject} {body}"
                            clean_text = " ".join(full_text.split())
                            logger.info(f"Full Text for Regex: {clean_text[:100]}...")

                            for pat in patterns:
                                match = re.search(pat, clean_text, re.IGNORECASE)
                                if match:
                                    amount_found = float(match.group(1))
                                    logger.info(f"  -> Match Found! Pattern: {pat}, Amount: {amount_found}")
                                    
                                    if abs(amount_found - float(expected_amount)) < 1.0:
                                        logger.info(f"PAYMENT VERIFIED: Found {amount_found} in '{subject}'")
                                        return True, f"Verified via email: {subject}", msg_id
                                        
                except Exception as ex:
                    logger.error(f"Error checking email {e_id}: {ex}")
                    continue

            return False, "No matching payment found in recent emails.", None

        except Exception as e:
            logger.error(f"Verification Check Failed: {e}")
            self._disconnect() 
            return False, str(e), None

    def check_for_payment_email(self, amount, time_window=60, min_timestamp=None):
        """
        Public wrapper for verify_payment to be used by the API.
        Checks for a payment of 'amount' within the last 'time_window' minutes.
        """
        success, message, msg_id = self.verify_payment(amount, time_window_minutes=time_window, min_timestamp=min_timestamp)
        return {"verified": success, "message": message, "message_id": msg_id}
