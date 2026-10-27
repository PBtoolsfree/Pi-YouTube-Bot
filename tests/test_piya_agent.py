import pytest
import asyncio
import time
import json
import threading
from unittest.mock import MagicMock, AsyncMock, patch

import sys
import os
sys.path.insert(0, os.path.abspath("bot-cloud"))

from backend.services.agent_service import AgentService, DEFAULT_AGENT_CONFIG
from backend.services.viewer_service import ViewerService
from backend.config_manager import ConfigManager


# ── Mock Objects for Unit Testing ────────────────────────────────────────────

class MockAIEngine:
    def __init__(self, canned_response="Hello! I am Piya."):
        self.canned_response = canned_response
        self.last_messages = []

    async def chat(self, messages, system_prompt=None):
        self.last_messages = messages
        # If this is the follow-up tool synthesis call
        if len(messages) >= 3 and messages[-1].get("role") == "system" and "Tool Execution Results" in messages[-1].get("content", ""):
            return {"response": "Confirmed! Action has been executed successfully."}
        return {"response": self.canned_response}


class DummyBot:
    def __init__(self):
        self.viewers = ViewerService(viewers_path="test_viewers.json")
        # Ensure clean test in-memory viewers
        self.viewers.viewers = {
            "alice": {"count": 10, "points": 500, "rank": "Bronze", "watch_time": 10},
            "bob": {"count": 5, "points": 100, "rank": "Noob", "watch_time": 5},
            "pradip": {"count": 100, "points": 10000, "rank": "GOD", "watch_time": 100}
        }
        self.ai_engine = MockAIEngine()
        self.broadcast_func = AsyncMock()
        self.audio = MagicMock()
        self.audio.speak = AsyncMock()
        self.audio.skip_current = AsyncMock()
        self.moderation = MagicMock()
        self.moderation.ban = AsyncMock(return_value="Banned successfully")
        self.moderation.timeout = AsyncMock(return_value="Timed out successfully")
        self.pokemon = MagicMock()
        self.pokemon.get_user_inventory = MagicMock(return_value=[
            {"name": "Pikachu", "power": 10, "sprite": "url"},
            {"name": "Charizard", "power": 15, "sprite": "url"}
        ])
        self.pokemon.get_active_pokemon = MagicMock(return_value={"name": "Charizard", "power": 15})
        self.pokemon.handle_catch = AsyncMock(return_value="Caught a wild Snorlax!")
        self.pokemon.handle_summon = AsyncMock(return_value="Summoned Pikachu as your active buddy!")
        self.pokemon.handle_view_pokemon = AsyncMock(return_value="Viewing collection: Pikachu, Charizard")
        self.pokemon.handle_battle = AsyncMock(return_value="Battle initiated against @bob for 50 points!")

    def load_config(self):
        return ConfigManager.get_config()

    def get_status(self):
        return {"is_running": True, "uptime": 3600}

    async def check_integrations(self):
        return {"streamer_bot": "connected", "youtube": "connected"}


def get_test_config():
    return {
        "agent": {
            "name": "Piya",
            "personality": "helpful and witty",
            "operators": ["pradip", "owner", "admin", "ownertester"],
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
            "rate_limits": {
                "global_cooldown": 0,
                "user_cooldown": 0
            }
        }
    }


# ── Test Suite ───────────────────────────────────────────────────────────────

def test_piya_configurable_name_and_personality():
    """1. Verify Piya's configurable display name and personality."""
    cfg = get_test_config()
    bot = DummyBot()
    with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
        agent = AgentService(bot)
        assert agent.get_agent_name() == "Piya"

        # Update config to Aria
        cfg["agent"]["name"] = "Aria"
        assert agent.get_agent_name() == "Aria"
        schema = agent.get_tools_schema()
        assert "You are Aria" in schema


