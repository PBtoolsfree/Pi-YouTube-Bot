"""
Comprehensive Regression Tests for Piya Live Fixes
Covers:
  - Part 1: Custom Tip Page Link (Config, Validation, Endpoints, Exact URL, Tool Execution)
  - Part 2: Wake-Word Detection (Start, Middle, End, Standalone Tokens, Username Safety, ! Commands)
  - Part 3: AI Runtime & Grounded Pokémon Knowledge (Model Filtering, Failover, Species Lookup, Fallback)
  - Part 4: Chat Logs & YouTube Memory Endpoints (Schema, Pagination, Stats, Viewer Privacy)
"""

import sys
import os
import re
import json
import base64
import time
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

# Ensure paths
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CLOUD_DIR = os.path.join(REPO_ROOT, "bot-cloud")
if CLOUD_DIR not in sys.path:
    sys.path.insert(0, CLOUD_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.bot_service import detect_wake_word
from backend.services.pokemon_service import PokemonService
from backend.services.agent_service import AgentService
from backend.ai_service import AIEngine, is_conversational_model
from backend.config_manager import ConfigManager
from backend.api import _validate_tip_url, app


# ==============================================================================
# PART 1: CUSTOM TIP PAGE LINK TESTS
# ==============================================================================

class TestTipPageLink:
    """Test Part 1: Custom Tip Page link configuration, validation, and tool output."""

    def test_validate_tip_url_valid(self):
        valid_urls = [
            "https://stream.tip.me/pbhero",
            "http://localhost:8080/tip",
            "https://donations.mypage.com/live?user=123",
            "https://sub.domain.co.in/path/to/donate",
        ]
        for url in valid_urls:
            # Should not raise HTTPException
            _validate_tip_url(url)

    def test_validate_tip_url_invalid(self):
        invalid_urls = [
            "",
            "ftp://stream.tip.me",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "not-a-url",
            "https://user:password@malicious.com",
            "https:///no-host",
        ]
        for url in invalid_urls:
            with pytest.raises(HTTPException):
                _validate_tip_url(url)

    def test_get_tip_page_url_exact_no_concatenation(self):
        """Ensure get_tip_page_url NEVER automatically appends /tip to a configured URL."""
        bot = MagicMock()
        cfg = {
            "tip_page": {
                "custom_url": "https://stream.tip.me/pbhero/donate",
                "upi_vpa": "pbhero@upi",
                "donation_instructions": "Scan QR or send via GPay/PhonePe to UPI ID",
            }
        }
        bot.load_config = MagicMock(return_value=cfg)

        async def _test():
            with patch.object(ConfigManager, "get_config", return_value=cfg):
                agent = AgentService(bot)
                result = await agent.execute_tool("get_tip_page_url", {}, caller_name="viewer1", caller_role="viewer")

                # Must contain exact URL, without adding another /tip
                assert "https://stream.tip.me/pbhero/donate" in result
                assert "https://stream.tip.me/pbhero/donate/tip" not in result
                assert "pbhero@upi" in result
                assert "GPay/PhonePe" in result

        asyncio.run(_test())

    def test_get_tip_page_url_missing_configuration(self):
        """Ensure unconfigured state returns a clear honest message, not an invented URL."""
        bot = MagicMock()
        cfg = {"tip_page": {}, "domain": {}, "cloudflare": {}}
        bot.load_config = MagicMock(return_value=cfg)

        async def _test():
            with patch.object(ConfigManager, "get_config", return_value=cfg):
                agent = AgentService(bot)
                result = await agent.execute_tool("get_tip_page_url", {}, caller_name="viewer1", caller_role="viewer")
                assert "not currently configured" in result.lower()
                assert "bot-pro.cc" not in result

        asyncio.run(_test())

    def test_tip_link_api_endpoints(self):
        """Test GET and POST /api/agent/tip-link endpoints via TestClient."""
        client = TestClient(app)

        # Test GET
        res = client.get("/api/agent/tip-link")
        assert res.status_code == 200
        data = res.json()
        assert "custom_url" in data
        assert "upi_vpa" in data
        assert "donation_instructions" in data

        # Test POST without authorization header / valid role
        bad_post = client.post("/api/agent/tip-link", json={
            "custom_url": "https://validtip.com/pay"
        })
        assert bad_post.status_code in (401, 403)


# ==============================================================================
# PART 2: WAKE-WORD DETECTION & DISPATCH SAFETY TESTS
# ==============================================================================

class TestWakeWordDetection:
    """Test Part 2: Wake-word trigger matching, standalone token boundaries, and username safety."""

    def test_wake_word_beginning(self):
        is_triggered, query = detect_wake_word("Piya hello, kya tum online ho?", "Piya", ["@Piya", "PBHERO"])
        assert is_triggered
        assert query == "hello, kya tum online ho?"

    def test_wake_word_at_sign(self):
        is_triggered, query = detect_wake_word("@Piya mere points aur rank batao", "Piya", ["@Piya", "PBHERO"])
        assert is_triggered
        assert query == "mere points aur rank batao"

    def test_wake_word_middle(self):
        is_triggered, query = detect_wake_word("Eevee kya-kya kar sakta hai, Piya batao", "Piya", ["@Piya", "PBHERO"])
        assert is_triggered
        assert "Eevee kya-kya kar sakta hai" in query
        assert "batao" in query
        assert "Piya" not in query

    def test_wake_word_end(self):
        is_triggered, query = detect_wake_word("Mere points batao Piya", "Piya", ["@Piya", "PBHERO"])
        assert is_triggered
        assert query == "Mere points batao"

    def test_wake_word_greeting_prefix(self):
        is_triggered, query = detect_wake_word("Hello Piya", "Piya", ["@Piya", "PBHERO"])
        assert is_triggered
        assert query == "Hello"

    def test_wake_word_punctuation_variants(self):
        variants = [
            ("Piya, kaise ho?", "kaise ho?"),
            ("piya: kaisa hai?", "kaisa hai?"),
            ("PIYA!! help me", "help me"),
        ]
        for msg, expected_clean in variants:
            is_triggered, query = detect_wake_word(msg, "Piya", ["@Piya"])
            assert is_triggered, f"Failed for variant {msg}"
            assert query == expected_clean

    def test_no_false_positive_substrings(self):
        """Words containing 'Piya' like 'Piyanka' or 'APIya' must NEVER trigger."""
        false_cases = [
            "Piyanka is my friend",
            "Hello Piyanka, kaise ho?",
            "APIya documentation check karo",
            "spiyan is a word maybe",
        ]
        for msg in false_cases:
            is_triggered, query = detect_wake_word(msg, "Piya", ["@Piya"])
            assert not is_triggered, f"Should not trigger for {msg}"

    def test_username_safety_not_triggered_by_username(self):
        """A user named 'Piya' sending a normal message like 'Hello' must NOT trigger the agent."""
        msg = "Hello everyone in stream"
        is_triggered, _ = detect_wake_word(msg, "Piya", ["@Piya"])
        assert not is_triggered

    def test_explicit_commands_not_intercepted(self):
        """Explicit ! commands must not be treated as wake words."""
        commands = [
            "!pokemon",
            "!mypokemon",
            "!catch",
            "!summon Eevee",
            "!attack @player",
            "!battle @user 50",
            "!give @user 100",
            "!points",
            "!rank",
        ]
        for cmd in commands:
            is_triggered, _ = detect_wake_word(cmd, "Piya", ["@Piya"])
            assert not is_triggered, f"Explicit command {cmd} must not trigger wake word"


# ==============================================================================
# PART 3: AI RUNTIME & GROUNDED POKÉMON KNOWLEDGE
# ==============================================================================

class TestAIRuntimeAndPokemon:
    """Test Part 3: Model compatibility filtering, failover, and Pokémon species grounding."""

    def test_pokemon_species_info_eevee(self):
        """Verify PokemonService provides comprehensive species data for Eevee."""
        info = asyncio.run(PokemonService.get_pokemon_species_info("Eevee"))
        assert info is not None
        assert "Eevee" in info
        assert "PWR: 7" in info
        assert "Normal" in info
        assert "Vaporeon" in info
        assert "!summon" in info

    def test_pokemon_species_info_pikachu(self):
        """Verify PokemonService species lookup works for other species."""
        info = asyncio.run(PokemonService.get_pokemon_species_info("Pikachu"))
        assert info is not None
        assert "Pikachu" in info
        assert "PWR: 10" in info
        assert "Electric" in info

    def test_pokemon_species_info_unknown(self):
        """Unknown species returns polite failure message."""
        info = asyncio.run(PokemonService.get_pokemon_species_info("NotARealMon999"))
        assert "nahi mila" in info or "not found" in info.lower()

    def test_agent_pokemon_info_tool(self):
        """Verify AgentService execute_tool('get_pokemon_info') returns formatted species data."""
        bot = MagicMock()
        bot.pokemon = MagicMock()
        bot.pokemon.get_pokemon_species_info = PokemonService.get_pokemon_species_info

        async def _test():
            agent = AgentService(bot)
            result = await agent.execute_tool("get_pokemon_info", {"pokemon_name": "Eevee"}, caller_name="alice", caller_role="viewer")
            assert "Eevee" in result
            assert "PWR: 7" in result
            assert "Normal" in result

        asyncio.run(_test())

    def test_grounded_fallback_eevee_query(self):
        """Verify _try_grounded_fallback answers Eevee questions accurately when LLM is unavailable."""
        bot = MagicMock()
        bot.pokemon = MagicMock()
        bot.pokemon.get_pokemon_species_info = PokemonService.get_pokemon_species_info

        async def _test():
            agent = AgentService(bot)
            fallback = await agent._try_grounded_fallback("Eevee yah kya-kya kar sakta hai batao", "pradipbag6209")
            assert fallback is not None
            assert "Eevee" in fallback
            assert "PWR: 7" in fallback
            assert "!summon" in fallback or "!battle" in fallback

        asyncio.run(_test())

    def test_grounded_fallback_tip_page_query(self):
        """Verify _try_grounded_fallback returns tip link for donation questions."""
        bot = MagicMock()
        cfg = {
            "tip_page": {
                "custom_url": "https://stream.tip.me/pbhero",
                "upi_vpa": "pbhero@upi",
            }
        }
        bot.load_config = MagicMock(return_value=cfg)

        async def _test():
            with patch.object(ConfigManager, "get_config", return_value=cfg):
                agent = AgentService(bot)
                fallback = await agent._try_grounded_fallback("mera tip page link do", "pradipbag6209")
                assert fallback is not None
                assert "https://stream.tip.me/pbhero" in fallback
                assert "pbhero@upi" in fallback

        asyncio.run(_test())

    def test_ai_engine_is_conversational_model(self):
        """Verify conversational model filter rejects moderation, embedding, and specialist models."""
        # Conversational models
        assert is_conversational_model("gemini-1.5-flash")
        assert is_conversational_model("gemini-2.5-flash")
        assert is_conversational_model("gpt-4o-mini")
        assert is_conversational_model("claude-3-haiku")
        assert is_conversational_model("llama3:8b")

        # Non-conversational models
        assert not is_conversational_model("text-embedding-ada-002")
        assert not is_conversational_model("text-moderation-latest")
        assert not is_conversational_model("dall-e-3")
        assert not is_conversational_model("tts-1")
        assert not is_conversational_model("whisper-1")
        assert not is_conversational_model("bge-large-en")

    def test_ai_engine_failover_on_empty_choices(self):
        """Verify AIEngine fails over to secondary provider when primary returns empty choices."""
        engine = AIEngine()
        mock_cfg = {
            "ai_topology": {
                "providers": [
                    {
                        "id": "primary_fail",
                        "name": "Primary Faulty",
                        "type": "custom",
                        "enabled": True,
                        "priority": 1,
                        "models": [{"id": "model-1", "enabled": True, "priority": 1}]
                    },
                    {
                        "id": "secondary_ok",
                        "name": "Secondary Good",
                        "type": "custom",
                        "enabled": True,
                        "priority": 2,
                        "models": [{"id": "model-2", "enabled": True, "priority": 1}]
                    }
                ]
            }
        }

        async def mock_call(provider, model_id, history):
            if provider.get("id") == "primary_fail":
                # Primary returns empty/null choices, which raises ValueError
                raise ValueError("OpenAI-compatible returned empty choices list (model: model-1)")
            return "Valid response from backup provider"

        async def _test():
            with patch.object(ConfigManager, "get_config", return_value=mock_cfg):
                with patch.object(engine, "_call_openai_compatible", side_effect=mock_call):
                    res = await engine.chat("Hello test")
                    assert res["response"] == "Valid response from backup provider"
                    assert res["provider"] == "Secondary Good"
                    assert res["model"] == "model-2"
                    assert len(res["trace"]) == 2
                    assert res["trace"][0]["status"] == "error"
                    assert res["trace"][1]["status"] == "success"

        asyncio.run(_test())


# ==============================================================================
# PART 4: CHAT LOGS & YOUTUBE MEMORY ENDPOINTS
# ==============================================================================

class TestChatLogsAndMemory:
    """Test Part 4: Chat Logs response schema, limit parameter, and memory endpoints authorization."""

    @pytest.fixture(autouse=True)
    def setup_admin_auth(self):
        self.client = TestClient(app)
        self.admin_password = "supersecretadminpassword123"
        self.auth_header = {
            "Authorization": f"Basic {base64.b64encode(f'admin:{self.admin_password}'.encode()).decode()}"
        }
        self.bad_auth_header = {
            "Authorization": f"Basic {base64.b64encode(b'admin:wrongpass').decode()}"
        }

    def test_memory_routes_require_authentication(self):
        """All memory and chat log management routes reject unauthenticated requests with 401."""
        endpoints = [
            ("GET", "/api/memory/stats"),
            ("GET", "/api/youtube-memory/stats"),
            ("GET", "/api/memory/users"),
            ("GET", "/api/youtube-memory/users"),
            ("GET", "/api/memory/user/alice"),
            ("GET", "/api/youtube-memory/user/alice"),
            ("DELETE", "/api/memory/user/alice"),
            ("DELETE", "/api/youtube-memory/user/alice"),
            ("POST", "/api/memory/cleanup"),
            ("POST", "/api/youtube-memory/cleanup"),
            ("GET", "/api/chat/logs?limit=5"),
            ("GET", "/api/chat/logs/stats"),
            ("GET", "/api/chat/logs/export"),
        ]
        with patch.dict(os.environ, {"DASHBOARD_PASSWORD": self.admin_password}):
            for method, path in endpoints:
                # 1. Unauthenticated request (no auth header) -> 401
                res_no_auth = self.client.request(method, path)
                assert res_no_auth.status_code == 401, f"{method} {path} should require auth, got {res_no_auth.status_code}"

                # 2. Bad credentials -> 401
                res_bad_auth = self.client.request(method, path, headers=self.bad_auth_header)
                assert res_bad_auth.status_code == 401, f"{method} {path} should reject bad auth, got {res_bad_auth.status_code}"

    def test_memory_routes_with_valid_admin_auth(self):
        """Authenticated owner/admin receives 200 OK and expected schema on memory and chat endpoints."""
        with patch.dict(os.environ, {"DASHBOARD_PASSWORD": self.admin_password}):
            stats_res = self.client.get("/api/memory/stats", headers=self.auth_header)
            assert stats_res.status_code == 200
            assert "total_messages" in stats_res.json() or "total_users" in stats_res.json()

            users_res = self.client.get("/api/memory/users", headers=self.auth_header)
            assert users_res.status_code == 200
            users_data = users_res.json()
            assert "users" in users_data
            assert isinstance(users_data["users"], list)

            logs_res = self.client.get("/api/chat/logs?limit=5", headers=self.auth_header)
            assert logs_res.status_code == 200
            logs_data = logs_res.json()
            assert "messages" in logs_data
            assert "total" in logs_data
            assert len(logs_data["messages"]) <= 5

    def test_viewer_chat_delete_history_scoped_to_caller(self):
        """In live chat, delete_my_history tool only clears memory for caller_name, not other viewers."""
        bot = MagicMock()
        bot.brain_service = MagicMock()
        agent = AgentService(bot)

        async def _test():
            res = await agent.execute_tool("delete_my_history", {}, caller_name="alice", caller_role="viewer")
            assert "@alice" in res
            assert "cleared" in res.lower()
            if hasattr(bot.brain_service, "delete_user_history"):
                bot.brain_service.delete_user_history.assert_called_with("alice")

        asyncio.run(_test())


# ==============================================================================
# PART 5: CONFIRMATION TOKEN SECURITY & RESILIENCE
# ==============================================================================

class TestConfirmationTokenSecurity:
    """Test confirmation token strength, 6-character hex format, expiry, single-use, and guessing protection."""

    def test_confirmation_token_format_is_6_char_hex(self):
        """Verify confirmation challenge issues a 6-character uppercase hexadecimal token."""
        bot = MagicMock()
        agent = AgentService(bot)

        async def _test():
            res = await agent.execute_tool("restart_bot", {}, caller_name="pradip", caller_role="owner")
            assert "requires independent server-side confirmation" in res
            m = re.search(r'Code:\s*([0-9A-F]{6})\b', res)
            assert m is not None, f"Expected 6-char hex code in response: {res}"
            token = m.group(1)
            assert len(token) == 6
            assert re.match(r'^[0-9A-F]{6}$', token)

        asyncio.run(_test())

    def test_confirmation_token_not_logged_in_audit_trail(self):
        """Verify the confirmation token is redacted from audit logs to prevent credential leakage."""
        bot = MagicMock()
        agent = AgentService(bot)

        async def _test():
            res = await agent.execute_tool("restart_bot", {}, caller_name="pradip", caller_role="owner")
            m = re.search(r'Code:\s*([0-9A-F]{6})\b', res)
            assert m is not None
            token = m.group(1)

            audit = agent.get_audit_trail(10)
            assert len(audit) > 0
            for entry in audit:
                assert token not in entry.get("result", "")
                assert token not in str(entry)
                if entry.get("status") == "confirmation_challenge":
                    assert "token redacted" in entry.get("result", "")

        asyncio.run(_test())

    def test_confirmation_single_use_and_replay_protection(self):
        """Verify confirmation token is consumed upon first execution and replay is rejected."""
        bot = MagicMock()
        bot.viewers = MagicMock()
        bot.viewers.viewers = {"alice": {}, "bob": {}}
        bot.viewers.add_points = MagicMock()
        agent = AgentService(bot)

        async def _test():
            res = await agent.execute_tool("add_loyalty_all", {"amount": 100}, caller_name="pradip", caller_role="owner")
            m = re.search(r'Code:\s*([0-9A-F]{6})\b', res)
            assert m is not None
            token = m.group(1)

            # First execution with code -> succeeds
            confirm_res = await agent.confirm_pending_action("pradip", "owner", token)
            assert "Added 100 points" in confirm_res

            # Replay with same code must be rejected
            replay_res = await agent.confirm_pending_action("pradip", "owner", token)
            assert "invalid, already used, or expired" in replay_res

        asyncio.run(_test())

    def test_confirmation_expiry(self):
        """Verify confirmation token expires after 60 seconds TTL."""
        bot = MagicMock()
        agent = AgentService(bot)

        async def _test():
            res = await agent.execute_tool("restart_bot", {}, caller_name="pradip", caller_role="owner")
            m = re.search(r'Code:\s*([0-9A-F]{6})\b', res)
            assert m is not None
            token = m.group(1)

            # Manually expire the token
            agent._pending_confirmations[token]["expires_at"] = time.time() - 5.0

            confirm_res = await agent.confirm_pending_action("pradip", "owner", token)
            assert "expired" in confirm_res.lower()

        asyncio.run(_test())

    def test_confirmation_unauthorized_actor_binding(self):
        """Verify a confirmation code issued to pradip cannot be confirmed by another caller."""
        bot = MagicMock()
        agent = AgentService(bot)

        async def _test():
            res = await agent.execute_tool("restart_bot", {}, caller_name="pradip", caller_role="owner")
            m = re.search(r'Code:\s*([0-9A-F]{6})\b', res)
            assert m is not None
            token = m.group(1)

            # Alice tries to confirm pradip's challenge
            steal_res = await agent.confirm_pending_action("alice", "owner", token)
            assert "issued to @pradip, not @alice" in steal_res

        asyncio.run(_test())

    def test_confirmation_guessing_lockout(self):
        """Verify 5 failed confirmation attempts locks out the actor for 60 seconds."""
        bot = MagicMock()
        agent = AgentService(bot)

        async def _test():
            # Actor sends 5 invalid confirmation guesses
            for _ in range(5):
                await agent.confirm_pending_action("attacker", "owner", "WRONG1")

            lockout_res = await agent.confirm_pending_action("attacker", "owner", "WRONG2")
            assert "Too many failed confirmation attempts" in lockout_res

        asyncio.run(_test())
