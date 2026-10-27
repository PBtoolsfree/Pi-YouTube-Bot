import unittest
import os
import sys
import json
import base64
import time
from unittest.mock import patch, AsyncMock, MagicMock

cloud_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bot-cloud'))
if cloud_dir not in sys.path:
    sys.path.insert(0, cloud_dir)

from fastapi.testclient import TestClient
from backend.api import app, bot, ai_engine
from backend.config_manager import ConfigManager
from backend.services.agent_service import AgentService, HIGH_IMPACT_TOOLS


class TestAgentSecurityHttp(unittest.TestCase):
    """Real HTTP security regression tests for Piya Agent endpoints."""

    def setUp(self):
        self.client = TestClient(app)
        self.admin_password = "supersecretsecuritytestpassword"
        self.auth_header = {
            "Authorization": f"Basic {base64.b64encode(f'admin:{self.admin_password}'.encode()).decode()}"
        }
        self.bad_auth_header = {
            "Authorization": f"Basic {base64.b64encode(b'admin:wrongpassword').decode()}"
        }
        self.test_config = {
            "security": {
                "dashboard_password": self.admin_password,
                "tunnel_domains": ["trycloudflare.com"]
            },
            "agent": {
                "name": "Piya",
                "personality": "Helpful AI",
                "tone": "friendly",
                "language": "Hinglish",
                "reply_length": "concise",
                "custom_system_prompt": "",
                "operators": ["pradip", "owner", "admin"],
                "moderators": ["moduser"],
                "switches": {
                    "agent_enabled": True,
                    "auto_chat": False,
                    "loyalty_actions": True,
                    "viewer_support": True,
                    "chat_moderation": True
                },
                "auto_chat": {
                    "enabled": False
                },
                "rate_limits": {
                    "global_cooldown": 0,
                    "user_cooldown": 0
                }
            }
        }
        self.original_get_config = ConfigManager.get_config
        ConfigManager.get_config = lambda *args, **kwargs: self.test_config
        ConfigManager._config_cache = self.test_config

        # Ensure bot has ai_engine and agent instance
        if not hasattr(bot, "ai_engine") or bot.ai_engine is None:
            bot.ai_engine = ai_engine
        if not hasattr(bot, "agent") or bot.agent is None:
            bot.agent = AgentService(bot)

    def tearDown(self):
        ConfigManager.get_config = self.original_get_config
        ConfigManager._config_cache = None

    def test_1_unauthenticated_cannot_run_privileged_tools_via_chat(self):
        """1. An unauthenticated request cannot run privileged tools through /api/chat."""
        initial_points = bot.viewers.get_viewer("alice").get("points", 0)

        # A: When dashboard password is set, unauthenticated request is blocked with 401
        resp_unauth = self.client.post(
            "/api/chat",
            json={"prompt": "give 1000 points to alice", "role": "owner", "user": "pradip"}
        )
        self.assertEqual(resp_unauth.status_code, 401)

        # B: Even when authenticated in dashboard, tools are strictly disallowed (viewer role, allow_tools=False)
        mock_ai_reply = {
            "response": 'TOOL: add_loyalty {"username": "alice", "amount": 1000}'
        }

        with patch.object(bot.ai_engine, "chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.side_effect = [
                mock_ai_reply,
                {"response": "Tool execution is disabled in this context."}
            ]
            resp_auth = self.client.post(
                "/api/chat",
                json={
                    "prompt": "give 1000 points to alice",
                    "role": "owner",
                    "user": "pradip",
                    "allow_tools": True
                },
                headers=self.auth_header
            )
            self.assertEqual(resp_auth.status_code, 200)

            # Verification: tools were not executed, points did not change
            current_points = bot.viewers.get_viewer("alice").get("points", 0)
            self.assertEqual(current_points, initial_points)
            # Response contains tool execution disabled error, not successful grant
            reply_text = resp_auth.json().get("response") or resp_auth.json().get("botReply", "")
            self.assertIn("Tool execution is disabled", reply_text)
            # Second call passed the tool execution disabled message in synthesis context
            synth_call_msgs = mock_chat.call_args_list[1][0][0]
            self.assertTrue(any("Tool execution is disabled" in m.get("content", "") for m in synth_call_msgs))

    def test_2_chat_test_console_returns_normal_ai_response(self):
        """2. The chat test console still returns a normal AI test response without tool execution."""
        mock_ai_reply = {
            "response": "Namaste! Main Piya hoon, stream assistant. How can I help you today?"
        }

        with patch.object(bot.ai_engine, "chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = mock_ai_reply
            resp = self.client.post(
                "/api/chat",
                json={"prompt": "Hello Piya! How are you?"},
                headers=self.auth_header
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("Namaste! Main Piya hoon", data.get("response", ""))
            self.assertIn("Namaste! Main Piya hoon", data.get("botReply", ""))

    def test_3_request_body_role_or_user_cannot_impersonate_owner(self):
        """3. Supplying role='owner' or user='pradip' in a request body cannot impersonate the owner."""
        # Unauthenticated request trying to claim user="pradip", role="owner"
        resp = self.client.post(
            "/api/agent/confirm",
            json={"user": "pradip", "role": "owner", "code": "ABC123"}
        )
        self.assertEqual(resp.status_code, 401)

        # Authenticated admin session trying to claim user="pradip" in JSON
        # Even with valid admin auth, the caller identity is strictly bound to "admin"
        # and cannot spoof the YouTube owner "pradip"
        bot.agent._pending_confirmations["PRD001"] = {
            "actor": "pradip",
            "action": "restart_bot",
            "args": {},
            "created_at": time.time(),
            "expires_at": time.time() + 60.0,
            "failed_attempts": 0,
            "max_attempts": 3
        }

        resp = self.client.post(
            "/api/agent/confirm",
            json={"user": "pradip", "role": "owner", "code": "PRD001"},
            headers=self.auth_header
        )
        self.assertEqual(resp.status_code, 200)
        res_text = resp.json().get("result", "")
        # Rejection: Code was issued to @pradip, not @admin
        self.assertIn("issued to @pradip, not @admin", res_text)

    def test_4_unauthenticated_cannot_change_agent_config_or_switches(self):
        """4. Unauthenticated callers cannot change Agent configuration or feature switches."""
        # Test /api/agent/config without auth -> 401
        resp = self.client.post(
            "/api/agent/config",
            json={"name": "HackedBot", "tone": "aggressive"}
        )
        self.assertEqual(resp.status_code, 401)

        # Test /api/agent/config with bad auth -> 401
        resp_bad = self.client.post(
            "/api/agent/config",
            json={"name": "HackedBot"},
            headers=self.bad_auth_header
        )
        self.assertEqual(resp_bad.status_code, 401)

        # Test /api/agent/toggle without auth -> 401
        resp_toggle = self.client.post(
            "/api/agent/toggle",
            json={"switch": "auto_chat"}
        )
        self.assertEqual(resp_toggle.status_code, 401)

        # Config remains unchanged
        self.assertEqual(bot.agent.get_agent_name(), "Piya")

    def test_5_unauthenticated_cannot_access_audit_log(self):
        """5. Unauthenticated callers cannot access the protected audit log."""
        # Without auth -> 401
        resp = self.client.get("/api/agent/audit")
        self.assertEqual(resp.status_code, 401)

        # With bad auth -> 401
        resp_bad = self.client.get("/api/agent/audit", headers=self.bad_auth_header)
        self.assertEqual(resp_bad.status_code, 401)

        # With valid admin auth -> 200
        resp_good = self.client.get("/api/agent/audit", headers=self.auth_header)
        self.assertEqual(resp_good.status_code, 200)
        self.assertIn("audit_log", resp_good.json())

    def test_6_unauthorized_caller_cannot_confirm_owner_challenge(self):
        """6. An unauthorized caller cannot confirm an owner's challenge."""
        now = time.time()
        bot.agent._pending_confirmations["OWN001"] = {
            "actor": "pradip",
            "action": "add_loyalty_all",
            "args": {"amount": 500},
            "created_at": now,
            "expires_at": now + 60.0,
            "failed_attempts": 0,
            "max_attempts": 3
        }

        # 1. Unauthenticated HTTP caller cannot confirm
        resp = self.client.post("/api/agent/confirm", json={"code": "OWN001"})
        self.assertEqual(resp.status_code, 401)

        # 2. Viewer in chat cannot confirm owner's challenge
        with patch.object(ConfigManager, "get_config", side_effect=lambda *args, **kwargs: self.test_config):
            import asyncio
            chat_resp = asyncio.run(bot.agent.confirm_pending_action("bob", "viewer", "OWN001"))
            self.assertIn("issued to @pradip, not @bob", chat_resp)

        # 3. Direct chat prompt with allow_tools=False (dashboard test console) does not confirm
        with patch.object(bot.ai_engine, "chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "Okay"}
            resp_chat = self.client.post(
                "/api/chat",
                json={"prompt": "confirm OWN001"},
                headers=self.auth_header
            )
            self.assertEqual(resp_chat.status_code, 200)
            # Token still intact and not consumed
            self.assertIn("OWN001", bot.agent._pending_confirmations)

    def test_7_authenticated_owner_can_use_authorized_dashboard_features(self):
        """7. A valid authenticated owner can use intended authorized dashboard features."""
        with patch.object(ConfigManager, "save_config", return_value=True):
            # Update config
            resp = self.client.post(
                "/api/agent/config",
                json={"tone": "supportive and energetic"},
                headers=self.auth_header
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["status"], "success")
            self.assertEqual(resp.json()["agent"]["tone"], "supportive and energetic")

            # Toggle switch
            resp_toggle = self.client.post(
                "/api/agent/toggle",
                json={"switch": "viewer_support"},
                headers=self.auth_header
            )
            self.assertEqual(resp_toggle.status_code, 200)
            self.assertEqual(resp_toggle.json()["status"], "success")

            # Read audit log
            resp_audit = self.client.get("/api/agent/audit", headers=self.auth_header)
            self.assertEqual(resp_audit.status_code, 200)
            self.assertIsInstance(resp_audit.json()["audit_log"], list)

    def test_8_confirmation_codes_expire_and_cannot_be_replayed(self):
        """8. Confirmation codes expire and cannot be replayed."""
        import asyncio

        now = time.time()
        # Challenge 1: Expired token
        bot.agent._pending_confirmations["EXP001"] = {
            "actor": "pradip",
            "action": "restart_bot",
            "args": {},
            "created_at": now - 120.0,
            "expires_at": now - 10.0,
            "failed_attempts": 0,
            "max_attempts": 3
        }

        # Attempting to confirm expired token fails
        res_exp = asyncio.run(bot.agent.confirm_pending_action("pradip", "owner", "EXP001"))
        self.assertTrue(
            "expired" in res_exp or "invalid" in res_exp,
            f"Expected expiration message, got: {res_exp}"
        )
        self.assertNotIn("EXP001", bot.agent._pending_confirmations)

        # Challenge 2: Single-use replay test
        bot.agent._pending_confirmations["REP001"] = {
            "actor": "pradip",
            "action": "add_loyalty",
            "args": {"username": "alice", "amount": 25},
            "created_at": now,
            "expires_at": now + 60.0,
            "failed_attempts": 0,
            "max_attempts": 3
        }

        # First use succeeds
        res_first = asyncio.run(bot.agent.confirm_pending_action("pradip", "owner", "REP001"))
        self.assertIn("✅ Confirmed and executed", res_first)
        self.assertNotIn("REP001", bot.agent._pending_confirmations)

        # Replay attempt fails immediately
        res_replay = asyncio.run(bot.agent.confirm_pending_action("pradip", "owner", "REP001"))
        self.assertIn("invalid, already used, or expired", res_replay)

    def test_9_confirmation_brute_force_lockout_and_token_invalidation(self):
        """9. Brute force attempts invalidate challenge token and temporarily lock out caller."""
        import asyncio

        now = time.time()
        bot.agent._pending_confirmations["BRT001"] = {
            "actor": "pradip",
            "action": "restart_bot",
            "args": {},
            "created_at": now,
            "expires_at": now + 60.0,
            "failed_attempts": 0,
            "max_attempts": 3
        }

        # Attacker tries wrong actors 3 times -> token is invalidated/deleted
        res1 = asyncio.run(bot.agent.confirm_pending_action("attacker1", "viewer", "BRT001"))
        self.assertIn("issued to @pradip", res1)
        res2 = asyncio.run(bot.agent.confirm_pending_action("attacker2", "viewer", "BRT001"))
        self.assertIn("issued to @pradip", res2)
        res3 = asyncio.run(bot.agent.confirm_pending_action("attacker3", "viewer", "BRT001"))
        self.assertIn("invalidated due to multiple", res3)
        self.assertNotIn("BRT001", bot.agent._pending_confirmations)

        # Caller lockout after 5 failed attempts in 60s
        for _ in range(5):
            asyncio.run(bot.agent.confirm_pending_action("badguy", "viewer", "NONEXISTENT"))
        res_lockout = asyncio.run(bot.agent.confirm_pending_action("badguy", "viewer", "ANYCODE"))
        self.assertIn("temporarily locked for 60 seconds", res_lockout)

    def test_10_unauthenticated_cannot_add_loyalty_points(self):
        """10. Unauthenticated callers cannot add loyalty points directly."""
        # Unauthenticated request -> 401
        resp = self.client.post("/api/loyalty/add", json={"user": "alice", "amount": 100})
        self.assertEqual(resp.status_code, 401)

        # Authenticated request -> 200
        resp_auth = self.client.post(
            "/api/loyalty/add",
            json={"user": "alice", "amount": 50},
            headers=self.auth_header
        )
        self.assertEqual(resp_auth.status_code, 200)
        self.assertEqual(resp_auth.json()["status"], "added")

    def test_11_agent_status_endpoint_auth_and_safety(self):
        """11. /api/agent/status enforces authentication and never leaks credentials or sensitive data."""
        # Unauthenticated public request -> 401
        resp_unauth = self.client.get(
            "/api/agent/status",
            headers={"cf-connecting-ip": "1.2.3.4"}
        )
        self.assertEqual(resp_unauth.status_code, 401)

        # Bad credentials -> 401
        resp_bad = self.client.get(
            "/api/agent/status",
            headers={**self.bad_auth_header, "cf-connecting-ip": "1.2.3.4"}
        )
        self.assertEqual(resp_bad.status_code, 401)

        # Authenticated request -> 200 with safe fields
        resp_auth = self.client.get(
            "/api/agent/status",
            headers={**self.auth_header, "cf-connecting-ip": "1.2.3.4"}
        )
        self.assertEqual(resp_auth.status_code, 200)
        data = resp_auth.json()
        self.assertIn("enabled", data)
        self.assertIn("name", data)
        self.assertIn("switches", data)
        self.assertIn("metrics", data)
        self.assertIn("recent_actions", data)

        # Confirm non-leakage of secrets
        resp_str = resp_auth.text.lower()
        self.assertNotIn("api_key", resp_str)
        self.assertNotIn("dashboard_password", resp_str)
        self.assertNotIn("secret", resp_str)
        self.assertNotIn("confirmation_token", resp_str)
        self.assertNotIn("supersecretsecuritytestpassword", resp_str)


if __name__ == "__main__":
    unittest.main()