def test_cloud_agent_entry_point_reaches_tool_execution():
    """2. Verify central tool execution loop is entered and returns real result."""
    async def _test():
        cfg = get_test_config()
        bot = DummyBot()
        bot.ai_engine.canned_response = 'TOOL: get_my_points {}'
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)
            reply = await agent.process_request("alice", "user_123", "mere points kitne hain?", caller_role="viewer")
            assert "Confirmed!" in reply
            assert len(agent.audit_log) == 1
            assert agent.audit_log[0]["tool"] == "get_my_points"
            assert agent.audit_log[0]["status"] == "success"
            assert "500 pts" in agent.audit_log[0]["result"]

    asyncio.run(_test())


def test_local_bot_does_not_run_duplicate_agent():
    """3. Verify Local Bot code does not import or instantiate an AgentService brain loop."""
    local_bot_path = "bot-local/backend/bot_service.py"
    with open(local_bot_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "AgentService(" not in content
    assert "from backend.services.agent_service import AgentService" not in content


def test_trusted_identity_resolution():
    """4. Verify caller role is resolved from trusted metadata, not prompt claims."""
    cfg = get_test_config()
    bot = DummyBot()
    with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
        agent = AgentService(bot)
        assert agent.resolve_role("chatter", is_owner=False, is_mod=False) == "viewer"
        assert agent.resolve_role("i_am_the_admin", is_owner=False, is_mod=False) == "viewer"
        assert agent.resolve_role("pradip") == "owner"
        assert agent.resolve_role("moduser") == "moderator"
        assert agent.resolve_role("chatter", is_mod=True) == "moderator"


def test_own_points_and_pokemon_queries():
    """5. Verify own-data queries fetch real data from viewers and pokemon services."""
    async def _test():
        cfg = get_test_config()
        bot = DummyBot()
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)

            # Own points
            res_pts = await agent.execute_tool("get_my_points", {}, caller_name="alice", caller_role="viewer")
            data_pts = json.loads(res_pts)
            assert data_pts["points"] == 500
            assert data_pts["username"] == "alice"

            # Own Pokémon
            res_poke = await agent.execute_tool("get_my_pokemon", {}, caller_name="alice", caller_role="viewer")
            assert "Pikachu" in res_poke
            assert "Charizard" in res_poke

    asyncio.run(_test())


def test_point_transfers_validation_balance_self_transfer_and_concurrency():
    """6. Verify atomic point transfers enforce balance, non-self-transfer, positive integer, and concurrency safety."""
    bot = DummyBot()
    vs = bot.viewers

    # 1. Self transfer blocked
    res1 = vs.transfer_points_detailed("alice", "alice", 50)
    assert res1["success"] is False
    assert res1["error"] == "self_transfer"

    # 2. Non-existent receiver blocked
    res2 = vs.transfer_points_detailed("alice", "ghost_user", 50)
    assert res2["success"] is False
    assert res2["error"] == "receiver_not_found"

    # 3. Negative / Zero / Invalid amount blocked
    assert vs.transfer_points_detailed("alice", "bob", -10)["success"] is False
    assert vs.transfer_points_detailed("alice", "bob", 0)["success"] is False
    assert vs.transfer_points_detailed("alice", "bob", "not_a_number")["success"] is False

    # 4. Insufficient points blocked
    res4 = vs.transfer_points_detailed("alice", "bob", 99999)
    assert res4["success"] is False
    assert res4["error"] == "insufficient_points"
    assert vs.viewers["alice"]["points"] == 500

    # 5. Successful atomic transfer
    res5 = vs.transfer_points_detailed("alice", "@bob", 150)
    assert res5["success"] is True
    assert vs.viewers["alice"]["points"] == 350
    assert vs.viewers["bob"]["points"] == 250
    assert len(vs.transfer_history) == 1

    # 6. Concurrency race-condition test under multi-threading
    # Alice has 350. 10 threads each attempt to transfer 100 points to Bob.
    # Exactly 3 must succeed, 7 must fail, leaving Alice with 50 points.
    successful = []
    failed = []

    def run_transfer():
        r = vs.transfer_points_detailed("alice", "bob", 100)
        if r["success"]:
            successful.append(r)
        else:
            failed.append(r)

    threads = [threading.Thread(target=run_transfer) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(successful) == 3
    assert len(failed) == 7
    assert vs.viewers["alice"]["points"] == 50


def test_permission_boundaries():
    """7. Verify role boundaries (viewer vs moderator vs owner)."""
    async def _test():
        cfg = get_test_config()
        bot = DummyBot()
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)

            # Viewer tries to ban user -> Denied
            res_ban = await agent.execute_tool("ban_user", {"username": "spammer"}, caller_name="alice", caller_role="viewer")
            assert "Permission denied" in res_ban

            # Viewer tries to add points -> Denied
            res_add = await agent.execute_tool("add_loyalty", {"username": "bob", "amount": 100}, caller_name="alice", caller_role="viewer")
            assert "Permission denied" in res_add

            # Moderator bans user -> Allowed
            res_mod_ban = await agent.execute_tool("ban_user", {"username": "spammer"}, caller_name="moduser", caller_role="moderator")
            assert "🔨 spammer banned" in res_mod_ban

            # Moderator tries to restart bot -> Denied
            res_mod_restart = await agent.execute_tool("restart_bot", {}, caller_name="moduser", caller_role="moderator")
            assert "Permission denied" in res_mod_restart

            # Owner triggers admin tool -> Returns cryptographic confirmation challenge
            res_owner_challenge = await agent.execute_tool("add_loyalty", {"username": "bob", "amount": 50}, caller_name="pradip", caller_role="owner")
            assert "requires independent server-side confirmation" in res_owner_challenge
            # Extract code from challenge
            import re
            m = re.search(r"Code:\s*([A-Fa-f0-9]{6})", res_owner_challenge)
            assert m is not None
            code = m.group(1)
            # Confirming with valid code succeeds
            res_owner_add = await agent.confirm_pending_action("pradip", "owner", code)
            assert "✅ Added 50 points" in res_owner_add

    asyncio.run(_test())


