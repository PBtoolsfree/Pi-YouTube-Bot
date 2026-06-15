import unittest
import os
import sys
import time
import asyncio

# Add the parent directory to the path so we can import backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.config_manager import ConfigManager
from backend.bot_service import BotService

class TestStability(unittest.TestCase):
    def setUp(self):
        # Provide a dummy config for testing
        self.test_config = {
            "ai_topology": {"enabled": True, "providers": {}},  # Should disable AI
            "audio": {"enabled": True, "udp_mode": "push", "gaming_pc_ip": ""}, # Should disable audio
            "youtube": {"enabled": True, "channel_id": "test_id"}
        }
        
        # Override the ConfigManager's get_config to return our test config
        self.original_get_config = ConfigManager.get_config
        ConfigManager.get_config = lambda *args, **kwargs: self.test_config

    def tearDown(self):
        ConfigManager.get_config = self.original_get_config
        ConfigManager._config_cache = None

    def test_config_validation_graceful_disable(self):
        """Test that missing configs gracefully disable the features rather than crashing."""
        ConfigManager._config_cache = self.test_config
        warnings = ConfigManager.validate_config()
        
        # We expect 2 warnings: ai and audio
        self.assertTrue(any("AI enabled but no valid provider" in w for w in warnings))
        self.assertTrue(any("Audio enabled in 'push' mode but 'gaming_pc_ip' missing" in w for w in warnings))
        
        # Verify the cache reflects the disabled state
        cached = ConfigManager._config_cache
        self.assertFalse(cached["ai_topology"]["enabled"])
        self.assertFalse(cached["audio"]["enabled"])
        self.assertTrue(cached["youtube"]["enabled"])

    def test_worker_health_initialization(self):
        """Test that the BotService initializes worker health correctly."""
        bot = BotService()
        self.assertTrue(hasattr(bot, "worker_health"))
        self.assertEqual(bot.worker_health, {})
        
        # Mock a managed loop to verify status updates
        bot.is_running = True
        
        async def mock_coro():
            pass
            
        async def run_test():
            task = bot._spawn_managed_loop("test_worker", mock_coro)
            self.assertIn("test_worker", bot.worker_health)
            self.assertEqual(bot.worker_health["test_worker"]["status"], "starting")
            self.assertEqual(bot.worker_health["test_worker"]["restarts"], 0)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        asyncio.run(run_test())

if __name__ == '__main__':
    unittest.main()
