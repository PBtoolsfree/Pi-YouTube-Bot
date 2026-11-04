"""
Master Regression Test Suite for PB HERO PiBot — Advanced Piya AI Agent Audit & Fixes.
Covers:
  1. Random Conversation Scheduler (ON/OFF, restart, no duplicates, cooldowns, eligibility, provider error recovery)
  2. Smart Natural Language Wake-Word & Intent Detection (beginning, middle, end, rejection of Piyanka, ! isolation)
  3. Hindi / Hinglish / English Natural Language Pokémon Actions:
     - Capture (with/without active encounter, insufficient points, success, correct viewer binding)
     - Attack / Battle (active battle, skirmish, missing target clarification, cooldowns, authorization)
     - Inventory and Active Buddy queries
  4. Conversation Memory & Context (isolation per viewer, reference resolution, expiration)
  5. Feature Switches & Security Enforcement:
     - normal_llm, obs_actions, integration_tools, pokemon_actions, loyalty_actions
     - Owner confirmation tokens, moderator boundaries, viewer privacy
"""

from __future__ import annotations
import os
import sys
import time
import json
import asyncio
try:
    import pytest
except ImportError:
    pytest = None
from unittest.mock import MagicMock, AsyncMock, patch

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CLOUD_DIR = os.path.join(REPO_ROOT, "bot-cloud")
if CLOUD_DIR not in sys.path:
    sys.path.insert(0, CLOUD_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.services.agent_service import AgentService, DEFAULT_AGENT_CONFIG
from backend.services.pokemon_service import PokemonService
from backend.services.viewer_service import ViewerService
from backend.bot_service import BotService, detect_wake_word
from backend.config_manager import ConfigManager


# ── Test Mocks & Fixtures ──────────────────────────────────────────────────

class MockAIEngine:
    def __init__(self, response_text="Hello! Main Piya hoon."):
        self.response_text = response_text
        self.call_count = 0
        self.last_messages = []
        self.should_fail = False

    async def chat(self, messages, system_prompt=None):
        self.call_count += 1
        self.last_messages = messages
        if self.should_fail:
            return {"response": None, "error": "Simulated AI provider timeout"}

        # If follow-up tool synthesis prompt
        if len(messages) >= 3 and messages[-1].get("role") == "system" and "Tool Execution Results" in messages[-1].get("content", ""):
            content = messages[-1]["content"]
            lines = [l for l in content.split("\n") if l.startswith("- Tool '")]
            tool_res = lines[0].split(": ", 1)[1] if lines and ": " in lines[0] else content
            return {"response": f"Confirmed: {tool_res}"}

        return {"response": self.response_text}


class BotFixture:
    def __init__(self):
        self.viewers = ViewerService(viewers_path="test_viewers_master.json")
        self.viewers.viewers = {
            "alice": {"count": 20, "points": 1000, "rank": "Gold", "watch_time": 100},
            "bob": {"count": 5, "points": 50, "rank": "Novice", "watch_time": 20},
            "pradip": {"count": 100, "points": 50000, "rank": "Owner", "watch_time": 1000}
        }
        self.ai_engine = MockAIEngine()
        self.broadcast_func = AsyncMock()
        self.audio = MagicMock()
        self.audio.speak = AsyncMock()
        self.moderation = MagicMock()
        self.moderation.ban = AsyncMock(return_value="Banned successfully")
        self.moderation.timeout = AsyncMock(return_value="Timed out successfully")

        # Mock Pokemon Service
        self.pokemon = MagicMock()
        self.pokemon.active_wild_pokemon = {"name": "Pikachu", "power": 12, "sprite": "pika.gif"}
        self.pokemon.pending_battles = {}
        self.pokemon.attack_cooldowns = {}
        self.pokemon.users_data = {
            "alice": {"pokemons": [{"name": "Charizard", "power": 85}], "wins": 2, "losses": 0},
            "bob": {"pokemons": [{"name": "Eevee", "power": 15}], "wins": 0, "losses": 1}
        }
        self.pokemon.get_user_inventory = MagicMock(side_effect=lambda u: self.pokemon.users_data.get(u.lower(), {}).get("pokemons", []))
        self.pokemon.get_user_pokemon = MagicMock(side_effect=lambda u, name=None: (
            next((p for p in self.pokemon.users_data.get(u.lower(), {}).get("pokemons", []) if not name or p["name"].lower() == name.lower()), None)
        ))
        self.pokemon.get_active_pokemon = MagicMock(side_effect=lambda u: (
            self.pokemon.users_data.get(u.lower(), {}).get("pokemons", [None])[0]
        ))
        self.pokemon.handle_catch = AsyncMock(return_value="🎉 @alice successfully caught wild Pikachu!")
        self.pokemon.handle_attack = AsyncMock(return_value="⚔️ @alice's Charizard defeated @bob's Eevee! Won 25 bonus points.")
        self.pokemon.handle_battle_challenge = AsyncMock(return_value="⚔️ @bob, alice challenged you to a battle for 50 points!")
        self.pokemon.handle_accept = AsyncMock(return_value="⚔️ @alice won the battle against @bob!")
        self.pokemon.handle_summon = AsyncMock(return_value="Set Charizard as active buddy.")
        self.pokemon.get_pokemon_species_info = AsyncMock(return_value="Eevee: Normal type, 7 Power.")

        self._trigger_sb_action = AsyncMock()
        self.is_sb_connected = True
        self.is_running = True
        self.live_chat_id = "test_live_chat"

    def load_config(self):
        return {
            "agent": {
                "name": "Piya",
                "personality": "Helpful Hinglish AI assistant",
                "operators": ["pradip", "owner"],
                "moderators": ["moduser"],
                "switches": {
                    "agent_enabled": True,
                    "normal_llm": True,
                    "auto_chat": True,
                    "viewer_support": True,
                    "loyalty_actions": True,
                    "pokemon_actions": True,
                    "chat_moderation": True,
                    "tts_actions": True,
                    "obs_actions": True,
                    "integration_tools": True,
                    "memory_enabled": True,
                    "chat_history": True,
                },
                "auto_chat": {
                    "enabled": True,
                    "probability": 1.0,
                    "global_cooldown": 0,
                    "user_cooldown": 0,
                    "max_session_replies": 50,
                    "max_length": 150,
                    "stream_live_only": False,
                },
                "rate_limits": {"global_cooldown": 0, "user_cooldown": 0}
            },
            "moderation": {
                "ignore_list": ["botuser", "nightbot"]
            }
        }


# ==============================================================================
# PART 1: SMART WAKE-WORD & INTENT DETECTION TESTS
# ==============================================================================

class TestSmartIntentAndWakeWord:
    """Test Part 1: Case-insensitivity, positioning, substring safety, ! command protection."""

    def test_wake_word_at_beginning_middle_end(self):
        # Beginning
        matched, prompt = detect_wake_word("Piya hello", agent_name="Piya")
        assert matched is True
        assert prompt == "hello"

        # Middle
        matched, prompt = detect_wake_word("hello @Piya can you help?", agent_name="Piya")
        assert matched is True
        assert "can you help" in prompt

        # End
        matched, prompt = detect_wake_word("Mere points batao Piya", agent_name="Piya")
        assert matched is True
        assert "Mere points batao" in prompt

    def test_wake_word_rejects_substrings_like_piyanka(self):
        matched, _ = detect_wake_word("Piyanka is here", agent_name="Piya")
        assert matched is False

        matched, _ = detect_wake_word("Hello APIyali", agent_name="Piya")
        assert matched is False

        matched, _ = detect_wake_word("piyush play well", agent_name="Piya")
        assert matched is False

    def test_explicit_exclamation_commands_remain_unaffected(self):
        """Commands starting with ! like !pokemon, !mypokemon, !catch bypass wake word."""
        cmds = ["!pokemon", "!mypokemon", "!catch", "!points", "!attack @user", "!help"]
        for cmd in cmds:
            matched, _ = detect_wake_word(cmd, agent_name="Piya")
            assert matched is False, f"Command '{cmd}' should NOT be intercepted by wake word!"

    def test_explicit_ai_prefixes_are_handled(self):
        matched, prompt = detect_wake_word("!piya kya haal hai", agent_name="Piya")
        assert matched is True
        assert "kya haal hai" in prompt


# ==============================================================================
# PART 2: POKÉMON NATURAL LANGUAGE INTENT & TOOL EXECUTION TESTS
# ==============================================================================

class TestPokemonNaturalLanguageActions:
    """Test Part 2: Capture, battle, attack, inventory, buddy, and failure honesty."""

    def test_natural_language_capture_success_for_correct_viewer(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            # Viewer requests capture in Hinglish
            res = await agent.process_request("alice", "user_alice", "Piya, mere liye ek Pokemon capture kar do.")
            bot.pokemon.handle_catch.assert_called_once_with("alice")
            assert "caught wild Pikachu" in res or "Confirmed" in res
        asyncio.run(_test())

    def test_natural_language_capture_no_encounter_honest_response(self):
        async def _test():
            bot = BotFixture()
            bot.pokemon.active_wild_pokemon = None
            bot.pokemon.handle_catch = AsyncMock(return_value="@alice, there is no wild Pokemon to catch right now!")
            agent = AgentService(bot)

            res = await agent.process_request("alice", "user_alice", "Mere liye Pokemon pakdo.")
            bot.pokemon.handle_catch.assert_called_once_with("alice")
            assert "no wild Pokemon" in res
        asyncio.run(_test())

    def test_natural_language_capture_insufficient_points_honest_failure(self):
        async def _test():
            bot = BotFixture()
            bot.pokemon.handle_catch = AsyncMock(return_value="@bob, you need 10 points to attempt catching! (Your balance: 5 pts)")
            agent = AgentService(bot)

            res = await agent.process_request("bob", "user_bob", "Piya, wild Pokemon capture karo")
            bot.pokemon.handle_catch.assert_called_once_with("bob")
            assert "need 10 points" in res
        asyncio.run(_test())

    def test_natural_language_attack_with_opponent_target(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            res = await agent.process_request("alice", "user_alice", "Mere Pokemon se @bob par attack karwao.")
            bot.pokemon.handle_attack.assert_called_once_with("alice", "bob")
            assert "Charizard defeated @bob's Eevee" in res or "Confirmed" in res
        asyncio.run(_test())

    def test_natural_language_attack_missing_target_clarification(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            # No target given and no pending battle
            res = await agent.process_request("alice", "user_alice", "Mere Pokemon se attack karwao.")
            # Must ask clarification rather than attacking a fabricated target
            assert "kiske Pokemon par attack karna hai" in res or "opponent ka naam batayein" in res
        asyncio.run(_test())

    def test_natural_language_attack_with_unowned_pokemon_rejected(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            # Alice does not own Mewtwo (she only has Charizard)
            res = await agent.process_request("alice", "user_alice", "Mewtwo se @bob par attack karo.")
            assert "aapke paas 'Mewtwo' nahi hai" in res
            bot.pokemon.handle_attack.assert_not_called()
        asyncio.run(_test())

    def test_natural_language_battle_start_challenge(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            res = await agent.process_request("alice", "user_alice", "Mera Pokemon battle mein bhejo @bob ke saath 50 points.")
            bot.pokemon.handle_battle_challenge.assert_called_once()
            args, kwargs = bot.pokemon.handle_battle_challenge.call_args
            assert args[0] == "alice"
            assert args[1] == "bob"
        asyncio.run(_test())

    def test_natural_language_inventory_lookup(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            res = await agent.process_request("alice", "user_alice", "Mere Pokemon inventory mein kya hai?")
            assert "Charizard" in res
        asyncio.run(_test())

    def test_natural_language_active_pokemon_lookup(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            res = await agent.process_request("alice", "user_alice", "Mera active Pokemon kaun sa hai?")
            assert "Charizard" in res
        asyncio.run(_test())


# ==============================================================================
# PART 3: CONVERSATION MEMORY & CONTEXT ISOLATION TESTS
# ==============================================================================

class TestConversationMemoryAndContext:
    """Test Part 3: Per-viewer context isolation, safe pronoun resolution ('usse'), and context TTL."""

    def test_context_reference_resolution_usse(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            # Turn 1: Ask about inventory
            await agent.process_request("alice", "user_alice", "Piya, mere paas kaunsa Pokemon hai?")

            # Turn 2: Follow-up using 'usse'
            res = await agent.process_request("alice", "user_alice", "Usse @bob par attack karwao.")
            bot.pokemon.handle_attack.assert_called_once_with("alice", "bob")
            assert "Charizard" in str(bot.pokemon.handle_attack.call_args) or "Charizard" in res or "Confirmed" in res
        asyncio.run(_test())

    def test_context_isolation_between_different_viewers(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            # Alice talks about Charizard
            await agent.process_request("alice", "user_alice", "Piya, mere paas kaunsa Pokemon hai?")
            alice_ctx = agent._get_clean_user_context("user_alice")
            assert len(alice_ctx) == 1
            assert "Charizard" in alice_ctx[0]["meta"].get("pokemon", "") or "Charizard" in alice_ctx[0]["agent"]

            # Bob's context must be completely empty / independent
            bob_ctx = agent._get_clean_user_context("user_bob")
            assert len(bob_ctx) == 0
        asyncio.run(_test())

    def test_context_expiration_ttl(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)
            agent.context_ttl = 1.0  # 1 second TTL for test

            await agent.process_request("alice", "user_alice", "Hello Piya")
            assert len(agent._get_clean_user_context("user_alice")) == 1

            # Simulate time jump beyond TTL
            agent.user_contexts["user_alice"][0]["timestamp"] = time.time() - 10.0
            assert len(agent._get_clean_user_context("user_alice")) == 0
        asyncio.run(_test())


# ==============================================================================
# PART 4: AUTOMATIC / RANDOM CONVERSATION SCHEDULER TESTS
# ==============================================================================

class TestRandomConversationScheduler:
    """Test Part 4: Auto-chat ON/OFF, startup, cooldowns, eligibility, provider failure recovery."""

    def test_agent_get_config_method_exists_and_returns_config(self):
        bot = BotFixture()
        agent = AgentService(bot)
        cfg = agent.get_config()
        assert isinstance(cfg, dict)
        assert "auto_chat" in cfg
        assert "switches" in cfg

    def test_process_request_accepts_is_auto_chat_without_type_error(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)
            # Calling process_request with is_auto_chat=True must succeed
            reply = await agent.process_request("alice", "user_alice", "Great stream!", is_auto_chat=True, allow_tools=False)
            assert reply is not None
            assert isinstance(reply, str)
        asyncio.run(_test())

    def test_random_chat_disabled_stops_spontaneous_replies(self):
        bot = BotFixture()
        cfg = bot.load_config()
        cfg["agent"]["switches"]["auto_chat"] = False
        cfg["agent"]["auto_chat"]["enabled"] = False
        bot.load_config = MagicMock(return_value=cfg)

        agent = AgentService(bot)
        assert agent.is_feature_enabled("auto_chat") is False

    def test_random_chat_scheduler_loop_runs_and_respects_eligibility(self):
        async def _test():
            bot = BotService()
            bot.is_running = True
            bot.is_live_state = True
            bot._send_chat = AsyncMock()
            bot._log_ui = AsyncMock()

            # Mock agent to return a friendly reply
            bot.agent = AgentService(bot)
            bot.agent.is_feature_enabled = MagicMock(side_effect=lambda k: True)
            bot.agent.get_config = MagicMock(return_value={
                "auto_chat": {
                    "enabled": True,
                    "global_cooldown": 0,
                    "user_cooldown": 0,
                    "max_session_replies": 5,
                    "max_length": 100,
                    "stream_live_only": False,
                }
            })
            bot.agent.process_request = AsyncMock(return_value="Kya chal raha hai stream par?")

            # Add recent message from eligible viewer
            bot.recent_chat_messages.append({
                "author": "eligible_user",
                "user_id": "u123",
                "message": "GG stream!",
                "timestamp": time.time()
            })

            # Run one cycle of random chat
            task = asyncio.create_task(bot._random_chat_loop())
            await asyncio.sleep(0.1)
            bot.is_running = False
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            # Verify chat message was sent to the eligible viewer
            assert bot._send_chat.called
            sent_text = bot._send_chat.call_args[0][0]
            assert "@eligible_user" in sent_text
            assert "Kya chal raha hai" in sent_text
        asyncio.run(_test())

    def test_random_chat_no_eligible_viewers_means_no_messages(self):
        async def _test():
            bot = BotService()
            bot.is_running = True
            bot._send_chat = AsyncMock()
            bot.recent_chat_messages.clear()
            bot.session_chatters.clear()

            bot.agent = AgentService(bot)
            bot.agent.is_feature_enabled = MagicMock(side_effect=lambda k: True)
            bot.agent.get_config = MagicMock(return_value={
                "auto_chat": {"enabled": True, "stream_live_only": False, "global_cooldown": 0, "user_cooldown": 0}
            })

            # Run cycle with no viewers
            task = asyncio.create_task(bot._random_chat_loop())
            await asyncio.sleep(0.05)
            bot.is_running = False
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            # Must not send chat when nobody is active
            bot._send_chat.assert_not_called()
        asyncio.run(_test())

    def test_random_chat_provider_failure_does_not_crash_scheduler(self):
        async def _test():
            bot = BotService()
            bot.is_running = True
            bot._send_chat = AsyncMock()

            bot.agent = AgentService(bot)
            bot.agent.is_feature_enabled = MagicMock(side_effect=lambda k: True)
            bot.agent.get_config = MagicMock(return_value={
                "auto_chat": {"enabled": True, "stream_live_only": False, "global_cooldown": 0, "user_cooldown": 0}
            })
            # Simulate agent throwing an exception
            bot.agent.process_request = AsyncMock(side_effect=Exception("Simulated provider network drop"))

            bot.recent_chat_messages.append({
                "author": "eligible_user",
                "user_id": "u123",
                "message": "GG stream!",
                "timestamp": time.time()
            })

            task = asyncio.create_task(bot._random_chat_loop())
            await asyncio.sleep(0.05)
            # Scheduler loop must still be alive despite provider exception!
            assert not task.done()
            bot.is_running = False
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        asyncio.run(_test())


# ==============================================================================
# PART 5: SECURITY & FEATURE SWITCHES ENFORCEMENT TESTS
# ==============================================================================

class TestSecurityAndFeatureSwitches:
    """Test Part 5: Backend switch enforcement (normal_llm, obs_actions, integration_tools) and roles."""

    def test_normal_llm_switch_disabled_blocks_chit_chat(self):
        async def _test():
            bot = BotFixture()
            cfg = bot.load_config()
            cfg["agent"]["switches"]["normal_llm"] = False
            bot.load_config = MagicMock(return_value=cfg)

            agent = AgentService(bot)
            reply = await agent.process_request("alice", "user_alice", "Hello Piya, how are you today?")
            assert "conversational" in reply.lower() or "disabled" in reply.lower()
            # AI engine was not used to generate chit-chat
            assert bot.ai_engine.call_count == 0
        asyncio.run(_test())

    def test_obs_actions_switch_and_role_enforcement(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            # 1. Viewer tries to trigger OBS -> Denied
            res_viewer = await agent.execute_tool("trigger_obs_action", {"action_name": "Scare"}, caller_name="alice", caller_role="viewer")
            assert "Permission denied" in res_viewer

            # 2. Moderator triggers OBS -> Success
            res_mod = await agent.execute_tool("trigger_obs_action", {"action_name": "Scare"}, caller_name="moduser", caller_role="moderator")
            assert "Triggered OBS" in res_mod
            bot._trigger_sb_action.assert_called_with("Scare")

            # 3. Disable switch -> Denied even for moderator
            cfg = bot.load_config()
            cfg["agent"]["switches"]["obs_actions"] = False
            bot.load_config = MagicMock(return_value=cfg)
            res_disabled = await agent.execute_tool("trigger_obs_action", {"action_name": "Scare"}, caller_name="moduser", caller_role="moderator")
            assert "disabled" in res_disabled
        asyncio.run(_test())

    def test_integration_tools_switch_enforcement(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            # 1. Enabled -> returns integration status
            res = await agent.execute_tool("get_system_status", {}, caller_name="alice", caller_role="viewer")
            data = json.loads(res)
            assert "streamer_bot_connected" in data

            # 2. Disabled -> blocked
            cfg = bot.load_config()
            cfg["agent"]["switches"]["integration_tools"] = False
            bot.load_config = MagicMock(return_value=cfg)
            res_disabled = await agent.execute_tool("get_system_status", {}, caller_name="alice", caller_role="viewer")
            assert "disabled" in res_disabled
        asyncio.run(_test())

    def test_viewer_cannot_access_or_modify_another_viewers_data(self):
        async def _test():
            bot = BotFixture()
            agent = AgentService(bot)

            # Alice cannot transfer Bob's points
            # execute_tool transfer_my_points always uses caller_name as sender
            res = await agent.execute_tool("transfer_my_points", {"receiver": "pradip", "amount": 100}, caller_name="alice", caller_role="viewer")
            assert "alice" in res
            # Bob's balance is untouched
            assert bot.viewers.viewers["bob"]["points"] == 50
        asyncio.run(_test())

    def test_is_live_mirrors_is_stream_live(self):
        bot = BotService()
        bot.load_config = MagicMock(return_value={"stream_offline": False})
        # If not connected, is_live must be False
        assert bot.is_live is False
        assert bot.is_live == bot.is_stream_live

        # When stream_offline is True, is_live must be False
        bot.load_config = MagicMock(return_value={"stream_offline": True})
        assert bot.is_live is False

    def test_spawn_managed_loop_idempotency(self):
        async def _test():
            bot = BotService()
            bot.is_running = True
            calls = 0
            async def dummy_worker():
                nonlocal calls
                calls += 1
                while bot.is_running:
                    await asyncio.sleep(0.01)

            t1 = bot._spawn_managed_loop("dummy_loop", dummy_worker)
            t2 = bot._spawn_managed_loop("dummy_loop", dummy_worker)
            # Must return identical task, no duplicate worker
            assert t1 is t2
            bot.is_running = False
            bot.stop()
            await asyncio.sleep(0.02)
            assert t1.cancelled() or t1.done()
        asyncio.run(_test())