def test_feature_switches_block_real_actions():
    """8. Verify disabled feature switches actively block tool execution on the backend."""
    async def _test():
        cfg = get_test_config()
        bot = DummyBot()
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)

            # Disable loyalty_actions
            cfg["agent"]["switches"]["loyalty_actions"] = False

            res = await agent.execute_tool("get_my_points", {}, caller_name="alice", caller_role="viewer")
            assert "Loyalty features are currently disabled" in res

            res_transfer = await agent.execute_tool("transfer_my_points", {"receiver": "bob", "amount": 10}, caller_name="alice", caller_role="viewer")
            assert "Point transfers are currently disabled" in res_transfer

            # Re-enable
            cfg["agent"]["switches"]["loyalty_actions"] = True
            res_ok = await agent.execute_tool("get_my_points", {}, caller_name="alice", caller_role="viewer")
            assert "points" in res_ok

    asyncio.run(_test())


def test_arbitrary_config_edits_rejected():
    """9. Verify arbitrary configuration edits and secret writes are rejected."""
    async def _test():
        cfg = get_test_config()
        bot = DummyBot()
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)

            # Attempt to write an unwhitelisted key
            res = await agent.execute_tool("update_agent_config", {"key": "shell_exec", "value": "rm -rf"}, caller_name="pradip", caller_role="owner")
            assert "Disallowed config key" in res

            # Approved key triggers confirmation challenge
            res_chal = await agent.execute_tool("update_agent_config", {"key": "language", "value": "Hindi"}, caller_name="pradip", caller_role="owner")
            assert "requires independent server-side confirmation" in res_chal
            import re
            m = re.search(r"Code:\s*([A-Fa-f0-9]{6})", res_chal)
            assert m is not None
            with patch.object(ConfigManager, "save_config", return_value=True):
                res_ok = await agent.confirm_pending_action("pradip", "owner", m.group(1))
                assert "✅ Updated Agent config" in res_ok

    asyncio.run(_test())


