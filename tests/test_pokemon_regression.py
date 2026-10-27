import unittest
import asyncio
import os
import sys
import time
import uuid
from unittest.mock import MagicMock, AsyncMock, patch

cloud_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bot-cloud'))
if cloud_dir not in sys.path:
    sys.path.insert(0, cloud_dir)

from backend.services.pokemon_service import PokemonService, normalize_pokemon
from backend.bot_service import BotService, is_valid_command


class MockViewerService:
    def __init__(self):
        self.viewers = {
            "Ash": {
                "points": 500,
                "pokemons": [
                    {"name": "Pikachu", "power": 20, "type": "Electric", "sprite": "http://pika.png"},
                    {"name": "Pikachu", "power": 20, "type": "Electric", "sprite": "http://pika.png"},
                    {"name": "Charizard", "power": 35, "type": "Fire", "sprite": "http://char.png"}
                ],
                "active_pokemon": "Pikachu"
            },
            "Gary": {
                "points": 300,
                "pokemons": [
                    {"name": "Blastoise", "power": 30, "type": "Water", "sprite": "http://blast.png"}
                ],
                "active_pokemon": "Blastoise"
            },
            "Misty": {
                "points": 100,
                "pokemons": []
            }
        }

    def get_viewer(self, user):
        canonical = self.find_username(user) or user
        return self.viewers.get(canonical, {"points": 0, "pokemons": []})

    def get_total_points(self, user):
        return self.get_viewer(user).get("points", 0)

    def deduct_points(self, user, pts):
        canonical = self.find_username(user) or user
        if canonical in self.viewers and self.viewers[canonical]["points"] >= pts:
            self.viewers[canonical]["points"] -= pts
            return True
        return False

    def add_points(self, user, pts):
        canonical = self.find_username(user) or user
        if canonical not in self.viewers:
            self.viewers[canonical] = {"points": 0, "pokemons": []}
        self.viewers[canonical]["points"] += pts

    def set_points(self, user, pts):
        canonical = self.find_username(user) or user
        if canonical not in self.viewers:
            self.viewers[canonical] = {"points": 0, "pokemons": []}
        self.viewers[canonical]["points"] = max(0, pts)

    def find_username(self, name_or_mention: str):
        if not name_or_mention:
            return None
        clean = name_or_mention.lstrip('@').strip()
        if clean in self.viewers:
            return clean
        for existing in self.viewers:
            if existing.lower() == clean.lower():
                return existing
        return None

    def update_viewer(self, author, trigger_welcome_cb=None, trigger_rank_up_cb=None, check_loyalty_cb=None, channel_id=None):
        return self.get_viewer(author)

    def get_rank(self, msg_count, watch_time=0):
        return {"name": "Noob", "emoji": "🌱"}

    def _save_viewers(self):
        pass


