"""Regression tests for Audio Engine voice modes and multilingual fallback."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.audio_service import AudioService, _gtts_language_for_voice
from backend.config_manager import ConfigManager


def make_config(mode="auto"):
    auto_voices = {
        "enabled": mode == "auto",
        "public": {
            "en": "en-IN-NeerjaNeural",
            "hi": "hi-IN-SwaraNeural",
            "bn": "bn-IN-TanishaaNeural",
            "default": "en-IN-NeerjaNeural",
        },
        "private": {
            "en": "en-IN-PrabhatNeural",
            "hi": "hi-IN-MadhurNeural",
            "bn": "bn-IN-BashkarNeural",
            "default": "en-IN-PrabhatNeural",
        },
    }
    return {
        "audio": {
            "voice_mode": mode,
            "voice": "en-IN-PrabhatNeural",
            "auto_voices": auto_voices,
        }
    }


class TestAudioVoiceModes(unittest.TestCase):
    def setUp(self):
        self.config = make_config()
        self.get_config_patcher = patch.object(
            ConfigManager, "get_config", side_effect=lambda *args, **kwargs: self.config
        )
        self.get_config_patcher.start()
        self.addCleanup(self.get_config_patcher.stop)
        self.audio = AudioService()

    def test_auto_hindi_script_ignores_default_override(self):
        self.assertEqual(
            self.audio._determine_voice("नमस्ते, कैसे हो?", "en-IN-PrabhatNeural", "public"),
            "hi-IN-SwaraNeural",
        )

    def test_auto_bengali_script_ignores_default_override(self):
        self.assertEqual(
            self.audio._determine_voice("নমস্কার, কেমন আছো?", "en-IN-PrabhatNeural", "public"),
            "bn-IN-TanishaaNeural",
        )

    def test_auto_english_selects_channel_voice(self):
        self.assertEqual(
            self.audio._determine_voice("Hello everyone, welcome back to the game.", None, "secret"),
            "en-IN-PrabhatNeural",
        )

    def test_auto_hinglish_uses_hindi_voice(self):
        self.assertEqual(
            self.audio._determine_voice("Bhai kya haal hai", None, "public"),
            "hi-IN-SwaraNeural",
        )

    def test_single_mode_uses_configured_voice(self):
        self.config = make_config("single")
        self.config["audio"]["voice"] = "hi-IN-MadhurNeural"
        self.assertEqual(
            self.audio._determine_voice("Hello everyone", None, "public"),
            "hi-IN-MadhurNeural",
        )

    def test_single_mode_ignores_per_event_voice_override(self):
        self.config = make_config("single")
        self.config["audio"]["voice"] = "hi-IN-MadhurNeural"
        self.assertEqual(
            self.audio._determine_voice("Hello everyone", "en-IN-NeerjaNeural", "public"),
            "hi-IN-MadhurNeural",
        )

    def test_legacy_config_uses_auto_voices_enabled_flag(self):
        self.config = make_config()
        self.config["audio"].pop("voice_mode")
        self.assertEqual(
            self.audio._determine_voice("নমস্কার", None, "public"),
            "bn-IN-TanishaaNeural",
        )

    def test_gtts_fallback_follows_voice_language(self):
        self.assertEqual(_gtts_language_for_voice("hi-IN-SwaraNeural"), "hi")
        self.assertEqual(_gtts_language_for_voice("bn-IN-TanishaaNeural"), "bn")
        self.assertEqual(_gtts_language_for_voice("en-IN-PrabhatNeural"), "en")
        self.assertEqual(_gtts_language_for_voice("unknown-voice"), "en")


if __name__ == "__main__":
    unittest.main()