def test_high_impact_actions_require_confirmation():
    """10. Verify high-impact actions require server-side cryptographic confirmation."""
    async def _test():
        cfg = get_test_config()
        bot = DummyBot()
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)

            # 1. Calling high-impact tool add_loyalty_all returns confirmation challenge
            res1 = await agent.execute_tool("add_loyalty_all", {"amount": 500}, caller_name="pradip", caller_role="owner")
            assert "requires independent server-side confirmation" in res1
            import re
            code_match = re.search(r"Code:\s*([A-Fa-f0-9]{6})", res1)
            assert code_match is not None
            token = code_match.group(1)

            # 2. A model-generated 'confirm: true' alone is strictly insufficient!
            res_model_hack = await agent.execute_tool("add_loyalty_all", {"amount": 500, "confirm": True}, caller_name="pradip", caller_role="owner")
            assert "requires independent server-side confirmation" in res_model_hack
            assert "model-generated 'confirm: true' is not accepted" in res_model_hack

            # 3. Unauthorized actor cannot confirm a token issued to owner
            res_bad_actor = await agent.confirm_pending_action("alice", "viewer", token)
            assert "was issued to @pradip, not @alice" in res_bad_actor

            # 4. Tampered arguments fail confirmation
            res_tampered = await agent.execute_tool(
                "add_loyalty_all",
                {"amount": 9999, "confirmation_code": token},
                caller_name="pradip",
                caller_role="owner"
            )
            assert "requires independent server-side confirmation" in res_tampered

            # 5. Correct confirmation with token succeeds and consumes token
            res_ok = await agent.confirm_pending_action("pradip", "owner", token)
            assert "✅ Added 500 points to all" in res_ok

            # 6. Replaying the consumed token fails
            res_replay = await agent.confirm_pending_action("pradip", "owner", token)
            assert "invalid, already used, or expired" in res_replay

            # 7. Restart bot also enforces server-side confirmation
            res_restart = await agent.execute_tool("restart_bot", {}, caller_name="pradip", caller_role="owner")
            assert "requires independent server-side confirmation" in res_restart

            # 8. Direct chat command "confirm <CODE>" in process_request intercepts and confirms
            res_chal2 = await agent.execute_tool("add_loyalty", {"username": "alice", "amount": 100}, caller_name="pradip", caller_role="owner")
            code2 = re.search(r"Code:\s*([A-Fa-f0-9]{6})", res_chal2).group(1)
            chat_confirm_resp = await agent.process_request("pradip", "user_owner", f"confirm {code2}", caller_role="owner")
            assert "✅ Confirmed and executed 'add_loyalty'" in chat_confirm_resp

    asyncio.run(_test())


def test_random_chat_cannot_execute_modifying_tools():
    """11. Verify automatic/random chat cannot execute tools (allow_tools=False boundary)."""
    async def _test():
        cfg = get_test_config()
        bot = DummyBot()
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)

            # Attempting to call tools while allow_tools is False
            res = await agent.execute_tool("add_loyalty", {"username": "bob", "amount": 100}, caller_name="bob", caller_role="viewer", allow_tools=False)
            assert "Tool execution is disabled in this mode" in res

    asyncio.run(_test())


def test_telegram_and_sheets_completely_removed():
    """12. Verify Google Sheets and Telegram references are removed without breaking YouTube."""
    # sheets_service.py must not exist
    assert not os.path.exists("bot-cloud/backend/services/sheets_service.py")
    assert not os.path.exists("bot-local/backend/services/sheets_service.py")

    # Config migration cleans legacy keys
    test_cfg = {
        "telegram": {"enabled": True, "token": "secret"},
        "google_sheets": {"enabled": True},
        "youtube": {"enabled": True, "channel_id": "UC123"}
    }
    migrated = ConfigManager._migrate_legacy_integrations(test_cfg, "test_config.json")
    assert migrated is True
    assert "telegram" not in test_cfg
    assert "google_sheets" not in test_cfg
    assert test_cfg["youtube"]["enabled"] is True

    # Cleanup temp test files
    for p in ["test_config.json", "test_config.json.bak_legacy_integrations", "test_config.json.tmp"]:
        if os.path.exists(p):
            os.remove(p)


