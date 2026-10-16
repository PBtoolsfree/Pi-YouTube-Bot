import unittest
import os
import sys
import time
import asyncio

# Add the bot-local root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.bot_service import BotService


class TestStreamerbotLiveEvents(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        from unittest.mock import MagicMock
        self.bot = BotService()
        self.bot.remote_sb_connected = True
        self.bot.last_pi_heartbeat = time.time()
        mock_ws = MagicMock()
        mock_ws.open = True
        self.bot.sb_ws = mock_ws

    async def test_initial_state_not_live(self):
        """Connected Streamer.bot socket alone does not mean stream is live."""
        self.assertFalse(self.bot.is_stream_live)

    async def test_youtube_broadcast_lifecycle_events(self):
        """Streamer.bot YouTube lifecycle events update is_stream_live."""
        # BroadcastStarted -> True
        await self.bot._handle_sb_event({
            "event": {"source": "YouTube", "type": "BroadcastStarted"}
        })
        self.assertTrue(self.bot.is_stream_live)

        # BroadcastEnded -> False
        await self.bot._handle_sb_event({
            "event": {"source": "YouTube", "type": "BroadcastEnded"}
        })
        self.assertFalse(self.bot.is_stream_live)

    async def test_obs_stream_lifecycle_events(self):
        """Streamer.bot OBS lifecycle events update is_stream_live."""
        # StreamStarted -> True
        await self.bot._handle_sb_event({
            "event": {"source": "OBS", "type": "StreamStarted"}
        })
        self.assertTrue(self.bot.is_stream_live)

        # StreamStopped -> False
        await self.bot._handle_sb_event({
            "event": {"source": "OBS", "type": "StreamStopped"}
        })
        self.assertFalse(self.bot.is_stream_live)

    async def test_broadcast_updated_status(self):
        """Streamer.bot BroadcastUpdated payloads update is_stream_live based on status."""
        # status: live
        await self.bot._handle_sb_event({
            "event": {"source": "YouTube", "type": "BroadcastUpdated"},
            "data": {"status": "live"}
        })
        self.assertTrue(self.bot.is_stream_live)

        # status: complete
        await self.bot._handle_sb_event({
            "event": {"source": "YouTube", "type": "BroadcastUpdated"},
            "data": {"status": "complete"}
        })
        self.assertFalse(self.bot.is_stream_live)


def tearDownModule():
    # Clean up sys.modules so backend imports don't bleed into cloud tests
    for mod in list(sys.modules.keys()):
        if mod == "backend" or mod.startswith("backend."):
            del sys.modules[mod]


if __name__ == "__main__":
    unittest.main()
