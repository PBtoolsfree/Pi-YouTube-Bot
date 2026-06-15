import asyncio
import logging
import re
import shutil
import tempfile
import time
import os
import platform
import traceback
import threading
from collections import deque
from typing import Optional

import edge_tts
import langid

from .config_manager import ConfigManager

logger = logging.getLogger(__name__)

# ── Platform detection ────────────────────────────────────────────────────────
_IS_LINUX = platform.system() != "Windows"
_IS_PI = _IS_LINUX  # Good enough heuristic for this project

# ── Emoji / Junk regex ────────────────────────────────────────────────────────
_EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # Emoticons
    "\U0001F300-\U0001F5FF"  # Misc Symbols & Pictographs
    "\U0001F680-\U0001F6FF"  # Transport & Map
    "\U0001F1E0-\U0001F1FF"  # Flags
    "\U0001F900-\U0001F9FF"  # Supplemental Symbols
    "\U0001FA00-\U0001FA6F"  # Chess / Extended
    "\U0001FA70-\U0001FAFF"  # Symbols & Pictographs Extended-A
    "\U00002702-\U000027B0"  # Dingbats
    "\U0000FE00-\U0000FE0F"  # Variation Selectors
    "\U0000200D"             # Zero Width Joiner
    "\U000020E3"             # Combining Enclosing Keycap
    "\U00002600-\U000026FF"  # Misc Symbols
    "\U00002300-\U000023FF"  # Misc Technical
    "\U0000200B-\U0000200F"  # Zero-width chars
    "\U00003030\U000030A0-\U000030FF"  # CJK Symbols
    "]+",
    flags=re.UNICODE,
)

_AUDIO_DEBUG_LOG = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "logs",
    "audio_debug.log",
)
_MAX_LOG_BYTES = 5 * 1024 * 1024  # 5 MB cap

# ── Default banned words (fallback if config has none) ────────────────────────
_DEFAULT_BANNED_WORDS = [
    "fuck", "bitch", "cunt", "nigger", "nigga", "faggot",
    "dick", "pussy", "asshole", "motherfucker",
]


def _ensure_log_dir() -> None:
    os.makedirs(os.path.dirname(_AUDIO_DEBUG_LOG), exist_ok=True)


_log_lock = threading.Lock()


def _rotate_log_if_needed() -> None:
    """Truncate audio debug log if it exceeds 5 MB. Must be called with _log_lock held."""
    try:
        if os.path.exists(_AUDIO_DEBUG_LOG) and os.path.getsize(_AUDIO_DEBUG_LOG) > _MAX_LOG_BYTES:
            with open(_AUDIO_DEBUG_LOG, "w", encoding="utf-8") as fh:
                fh.write("[log rotated]\n")
    except OSError:
        pass


def _sync_write_log(msg: str) -> None:
    """Synchronous core for writing logs, protected by a thread lock."""
    with _log_lock:
        _rotate_log_if_needed()
        try:
            with open(_AUDIO_DEBUG_LOG, "a", encoding="utf-8") as fh:
                fh.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        except OSError as exc:
            logger.warning("Could not write audio debug log: %s", exc)


def _append_audio_log(msg: str) -> None:
    """Append a timestamped line to the audio debug log asynchronously."""
    try:
        loop = asyncio.get_running_loop()
        # Fire-and-forget offload to background thread
        loop.run_in_executor(None, _sync_write_log, msg)
    except RuntimeError:
        # Fallback if called outside an async event loop
        _sync_write_log(msg)


def _get_temp_dir() -> str:
    """Return optimal temp directory — /dev/shm (RAM disk) on Pi, system default on Windows."""
    if _IS_PI:
        shm = "/dev/shm"
        if os.path.isdir(shm) and os.access(shm, os.W_OK):
            return shm
    return tempfile.gettempdir()


def _find_ffmpeg() -> str:
    """Return path to ffmpeg executable. Prefers system on Linux/Pi."""
    if _IS_LINUX:
        return "ffmpeg"

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local = os.path.join(base_dir, "ffmpeg.exe")
    return local if os.path.exists(local) else "ffmpeg"