def test_safe_default_feature_states():
    """13. Verify safe default states: auto_chat disabled by default, agent independently enabled."""
    bot = DummyBot()
    # Unconfigured bot defaults
    with patch.object(ConfigManager, "get_config", return_value={}):
        agent = AgentService(bot)
        # Piya agent is enabled independently
        assert agent.is_feature_enabled("agent_enabled") is True
        # Random automatic chat is DISABLED by default
        assert agent.is_feature_enabled("auto_chat") is False
        assert DEFAULT_AGENT_CONFIG["switches"]["auto_chat"] is False
        assert DEFAULT_AGENT_CONFIG["auto_chat"]["enabled"] is False


def test_resolve_role_signature_with_user_id_regression():
    """14. Regression: resolve_role must accept user_id without TypeError and resolve correctly."""
    cfg = get_test_config()
    cfg["agent"]["operators"].append("UC_OPERATOR_CHANNEL_ID")
    cfg["agent"]["moderators"].append("UC_MOD_CHANNEL_ID")
    bot = DummyBot()

    with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
        agent = AgentService(bot)

        # Exact production call site pattern that previously raised TypeError:
        # caller_role = self.agent.resolve_role(author, user_id=channel_id, is_mod=is_mod, is_owner=is_owner)
        role_viewer = agent.resolve_role(
            "pradipbag6209",
            user_id="UCGSYPK8jBHSD6SMNIhfGIMQ",
            is_mod=False,
            is_owner=False
        )
        assert role_viewer == "viewer"

        # Explicit owner flag from Streamer.bot metadata
        role_owner_flag = agent.resolve_role(
            "any_chatter",
            user_id="UC_ANY",
            is_owner=True
        )
        assert role_owner_flag == "owner"

        # Explicit moderator flag from Streamer.bot metadata
        role_mod_flag = agent.resolve_role(
            "regular_user",
            user_id="UC_REGULAR",
            is_mod=True
        )
        assert role_mod_flag == "moderator"

        # Operator resolved by verified channel ID
        role_op_id = agent.resolve_role(
            "stream_helper",
            user_id="UC_OPERATOR_CHANNEL_ID"
        )
        assert role_op_id == "owner"

        # Moderator resolved by verified channel ID
        role_mod_id = agent.resolve_role(
            "stream_police",
            user_id="UC_MOD_CHANNEL_ID"
        )
        assert role_mod_id == "moderator"


def test_agent_get_status_overview_safe_fields():
    """15. Verify get_status_overview returns safe operational fields and zero sensitive secrets."""
    bot = DummyBot()
    cfg = get_test_config()
    with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
        agent = AgentService(bot)
        overview = agent.get_status_overview()

        assert overview["enabled"] is True
        assert overview["name"] == "Piya"
        assert "switches" in overview
        assert "metrics" in overview
        assert "recent_actions" in overview
        assert "enabled" in overview["auto_chat"]

        # Confirm non-leakage
        overview_str = json.dumps(overview).lower()
        assert "api_key" not in overview_str
        assert "password" not in overview_str
        assert "secret" not in overview_str
        assert "confirmation_token" not in overview_str

    # Verify unconfigured bot has auto_chat disabled by default
    with patch.object(ConfigManager, "get_config", return_value={}):
        default_agent = AgentService(bot)
        default_overview = default_agent.get_status_overview()
        assert default_overview["auto_chat"]["enabled"] is False


def test_conversational_model_filtering():
    """16. Verify is_conversational_model correctly rejects classifiers and embedding models."""
    from backend.ai_service import is_conversational_model

    # Valid conversational chat models
    assert is_conversational_model("gemini-3-flash-preview") is True
    assert is_conversational_model("gpt-4o") is True
    assert is_conversational_model("llama-3.3-70b-versatile") is True
    assert is_conversational_model("recursive/flint-v1.0:free") is True

    # Incompatible non-conversational models
    assert is_conversational_model("meta-llama/llama-prompt-guard-2-22m") is False
    assert is_conversational_model("nvidia/nemotron-3.5-embed-1b:free") is False
    assert is_conversational_model("text-embedding-3-small") is False
    assert is_conversational_model("cohere-rerank-v3") is False
    assert is_conversational_model("whisper-large-v3") is False


