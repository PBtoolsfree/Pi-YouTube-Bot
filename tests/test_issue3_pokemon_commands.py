import unittest
import asyncio
import os
import sys
import time
from unittest.mock import MagicMock, AsyncMock, patch

cloud_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bot-cloud'))
if cloud_dir not in sys.path:
    sys.path.insert(0, cloud_dir)

from backend.services.pokemon_service import PokemonService, normalize_pokemon
from backend.bot_service import BotService


class MockViewerService:
    def __init__(self):
        self.viewers = {
            "Ash": {
                "points": 500,
                "pokemons": [
                    "Pikachu",
                    "Pikachu",
                    {"name": "Charizard", "power": 25, "type": "Fire", "sprite": "http://char.png"}
                ],
                "active_pokemon": "Pikachu"
            },
            "Gary": {
                "points": 300,
                "pokemons": [
                    {"name": "Blastoise", "power": 22, "type": "Water", "sprite": "http://blast.png"}
                ],
                "active_pokemon": "Blastoise"
            },
            "Misty": {
                "points": 100,
                "pokemons": []
            }
        }

    def get_viewer(self, user):
        return self.viewers.get(user, {"points": 0, "pokemons": []})

    def get_total_points(self, user):
        return self.viewers.get(user, {}).get("points", 0)

    def deduct_points(self, user, pts):
        if user in self.viewers and self.viewers[user]["points"] >= pts:
            self.viewers[user]["points"] -= pts
            return True
        return False

    def add_points(self, user, pts):
        if user in self.viewers:
            self.viewers[user]["points"] += pts

    def save_viewers(self):
        pass


class MockBot:
    def __init__(self):
        self.viewers = MockViewerService()
        self.broadcast_events = []
        self.chat_messages = []
        self._is_live = True
        self.boss_fight = MagicMock()
        self.boss_fight.attack_boss.return_value = {
            "success": True,
            "actual_damage": 50,
            "current_hp": 950,
            "defeated": False,
            "message": "Dealt 50 damage!"
        }

    @property
    def is_stream_live(self):
        return self._is_live

    async def broadcast_func(self, event):
        self.broadcast_events.append(event)

    async def _send_chat(self, msg):
        self.chat_messages.append(msg)


