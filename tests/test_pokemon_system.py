import unittest
import asyncio
import os
import sys
import time
from unittest.mock import MagicMock, AsyncMock, patch

# Ensure bot-cloud backend is isolated and used rather than bot-local
cloud_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bot-cloud'))
for mod in list(sys.modules.keys()):
    if mod == "backend" or mod.startswith("backend."):
        del sys.modules[mod]

sys.path = [p for p in sys.path if "bot-local" not in p and "bot-cloud" not in p]
sys.path.insert(0, cloud_dir)

from backend.services.pokemon_service import PokemonService
from backend.bot_service import BotService as CloudBotService
from backend.api import app as cloud_app, bot as cloud_api_bot



class MockBotService:
    """Mock BotService providing required attributes and broadcast functions."""
    def __init__(self, is_live=True):
        self._is_live = is_live
        self.broadcast_events = []
        self.chat_messages = []
        self.remote_sb_connected = True
        self.last_pi_heartbeat = time.time()
        self.active_pi_websockets = []
        self.subscriber_count = 100
        
        # Mock viewers service
        self.viewers = MagicMock()
        self.viewers.viewers = {
            "Ash": {"points": 100, "pokemons": []},
            "Gary": {"points": 100, "pokemons": [{"name": "Blastoise", "power": 80, "type": "Water"}]},
            "BrokeViewer": {"points": 0, "pokemons": []}
        }
        self.viewers.deduct_points = MagicMock(side_effect=self._mock_deduct_points)
        self.viewers.add_points = MagicMock(side_effect=self._mock_add_points)

    def _mock_deduct_points(self, user, pts):
        if user in self.viewers.viewers and self.viewers.viewers[user]["points"] >= pts:
            self.viewers.viewers[user]["points"] -= pts
            return True
        return False

    def _mock_add_points(self, user, pts):
        if user in self.viewers.viewers:
            self.viewers.viewers[user]["points"] += pts

    @property
    def is_stream_live(self) -> bool:
        return self._is_live

    async def broadcast_func(self, event):
        self.broadcast_events.append(event)

    async def _send_chat(self, msg):
        self.chat_messages.append(msg)