def test_ai_engine_plan_skips_non_conversational_models():
    """17. Verify AIEngine.chat plan skips non-conversational models."""
    from backend.ai_service import AIEngine

    mixed_topology = {
        "ai_topology": {
            "providers": [
                {
                    "id": "groq",
                    "name": "groq",
                    "type": "openai",
                    "enabled": True,
                    "models": [
                        {"id": "meta-llama/llama-prompt-guard-2-22m", "enabled": True, "priority": 1}
                    ]
                },
                {
                    "id": "openrouter_embed",
                    "name": "openrouter",
                    "type": "openai",
                    "enabled": True,
                    "models": [
                        {"id": "nvidia/nemotron-3.5-embed-1b:free", "enabled": True, "priority": 1}
                    ]
                }
            ]
        }
    }

    async def _test():
        with patch.object(ConfigManager, "get_config", return_value=mixed_topology):
            engine = AIEngine()
            res = await engine.chat("Hello!")
            # Plan has 0 conversational models -> returns error dict gracefully without calling HTTP
            assert res["response"] is None
            assert "No enabled conversational providers available" in res["error"]

    asyncio.run(_test())


def test_trigger_pipeline_and_safe_fallback():
    """18. Verify trigger messages pipeline and safe fallback when LLM is unavailable."""
    bot = DummyBot()
    cfg = get_test_config()

    async def _test():
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)

            # A: Normal chat query through agent
            bot.ai_engine = MockAIEngine(canned_response="Haan ji, main online hoon! Kaise madad kar sakti hoon?")
            res_hello = await agent.process_request("pradipbag6209", "UC123", "Piya hello, kya tum online ho?")
            assert "online hoon" in res_hello

            # B: Tool-driven points query
            bot.ai_engine = MockAIEngine(canned_response="TOOL: get_my_points {}\nMain check karti hoon!")
            res_points = await agent.process_request("alice", "UC_ALICE", "@Piya mere points aur rank batao")
            assert "Action has been executed successfully" in res_points or "500" in res_points

            # C: Fallback when all providers fail (returns None response)
            failing_engine = MagicMock()
            failing_engine.chat = AsyncMock(return_value={"response": None, "error": "All providers failed."})
            res_fail = await agent.process_request("pradipbag6209", "UC123", "Piya hello", ai_engine=failing_engine)
            assert "temporarily unavailable" in res_fail

    asyncio.run(_test())


def test_expanded_agent_tools_execution():
    """19. Verify newly added tools (redeem_reward, get_tip_page_url, explain_points_transfer, get_system_status)."""
    bot = DummyBot()
    cfg = get_test_config()
    cfg["tip_page"] = {"upi_vpa": "paytmqr281005@paytm", "url": "https://stream.tip.me"}
    bot.load_config = MagicMock(return_value=cfg)
    bot.is_sb_connected = True
    bot.live_chat_id = "test_live_chat"

    # Setup mock redeem service
    bot.redeem_svc = MagicMock()
    bot.redeem_svc.find_by_name = MagicMock(return_value={"id": "dance_filter", "name": "Dance Filter", "cost": 50})
    bot.redeem_svc.trigger_redeem = AsyncMock(return_value={"ok": True})

    async def _test():
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: cfg):
            agent = AgentService(bot)

            # Tip page
            tip_res = await agent.execute_tool("get_tip_page_url", {}, caller_name="alice", caller_role="viewer")
            assert "https://stream.tip.me" in tip_res
            assert "/tip" not in tip_res
            assert "paytmqr281005@paytm" in tip_res

            # Points transfer explanation
            exp_res = await agent.execute_tool("explain_points_transfer", {}, caller_name="alice", caller_role="viewer")
            assert "!give @username" in exp_res

            # System status
            status_res = await agent.execute_tool("get_system_status", {}, caller_name="alice", caller_role="viewer")
            status_data = json.loads(status_res)
            assert status_data["streamer_bot_connected"] is True
            assert status_data["live_chat_active"] is True

            # Redeem reward
            redeem_res = await agent.execute_tool("redeem_reward", {"reward_name": "Dance Filter"}, caller_name="alice", caller_role="viewer")
            assert "successfully redeemed" in redeem_res
            assert "Dance Filter" in redeem_res

    asyncio.run(_test())