class TestIssue3PokemonCommands(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_bot = MockBot()
        self.pokemon_service = PokemonService(self.mock_bot)
        # Isolate in-memory users_data from disk data
        self.pokemon_service.users_data = {}
        self.pokemon_service.active_summoned = {}
        self.pokemon_service.attack_cooldowns = {}
        self.mock_bot.pokemon = self.pokemon_service

    async def asyncTearDown(self):
        self.pokemon_service.stop()

    def test_normalize_pokemon_legacy_string_and_dict(self):
        """normalize_pokemon safely handles both legacy strings and object dictionaries."""
        # 1. Legacy string representation
        norm_str = normalize_pokemon("Pikachu")
        self.assertIsInstance(norm_str, dict)
        self.assertEqual(norm_str["name"], "Pikachu")
        self.assertTrue(norm_str.get("power", 0) > 0)
        self.assertIn("sprite", norm_str)

        # 2. Modern dict representation
        poke_dict = {"name": "Charizard", "power": 25, "type": "Fire", "sprite": "http://char.png"}
        norm_dict = normalize_pokemon(poke_dict)
        self.assertEqual(norm_dict["name"], "Charizard")
        self.assertEqual(norm_dict["power"], 25)
        self.assertEqual(norm_dict["type"], "Fire")
        self.assertEqual(norm_dict["sprite"], "http://char.png")

        # 3. Unknown name falls back safely
        norm_unknown = normalize_pokemon("MissingNo")
        self.assertEqual(norm_unknown["name"], "MissingNo")
        self.assertEqual(norm_unknown["power"], 10)

    def test_duplicate_counting_in_inventory(self):
        """Viewers with duplicate Pokemon get accurate duplicate count formatting."""
        inventory = self.pokemon_service.get_user_inventory("Ash")
        self.assertEqual(len(inventory), 3)

        # handle_my_pokemon formats duplicates like 'Pikachu ×2'
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(self.pokemon_service.handle_my_pokemon("Ash"))
        self.assertIn("Pikachu ×2", res)
        self.assertIn("Charizard", res)
        self.assertIn("3 total", res)

    async def test_my_pokemon_empty_collection(self):
        """A viewer with no Pokemon receives a clear, friendly chat message."""
        res = await self.pokemon_service.handle_my_pokemon("Misty")
        self.assertIn("@Misty", res)
        self.assertIn("don't own any", res.lower())
        self.assertIn("!catch", res)

    async def test_view_another_viewer_pokemon(self):
        """!pokemon @username allows viewing public collection of another viewer."""
        # View Ash's collection as Gary
        res_ash = await self.pokemon_service.handle_view_pokemon("Gary", "@Ash")
        self.assertIn("Ash's Pokémon (3 total", res_ash)
        self.assertIn("Pikachu ×2", res_ash)

        # View non-existent user
        res_nobody = await self.pokemon_service.handle_view_pokemon("Gary", "@NobodyHere")
        self.assertIn("doesn't own any pokémon yet", res_nobody.lower())

    async def test_summon_owned_pokemon(self):
        """!summon allows summoning an owned Pokemon and broadcasts to overlay."""
        res = await self.pokemon_service.handle_summon("Ash", "Charizard")
        self.assertIn("Ash summoned Charizard", res)

        # Active summoned state updated
        active = self.pokemon_service.get_active_pokemon("Ash")
        self.assertIsNotNone(active)
        self.assertEqual(active["name"], "Charizard")

        # Broadcast event sent
        summon_events = [e for e in self.mock_bot.broadcast_events if e.get("action") == "summon"]
        self.assertTrue(len(summon_events) > 0)
        self.assertEqual(summon_events[0]["pokemon"]["name"], "Charizard")
        self.assertEqual(summon_events[0]["user"], "Ash")

    async def test_summon_unowned_pokemon_rejected(self):
        """!summon rejects summoning a Pokemon the viewer does not own."""
        res = await self.pokemon_service.handle_summon("Ash", "Mewtwo")
        self.assertIn("don't own a pokémon named 'mewtwo'", res.lower())

        # Misty with empty inventory cannot summon
        res_misty = await self.pokemon_service.handle_summon("Misty", "Pikachu")
        self.assertIn("don't have any pokémon to summon", res_misty.lower())

    async def test_attack_player_duel(self):
        """!attack allows attacking another trainer with active Pokemon."""
        # Ash attacks Gary
        res = await self.pokemon_service.handle_attack("Ash", "@Gary")
        self.assertTrue("Ash's" in res and "Gary's" in res)
        self.assertIn("pts)", res)

        # Broadcast event sent
        attack_events = [e for e in self.mock_bot.broadcast_events if e.get("action") == "battle"]
        self.assertTrue(len(attack_events) > 0)

    async def test_attack_self_rejected(self):
        """!attack rejects attacking oneself."""
        res = await self.pokemon_service.handle_attack("Ash", "@Ash")
        self.assertIn("cannot attack yourself", res.lower())

    async def test_attack_cooldown_enforced(self):
        """!attack enforces a 30s cooldown between attacks to prevent spam."""
        # First attack succeeds
        await self.pokemon_service.handle_attack("Ash", "@Gary")

        # Immediate second attack fails on cooldown
        res_spam = await self.pokemon_service.handle_attack("Ash", "@Gary")
        self.assertIn("recovering", res_spam.lower())
        self.assertIn("attack again in", res_spam.lower())

    async def test_bot_service_attack_routing(self):
        """BotService properly routes numeric attack to Boss Fight and @target to Pokemon Duel."""
        bot = BotService.__new__(BotService)
        bot._custom_cmd_cooldowns = {}
        bot.viewers = self.mock_bot.viewers
        bot.pokemon = self.pokemon_service
        bot.boss_fight = self.mock_bot.boss_fight
        bot.broadcast_func = self.mock_bot.broadcast_func
        bot.chat_messages = []
        async def fake_send_chat(msg):
            bot.chat_messages.append(msg)
        bot._send_chat = fake_send_chat
        bot.load_config = MagicMock(return_value={"loyalty": {"enabled": True}})

        # 1. Numeric attack "!attack 50" -> Boss Fight
        await bot._handle_command("Ash", "!attack 50", None)
        self.mock_bot.boss_fight.attack_boss.assert_called_with("Ash", 50, 500, self.mock_bot.viewers)

        # 2. Player attack "!attack @Gary" -> Pokemon Duel
        await bot._handle_command("Ash", "!attack @Gary", None)
        self.assertTrue(len(bot.chat_messages) > 0)
        self.assertTrue(any("Gary" in msg for msg in bot.chat_messages))

        # 3. !mypokemon -> Ash's inventory
        await bot._handle_command("Ash", "!mypokemon", None)
        self.assertTrue(any("Pikachu" in msg and "2" in msg for msg in bot.chat_messages))


if __name__ == "__main__":
    unittest.main()
