import unittest
import os
import sys
from unittest.mock import patch, MagicMock

# Add parent directory to path so bot-local backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.config_manager import ConfigManager
from backend.audio_service import (
    AudioService,
    _is_default_voice,
    _get_audio_mode
)

# Also import bot-cloud backend audio_service to verify cloud consistency
cloud_backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'bot-cloud'))
if cloud_backend_path not in sys.path:
    sys.path.insert(0, cloud_backend_path)

try:
    import backend.audio_service as cloud_audio_service
    HAS_CLOUD_BACKEND = True
except Exception:
    HAS_CLOUD_BACKEND = False


class TestAudioMultilingual(unittest.TestCase):
    def setUp(self):
        self.service = AudioService()
        self.original_get_config = ConfigManager.get_config

        # Standard test configuration with distinct voices for each language and channel
        self.test_config = {
            "audio": {
                "enabled": True,
                "mode": "auto",
                "voice": "en-IN-PrabhatNeural",
                "rate": "+0%",
                "volume": "+0%",
                "priority_mode": "public",
                "auto_voices": {
                    "enabled": True,
                    "public": {
                        "en": "en-IN-PrabhatNeural",
                        "hi": "hi-IN-SwaraNeural",
                        "bn": "bn-IN-BashkarNeural",
                        "default": "en-IN-PrabhatNeural"
                    },
                    "private": {
                        "en": "en-IN-NeerjaNeural",
                        "hi": "hi-IN-MadhurNeural",
                        "bn": "bn-IN-TanishaaNeural",
                        "default": "en-IN-NeerjaNeural"
                    }
                }
            }
        }
        ConfigManager.get_config = lambda *args, **kwargs: self.test_config

    def tearDown(self):
        ConfigManager.get_config = self.original_get_config
        ConfigManager._config_cache = None

    # ── 1. Language Detection: Indic Native Scripts ───────────────────────────

    def test_hindi_devanagari_script_detection(self):
        """Devanagari script must reliably classify as Hindi ('hi')."""
        samples = [
            "नमस्ते दोस्तों, आप सभी का स्वागत है",
            "आज की लाइव स्ट्रीम शुरू हो चुकी है",
            "धन्यवाद भाई आपके सुपरचैट के लिए",
            "क्या हाल चाल है भाई सब बढ़िया?",
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                lang = self.service._detect_language(sample)
                self.assertEqual(lang, "hi", f"Failed for Devanagari text: {sample}")

    def test_bengali_script_detection(self):
        """Bengali script must reliably classify as Bengali ('bn')."""
        samples = [
            "কেমন আছেন সবাই, আশা করি ভালো আছেন",
            "আজকের লাইভ স্ট্রিমে সবাইকে স্বাগতম",
            "অনেক অনেক ধন্যবাদ দাদা",
            "চ্যানেলটি সাবস্ক্রাইব করতে ভুলবেন না",
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                lang = self.service._detect_language(sample)
                self.assertEqual(lang, "bn", f"Failed for Bengali script: {sample}")

    # ── 2. Romanized Script: Hinglish vs Benglish vs English ──────────────────

    def test_hinglish_roman_script_detection(self):
        """Hinglish written in Latin script must detect as Hindi ('hi')."""
        samples = [
            "Bhai aaj stream kab start hoga?",
            "kya chal raha hai bhai kaisa laga game?",
            "arre bhai bohot badhiya gameplay tha",
            "chalo jaldi shuru karte hai aaj ka match",
            "bhai mujhe bhi sath me khilao",
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                lang = self.service._detect_language(sample)
                self.assertEqual(lang, "hi", f"Failed for Hinglish sample: {sample}")

    def test_benglish_roman_script_detection(self):
        """Benglish written in Latin script must detect as Bengali ('bn')."""
        samples = [
            "kemon acho dada, ami bhalo achi",
            "ei game ta khub bhalo lagche",
            "apni kothay thaken dada?",
            "amra shobai eksathe khelbo",
            "tomar stream dekhte khub valo lage",
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                lang = self.service._detect_language(sample)
                self.assertEqual(lang, "bn", f"Failed for Benglish sample: {sample}")

    def test_english_with_confusing_words_not_misclassified_as_hindi(self):
        """
        Normal English sentences containing words like 'ban', 'lag', 'mat', 'time',
        'me', 'the', 'din' must NOT be misclassified as Hindi.
        """
        english_samples = [
            "Please ban the user who is causing lag all the time",
            "Welcome to the stream, step onto the mat and enjoy the game",
            "Can you tell me the time of the next match?",
            "The ambient din in this room is creating a lot of hum",
            "Hello everyone, thank you for watching the stream today!",
            "I will ban any toxic player from the chat room",
            "Is the lag gone now or are we still seeing delay?",
        ]
        for sample in english_samples:
            with self.subTest(sample=sample):
                lang = self.service._detect_language(sample)
                self.assertEqual(lang, "en", f"English sentence misclassified: {sample} -> {lang}")

    def test_uncertain_and_empty_text_falls_back_to_default(self):
        """Empty text, numbers, or unclassifiable symbols return 'default'."""
        self.assertEqual(self.service._detect_language(""), "default")
        self.assertEqual(self.service._detect_language("   "), "default")
        self.assertEqual(self.service._detect_language("12345 67890"), "default")
        self.assertEqual(self.service._detect_language("!@#$%^&*()"), "default")

    # ── 3. Auto Multi-Language Voice Determination ───────────────────────────

    def test_auto_mode_public_channel_voices(self):
        """In Auto Multi-Language mode, public channel selects public configured voices."""
        self.test_config["audio"]["mode"] = "auto"

        # English
        v_en = self.service._determine_voice("Hello and welcome everyone!", None, "public")
        self.assertEqual(v_en, "en-IN-PrabhatNeural")

        # Hindi (Devanagari)
        v_hi = self.service._determine_voice("नमस्ते दोस्तों", None, "public")
        self.assertEqual(v_hi, "hi-IN-SwaraNeural")

        # Bengali
        v_bn = self.service._determine_voice("কেমন আছেন সবাই", None, "public")
        self.assertEqual(v_bn, "bn-IN-BashkarNeural")

    def test_auto_mode_private_channel_voices(self):
        """In Auto Multi-Language mode, private channel selects private configured voices."""
        self.test_config["audio"]["mode"] = "auto"

        # English
        v_en = self.service._determine_voice("Hello and welcome everyone!", None, "private")
        self.assertEqual(v_en, "en-IN-NeerjaNeural")

        # Hindi (Hinglish)
        v_hi = self.service._determine_voice("Bhai kya chal raha hai aaj?", None, "private")
        self.assertEqual(v_hi, "hi-IN-MadhurNeural")

        # Bengali (Benglish)
        v_bn = self.service._determine_voice("kemon acho dada, ami bhalo achi", None, "private")
        self.assertEqual(v_bn, "bn-IN-TanishaaNeural")

    def test_auto_mode_cloud_default_voice_does_not_override_detection(self):
        """
        When Cloud TTS event sends default voice (e.g. 'en-IN-PrabhatNeural' or 'default'),
        it must NOT override automatic language selection in Auto Multi-Language mode.
        """
        self.test_config["audio"]["mode"] = "auto"

        # Devanagari Hindi text with Cloud default voice override passed
        voice = self.service._determine_voice(
            text="नमस्ते भाई, सुपरचैट के लिए शुक्रिया",
            override_voice="en-IN-PrabhatNeural",
            channel="public"
        )
        self.assertEqual(voice, "hi-IN-SwaraNeural", "Cloud default voice overridden Hindi auto-selection!")

        # Bengali text with 'default' string passed
        voice_bn = self.service._determine_voice(
            text="কেমন আছেন দাদা?",
            override_voice="default",
            channel="public"
        )
        self.assertEqual(voice_bn, "bn-IN-BashkarNeural", "'default' string overridden Bengali auto-selection!")

    def test_auto_mode_explicit_custom_override_is_honoured(self):
        """In Auto Multi-Language mode, a genuine custom voice override (e.g. te-IN) is honoured."""
        self.test_config["audio"]["mode"] = "auto"
        custom_voice = "te-IN-MohanNeural"
        voice = self.service._determine_voice("नमस्ते भाई", custom_voice, "public")
        self.assertEqual(voice, custom_voice)

    # ── 4. Single Language Mode ──────────────────────────────────────────────

    def test_single_language_mode_strictly_honours_dashboard_selection(self):
        """In Single Language mode, the dashboard configured voice is used for all text."""
        self.test_config["audio"]["mode"] = "single"
        self.test_config["audio"]["voice"] = "bn-IN-BashkarNeural"

        # English text
        v1 = self.service._determine_voice("Hello everyone", None, "public")
        self.assertEqual(v1, "bn-IN-BashkarNeural")

        # Hindi Devanagari text
        v2 = self.service._determine_voice("नमस्ते दोस्तों", None, "public")
        self.assertEqual(v2, "bn-IN-BashkarNeural")

        # Bengali text
        v3 = self.service._determine_voice("কেমন আছেন সবাই", None, "public")
        self.assertEqual(v3, "bn-IN-BashkarNeural")

    def test_single_language_mode_ignores_cloud_default_voice(self):
        """In Single Language mode, inherited or Cloud default voice does not override selection."""
        self.test_config["audio"]["mode"] = "single"
        self.test_config["audio"]["voice"] = "hi-IN-MadhurNeural"

        # Cloud sends default voice 'en-IN-PrabhatNeural'
        voice = self.service._determine_voice(
            text="Any message",
            override_voice="en-IN-PrabhatNeural",
            channel="public"
        )
        self.assertEqual(voice, "hi-IN-MadhurNeural")

        # Cloud sends 'default'
        voice2 = self.service._determine_voice(
            text="Any message",
            override_voice="default",
            channel="private"
        )
        self.assertEqual(voice2, "hi-IN-MadhurNeural")

    # ── 5. Legacy Configurations ─────────────────────────────────────────────

    def test_legacy_config_without_mode_field(self):
        """Legacy config without 'mode' key falls back to auto_voices.enabled."""
        legacy_cfg_auto = {
            "enabled": True,
            "voice": "en-IN-PrabhatNeural",
            "auto_voices": {
                "enabled": True,
                "public": {"en": "en-1", "hi": "hi-1", "bn": "bn-1", "default": "en-1"},
                "private": {"en": "en-2", "hi": "hi-2", "bn": "bn-2", "default": "en-2"}
            }
        }
        self.assertEqual(_get_audio_mode(legacy_cfg_auto), "auto")

        legacy_cfg_single = {
            "enabled": True,
            "voice": "hi-IN-MadhurNeural",
            "auto_voices": {
                "enabled": False
            }
        }
        self.assertEqual(_get_audio_mode(legacy_cfg_single), "single")

        legacy_cfg_no_auto = {
            "enabled": True,
            "voice": "en-IN-NeerjaNeural"
        }
        self.assertEqual(_get_audio_mode(legacy_cfg_no_auto), "single")

    # ── 6. Fallback Language Determination (gTTS Fallback) ───────────────────

    def test_fallback_language_selection(self):
        """gTTS fallback uses language-appropriate code: 'hi', 'bn', or 'en'."""
        # Hindi Devanagari text
        self.assertEqual(self.service._determine_fallback_lang("नमस्ते दोस्तों", "en-IN-PrabhatNeural"), "hi")
        # Hindi voice
        self.assertEqual(self.service._determine_fallback_lang("Hello", "hi-IN-SwaraNeural"), "hi")

        # Bengali script text
        self.assertEqual(self.service._determine_fallback_lang("কেমন আছেন সবাই", "en-IN-PrabhatNeural"), "bn")
        # Bengali voice
        self.assertEqual(self.service._determine_fallback_lang("Hello", "bn-IN-BashkarNeural"), "bn")

        # English text / English voice
        self.assertEqual(self.service._determine_fallback_lang("Hello and welcome", "en-IN-PrabhatNeural"), "en")

        # Unknown / numbers / default fallback
        self.assertEqual(self.service._determine_fallback_lang("12345", "unknown-voice"), "en")

    # ── 7. Engine Status API ─────────────────────────────────────────────────

    def test_get_status_returns_mode_and_auto_voices(self):
        """get_status() includes 'mode' and 'auto_voices' in config response."""
        self.test_config["audio"]["mode"] = "auto"
        status = self.service.get_status()

        self.assertIn("config", status)
        self.assertEqual(status["config"].get("mode"), "auto")
        self.assertIn("auto_voices", status["config"])
        self.assertTrue(status["config"]["auto_voices"].get("enabled"))

    # ── 8. Cloud Audio Engine Parity ─────────────────────────────────────────

    def test_cloud_audio_service_parity(self):
        """Verify bot-cloud AudioService mirrors exact same auto/single mode logic."""
        if not HAS_CLOUD_BACKEND:
            self.skipTest("bot-cloud backend not found in path")

        cloud_service = cloud_audio_service.AudioService()

        # Indic scripts
        self.assertEqual(cloud_service._detect_language("नमस्ते दोस्तों"), "hi")
        self.assertEqual(cloud_service._detect_language("কেমন আছেন সবাই"), "bn")

        # Hinglish / Benglish
        self.assertEqual(cloud_service._detect_language("Bhai aaj stream kab hogi?"), "hi")
        self.assertEqual(cloud_service._detect_language("kemon acho dada, ami bhalo achi"), "bn")

        # English with tricky words
        self.assertEqual(
            cloud_service._detect_language("Please ban the user causing lag on time"),
            "en"
        )

        # Single language mode in cloud
        self.test_config["audio"]["mode"] = "single"
        self.test_config["audio"]["voice"] = "bn-IN-BashkarNeural"
        cloud_voice = cloud_service._determine_voice("नमस्ते दोस्तों", "en-IN-PrabhatNeural", "public")
        self.assertEqual(cloud_voice, "bn-IN-BashkarNeural")


if __name__ == '__main__':
    unittest.main()