class TestPokemonCommandsRegression(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Build an instance of BotService using __new__ to isolate unit tests cleanly
        self.bot = BotService.__new__(BotService)
        self.bot.viewers = MockViewerService()
        self.bot.viewers.bot = self.bot
        self.bot._custom_cmd_cooldowns = {}
        self.bot.broadcast_events = []
        self.bot.chat_messages = []
        self.bot.session_stats = {"total_commands": 0}
        self.bot.session_chatters = {"Ash": 5, "Gary": 3}
        self.bot.message_dedup_cache = []
        self.bot._content_dedup_dict = {}
        self.bot._dedup_lock = asyncio.Lock()
        self.bot.cloud_alert_client = None
        self.bot.audio = None
        self.bot.mod_locks = {}

        self.bot.yt_memory_enabled = False
        self.bot.moderation = MagicMock()
        self.bot.moderation.is_user_muted.return_value = False
        self.bot._log_ui = AsyncMock()
        self.bot._trigger_welcome = AsyncMock()
        self.bot._trigger_rank_up = AsyncMock()
        self.bot._check_loyalty = AsyncMock()
        self.bot.pi_clients = MagicMock()
        self.bot.pi_clients.broadcast = AsyncMock()

        async def fake_broadcast(event):
            self.bot.broadcast_events.append(event)
        self.bot.broadcast_func = fake_broadcast

        async def fake_send_chat(msg):
            self.bot.chat_messages.append(msg)
        self.bot._send_chat = fake_send_chat

        self.bot.load_config = MagicMock(return_value={
            "commands": {"enabled": True, "prefix": "!"},
            "loyalty": {
                "enabled": True,
                "games": {
                    "pokemon": {
                        "enabled": True,
                        "catch_cost": 10,
                        "catch_rate": 100,
                        "duel_cost": 50,
                        "duel_reward": 25
                    }
                }
            },
            "moderation": {
                "enabled": False,
                "ai_triggers": {
                    "enabled": True,
                    "prefixes": ["!ai", "!ask"],
                    "keywords": ["piya"]
                }
            }
        })

        self.bot.boss_fight = MagicMock()
        self.bot.boss_fight.attack_boss.return_value = {
            "success": True,
            "actual_damage": 50,
            "current_hp": 950,
            "defeated": False,
            "message": "Dealt 50 damage to Boss!"
        }

        # Mock Piya Agent to verify it is NOT erroneously called on explicit pokemon commands
        self.bot.agent = MagicMock()
        self.bot.agent.get_agent_name.return_value = "Piya"
        self.bot.agent.is_feature_enabled.return_value = False
        self.bot.agent.process_request = AsyncMock(return_value="Agent AI Response")
        self.bot.brain = MagicMock()
        self.bot.brain.recall_answer.return_value = None

        self.pokemon_service = PokemonService(self.bot)
        self.pokemon_service.users_data = {}
        self.pokemon_service.active_summoned = {}
        self.pokemon_service.attack_cooldowns = {}
        self.pokemon_service.pending_battles = {}
        self.bot.pokemon = self.pokemon_service

    async def asyncTearDown(self):
        self.pokemon_service.stop()

    async def _send_chat(self, author, message):
        """Helper to send a message through the full application dispatcher."""
        self.bot._content_dedup_dict = {}
        if hasattr(self.bot, "message_dedup_cache"):
            self.bot.message_dedup_cache.clear()

        class MockAuthor:
            def __init__(self, name):
                self.name = name
                self.channelId = f"id_{name}"
                self.is_sponsor = False
                self.is_subscriber = False
                self.is_moderator = False
                self.is_chat_owner = False

        class MockChat:
            def __init__(self, author, message):
                self.author = MockAuthor(author)
                self.message = message
                self.msg_id = f"msg_{uuid.uuid4().hex}_{author}"
                self.id = self.msg_id

        await self.bot._handle_message(MockChat(author, message))

    # 1. is_valid_command recognition tests
    def test_is_valid_command_recognition(self):
        cfg = {"commands": {"enabled": True, "prefix": "!"}}
        self.assertTrue(is_valid_command("!catch", cfg))
        self.assertTrue(is_valid_command("mypokemon", cfg))
        self.assertTrue(is_valid_command("!mypokemon", cfg))
        self.assertTrue(is_valid_command("pokemon", cfg))
        self.assertTrue(is_valid_command("summon", cfg))
        self.assertTrue(is_valid_command("!summon", cfg))
        self.assertTrue(is_valid_command("attack", cfg))
        self.assertTrue(is_valid_command("pokeattack", cfg))
        self.assertTrue(is_valid_command("pattack", cfg))
        self.assertTrue(is_valid_command("battle", cfg))
        self.assertTrue(is_valid_command("accept", cfg))
        self.assertTrue(is_valid_command("showpokemon", cfg))
        self.assertTrue(is_valid_command("show", cfg))
        self.assertTrue(is_valid_command("help", cfg))
        self.assertFalse(is_valid_command("nonexistentcommand123", cfg))

    # 2. Working !catch regression test
    async def test_catch_workflow_through_dispatcher(self):
        # Spawn a wild pokemon
        await self.pokemon_service.spawn_wild_pokemon(force=True, is_test=False)
        self.assertIsNotNone(self.pokemon_service.active_wild_pokemon)
        spawned_name = self.pokemon_service.active_wild_pokemon["name"]

        # Ash catches it via chat pipeline
        await self._send_chat("Ash", "!catch")
        self.assertTrue(any("caught the wild" in m and spawned_name in m for m in self.bot.chat_messages))

        # Check inventory updated
        ash_inv = self.pokemon_service.get_user_inventory("Ash")
        self.assertTrue(any(p["name"] == spawned_name for p in ash_inv))

    # 3. !mypokemon tests
    async def test_mypokemon_through_dispatcher(self):
        await self._send_chat("Ash", "!mypokemon")
        self.assertTrue(len(self.bot.chat_messages) > 0)
        reply = self.bot.chat_messages[-1]
        self.assertIn("@ash's pokémon", reply.lower())
        self.assertIn("Pikachu ×2", reply)
        self.assertIn("Charizard", reply)

    async def test_mypokemon_whitespace_and_case(self):
        await self._send_chat("Ash", "  !MyPokemon  ")
        self.assertTrue(len(self.bot.chat_messages) > 0)
        reply = self.bot.chat_messages[-1]
        self.assertIn("@ash's pokémon", reply.lower())
        self.assertIn("Pikachu ×2", reply)

    async def test_mypokemon_empty_collection(self):
        await self._send_chat("Misty", "!mypokemon")
        reply = self.bot.chat_messages[-1]
        self.assertIn("@misty, you don't own any pokémon yet!", reply.lower())
        self.assertIn("!catch", reply)

    # 4. !pokemon and variants
    async def test_pokemon_no_args_shows_own_collection(self):
        await self._send_chat("Gary", "!pokemon")
        reply = self.bot.chat_messages[-1]
        self.assertIn("@gary's pokémon", reply.lower())
        self.assertIn("Blastoise", reply)

    async def test_pokemon_with_mention_target(self):
        await self._send_chat("Gary", "!pokemon @Ash")
        reply = self.bot.chat_messages[-1]
        self.assertIn("@ash's pokémon", reply.lower())
        self.assertIn("Pikachu ×2", reply)

    async def test_pokemon_with_clean_username_target(self):
        await self._send_chat("Misty", "!pokemon Gary")
        reply = self.bot.chat_messages[-1]
        self.assertIn("@gary's pokémon", reply.lower())
        self.assertIn("Blastoise", reply)

    async def test_pokemon_pokedex_lookup(self):
        # Lookup known pokemon 'Pikachu'
        await self._send_chat("Gary", "!pokemon Pikachu")
        reply = self.bot.chat_messages[-1]
        self.assertIn("Pokédex: Pikachu", reply)
        self.assertIn("Type:", reply)

    async def test_pokemon_unknown_lookup(self):
        await self._send_chat("Ash", "!pokemon DefinitelyNotAPokemon")
        reply = self.bot.chat_messages[-1]
        self.assertIn("neither a known viewer nor a Pokémon in the Pokédex", reply)

    # 5. !summon tests
    async def test_summon_owned_pokemon(self):
        await self._send_chat("Ash", "!summon Charizard")
        reply = self.bot.chat_messages[-1]
        self.assertIn("summoned charizard", reply.lower())

        # Verify active summoned state
        active = self.pokemon_service.get_active_pokemon("Ash")
        self.assertEqual(active["name"], "Charizard")

        # Verify overlay event broadcast
        summon_events = [e for e in self.bot.broadcast_events if e.get("action") == "summon"]
        self.assertTrue(len(summon_events) > 0)
        self.assertEqual(summon_events[0]["pokemon"]["name"], "Charizard")

    async def test_summon_unowned_pokemon(self):
        await self._send_chat("Ash", "!summon Snorlax")
        reply = self.bot.chat_messages[-1]
        self.assertIn("don't own a Pokémon named 'Snorlax'", reply)

    async def test_summon_missing_argument(self):
        await self._send_chat("Ash", "!summon")
        reply = self.bot.chat_messages[-1]
        self.assertIn("Usage: !summon <pokemon_name>", reply)

    # 6. !attack tests
    async def test_attack_pokemon_duel(self):
        await self._send_chat("Ash", "!attack @Gary")
        reply = self.bot.chat_messages[-1]
        self.assertTrue("ash's" in reply.lower() and "gary's" in reply.lower())
        self.assertIn("won!", reply)

        # Check overlay battle broadcast
        battle_events = [e for e in self.bot.broadcast_events if e.get("action") == "battle"]
        self.assertTrue(len(battle_events) > 0)

    async def test_attack_aliases(self):
        # Reset cooldown for Ash
        self.pokemon_service.attack_cooldowns.clear()
        await self._send_chat("Ash", "!pokeattack @Gary")
        reply = self.bot.chat_messages[-1]
        self.assertTrue("ash's" in reply.lower() and "gary's" in reply.lower())

    async def test_attack_self_rejected(self):
        await self._send_chat("Ash", "!attack @Ash")
        reply = self.bot.chat_messages[-1]
        self.assertIn("cannot attack yourself", reply)

    async def test_attack_target_has_no_pokemon(self):
        await self._send_chat("Ash", "!attack @Misty")
        reply = self.bot.chat_messages[-1]
        self.assertIn("misty doesn't own any pokémon to battle!", reply.lower())

    async def test_attack_cooldown_enforced(self):
        self.pokemon_service.attack_cooldowns.clear()
        await self._send_chat("Ash", "!attack @Gary")
        # Second immediate attack should be blocked by cooldown
        await self._send_chat("Ash", "!attack @Gary")
        reply = self.bot.chat_messages[-1]
        self.assertIn("is recovering", reply)

    async def test_attack_numeric_routes_to_boss(self):
        await self._send_chat("Ash", "!attack 50")
        self.bot.boss_fight.attack_boss.assert_called_with("ash", 50, 500, self.bot.viewers)

    # 7. !battle and acceptance tests
    async def test_battle_challenge_and_acceptance(self):
        # Gary challenges Ash for 50 pts
        await self._send_chat("Gary", "!battle @Ash 50")
        reply = self.bot.chat_messages[-1]
        self.assertIn("challenged you using Blastoise for 50 points!", reply)
        self.assertIn("Type !accept <pokemon_name> to fight!", reply)

        # Ash accepts challenge using !accept
        await self._send_chat("Ash", "!accept Charizard")
        accept_reply = self.bot.chat_messages[-1]
        self.assertIn("BATTLE RESULTS:", accept_reply)
        self.assertTrue("won 50" in accept_reply)

    async def test_battle_accept_alias(self):
        # Challenge Gary as Ash
        await self._send_chat("Ash", "!battle @Gary 50 Pikachu")
        self.assertIn("challenged you using Pikachu", self.bot.chat_messages[-1])

        # Gary accepts using "!battle accept" alias
        await self._send_chat("Gary", "!battle accept Blastoise")
        reply = self.bot.chat_messages[-1]
        self.assertIn("BATTLE RESULTS:", reply)

    async def test_battle_duplicate_acceptance_prevented(self):
        # Ash challenges Gary
        await self._send_chat("Ash", "!battle @Gary 50")
        # First accept succeeds
        await self._send_chat("Gary", "!accept")
        first_reply = self.bot.chat_messages[-1]
        self.assertIn("BATTLE RESULTS:", first_reply)

        # Immediate duplicate accept rejected cleanly
        await self._send_chat("Gary", "!accept")
        duplicate_reply = self.bot.chat_messages[-1]
        self.assertIn("you don't have any pending battle challenges", duplicate_reply.lower())

    async def test_battle_insufficient_points_rejected(self):
        # Misty only has 100 points, tries to bet 500
        # First give Misty a pokemon
        self.bot.viewers.viewers["Misty"]["pokemons"] = [{"name": "Staryu", "power": 15, "type": "Water"}]
        await self._send_chat("Misty", "!battle @Ash 500")
        reply = self.bot.chat_messages[-1]
        self.assertIn("you don't have enough points", reply)

    async def test_battle_random_target_format(self):
        # Format: !battle 50
        await self._send_chat("Ash", "!battle 50")
        reply = self.bot.chat_messages[-1]
        self.assertTrue("challenged you" in reply or "nobody else has a Pokemon" in reply)

    # 8. !showpokemon tests
    async def test_showpokemon_named_and_overlay_broadcast(self):
        await self._send_chat("Ash", "!showpokemon Charizard")
        reply = self.bot.chat_messages[-1]
        self.assertIn("showing off their charizard on stream!", reply.lower())

        # Check overlay events
        show_events = [e for e in self.bot.broadcast_events if e.get("action") == "show"]
        self.assertTrue(len(show_events) > 0)
        self.assertEqual(show_events[0]["pokemon"]["name"], "Charizard")
        self.assertEqual(show_events[0]["user"].lower(), "ash")

    async def test_showpokemon_default_active(self):
        await self._send_chat("Gary", "!showpokemon")
        reply = self.bot.chat_messages[-1]
        self.assertIn("showing off their blastoise on stream!", reply.lower())

    async def test_showpokemon_unowned_rejected(self):
        await self._send_chat("Gary", "!showpokemon Mewtwo")
        reply = self.bot.chat_messages[-1]
        self.assertIn("you don't own a", reply.lower())
        self.assertIn("mewtwo", reply.lower())

    # 9. Explicit commands not swallowed by Piya Agent
    async def test_explicit_commands_never_swallowed_by_agent(self):
        # Even if agent is configured with active memory or triggers, explicit !commands must not call agent
        await self._send_chat("Ash", "!mypokemon")
        self.bot.agent.process_request.assert_not_called()

        await self._send_chat("Ash", "!pokemon Pikachu")
        self.bot.agent.process_request.assert_not_called()

        await self._send_chat("Ash", "!summon Pikachu")
        self.bot.agent.process_request.assert_not_called()

    async def test_unknown_command_returns_clear_error(self):
        await self._send_chat("Ash", "!randomboguscommand")
        self.bot.agent.process_request.assert_not_called()
        reply = self.bot.chat_messages[-1]
        self.assertIn("Unknown command '!randomboguscommand'", reply)
        self.assertIn("!help", reply)

    # 10. Real Streamer.bot chat event pipeline
    async def test_streamerbot_chat_event_pipeline(self):
        sb_payload = {
            "userId": "channel_gary_123",
            "msgId": "sb_event_999",
            "user": {
                "name": "Gary",
                "isSponsor": True,
                "isSubscriber": True
            }
        }
        res = await self.bot.handle_sb_chat("Gary", "!mypokemon", payload=sb_payload)
        self.assertIsInstance(res, dict)
        # Check chat response was delivered
        self.assertTrue(len(self.bot.chat_messages) > 0)
        self.assertIn("@gary's pokémon", self.bot.chat_messages[-1].lower())

    async def test_cloud_sync_chat_message_pipeline(self):
        cloud_event = {
            "type": "sync_chat_message",
            "author": "Ash",
            "message": "!pokemon @Gary",
            "msg_id": "cloud_sync_101",
            "channel_id": "ash_channel",
            "is_sponsor": False,
            "is_sub": True,
            "is_forwarded": True
        }
        await self.bot.handle_pi_client_event(cloud_event)
        self.assertTrue(len(self.bot.chat_messages) > 0)
        self.assertIn("@gary's pokémon", self.bot.chat_messages[-1].lower())


if __name__ == "__main__":
    unittest.main()
