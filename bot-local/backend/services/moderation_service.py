import time
import logging
import asyncio
import json
import re
import unicodedata
import difflib

logger = logging.getLogger(__name__)

class ModerationService:
    def __init__(self, sb_ws_getter, config_loader=None):
        self.sb_ws_getter = sb_ws_getter # Function to get the current WebSocket
        self.config_loader = config_loader
        self.msg_history = {} # {username: [timestamps]}
        self.text_history = {} # {username: [{"timestamp": float, "text": str}]}
        self.internal_mutes = {} # {username: mute_until_timestamp}
        self.last_warning_time = {} # {username: timestamp}
        self.permit_list = {} # {username: expiration_timestamp}

    @staticmethod
    def _is_ws_open(ws) -> bool:
        """Check WebSocket open state across websockets library versions."""
        if ws is None:
            return False
        if getattr(ws, "open", False):
            return True
        try:
            from websockets.protocol import State
            if hasattr(ws, "state") and ws.state == State.OPEN:
                return True
        except ImportError:
            pass
        return False

    async def run_filters(self, author, message, mod_cfg):
        if message.strip().startswith("!"):
            return False, ""
            
        filters = mod_cfg.get("filters", {})
        now = time.time()

        # Update text history
        if author not in self.text_history:
            self.text_history[author] = []
        self.text_history[author].append({"timestamp": now, "text": message})
        # Keep only last 60 seconds for general advanced filtering
        self.text_history[author] = [msg for msg in self.text_history[author] if now - msg["timestamp"] < 60]
        
        # 0. Permit Check (Link Protection Override)
        # Check if user has a temporary permit
        if author in self.permit_list:
            if time.time() < self.permit_list[author]:
                # User is permitted, skip link check but still check others? 
                # For now, let's just allow links but check simple spam
                pass 
            else:
                del self.permit_list[author] # Expired

        # A. Link Protection (NEW)
        link_cfg = filters.get("link_protection", {})
        if link_cfg.get("enabled"):
            # If user is permitted, skip this check
            is_permitted = author in self.permit_list and time.time() < self.permit_list[author]
            
            if not is_permitted:
                # Regex for URLs (http, https, www, .com, etc)
                url_pattern = r"(https?://\S+|www\.\S+|\S+\.(com|org|net|io|gg|tv|xyz)\b)"
                if re.search(url_pattern, message, re.IGNORECASE):
                    # Check Whitelist
                    whitelist = link_cfg.get("whitelist", [])
                    if not any(domain in message for domain in whitelist):
                        return True, link_cfg.get("message", "No links allowed! Ask for !permit.")

        # B. Spam Protection
        spam_cfg = filters.get("spam_protection", {})
        if spam_cfg.get("enabled"):
            if author not in self.msg_history:
                self.msg_history[author] = []
            
            self.msg_history[author].append(now)
            window = spam_cfg.get("window", 10)
            self.msg_history[author] = [t for t in self.msg_history[author] if now - t < window]
            
            if len(self.msg_history[author]) > spam_cfg.get("limit", 5):
                return True, spam_cfg.get("message", "Stop spamming!")

        # C. Word Blacklist
        bl_cfg = filters.get("word_blacklist", {})
        if bl_cfg.get("enabled"):
            for word in bl_cfg.get("words", []):
                if not word: continue
                pattern = re.escape(word).replace(r'\*', '.*')
                if re.search(f"^{pattern}$", message, re.IGNORECASE) or re.search(f"\\b{pattern}\\b", message, re.IGNORECASE):
                    return True, bl_cfg.get("message", "Blacklisted word detected!")

        # D. Excess Symbols & Emoji Filter
        sym_cfg = filters.get("excess_symbols", {})
        if sym_cfg.get("enabled"):
            symbols = "!@#$%^&*()_+-=[]{}|;':\",.//<>?~`"
            limit = sym_cfg.get("limit", 10)
            
            def _is_emoji(char):
                """Detect emojis via Unicode category and codepoint ranges."""
                cp = ord(char)
                # Fast ASCII shortcut
                if cp < 128:
                    return False
                # Unicode emoji ranges
                if (0x1F600 <= cp <= 0x1F64F or  # Emoticons
                    0x1F300 <= cp <= 0x1F5FF or  # Misc Symbols & Pictographs
                    0x1F680 <= cp <= 0x1F6FF or  # Transport & Map
                    0x1F700 <= cp <= 0x1F77F or  # Alchemical Symbols
                    0x1F780 <= cp <= 0x1F7FF or  # Geometric Shapes Extended
                    0x1F800 <= cp <= 0x1F8FF or  # Supplemental Arrows-C
                    0x1F900 <= cp <= 0x1F9FF or  # Supplemental Symbols & Pictographs
                    0x1FA00 <= cp <= 0x1FA6F or  # Chess Symbols
                    0x1FA70 <= cp <= 0x1FAFF or  # Symbols & Pictographs Extended-A
                    0x2600  <= cp <= 0x26FF  or  # Misc Symbols (☀️ ⚡ etc.)
                    0x2700  <= cp <= 0x27BF  or  # Dingbats
                    0xFE00  <= cp <= 0xFE0F  or  # Variation Selectors
                    0x1F1E0 <= cp <= 0x1F1FF):   # Flags (Regional Indicator)
                    return True
                # Fallback: Unicode category So = Symbol, Other
                return unicodedata.category(char) == 'So'
            
            count = sum(1 for char in message if char in symbols or _is_emoji(char))
            if count >= limit:
                return True, sym_cfg.get("message", f"Too many symbols/emojis! (Max {limit})")

        # E. Repetition Filter
        rep_cfg = filters.get("repetition_filter", {})
        if rep_cfg.get("enabled"):
            words = message.split()
            if len(words) > 3:
                unique = set([w.lower() for w in words])
                ratio = len(unique) / len(words)
                if ratio < 0.4:
                    return True, "Stop repeating yourself!"

        # F. Caps Protection (Stop Shouting)
        caps_cfg = filters.get("caps_protection", {})
        if caps_cfg.get("enabled"):
            alpha_chars = [c for c in message if c.isalpha()]
            if len(alpha_chars) > 8: # Only trigger if actually typing a sentence
                upper_chars = [c for c in alpha_chars if c.isupper()]
                caps_ratio = (len(upper_chars) / len(alpha_chars)) * 100
                if caps_ratio > caps_cfg.get("limit", 70):
                    return True, "Stop shouting! (Too many CAPS)"
        
        # G. Length Protection (Stop Text Walls)
        len_cfg = filters.get("length_protection", {})
        if len_cfg.get("enabled"):
            if len(message) > len_cfg.get("limit", 300):
                return True, "Message is too long! (Text Wall)"

        # H. Auto Spam & Gibberish Filter
        gib_cfg = filters.get("gibberish_filter", {})
        if gib_cfg.get("enabled", True):
            # 1. Consecutive Character Repetition (e.g. "ohhhhhhh", "ahhhhhhh")
            if re.search(r"(.)\1{4,}", message):
                return True, "Excessive character repetition detected!"

            # 2. Repeated Words Filter (e.g., "hello hello hello hello")
            words = message.split()
            if words:
                from collections import Counter
                word_counts = Counter([w.lower() for w in words])
                for w, count in word_counts.items():
                    # If a word (length > 1) is repeated 3 or more times
                    if len(w) > 1 and count >= 3:
                        return True, f"Repeated word '{w}' detected!"
                    # For single characters (like 'a a a a'), flag if repeated 4 or more times
                    elif len(w) == 1 and count >= 4:
                        return True, f"Excessive single character repetition detected!"

            # 3. Extremely long words (gibberish/spam, e.g., "gsiyeuueuehdbdhdidhdjs")
            url_pattern = r"(https?://\S+|www\.\S+|\S+\.(com|org|net|io|gg|tv|xyz)\b)"
            for word in words:
                if re.match(url_pattern, word, re.IGNORECASE):
                    continue
                # Skip non-Latin scripts (Hindi/Devanagari, Arabic, CJK, etc.)
                # These scripts have high char-density by nature — not gibberish
                if any(ord(c) > 0x0900 for c in word):
                    continue
                if len(word) > 25:  # Raised from 20 to avoid false positives
                    return True, "Word is too long (gibberish/spam)!"
                if len(word) > 12:
                    unique_chars = len(set(word.lower()))
                    char_ratio = unique_chars / len(word)
                    if char_ratio < 0.3:
                        return True, "Repetitive character pattern detected!"

        # I. Identical Message Filter
        ident_cfg = filters.get("identical_message_filter", {})
        if ident_cfg.get("enabled"):
            window = ident_cfg.get("window", 30)
            limit = ident_cfg.get("limit", 3)
            # Count identical messages within the window
            identical_count = 0
            for msg_obj in self.text_history.get(author, []):
                if now - msg_obj["timestamp"] <= window:
                    if msg_obj["text"].strip().lower() == message.strip().lower():
                        identical_count += 1
            
            if identical_count > limit:
                return True, "Stop spamming the same message!"

        # J. Advanced Similar Message Filter
        adv_cfg = filters.get("advanced_spam_filter", {})
        if adv_cfg.get("enabled"):
            short_spam_limit = adv_cfg.get("short_spam_limit", 3)
            
            # Check 1: Multiple short gibberish messages
            if len(message) < 5:
                short_count = sum(1 for m in self.text_history.get(author, []) 
                                  if len(m["text"]) < 5 and now - m["timestamp"] <= 15)
                if short_count > short_spam_limit:
                    return True, "Stop spamming short messages!"
                    
            # Check 2: Fuzzy similarity with previous messages
            # Only compare if message is substantial (> 4 chars) to avoid false positives on short words like "ok", "yes"
            if len(message) > 4:
                recent_msgs = [m["text"] for m in self.text_history.get(author, []) if m["text"] != message]
                for prev_msg in recent_msgs[-3:]: # Check against last 3 unique messages
                    if len(prev_msg) > 4:
                        similarity = difflib.SequenceMatcher(None, message.lower(), prev_msg.lower()).ratio()
                        if similarity > 0.8:
                            return True, "Stop spamming similar messages!"

        # K. Fast Spam Filter (Fast Typing)
        fast_cfg = filters.get("fast_spam_filter", {})
        if fast_cfg.get("enabled"):
            window = fast_cfg.get("window", 5)
            limit = fast_cfg.get("limit", 10)
            
            fast_count = sum(1 for m in self.text_history.get(author, []) if now - m["timestamp"] <= window)
            if fast_count > limit:
                return True, "Stop typing so fast! (Fast Spam Detected)"

        return False, ""

    def grant_permit(self, author, duration=60):
        self.permit_list[author] = time.time() + duration

    async def trigger_timeout(self, author, duration, channel_id=None):
        # 1. Prepare Payload
        target = channel_id or author
        payload = {
            "request": "DoAction",
            "action": {"name": "PiBot Timeout"},
            "args": {
                "user": target,
                "userName": author,
                "duration": duration
            },
            "id": "PiBotTimeout"
        }
        
        # 2. Try Main Connection
        ws = self.sb_ws_getter()
        is_connected = self._is_ws_open(ws)
        
        if is_connected:
            try:
                await ws.send(json.dumps(payload))
                logger.info(f"Timeout Sent (Main): {author} for {duration}s")
                return
            except Exception as e:
                logger.warning(f"Timeout Main WS Failed: {e}")
                is_connected = False
        
        # 3. Fallback Connection
        if not is_connected and self.config_loader:
            try:
                cfg = self.config_loader()
                sb_cfg = cfg.get("streamer_bot", {})
                if not sb_cfg.get("enabled"): return
                
                host = sb_cfg.get("host", "127.0.0.1")
                port = sb_cfg.get("port", 8080)
                uri = f"ws://{host}:{port}/"
                
                logger.info(f"Timeout (Fallback) Connecting: {uri}")
                import websockets
                async with websockets.connect(uri) as temp_ws:
                    await temp_ws.send(json.dumps(payload))
                logger.info("Timeout Sent (Fallback)")
            except Exception as e:
                logger.error(f"Timeout Fallback Failed: {e}")
        else:
            logger.warning("Timeout Failed: No connection available.")

    async def trigger_delete(self, msg_id):
        payload = {
            "request": "DoAction",
            "action": {"name": "PiBot Delete"},
            "args": {"msgId": msg_id},
            "id": "PiBotDelete"
        }
        
        # 1. Main Connection
        ws = self.sb_ws_getter()
        is_connected = self._is_ws_open(ws)
        
        if is_connected:
            try:
                await ws.send(json.dumps(payload))
                logger.info(f"Delete Sent (Main): {msg_id}")
                return
            except Exception as e:
                logger.warning(f"Delete Main WS Failed: {e}")
                is_connected = False
        
        # 2. Fallback
        if not is_connected and self.config_loader:
            try:
                cfg = self.config_loader()
                sb_cfg = cfg.get("streamer_bot", {})
                host = sb_cfg.get("host", "127.0.0.1")
                port = sb_cfg.get("port", 8080)
                uri = f"ws://{host}:{port}/"
                
                import websockets
                async with websockets.connect(uri) as temp_ws:
                    await temp_ws.send(json.dumps(payload))
                logger.info("Delete Sent (Fallback)")
            except Exception as e:
                logger.error(f"Delete Fallback Failed: {e}")

    def is_user_muted(self, author):
        return self.internal_mutes.get(author, 0) > time.time()

    def set_user_mute(self, author, until):
        self.internal_mutes[author] = until