def _find_ffplay() -> str:
    """Return path to ffplay executable."""
    if _IS_LINUX:
        found = shutil.which("ffplay") or "ffplay"
        return found

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local = os.path.join(base_dir, "ffplay.exe")
    return local if os.path.exists(local) else "ffplay"


def _validate_rate_volume(value: str) -> str:
    """Validate and clamp TTS rate/volume format (e.g. '+0%', '-50%', '+100%')."""
    if not value or not isinstance(value, str):
        return "+0%"
    # Strip and normalize
    value = value.strip()
    match = re.match(r'^([+-]?\d+)%$', value)
    if not match:
        return "+0%"
    num = int(match.group(1))
    num = max(-50, min(100, num))
    return f"+{num}%" if num >= 0 else f"{num}%"


class AudioService:
    """
    Async TTS/audio engine — optimized for Raspberry Pi 4.

    Queues text across two channels (public / secret), generates speech via
    Edge-TTS (with gTTS fallback), and streams audio to a gaming PC via UDP
    or plays locally via mpg123/ffplay/aplay.

    Pi 4 Optimizations:
    - Uses /dev/shm (RAM disk) for temp files to avoid SD card wear
    - ALSA aplay fallback for headless setups
    - Process timeout protection (default 30s) to prevent zombie processes
    - TTS retry with backoff before gTTS fallback
    """

    def __init__(self) -> None:
        self.queues = {
            "public": deque(),
            "secret": deque(),
        }
        self.current_process: Optional[asyncio.subprocess.Process] = None
        self.is_playing: bool = False
        self.current_text: str = ""
        self.metrics = {
            "played_count": 0,
            "dropped_count": 0,
            "total_latency": 0.0,
            "avg_latency": 0.0,
            # ── Enhanced Pi 4 metrics ──
            "edge_tts_failures": 0,
            "gtts_fallbacks": 0,
            "timeout_kills": 0,
            "total_errors": 0,
        }
        self.paused: bool = False
        self.queue_paused = {"public": False, "secret": False}
        self._shutdown: bool = False
        self.broadcast_func = None

        # ── Health tracking ───────────────────────────────────────────────────
        self._start_time: float = time.time()
        self._last_error: Optional[dict] = None  # {"message": str, "timestamp": float}
        self._consecutive_errors: int = 0
        self._skip_requested: bool = False

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        _ensure_log_dir()
        temp_dir = _get_temp_dir()
        logger.info("Audio Engine starting. Temp dir: %s | Platform: %s", temp_dir, platform.system())
        _append_audio_log(f"Engine started. Temp dir: {temp_dir}")
        
        # Cleanup leftover temp files from past crashes
        try:
            import glob
            orphans = glob.glob(os.path.join(temp_dir, "pibot_tts_*.mp3"))
            for orphan in orphans:
                try:
                    os.unlink(orphan)
                except OSError:
                    pass
            if orphans:
                logger.info("Cleaned up %d orphaned TTS temp files.", len(orphans))
        except Exception as e:
            logger.warning("Failed to clean up audio temp files: %s", e)

        asyncio.create_task(self._process_loop())

    def stop(self) -> None:
        self._shutdown = True
        if self.current_process:
            try:
                self.current_process.terminate()
            except OSError:
                pass
        logger.info("Audio Engine stopped.")

    # ── Health Status ─────────────────────────────────────────────────────────

    @property
    def health_status(self) -> str:
        """Compute health status: 'healthy', 'degraded', or 'error'."""
        if self._consecutive_errors >= 5:
            return "error"
        if self._consecutive_errors >= 2 or self.metrics["edge_tts_failures"] > 10:
            return "degraded"
        return "healthy"

    @property
    def uptime_seconds(self) -> float:
        return round(time.time() - self._start_time, 1)

    # ── Public Methods ────────────────────────────────────────────────────────

    @staticmethod
    def _clean_for_tts(text: str) -> str:
        """Apply anti-spam filters, strip emojis, excessive punctuation, and collapse whitespace."""
        # 1. URL and Link Removal
        cleaned = re.sub(r'https?://[^\s]+', '', text)
        cleaned = re.sub(r'www\.[^\s]+', '', cleaned)
        # Only match common TLDs to avoid stripping "Hello.How are you"
        cleaned = re.sub(r'\b[a-zA-Z0-9.-]+\.(?:com|net|org|in|co|uk|me|io|tv|gg)\b(?:/[^\s]*)?', '', cleaned)

        # 2. Character Repetition Filter (squash 4+ identical chars into 2)
        cleaned = re.sub(r'(.)\1{3,}', r'\1\1', cleaned)

        # 3. Profanity / Banned Words Replacement (from config or defaults)
        cfg = ConfigManager.get_config()
        banned_words = cfg.get("audio", {}).get("banned_words", _DEFAULT_BANNED_WORDS)
        if banned_words:
            pattern = re.compile(
                r'\b(' + '|'.join(map(re.escape, banned_words)) + r')\b',
                flags=re.IGNORECASE,
            )
            cleaned = pattern.sub('*bleep*', cleaned)

        # Original Cleaning
        cleaned = _EMOJI_PATTERN.sub("", cleaned)
        cleaned = re.sub(r"([!?.}]){2,}", r"\1", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    async def speak(
        self, text: str, channel: str = "public", voice: Optional[str] = None
    ) -> None:
        """Add text to the TTS queue for the given channel."""
        # --- SPAM GUARD: Ignore System Commands ---
        if text.strip().startswith(("!", "/")):
            logger.info("Ignoring system command from TTS: %s", text)
            if self.broadcast_func:
                asyncio.create_task(self.broadcast_func({
                    "type": "log",
                    "category": "SYSTEM",
                    "message": f"TTS Skipped (Command): {text[:50]}",
                    "timestamp": time.time(),
                    "author": "AudioEngine",
                    "meta": {}
                }))
            return

        if os.environ.get("RUN_MODE") == "cloud":
            logger.info("Cloud mode: Forwarding TTS to Pi clients...")
            if self.broadcast_func:
                asyncio.create_task(self.broadcast_func({
                    "type": "play_tts",
                    "text": text,
                    "channel": channel,
                    "voice": voice
                }))
            return

        if channel not in self.queues:
            logger.warning("Unknown audio channel: %s — defaulting to public", channel)
            channel = "public"

        cfg = ConfigManager.get_config()
        max_queue = cfg.get("audio", {}).get("max_queue_size", 20)

        if len(self.queues[channel]) >= max_queue:
            logger.warning(
                "Audio queue full (%s, max=%d). Dropping oldest item.", channel, max_queue
            )
            self.queues[channel].popleft()
            self.metrics["dropped_count"] += 1

        self.queues[channel].append(
            {
                "text": text,
                "voice": voice,
                "timestamp": time.time(),
                "id": f"{channel}_{time.time()}",
            }
        )

    async def skip_current(self) -> bool:
        """Terminate the currently playing audio process."""
        if self.current_process:
            logger.info("Skipping current audio track.")
            self._skip_requested = True
            try:
                self.current_process.terminate()
            except OSError:
                pass
            return True
        return False

    def clear_queue(self, channel: Optional[str] = None) -> None:
        if channel:
            if channel in self.queues:
                self.queues[channel].clear()
                logger.info("Cleared audio queue: %s", channel)
        else:
            for q in self.queues.values():
                q.clear()
            logger.info("Cleared all audio queues.")

    async def toggle_pause(self, paused: bool) -> None:
        self.paused = paused
        logger.info("Audio Engine paused: %s", paused)
        if paused and self.is_playing:
            await self.skip_current()

    def set_queue_pause(self, channel: str, paused: bool) -> None:
        if channel in self.queue_paused:
            self.queue_paused[channel] = paused
            logger.info("Queue '%s' paused: %s", channel, paused)

    def reorder_queue(self, channel: str, new_ids: list) -> None:
        if channel not in self.queues:
            return
        current_list = list(self.queues[channel])
        id_map = {item["id"]: item for item in current_list}
        new_deque: deque = deque()
        for iid in new_ids:
            if iid in id_map:
                new_deque.append(id_map.pop(iid))
        # Append any items that arrived during reorder
        for item in current_list:
            if item["id"] in id_map:
                new_deque.append(item)
        self.queues[channel] = new_deque

    def remove_from_queue(self, channel: str, item_id: str) -> None:
        if channel not in self.queues:
            return
        self.queues[channel] = deque(
            item for item in self.queues[channel] if item.get("id") != item_id
        )

    def get_status(self) -> dict:
        cfg = ConfigManager.get_config()
        audio_cfg = cfg.get("audio", {})
        return {
            "queues": {
                "public": list(self.queues["public"]),
                "secret": list(self.queues["secret"]),
            },
            "paused": self.paused,
            "queue_paused": self.queue_paused,
            "is_playing": self.is_playing,
            "current_text": self.current_text,
            "metrics": self.metrics,
            "config": {
                "voice": audio_cfg.get("voice", "en-IN-PrabhatNeural"),
                "volume": audio_cfg.get("volume", "+0%"),
                "rate": audio_cfg.get("rate", "+0%"),
                "priority_mode": audio_cfg.get("priority_mode", "public"),
            },
            # ── Enhanced health data ──
            "health_status": self.health_status,
            "uptime_seconds": self.uptime_seconds,
            "last_error": self._last_error,
            "temp_dir": _get_temp_dir(),
        }

    # ── Internal Loop ─────────────────────────────────────────────────────────

    async def _process_loop(self) -> None:
        while not self._shutdown:
            if self.paused:
                await asyncio.sleep(0.5)
                continue

            cfg = ConfigManager.get_config()
            priority = cfg.get("audio", {}).get("priority_mode", "public")

            can_public = bool(self.queues["public"]) and not self.queue_paused.get("public", False)
            can_secret = bool(self.queues["secret"]) and not self.queue_paused.get("secret", False)

            item_to_play = None
            play_channel = None

            if priority == "secret":
                if can_secret:
                    item_to_play = self.queues["secret"].popleft()
                    play_channel = "secret"
                elif can_public:
                    item_to_play = self.queues["public"].popleft()
                    play_channel = "public"
            else:
                if can_public:
                    item_to_play = self.queues["public"].popleft()
                    play_channel = "public"
                elif can_secret:
                    item_to_play = self.queues["secret"].popleft()
                    play_channel = "secret"

            if item_to_play:
                await self._play(item_to_play, play_channel)
            else:
                await asyncio.sleep(0.1)

    async def _play(self, item: dict, channel: str) -> None:
        raw_text: str = item["text"]
        override_voice: Optional[str] = item.get("voice")
        self.current_text = raw_text
        start_time = time.time()

        text = self._clean_for_tts(raw_text)
        if not text:
            logger.info("Skipping empty TTS after cleaning (orig: %.40s)", raw_text)
            return

        cfg = ConfigManager.get_config()
        audio_cfg = cfg.get("audio", {})

        auto_voices = audio_cfg.get("auto_voices", {})
        auto_enabled = auto_voices.get("enabled", False)

        voice = override_voice
        if not voice:
            if auto_enabled:
                lang_code = "unknown"
                text_lower = text.lower()
                words = set(re.findall(r'\b[a-z]+\b', text_lower))
                
                hinglish_keywords = {'hai', 'kya', 'kaise', 'karna', 'kar', 'raha', 'rahi', 'mera', 'mujhe', 'nahi', 'bhi', 'bahut', 'achha', 'thik', 'kaun', 'kahan', 'kab', 'ho', 'gaya', 'gayi', 'ye', 'wo', 'aur', 'haan', 'mat', 'bhai', 'yaar', 'karo', 'kare', 'kaam', 'baat'}
                benglish_keywords = {'kemon', 'acho', 'ami', 'tumi', 'korcho', 'kothay', 'hobe', 'jabo', 'valo', 'bhalo', 'khub', 'kore', 'amar', 'tomar', 'apni', 'tui', 'keno', 'khabe', 'naki', 'ache', 'nei', 'ekhon', 'dada', 'kori', 'kotha', 'bolo', 'bolcho'}

                hinglish_score = len(words.intersection(hinglish_keywords))
                benglish_score = len(words.intersection(benglish_keywords))

                mapped_lang = "default"
                if hinglish_score > 0 or benglish_score > 0:
                    if hinglish_score > benglish_score:
                        mapped_lang = "hi"
                    elif benglish_score > hinglish_score:
                        mapped_lang = "bn"
                    else:
                        mapped_lang = "hi"
                else:
                    lang_code, _ = langid.classify(text)

                    if lang_code in ['hi', 'mr', 'ne']:
                        mapped_lang = "hi"
                    elif lang_code in ['bn', 'as']:
                        mapped_lang = "bn"
                    elif lang_code == 'en':
                        mapped_lang = "en"

                config_channel = "private" if channel == "secret" else "public"
                voice_dict = auto_voices.get(config_channel, {})
                voice = voice_dict.get(mapped_lang) or voice_dict.get("default") or audio_cfg.get("voice", "en-IN-PrabhatNeural")
                logger.debug("Auto Voice [%s]: text_lang=%s, mapped=%s, selected=%s", channel, lang_code, mapped_lang, voice)
            else:
                voice = audio_cfg.get("voice", "en-IN-PrabhatNeural")

        rate: str = _validate_rate_volume(audio_cfg.get("rate", "+0%"))
        volume: str = _validate_rate_volume(audio_cfg.get("volume", "+0%"))

        # ── Max play duration (zombie protection) ─────────────────────────────
        max_duration: int = int(audio_cfg.get("max_play_duration", 30))

        default_ports = {"public": 8889, "secret": 8888}
        port = audio_cfg.get("udp_ports", {}).get(channel, default_ports.get(channel, 8889))
        udp_mode = audio_cfg.get("udp_mode", "push")
        gaming_pc_ip = audio_cfg.get("gaming_pc_ip", "127.0.0.1")

        force_local = audio_cfg.get("local_playback", False)
        use_local = force_local  # set local_playback=true in config to force Pi speakers

        self.is_playing = True
        tmp_mp3 = None
        try:
            # ── Step 1: Generate TTS audio to a temp file ─────────────────────
            tmp_mp3 = await self._generate_tts_audio(text, voice, rate, volume, channel)
            if tmp_mp3 is None:
                _append_audio_log(f"[{channel}] TTS generation failed — skipping")
                self._record_error("TTS generation failed (both edge-tts and gTTS)")
                return

            # ── Step 2: Play the temp file via ffplay / mpg123 / aplay / ffmpeg UDP ──
            ffmpeg = _find_ffmpeg()
            ffplay = _find_ffplay()

            if use_local:
                command = self._build_local_command(tmp_mp3, ffplay, ffmpeg, channel)
            else:
                # ── UDP to OBS (public channel) ───────────────────────────────
                if udp_mode == "push":
                    udp_url = f"udp://{gaming_pc_ip}:{port}"
                else:
                    udp_url = f"udp://0.0.0.0:{port}?listen=1&listen_timeout=5000000"
                _append_audio_log(f"[{channel}] UDP → {udp_url}")
                logger.info("Audio UDP [%s] → %s", udp_mode, udp_url)
                command = [
                    ffmpeg,
                    "-re",
                    "-i", tmp_mp3,
                    "-f", "mpegts",
                    "-c:a", "aac",
                    "-ar", "44100",
                    "-b:a", "128k",
                    "-flush_packets", "1",
                    "-y",
                    udp_url,
                ]

            _append_audio_log(f"[{channel}] TTS start: {text[:60]}")

            # BROADCAST TTS START EVENT
            if self.broadcast_func:
                asyncio.create_task(self.broadcast_func({
                    "type": "tts_event",
                    "state": "start",
                    "channel": channel,
                    "text": text,
                    "timestamp": time.time()
                }))

            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            self.current_process = process

            ffmpeg_stderr_lines: list = []

            async def _read_stderr() -> None:
                try:
                    while True:
                        line = await process.stderr.readline()
                        if not line:
                            break
                        msg = line.decode(errors="replace").strip()
                        if msg:
                            logger.debug("ffplay/ffmpeg [%s]: %s", channel, msg)
                            ffmpeg_stderr_lines.append(msg)
                except Exception:
                    pass

            stderr_task = asyncio.create_task(_read_stderr())

            # ── Timeout protection (Pi 4 zombie process killer) ───────────────
            timed_out = False
            try:
                await asyncio.wait_for(process.wait(), timeout=max_duration)
            except asyncio.TimeoutError:
                timed_out = True
                logger.warning("Audio process timed out after %ds [%s] — killing", max_duration, channel)
                _append_audio_log(f"[{channel}] TIMEOUT after {max_duration}s — killed")
                self.metrics["timeout_kills"] += 1
                try:
                    process.kill()
                except OSError:
                    pass
                await process.wait()  # Reap the killed process

            # Wait for stderr reader to finish
            await stderr_task

            latency = time.time() - start_time
            ret = process.returncode

            if getattr(self, "_skip_requested", False):
                _append_audio_log(f"[{channel}] Skipped by user")
                logger.info("TTS skipped [%s]", channel)
                self._skip_requested = False
            elif timed_out:
                self._record_error(f"Playback timeout after {max_duration}s")
            elif ret != 0:
                err_tail = " | ".join(ffmpeg_stderr_lines[-3:]) if ffmpeg_stderr_lines else "(no stderr)"
                _append_audio_log(f"[{channel}] ffmpeg exit={ret}: {err_tail}")
                logger.warning("ffmpeg exit %d [%s]: %s", ret, channel, err_tail)
                self._record_error(f"ffmpeg exit code {ret}: {err_tail[:100]}")
            else:
                _append_audio_log(f"[{channel}] Done in {latency:.2f}s")
                logger.info("TTS played [%s] in %.2fs", channel, latency)
                self._update_metrics(latency)
                self._consecutive_errors = 0  # Reset on success

        except Exception as exc:
            tb = traceback.format_exc()
            err_msg = f"{type(exc).__name__}: {exc}"
            logger.exception("Error in AudioService._play [%s]", channel)
            _append_audio_log(f"[{channel}] PLAY ERROR: {err_msg}")
            _append_audio_log(f"[{channel}] {tb.splitlines()[-1]}")
            self._record_error(err_msg)
        finally:
            # BROADCAST TTS END EVENT
            if self.broadcast_func:
                asyncio.create_task(self.broadcast_func({
                    "type": "tts_event",
                    "state": "end",
                    "channel": channel,
                    "timestamp": time.time()
                }))

            self.current_process = None
            self.is_playing = False
            self.current_text = ""
            if tmp_mp3 and os.path.exists(tmp_mp3):
                try:
                    os.unlink(tmp_mp3)
                except OSError:
                    pass

    def _build_local_command(self, tmp_mp3: str, ffplay: str, ffmpeg: str, channel: str) -> list:
        """Build the best available local playback command for the current platform.

        Fallback chain (Pi 4):
        1. mpg123 — lightweight, works on all Pi audio stacks
        2. ffplay — works for both wav and mp3
        3. aplay via ffmpeg pipe — ALSA direct output (headless Pi fallback)
        """
        # 1. Try mpg123 first (lightest on Pi 4)
        mpg123 = shutil.which("mpg123")
        if mpg123 and str(tmp_mp3).endswith(".mp3"):
            _append_audio_log(f"[{channel}] local mpg123")
            return [mpg123, "-q", tmp_mp3]

        # 2. Try ffplay
        if shutil.which("ffplay") or not _IS_LINUX:
            _append_audio_log(f"[{channel}] local ffplay")
            return [
                ffplay,
                "-nodisp",
                "-autoexit",
                "-i", tmp_mp3,
                "-v", "quiet",
                "-af", "volume=1.5",
            ]

        # 3. Fallback: Last resort try ffplay anyway
        _append_audio_log(f"[{channel}] local ffplay (last resort)")
        return [
            ffplay,
            "-nodisp",
            "-autoexit",
            "-i", tmp_mp3,
            "-v", "quiet",
        ]

    async def _generate_tts_audio(self, text: str, voice: str, rate: str, volume: str, channel: str) -> Optional[str]:
        """
        Generate TTS audio and save to a temp MP3/WAV file.
        Tries edge-tts with retry, then falls back to gTTS on failure.
        Returns the path to the temp file, or None on total failure.

        Pi 4 Optimizations:
        - Uses /dev/shm (RAM disk) for temp files
        - Retry edge-tts once with 1s backoff before gTTS fallback
        """
        loop = asyncio.get_running_loop()
        temp_dir = _get_temp_dir()

        # ── Attempt 1: edge-tts (with retry) ──────────────────────────────────
        for attempt in range(2):  # Try edge-tts up to 2 times
            try:
                communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume)
                fd, tmp_path = tempfile.mkstemp(prefix="pibot_tts_", suffix=".mp3", dir=temp_dir)
                os.close(fd)
                await communicate.save(tmp_path)
                if os.path.getsize(tmp_path) > 0:
                    _append_audio_log(f"[{channel}] edge-tts OK (attempt {attempt + 1}) → {os.path.basename(tmp_path)}")
                    return tmp_path
                os.unlink(tmp_path)
                raise RuntimeError("edge-tts produced empty file")
            except Exception as exc:
                if 'tmp_path' in locals() and os.path.exists(tmp_path):
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
                err_msg = f"{type(exc).__name__}: {exc}"
                if attempt == 0:
                    logger.warning("edge-tts attempt 1 failed for [%s]: %s — retrying in 1s", channel, err_msg)
                    _append_audio_log(f"[{channel}] edge-tts attempt 1 FAILED: {err_msg} — retrying")
                    await asyncio.sleep(1)  # Backoff before retry
                else:
                    logger.warning("edge-tts attempt 2 failed for [%s]: %s — trying gTTS fallback", channel, err_msg)
                    _append_audio_log(f"[{channel}] edge-tts attempt 2 FAILED: {err_msg}")
                    self.metrics["edge_tts_failures"] += 1

        # ── Attempt 2: gTTS fallback ──────────────────────────────────────────
        try:
            from gtts import gTTS  # lazy import — optional dependency
            fd, tmp_path = tempfile.mkstemp(prefix="pibot_tts_", suffix=".mp3", dir=temp_dir)
            os.close(fd)

            def _gtts_generate() -> None:
                tts = gTTS(text=text, lang="en", slow=False)
                tts.save(tmp_path)

            await loop.run_in_executor(None, _gtts_generate)
            if os.path.getsize(tmp_path) > 0:
                _append_audio_log(f"[{channel}] gTTS fallback OK → {os.path.basename(tmp_path)}")
                self.metrics["gtts_fallbacks"] += 1
                return tmp_path
            os.unlink(tmp_path)
            raise RuntimeError("gTTS produced empty file")
        except Exception as exc2:
            if 'tmp_path' in locals() and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
            err_msg2 = f"{type(exc2).__name__}: {exc2}"
            logger.error("gTTS fallback also failed for [%s]: %s", channel, err_msg2)
            _append_audio_log(f"[{channel}] gTTS FAILED: {err_msg2}")
            return None

    def _update_metrics(self, latency: float) -> None:
        self.metrics["played_count"] += 1
        self.metrics["total_latency"] += latency
        count = self.metrics["played_count"]
        if count > 0:
            self.metrics["avg_latency"] = round(self.metrics["total_latency"] / count, 3)

    def _record_error(self, message: str) -> None:
        """Record an error for health tracking."""
        self.metrics["total_errors"] += 1
        self._consecutive_errors += 1
        self._last_error = {
            "message": message,
            "timestamp": time.time(),
        }
        logger.warning("Audio error recorded (%d consecutive): %s", self._consecutive_errors, message)