class TestPokemonSystem(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.mock_bot = MockBotService(is_live=True)
        self.pokemon_service = PokemonService(self.mock_bot)

    async def asyncTearDown(self):
        self.pokemon_service.stop()

    async def test_game_disabled_no_automatic_spawn(self):
        """When game is disabled in config, automatic spawn does not occur."""
        custom_config = {
            "enabled": False,
            "spawn_interval": 15
        }
        with patch.object(self.pokemon_service, "get_config", return_value=custom_config):
            spawned = await self.pokemon_service.spawn_wild_pokemon(force=False)
            self.assertIsNone(spawned)
            self.assertIsNone(self.pokemon_service.active_wild_pokemon)
            self.assertEqual(len(self.mock_bot.broadcast_events), 0)

    async def test_stream_offline_no_automatic_spawn(self):
        """When stream is offline, automatic spawn is suppressed."""
        self.mock_bot._is_live = False
        custom_config = {
            "enabled": True,
            "spawn_interval": 15
        }
        with patch.object(self.pokemon_service, "get_config", return_value=custom_config):
            spawned = await self.pokemon_service.spawn_wild_pokemon(force=False)
            self.assertIsNone(spawned)
            self.assertIsNone(self.pokemon_service.active_wild_pokemon)
            self.assertEqual(len(self.mock_bot.broadcast_events), 0)

    async def test_stream_live_game_enabled_spawns_pokemon(self):
        """When stream is live and game is enabled, wild pokemon spawns and broadcasts to overlay."""
        self.mock_bot._is_live = True
        custom_config = {
            "enabled": True,
            "spawn_interval": 15
        }
        with patch.object(self.pokemon_service, "get_config", return_value=custom_config):
            spawned = await self.pokemon_service.spawn_wild_pokemon(force=False)
            self.assertIsNotNone(spawned)
            self.assertIsNotNone(self.pokemon_service.active_wild_pokemon)
            self.assertEqual(self.pokemon_service.active_wild_pokemon["name"], spawned["name"])
            
            # Verify broadcasts
            types = [e.get("type") for e in self.mock_bot.broadcast_events]
            self.assertIn("pokemon_event", types)
            self.assertIn("POKEMON_EVENT", types)
            
            # Verify chat announcement
            self.assertTrue(len(self.mock_bot.chat_messages) > 0)
            self.assertIn("wild", self.mock_bot.chat_messages[0].lower())

    async def test_configured_interval_respected_without_long_sleep(self):
        """Spawn loop respects configured interval (15m) using mocked sleep/timing."""
        custom_config = {
            "enabled": True,
            "spawn_interval": 15
        }
        
        sleep_durations = []
        async def mock_sleep(seconds):
            sleep_durations.append(seconds)
            # Stop the service after tracking sleep to exit loop
            self.pokemon_service.is_running = False

        with patch.object(self.pokemon_service, "get_config", return_value=custom_config), \
             patch("asyncio.sleep", side_effect=mock_sleep):
            
            # Run one iteration of spawn loop
            self.pokemon_service.is_running = True
            await self.pokemon_service._spawn_loop()
            
            self.assertTrue(len(sleep_durations) > 0)
            # 15 minutes = exactly 900 seconds (jitter removed, exact interval)
            first_sleep = sleep_durations[0]
            self.assertEqual(first_sleep, 900)

    async def test_auto_despawn_after_expiration(self):
        """Pokemon automatically despawns when timer expires, broadcasting despawn event."""
        # Spawn wild pokemon
        spawned = await self.pokemon_service.spawn_wild_pokemon(force=True)
        self.assertIsNotNone(self.pokemon_service.active_wild_pokemon)
        
        # Mismatch id should not despawn
        self.mock_bot.broadcast_events.clear()
        await self.pokemon_service._auto_despawn("non_matching_id")
        self.assertIsNotNone(self.pokemon_service.active_wild_pokemon)
        
        # Correct event ID triggers despawn
        event_id = self.pokemon_service.active_wild_pokemon["id"]
        await self.pokemon_service._auto_despawn(event_id)
        self.assertIsNone(self.pokemon_service.active_wild_pokemon)
        
        # Verify despawn broadcast
        actions = [e.get("action") for e in self.mock_bot.broadcast_events]
        self.assertIn("despawn", actions)

    async def test_test_spawn_distinction_and_overlay_delivery(self):
        """Test Spawn triggers overlay event, marks is_test=True, and skips YouTube chat spam."""
        self.mock_bot._is_live = False # Can run even when stream is offline!
        
        spawned = await self.pokemon_service.spawn_wild_pokemon(force=True, is_test=True)
        self.assertIsNotNone(spawned)
        self.assertTrue(self.pokemon_service.active_wild_pokemon["is_test"])
        
        # Test spawn should NOT post to live YouTube chat
        self.assertEqual(len(self.mock_bot.chat_messages), 0)
        
        # But MUST broadcast to overlays
        types = [e.get("type") for e in self.mock_bot.broadcast_events]
        self.assertIn("pokemon_event", types)
        overlay_event = next(e for e in self.mock_bot.broadcast_events if e.get("type") == "pokemon_event")
        self.assertTrue(overlay_event.get("is_test"))
        self.assertEqual(overlay_event.get("action"), "spawn")

    async def test_test_spawn_cannot_be_caught_for_real_points(self):
        """Test Spawn rejects real catch attempts, preserving economy integrity."""
        await self.pokemon_service.spawn_wild_pokemon(force=True, is_test=True)
        
        res = await self.pokemon_service.handle_catch("Ash")
        self.assertIn("test pokemon cannot be caught", res.lower())
        # Ash's points should not have been deducted
        self.assertEqual(self.mock_bot.viewers.viewers["Ash"]["points"], 100)
        self.assertEqual(len(self.mock_bot.viewers.viewers["Ash"]["pokemons"]), 0)

    async def test_catch_mechanic_points_deduction_and_rate(self):
        """Normal catch enforces catch cost and success rate."""
        custom_config = {
            "enabled": True,
            "catch_cost": 25,
            "catch_rate": 100 # Guarantee catch for test
        }
        with patch.object(self.pokemon_service, "get_config", return_value=custom_config):
            await self.pokemon_service.spawn_wild_pokemon(force=True, is_test=False)
            
            # Insufficient points viewer fails
            fail_res = await self.pokemon_service.handle_catch("BrokeViewer")
            self.assertIn("need 25 points", fail_res)
            
            # Ash catches successfully with 100% rate
            success_res = await self.pokemon_service.handle_catch("Ash")
            self.assertIn("caught", success_res.lower())
            self.assertEqual(self.mock_bot.viewers.viewers["Ash"]["points"], 75)
            self.assertEqual(len(self.mock_bot.viewers.viewers["Ash"]["pokemons"]), 1)
            # Wild pokemon should now be despawned/cleared
            self.assertIsNone(self.pokemon_service.active_wild_pokemon)

    async def test_duel_battle_mechanic(self):
        """Duel battle challenges player with bet and winner payout."""
        custom_config = {
            "duel_cost": 20,
            "duel_reward": 50
        }
        with patch.object(self.pokemon_service, "get_config", return_value=custom_config):
            res = await self.pokemon_service.handle_battle("Gary", "Ash", bet=20)
            self.assertIn("won the battle", res)
            
            # Check overlay broadcast
            actions = [e.get("action") for e in self.mock_bot.broadcast_events]
            self.assertIn("battle", actions)

    async def test_custom_pokedex_add_and_delete(self):
        """Custom Pokemon entries can be added, retrieved, and deleted."""
        new_poke = {
            "name": "MegaGengar",
            "type": "Ghost",
            "power": 95,
            "sprite": "https://example.com/gengar.png"
        }
        success, msg = self.pokemon_service.add_custom_pokemon(new_poke)
        self.assertTrue(success)
        
        all_pokemon = self.pokemon_service.get_all_pokemons()
        names = [p["name"] for p in all_pokemon]
        self.assertIn("MegaGengar", names)
        
        del_success, del_msg = self.pokemon_service.delete_custom_pokemon("MegaGengar")
        self.assertTrue(del_success)
        
        all_pokemon_after = self.pokemon_service.get_all_pokemons()
        names_after = [p["name"] for p in all_pokemon_after]
        self.assertNotIn("MegaGengar", names_after)

    async def test_restart_reconnect_idempotent_no_duplicate_scheduler(self):
        """Calling start() multiple times does not spawn duplicate tasks."""
        self.pokemon_service.start()
        first_task = self.pokemon_service.spawn_task
        self.assertIsNotNone(first_task)
        self.assertTrue(self.pokemon_service.is_running)
        
        # Second start call is a no-op
        self.pokemon_service.start()
        second_task = self.pokemon_service.spawn_task
        self.assertIs(first_task, second_task)
        
        self.pokemon_service.stop()
        self.assertFalse(self.pokemon_service.is_running)

    async def test_stale_heartbeat_pauses_cloud_live_stream_status(self):
        """BotService is_stream_live returns False when Pi heartbeat is stale (>60s)."""
        bot = CloudBotService()
        bot.remote_sb_connected = True
        bot._remote_stream_live = True
        
        with patch.dict(os.environ, {"RUN_MODE": "cloud"}):
            # Fresh heartbeat (<60s)
            bot.last_pi_heartbeat = time.time() - 10
            self.assertTrue(bot.is_stream_live)
            
            # Stale heartbeat (>60s)
            bot.last_pi_heartbeat = time.time() - 75
            self.assertFalse(bot.is_stream_live)
            
            # Streamer.bot disconnected
            bot.remote_sb_connected = False
            bot.last_pi_heartbeat = time.time()
            self.assertFalse(bot.is_stream_live)

    async def test_streamerbot_connected_alone_does_not_imply_stream_live(self):
        """Requirement 1: Connected Streamer.bot alone does not imply YouTube stream is live."""
        bot = CloudBotService()
        bot.remote_sb_connected = True
        bot._remote_stream_live = False
        bot.last_pi_heartbeat = time.time()

        with patch.dict(os.environ, {"RUN_MODE": "cloud"}):
            # SB is connected, Pi heartbeat is fresh, but stream is NOT live
            self.assertFalse(bot.is_stream_live)
            
            # Pokemon service using this bot must NOT auto-spawn
            poke_svc = PokemonService(bot)
            with patch.object(poke_svc, "get_config", return_value={"enabled": True, "spawn_interval": 15}):
                spawned = await poke_svc.spawn_wild_pokemon(force=False)
                self.assertIsNone(spawned)

    async def test_explicit_stream_live_allows_spawning(self):
        """Requirement 1 & 4: Explicit LIVE status permits spawning when game is enabled."""
        bot = CloudBotService()
        bot.remote_sb_connected = True
        bot._remote_stream_live = True
        bot.last_pi_heartbeat = time.time()

        with patch.dict(os.environ, {"RUN_MODE": "cloud"}):
            self.assertTrue(bot.is_stream_live)
            poke_svc = PokemonService(bot)
            with patch.object(poke_svc, "get_config", return_value={"enabled": True, "spawn_interval": 15}):
                spawned = await poke_svc.spawn_wild_pokemon(force=False)
                self.assertIsNotNone(spawned)

    async def test_explicit_stream_stop_prevents_automatic_spawning(self):
        """Requirement 1 & 4: Explicit OFFLINE status or stream stop pauses automatic spawning."""
        bot = CloudBotService()
        bot.remote_sb_connected = True
        bot._remote_stream_live = True
        bot.last_pi_heartbeat = time.time()

        with patch.dict(os.environ, {"RUN_MODE": "cloud"}):
            self.assertTrue(bot.is_stream_live)
            
            # Stream stop event arrives from Pi client
            await bot.handle_pi_client_event({"type": "stream_status", "live": False, "source": "StreamStopped"})
            self.assertFalse(bot.is_stream_live)
            
            poke_svc = PokemonService(bot)
            with patch.object(poke_svc, "get_config", return_value={"enabled": True, "spawn_interval": 15}):
                spawned = await poke_svc.spawn_wild_pokemon(force=False)
                self.assertIsNone(spawned)

    async def test_overlay_state_recovery_api(self):
        """Requirement 4: The overlay reconnects and recovers currently active Pokemon via GET /api/loyalty/pokemon/active."""
        from fastapi.testclient import TestClient
        
        client = TestClient(cloud_app)
        
        # When no pokemon is active
        cloud_api_bot.pokemon.active_wild_pokemon = None
        res = client.get("/api/loyalty/pokemon/active")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json().get("active"))
        
        # Spawn a wild pokemon
        spawned = await cloud_api_bot.pokemon.spawn_wild_pokemon(force=True, is_test=False)
        self.assertIsNotNone(spawned)
        
        # Now endpoint must return active pokemon and remaining seconds
        res = client.get("/api/loyalty/pokemon/active")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("active"))
        self.assertEqual(data["pokemon"]["name"], spawned["name"])
        self.assertGreater(data["remaining_seconds"], 0)
        self.assertLessEqual(data["remaining_seconds"], 60)
        
        # Cleanup
        cloud_api_bot.pokemon.active_wild_pokemon = None

    async def test_public_overlay_cannot_access_sensitive_admin_config(self):
        """Requirement 3 & 4: Public requests cannot mutate /api/config, but can access scoped overlay endpoints."""
        from fastapi.testclient import TestClient
        
        client = TestClient(cloud_app)
        public_headers = {
            "cf-connecting-ip": "203.0.113.195",
            "host": "overlay.trycloudflare.com"
        }
        
        # 1. Attempt unauthenticated POST to /api/config via public internet -> must be rejected (401 or 403)
        res_post = client.post(
            "/api/config",
            json={"config": {"security_bypass_test": True}},
            headers=public_headers
        )
        self.assertIn(res_post.status_code, [401, 403])
        
        # 2. Attempt unauthenticated POST to admin spawn endpoint -> must be rejected
        res_spawn = client.post(
            "/api/loyalty/spawn_pokemon",
            headers=public_headers
        )
        self.assertIn(res_spawn.status_code, [401, 403])
        
        # 3. Public GET /api/loyalty/pokemon/active (display only) -> must be allowed
        res_active = client.get(
            "/api/loyalty/pokemon/active",
            headers=public_headers
        )
        self.assertEqual(res_active.status_code, 200)
        
        # 4. Public GET /api/subscriber (display only) -> must be allowed
        res_sub = client.get(
            "/api/subscriber",
            headers=public_headers
        )
        self.assertEqual(res_sub.status_code, 200)
        
        # 5. Public GET /api/config -> sanitized, sensitive secrets stripped
        res_cfg = client.get(
            "/api/config",
            headers=public_headers
        )
        self.assertEqual(res_cfg.status_code, 200)
        cfg_data = res_cfg.json()
        # Verify sensitive keys are NOT present in public response
        self.assertNotIn("dashboard_password", cfg_data.get("security", {}))
        self.assertNotIn("webhook_secret", cfg_data.get("security", {}))


if __name__ == "__main__":
    unittest.main()
