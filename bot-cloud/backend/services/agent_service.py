import asyncio
import json
import logging
import re
import secrets
import time
from collections import deque, defaultdict
from typing import Dict, Any, Optional, List

logger = logging.getLogger("AgentService")

# High-impact operations requiring explicit, cryptographic server-side confirmation
HIGH_IMPACT_TOOLS = {
    "add_loyalty",
    "add_loyalty_all",
    "restart_bot",
    "update_agent_config",
    "toggle_feature_switch",
}

# Safe default agent configuration
DEFAULT_AGENT_CONFIG = {
    "name": "Piya",
    "personality": "Friendly, witty, helpful YouTube stream assistant with a cute and energetic vibe",
    "language": "Hinglish",
    "reply_length": "concise",
    "tone": "supportive and playful",
    "custom_system_prompt": "",
    "operators": ["pradip", "owner", "admin"],
    "moderators": ["moduser"],
    "switches": {
        "agent_enabled": True,
        "normal_llm": True,
        "auto_chat": False,
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
        "enabled": False,
        "probability": 0.05,
        "global_cooldown": 45,
        "user_cooldown": 120,
        "max_session_replies": 30,
        "max_length": 150,
        "stream_live_only": True,
    },
    "rate_limits": {
        "global_cooldown": 3,
        "user_cooldown": 10
    }
}

ROLE_LEVELS = {
    "viewer": 1,
    "moderator": 2,
    "owner": 3,
    "internal": 4
}

ALLOWED_CONFIG_KEYS = {
    "name",
    "personality",
    "language",
    "reply_length",
    "tone",
    "custom_system_prompt"
}


class AgentService:
    """Piya: Central AI Agent Brain for PB HERO PiBot on Cloud.

    Manages LLM reasoning, real bot data retrieval, atomic loyalty transfers,
    Pokémon actions, chat moderation, role-based authorization, feature switches,
    cryptographic server-side action confirmations, and audit trail.
    """

    def __init__(self, bot):
        self.bot = bot
        self.audit_log: deque = deque(maxlen=200)
        self.metrics = {
            "requests_total": 0,
            "tool_executions": 0,
            "denied_total": 0,
            "errors_total": 0,
            "avg_latency_ms": 0.0,
            "_total_latency": 0.0
        }
        self.last_user_request: Dict[str, float] = {}
        self.last_global_request: float = 0.0
        self._pending_confirmations: Dict[str, Dict[str, Any]] = {}
        self._confirmation_lock = asyncio.Lock()
        self._failed_confirmation_attempts: Dict[str, List[float]] = defaultdict(list)

    def _cleanup_expired_confirmations(self):
        """Purge expired confirmation challenges."""
        now = time.time()
        expired = [k for k, v in self._pending_confirmations.items() if v.get("expires_at", 0) <= now]
        for k in expired:
            del self._pending_confirmations[k]

    def _verify_or_challenge_confirmation(
        self,
        tool_name: str,
        args: Dict[str, Any],
        caller_name: str,
        caller_role: str,
        confirmation_verified: bool = False
    ) -> Optional[str]:
        """Verify server-side confirmation token or generate a bound challenge.

        Returns None if confirmation is satisfied.
        Returns a challenge/rejection string if confirmation is required.
        A model-generated 'confirm: true' alone is strictly insufficient.
        """
        if confirmation_verified:
            return None

        self._cleanup_expired_confirmations()
        actor_key = caller_name.lower().strip().lstrip("@")
        bound_args = {k: v for k, v in args.items() if k not in ("confirm", "confirmation_code", "confirmation_token")}
        provided_code = str(args.get("confirmation_code") or args.get("confirmation_token") or "").strip().upper()

        if provided_code and provided_code in self._pending_confirmations:
            rec = self._pending_confirmations[provided_code]
            if (
                rec["actor"] == actor_key
                and rec["action"] == tool_name
                and rec["args"] == bound_args
                and rec["expires_at"] > time.time()
            ):
                del self._pending_confirmations[provided_code]  # One-time use: consume token
                return None
            else:
                rec["failed_attempts"] = rec.get("failed_attempts", 0) + 1
                if rec["failed_attempts"] >= rec.get("max_attempts", 3):
                    del self._pending_confirmations[provided_code]

        # Generate single-use cryptographic token bound to actor, action, args, and expiry
        token = secrets.token_hex(3).upper()
        now = time.time()
        self._pending_confirmations[token] = {
            "actor": actor_key,
            "action": tool_name,
            "args": bound_args,
            "created_at": now,
            "expires_at": now + 60.0,  # 60 second TTL
            "failed_attempts": 0,
            "max_attempts": 3,
        }
        self._record_audit(caller_name, caller_role, tool_name, bound_args, "confirmation_challenge", "Challenge issued (token redacted)")
        return (
            f"⚠️ High-impact action '{tool_name}' requires independent server-side confirmation. "
            f"A model-generated 'confirm: true' is not accepted. "
            f"Owner @{caller_name}, to confirm {tool_name} with {bound_args}, reply within 60s with: "
            f"'confirm {token}' (Code: {token})"
        )

    async def confirm_pending_action(self, caller_name: str, caller_role: str, code: str) -> str:
        """Confirm and execute a pending high-impact action by its cryptographic code."""
        code = str(code).strip().upper()
        actor_key = caller_name.lower().strip().lstrip("@")
        now = time.time()

        # Check rate-limiting / lockout on failed confirmation attempts by this caller
        caller_attempts = self._failed_confirmation_attempts[actor_key]
        self._failed_confirmation_attempts[actor_key] = [t for t in caller_attempts if now - t < 60.0]
        if len(self._failed_confirmation_attempts[actor_key]) >= 5:
            return "❌ Too many failed confirmation attempts. Confirmation is temporarily locked for 60 seconds."

        async with self._confirmation_lock:
            self._cleanup_expired_confirmations()
            rec = self._pending_confirmations.get(code)
            if not rec:
                self._failed_confirmation_attempts[actor_key].append(now)
                return f"❌ Confirmation code '{code}' is invalid, already used, or expired."

            # Check expiration
            if rec.get("expires_at", 0) <= now:
                del self._pending_confirmations[code]
                self._failed_confirmation_attempts[actor_key].append(now)
                return f"❌ Confirmation code '{code}' has expired."

            # Check actor binding
            if rec["actor"] != actor_key:
                rec["failed_attempts"] = rec.get("failed_attempts", 0) + 1
                self._failed_confirmation_attempts[actor_key].append(now)
                if rec["failed_attempts"] >= rec.get("max_attempts", 3):
                    del self._pending_confirmations[code]
                    return f"❌ Confirmation code '{code}' was invalidated due to multiple unauthorized attempts."
                return f"❌ Confirmation code '{code}' was issued to @{rec['actor']}, not @{caller_name}."

            # Check role permission
            tool_name = rec["action"]
            if tool_name in HIGH_IMPACT_TOOLS and not self.has_permission(caller_role, "owner"):
                self.metrics["denied_total"] += 1
                self._record_audit(caller_name, caller_role, "confirm_action", {"code": code, "action": tool_name}, "denied", "Requires owner role")
                return f"❌ Permission denied: Owner role required to confirm high-impact action '{tool_name}'."

            # Valid: consume token atomically under lock before executing
            args = rec["args"]
            del self._pending_confirmations[code]

            tool_res = await self.execute_tool(
                tool_name=tool_name,
                args=args,
                caller_name=caller_name,
                caller_role=caller_role,
                allow_tools=True,
                confirmation_verified=True
            )
            return f"✅ Confirmed and executed '{tool_name}': {tool_res}"

    def _get_agent_cfg(self) -> Dict[str, Any]:
        """Fetch current agent configuration merged with defaults."""
        try:
            cfg = self.bot.load_config()
            agent_cfg = cfg.get("agent", {})
            # Shallow merge switches and auto_chat if missing
            res = {**DEFAULT_AGENT_CONFIG, **agent_cfg}
            if "switches" in agent_cfg:
                res["switches"] = {**DEFAULT_AGENT_CONFIG["switches"], **agent_cfg["switches"]}
            if "auto_chat" in agent_cfg:
                res["auto_chat"] = {**DEFAULT_AGENT_CONFIG["auto_chat"], **agent_cfg["auto_chat"]}
            if "rate_limits" in agent_cfg:
                res["rate_limits"] = {**DEFAULT_AGENT_CONFIG["rate_limits"], **agent_cfg["rate_limits"]}
            return res
        except Exception as e:
            logger.warning(f"Failed to load agent config from bot: {e}")
            return DEFAULT_AGENT_CONFIG

    def get_agent_name(self) -> str:
        """Return the configurable display name of the Agent (default: Piya)."""
        cfg = self._get_agent_cfg()
        return cfg.get("name", "Piya").strip() or "Piya"

    def is_feature_enabled(self, switch_name: str) -> bool:
        """Check if a specific feature switch is enabled."""
        cfg = self._get_agent_cfg()
        switches = cfg.get("switches", {})
        default_val = False if switch_name == "auto_chat" else True
        return bool(switches.get(switch_name, default_val))

    def resolve_role(
        self,
        username: str,
        user_id: Optional[str] = None,
        is_owner: bool = False,
        is_mod: bool = False
    ) -> str:
        """Resolve caller role from trusted event metadata, not prompt text."""
        if not username:
            return "viewer"
        
        u_clean = username.lower().strip().lstrip("@")
        u_id_clean = user_id.lower().strip() if user_id else ""
        cfg = self._get_agent_cfg()

        # Check explicit flags first
        if is_owner:
            return "owner"
        
        # Check operators list in config (username or verified channel/user ID)
        operators = [op.lower().strip().lstrip("@") for op in cfg.get("operators", [])]
        if u_clean in operators or (u_id_clean and u_id_clean in operators):
            return "owner"

        if is_mod:
            return "moderator"

        moderators = [m.lower().strip().lstrip("@") for m in cfg.get("moderators", [])]
        if u_clean in moderators or (u_id_clean and u_id_clean in moderators):
            return "moderator"

        return "viewer"

    def has_permission(self, caller_role: str, required_role: str) -> bool:
        """Check if caller meets the minimum required role level."""
        caller_lvl = ROLE_LEVELS.get(caller_role.lower(), 1)
        req_lvl = ROLE_LEVELS.get(required_role.lower(), 1)
        return caller_lvl >= req_lvl

    def _record_audit(self, actor: str, role: str, tool: str, args: Dict[str, Any], status: str, result: str):
        """Append an entry to the protected in-memory audit trail."""
        # Sanitize sensitive arguments
        safe_args = {k: v for k, v in args.items() if "token" not in k.lower() and "secret" not in k.lower() and "key" not in k.lower()}
        entry = {
            "timestamp": time.time(),
            "time_iso": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
            "actor": actor,
            "role": role,
            "tool": tool,
            "args": safe_args,
            "status": status,
            "result": str(result)[:300]
        }
        self.audit_log.append(entry)

    def get_audit_trail(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return the recent audit trail entries."""
        return list(self.audit_log)[-limit:]

    def get_status_overview(self) -> Dict[str, Any]:
        """Return safe, non-sensitive status overview of the agent."""
        cfg = self._get_agent_cfg()
        audit_trail = self.get_audit_trail(limit=20)
        recent_actions = []
        for entry in audit_trail:
            recent_actions.append({
                "timestamp": entry.get("timestamp", 0),
                "user": entry.get("actor", "unknown"),
                "role": entry.get("role", "viewer"),
                "tool": entry.get("tool", "unknown"),
                "status": entry.get("status", "unknown"),
                "result": str(entry.get("result", ""))[:200]
            })
        recent_actions.reverse()

        metrics = {
            "requests_total": self.metrics.get("requests_total", 0),
            "tool_executions": self.metrics.get("tool_executions", 0),
            "denied_total": self.metrics.get("denied_total", 0),
            "errors_total": self.metrics.get("errors_total", 0),
            "avg_latency_ms": round(self.metrics.get("avg_latency_ms", 0.0), 1),
            "last_latency_ms": round(self.metrics.get("last_latency_ms", 0.0), 1) if "last_latency_ms" in self.metrics else 0
        }

        return {
            "enabled": self.is_feature_enabled("agent_enabled"),
            "name": self.get_agent_name(),
            "personality": cfg.get("personality", "helpful and friendly"),
            "language": cfg.get("language", "Hinglish"),
            "reply_length": cfg.get("reply_length", "concise"),
            "tone": cfg.get("tone", "supportive"),
            "switches": cfg.get("switches", {}),
            "auto_chat": cfg.get("auto_chat", {}),
            "metrics": metrics,
            "recent_actions": recent_actions
        }

    def get_tools_schema(self) -> str:
        """Generate the system prompt containing Piya's identity and available tools schema."""
        cfg = self._get_agent_cfg()
        name = self.get_agent_name()
        personality = cfg.get("personality", "helpful and friendly")
        language = cfg.get("language", "Hinglish")
        reply_length = cfg.get("reply_length", "concise")
        tone = cfg.get("tone", "supportive")
        custom_prompt = cfg.get("custom_system_prompt", "").strip()

        tools_desc = f"""
You are {name}, the intelligent AI brain for the PB HERO PiBot live YouTube stream.
Personality: {personality}
Language: {language} (natural mix of Hindi and English when appropriate)
Tone: {tone}
Reply Style: {reply_length} (Keep live-chat responses brief, engaging, and under 2-3 sentences. Never spam long paragraphs).

Available Tools (Output strictly in the format: TOOL: tool_name {{"arg": "val"}}):

VIEWER TOOLS (Own data & Public Info):
- TOOL: get_my_points {{}}
  Fetch caller's own current points and rank.
- TOOL: transfer_my_points {{"receiver": "username", "amount": 100}}
  Transfer caller's own points to another viewer.
- TOOL: get_my_pokemon {{}}
  List caller's Pokémon inventory.
- TOOL: get_my_active_pokemon {{}}
  Show caller's currently active Pokémon companion.
- TOOL: catch_pokemon {{}}
  Attempt to catch a wild Pokémon.
- TOOL: summon_pokemon {{"pokemon_name": "Pikachu"}}
  Set active buddy Pokémon.
- TOOL: get_pokemon_info {{"pokemon_name": "Eevee"}}
  Get verified Pokédex entry, power, abilities, and stream battle actions for a Pokémon species.
- TOOL: view_pokemon {{"pokemon_name": "Pikachu"}}
  View details of a Pokémon or another viewer's collection.
- TOOL: battle_pokemon {{"target": "username", "points": 50}}
  Challenge another viewer to a Pokémon battle.
- TOOL: get_leaderboard {{"limit": 5}}
  Show top stream viewers by points.
- TOOL: get_games_guide {{}}
  List active stream chat games and how to play.
- TOOL: explain_commands {{}}
  Explain available chat commands.
- TOOL: explain_points_transfer {{}}
  Explain how to transfer points to another user.
- TOOL: get_available_redeems {{}}
  List reward redeems from the channel store.
- TOOL: redeem_reward {{"reward_name": "Dance Filter"}}
  Redeem a channel reward from the store using caller's points.
- TOOL: get_tip_page_url {{}}
  Get the configured donation / tip page link and UPI payment details.
- TOOL: get_bot_status {{}}
  Check status of bot systems and services.
- TOOL: get_system_status {{}}
  Get live status of integrations (Streamer.bot, audio, live stream).
- TOOL: delete_my_history {{}}
  Clear caller's AI chat history and memory.

MODERATOR & OWNER TOOLS:
- TOOL: ban_user {{"username": "baduser"}}
  Ban a disruptive user from chat.
- TOOL: timeout_user {{"username": "spammer", "duration": 300}}
  Timeout a user for given seconds.
- TOOL: add_loyalty {{"username": "user", "amount": 100}}
  Add loyalty points to a user (Requires Owner role and server confirmation).
- TOOL: add_loyalty_all {{"amount": 500}}
  Grant points to all viewers (Requires Owner role and server confirmation).
- TOOL: restart_bot {{}}
  Restart the bot service (Requires Owner role and server confirmation).
- TOOL: update_agent_config {{"key": "name", "value": "Piya"}}
  Update approved agent settings (Requires Owner role and server confirmation).
- TOOL: toggle_feature_switch {{"switch_name": "auto_chat", "enabled": true}}
  Toggle an agent feature switch (Requires Owner role and server confirmation).
- TOOL: confirm_action {{"code": "CODE12"}}
  Confirm a pending high-impact action with its single-use confirmation code.

CRITICAL INSTRUCTIONS:
1. Always resolve own-data using the authenticated caller context. Never guess or hallucinate user balances, ranks, or Pokémon.
2. If the user asks a question requiring tools, output ONLY the TOOL command line first.
3. If no tool is needed (general chatting), reply naturally as {name}.
"""
        if custom_prompt:
            tools_desc += f"\nCustom Directives:\n{custom_prompt}\n"

        return tools_desc.strip()

    async def execute_tool(
        self,
        tool_name: str,
        args: Dict[str, Any],
        caller_name: str = "system",
        caller_role: str = "viewer",
        allow_tools: bool = True,
        confirmation_verified: bool = False
    ) -> str:
        """Validate permissions, check feature switches, and safely execute a backend tool."""
        start_time = time.time()
        self.metrics["tool_executions"] += 1

        # Enforce tool boundary for random chat or restricted modes
        if not allow_tools:
            self.metrics["denied_total"] += 1
            self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Tool execution is disabled in this mode")
            return "❌ Tool execution is disabled in this mode."

        # Overall agent switch
        if not self.is_feature_enabled("agent_enabled"):
            self.metrics["denied_total"] += 1
            self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Agent is currently disabled")
            return "❌ Agent is currently disabled."

        try:
            # ── VIEWER TOOLS (OWN DATA) ──────────────────────────────────
            if tool_name == "get_my_points":
                if not self.is_feature_enabled("loyalty_actions"):
                    return "❌ Loyalty features are currently disabled."
                viewer = self.bot.viewers.get_viewer(caller_name)
                pts = viewer.get("points", 0) if viewer else 0
                rank = viewer.get("rank", "Novice") if viewer else "Novice"
                res = json.dumps({"username": caller_name, "points": pts, "rank": rank})
                self._record_audit(caller_name, caller_role, tool_name, args, "success", f"{pts} pts")
                return res

            elif tool_name == "transfer_my_points":
                if not self.is_feature_enabled("loyalty_actions"):
                    return "❌ Point transfers are currently disabled."
                receiver = args.get("receiver") or args.get("target") or args.get("to")
                amount = args.get("amount")
                if not receiver or amount is None:
                    return "❌ Receiver and positive amount are required."
                try:
                    amount_int = int(amount)
                except (ValueError, TypeError):
                    return "❌ Invalid transfer amount."

                result = self.bot.viewers.transfer_points_detailed(caller_name, receiver, amount_int)
                if result.get("success"):
                    msg = f"✅ Transferred {amount_int} points from @{caller_name} to @{result['receiver']}! New balance: {result['sender_balance']} pts."
                    self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                    return msg
                else:
                    err = result.get("error", "unknown_error")
                    msg = f"❌ Transfer failed: {err}."
                    self._record_audit(caller_name, caller_role, tool_name, args, "failed", msg)
                    return msg

            elif tool_name in ["get_my_pokemon", "get_my_active_pokemon"]:
                if not self.is_feature_enabled("pokemon_actions"):
                    return "❌ Pokémon actions are currently disabled."
                if not hasattr(self.bot, "pokemon") or not self.bot.pokemon:
                    return "❌ Pokémon service unavailable."

                if tool_name == "get_my_pokemon":
                    inv = self.bot.pokemon.get_user_inventory(caller_name)
                    if not inv:
                        return f"@{caller_name} has no Pokémon in their inventory yet! Try catching one."
                    names = [p.get("name", "Unknown") for p in inv]
                    return f"@{caller_name}'s Pokémon: {', '.join(names)}"
                else:
                    active = self.bot.pokemon.get_active_pokemon(caller_name)
                    if not active:
                        return f"@{caller_name} has no active Pokémon buddy set."
                    return f"Active buddy for @{caller_name}: {active.get('name', 'None')} (Power: {active.get('power', 0)})"

            elif tool_name == "catch_pokemon":
                if not self.is_feature_enabled("pokemon_actions"):
                    return "❌ Pokémon actions are currently disabled."
                if hasattr(self.bot, "pokemon") and self.bot.pokemon:
                    res = await self.bot.pokemon.handle_catch(caller_name)
                    self._record_audit(caller_name, caller_role, tool_name, args, "success", res)
                    return str(res)
                return "❌ Pokémon service not configured."

            elif tool_name == "summon_pokemon":
                if not self.is_feature_enabled("pokemon_actions"):
                    return "❌ Pokémon actions are currently disabled."
                poke_name = args.get("pokemon_name")
                if not poke_name:
                    return "❌ Pokémon name required."
                if hasattr(self.bot, "pokemon") and self.bot.pokemon:
                    res = await self.bot.pokemon.handle_summon(caller_name, poke_name)
                    self._record_audit(caller_name, caller_role, tool_name, args, "success", res)
                    return str(res)
                return "❌ Pokémon service not configured."

            elif tool_name == "get_pokemon_info":
                if not self.is_feature_enabled("pokemon_actions"):
                    return "❌ Pokémon actions are currently disabled."
                poke_name = args.get("pokemon_name") or args.get("name") or args.get("pokemon") or args.get("target")
                if hasattr(self.bot, "pokemon") and self.bot.pokemon:
                    if hasattr(self.bot.pokemon, "get_pokemon_species_info"):
                        res = await self.bot.pokemon.get_pokemon_species_info(poke_name)
                    else:
                        res = await self.bot.pokemon.handle_view_pokemon(caller_name, poke_name)
                    return str(res)
                return "❌ Pokémon service not configured."

            elif tool_name == "view_pokemon":
                if not self.is_feature_enabled("pokemon_actions"):
                    return "❌ Pokémon actions are currently disabled."
                poke_name = args.get("pokemon_name") or args.get("name") or args.get("target")
                if hasattr(self.bot, "pokemon") and self.bot.pokemon:
                    res = await self.bot.pokemon.handle_view_pokemon(caller_name, poke_name)
                    return str(res)
                return "❌ Pokémon service not configured."

            elif tool_name == "battle_pokemon":
                if not self.is_feature_enabled("pokemon_actions"):
                    return "❌ Pokémon actions are currently disabled."
                target = args.get("target") or args.get("opponent")
                points = args.get("points", 50)
                if hasattr(self.bot, "pokemon") and self.bot.pokemon:
                    res = await self.bot.pokemon.handle_battle(caller_name, target, points)
                    self._record_audit(caller_name, caller_role, tool_name, args, "success", res)
                    return str(res)
                return "❌ Pokémon service not configured."

            elif tool_name == "get_leaderboard":
                if not self.is_feature_enabled("loyalty_actions"):
                    return "❌ Leaderboard is currently disabled."
                limit = int(args.get("limit", 5))
                top = self.bot.viewers.get_leaderboard(limit=min(limit, 10))
                return json.dumps(top, indent=2)

            elif tool_name == "get_games_guide":
                if not self.is_feature_enabled("viewer_support"):
                    return "❌ Support guide is currently disabled."
                return (
                    "Stream Games Available:\n"
                    "1. Pokémon: !catch, !summon <name>, !mypokemon, !battle @user <pts>\n"
                    "2. Loyalty: !points, !give @user <pts>, !top\n"
                    "3. Chat Games: !trivia, !roll, !flip, !gamble <pts>, !rob @user\n"
                    "4. AI Piya: Ask any question directly or tag @Piya!"
                )

            elif tool_name == "explain_commands":
                if not self.is_feature_enabled("viewer_support"):
                    return "❌ Support guide is currently disabled."
                return "Commands: !points, !give @user <pts>, !catch, !mypokemon, !battle @user <pts>, !top, !redeem <id>, !help"

            elif tool_name == "explain_points_transfer":
                return "Points transfer karne ke liye chat mein type karein: '!give @username <amount>' ya mujhse bolein: '@Piya @username ko <amount> points transfer karo'."

            elif tool_name == "get_available_redeems":
                if not self.is_feature_enabled("loyalty_actions"):
                    return "❌ Redeems are currently disabled."
                if hasattr(self.bot, "redeem_svc") and self.bot.redeem_svc:
                    redeems = self.bot.redeem_svc.get_all()
                    active = [r for r in redeems if r.get("enabled")]
                    clean = [{"id": r["id"], "name": r["name"], "cost": r["cost"]} for r in active]
                    return json.dumps(clean, indent=2)
                return "No channel redeems configured."

            elif tool_name == "redeem_reward":
                if not self.is_feature_enabled("loyalty_actions"):
                    return "❌ Reward redemptions are currently disabled."
                reward_name = args.get("reward_name") or args.get("name") or args.get("reward")
                if not reward_name:
                    return "❌ Reward name required."
                if hasattr(self.bot, "redeem_svc") and self.bot.redeem_svc:
                    reward = self.bot.redeem_svc.find_by_name(reward_name)
                    if not reward:
                        return f"❌ Reward '{reward_name}' not found. Ask 'what rewards are available' to see the shop."
                    viewer_svc = getattr(self.bot, "viewers", None)
                    sb_ws = getattr(self.bot, "sb_ws", None)
                    b_func = getattr(self.bot, "broadcast_func", None)
                    res = await self.bot.redeem_svc.trigger_redeem(
                        reward["id"], caller_name, viewer_svc, sb_ws=sb_ws, broadcast_func=b_func
                    )
                    if res.get("ok"):
                        msg = f"🎉 @{caller_name} successfully redeemed '{reward['name']}' for {reward['cost']} points!"
                        self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                        return msg
                    else:
                        err = res.get("error", "Redeem failed")
                        msg = f"❌ Redeem failed: {err}"
                        self._record_audit(caller_name, caller_role, tool_name, args, "failed", msg)
                        return msg
                return "❌ Redeem service unavailable."

            elif tool_name == "get_tip_page_url":
                cfg = self.bot.load_config() if hasattr(self.bot, "load_config") else {}
                tip_cfg = cfg.get("tip_page", {})
                custom_url = (tip_cfg.get("custom_url") or tip_cfg.get("url") or cfg.get("public_url") or "").strip()
                upi_vpa = (tip_cfg.get("upi_vpa") or cfg.get("upi_vpa") or "").strip()
                instructions = (tip_cfg.get("donation_instructions") or "").strip()

                # Fall back to tunnel / custom_domain only if no explicit custom URL was configured
                if not custom_url:
                    domain_cfg = cfg.get("domain", {})
                    cf_cfg = cfg.get("cloudflare", {})
                    if cf_cfg.get("tunnel_url"):
                        custom_url = f"{cf_cfg['tunnel_url'].strip().rstrip('/')}/tip"
                    elif domain_cfg.get("custom_domain"):
                        custom_url = f"https://{domain_cfg['custom_domain'].strip().rstrip('/')}/tip"

                parts = []
                if custom_url:
                    parts.append(f"Tip Page: {custom_url}")
                if upi_vpa:
                    parts.append(f"UPI ID: {upi_vpa}")
                if instructions:
                    parts.append(f"Instructions: {instructions}")

                if parts:
                    return "\n".join(parts)
                return "Tip page is not currently configured."

            elif tool_name == "get_bot_status":
                if not self.is_feature_enabled("viewer_support"):
                    return "❌ Status checks disabled."
                status = self.bot.get_status() if hasattr(self.bot, "get_status") else {}
                return json.dumps({"status": "online", "details": status})

            elif tool_name == "get_system_status":
                if not self.is_feature_enabled("viewer_support"):
                    return "❌ System status checks are disabled."
                sb_connected = getattr(self.bot, "is_sb_connected", False)
                audio_active = bool(getattr(self.bot, "audio", None))
                live_chat = bool(getattr(self.bot, "live_chat_id", None))
                return json.dumps({
                    "streamer_bot_connected": sb_connected,
                    "audio_active": audio_active,
                    "live_chat_active": live_chat
                })

            elif tool_name == "delete_my_history":
                if hasattr(self.bot, "brain_service") and self.bot.brain_service:
                    if hasattr(self.bot.brain_service, "delete_user_history"):
                        self.bot.brain_service.delete_user_history(caller_name)
                try:
                    from backend.services import youtube_memory
                    youtube_memory.delete_user_history(caller_name)
                except Exception as e:
                    logger.warning(f"Error clearing youtube_memory for {caller_name}: {e}")
                self._record_audit(caller_name, caller_role, tool_name, args, "success", "History deleted")
                return f"✅ Chat memory and history for @{caller_name} have been cleared."

            # ── MODERATOR & OWNER TOOLS ──────────────────────────────────
            elif tool_name == "ban_user":
                if not self.has_permission(caller_role, "moderator"):
                    self.metrics["denied_total"] += 1
                    self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Requires moderator role")
                    return "❌ Permission denied: Moderator role required to ban users."
                if not self.is_feature_enabled("chat_moderation"):
                    return "❌ Chat moderation actions are currently disabled."
                target = args.get("username")
                if not target:
                    return "❌ Target username required."
                if hasattr(self.bot, "moderation") and self.bot.moderation:
                    res = await self.bot.moderation.ban(target)
                    msg = f"🔨 {target} banned: {res}"
                    self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                    return msg
                return "❌ Moderation service unavailable."

            elif tool_name == "timeout_user":
                if not self.has_permission(caller_role, "moderator"):
                    self.metrics["denied_total"] += 1
                    self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Requires moderator role")
                    return "❌ Permission denied: Moderator role required to timeout users."
                if not self.is_feature_enabled("chat_moderation"):
                    return "❌ Chat moderation actions are currently disabled."
                target = args.get("username")
                duration = int(args.get("duration", 300))
                if not target:
                    return "❌ Target username required."
                if hasattr(self.bot, "moderation") and self.bot.moderation:
                    res = await self.bot.moderation.timeout(target, duration)
                    msg = f"⏳ {target} timed out for {duration}s: {res}"
                    self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                    return msg
                return "❌ Moderation service unavailable."

            elif tool_name == "confirm_action":
                code = args.get("code") or args.get("confirmation_code")
                if not code:
                    return "❌ Confirmation code required."
                return await self.confirm_pending_action(caller_name, caller_role, str(code))

            elif tool_name == "add_loyalty":
                if not self.has_permission(caller_role, "owner"):
                    self.metrics["denied_total"] += 1
                    self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Requires owner role")
                    return "❌ Permission denied: Only stream owners can grant arbitrary loyalty points."
                chal = self._verify_or_challenge_confirmation(tool_name, args, caller_name, caller_role, confirmation_verified)
                if chal:
                    return chal
                target = args.get("username")
                amount = int(args.get("amount", 0))
                if not target or amount <= 0:
                    return "❌ Target username and positive amount required."
                self.bot.viewers.add_points(target, amount)
                msg = f"✅ Added {amount} points to @{target}."
                self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                return msg

            elif tool_name == "add_loyalty_all":
                if not self.has_permission(caller_role, "owner"):
                    self.metrics["denied_total"] += 1
                    self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Requires owner role")
                    return "❌ Permission denied: Owner role required."
                chal = self._verify_or_challenge_confirmation(tool_name, args, caller_name, caller_role, confirmation_verified)
                if chal:
                    return chal
                amount = int(args.get("amount", 0))
                if amount <= 0:
                    return "❌ Positive amount required."
                count = 0
                for u in list(self.bot.viewers.viewers.keys()):
                    self.bot.viewers.add_points(u, amount)
                    count += 1
                msg = f"✅ Added {amount} points to all {count} active viewers."
                self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                return msg

            elif tool_name == "restart_bot":
                if not self.has_permission(caller_role, "owner"):
                    self.metrics["denied_total"] += 1
                    self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Requires owner role")
                    return "❌ Permission denied: Owner role required to restart bot."
                chal = self._verify_or_challenge_confirmation(tool_name, args, caller_name, caller_role, confirmation_verified)
                if chal:
                    return chal
                asyncio.create_task(self._delayed_restart())
                msg = "🔄 Bot restart sequence initiated..."
                self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                return msg

            elif tool_name == "update_agent_config":
                if not self.has_permission(caller_role, "owner"):
                    self.metrics["denied_total"] += 1
                    self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Requires owner role")
                    return "❌ Permission denied: Owner role required to update Agent configuration."
                key = args.get("key")
                val = args.get("value")
                if key not in ALLOWED_CONFIG_KEYS:
                    return f"❌ Disallowed config key: '{key}'. Allowed keys: {', '.join(sorted(ALLOWED_CONFIG_KEYS))}."
                chal = self._verify_or_challenge_confirmation(tool_name, args, caller_name, caller_role, confirmation_verified)
                if chal:
                    return chal
                from backend.config_manager import ConfigManager
                cfg = self.bot.load_config()
                if "agent" not in cfg:
                    cfg["agent"] = {**DEFAULT_AGENT_CONFIG}
                cfg["agent"][key] = val
                ConfigManager.save_config(cfg)
                msg = f"✅ Updated Agent config '{key}' to '{val}'."
                self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                return msg

            elif tool_name == "toggle_feature_switch":
                if not self.has_permission(caller_role, "owner"):
                    self.metrics["denied_total"] += 1
                    self._record_audit(caller_name, caller_role, tool_name, args, "denied", "Requires owner role")
                    return "❌ Permission denied: Owner role required."
                switch = args.get("switch_name")
                enabled = bool(args.get("enabled", True))
                chal = self._verify_or_challenge_confirmation(tool_name, args, caller_name, caller_role, confirmation_verified)
                if chal:
                    return chal
                from backend.config_manager import ConfigManager
                cfg = self.bot.load_config()
                if "agent" not in cfg:
                    cfg["agent"] = {**DEFAULT_AGENT_CONFIG}
                if "switches" not in cfg["agent"]:
                    cfg["agent"]["switches"] = {**DEFAULT_AGENT_CONFIG["switches"]}
                cfg["agent"]["switches"][switch] = enabled
                ConfigManager.save_config(cfg)
                msg = f"✅ Feature switch '{switch}' set to {enabled}."
                self._record_audit(caller_name, caller_role, tool_name, args, "success", msg)
                return msg

            else:
                self.metrics["errors_total"] += 1
                return f"❌ Unknown or unsupported tool: {tool_name}."

        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}", exc_info=True)
            self.metrics["errors_total"] += 1
            self._record_audit(caller_name, caller_role, tool_name, args, "error", str(e))
            return f"❌ Tool execution error: {str(e)}"
        finally:
            latency = (time.time() - start_time) * 1000.0
            self.metrics["_total_latency"] += latency
            if self.metrics["tool_executions"] > 0:
                self.metrics["avg_latency_ms"] = round(self.metrics["_total_latency"] / self.metrics["tool_executions"], 2)

    async def _delayed_restart(self):
        """Safely restart bot service after allowing pending responses to send."""
        await asyncio.sleep(2)
        try:
            if hasattr(self.bot, "stop"):
                self.bot.stop()
            await asyncio.sleep(1)
            if hasattr(self.bot, "start") and self.bot.broadcast_func:
                await self.bot.start(self.bot.broadcast_func)
        except Exception as e:
            logger.error(f"Restart error: {e}")

    async def _try_grounded_fallback(self, text: str, user_name: str, caller_role: str = "viewer") -> Optional[str]:
        """Provide verified factual response from local services when conversational LLM is unavailable."""
        t_lower = text.lower().strip()

        # 1. Pokemon knowledge / abilities check
        pokemon_match = re.search(r'\b(eevee|pikachu|charizard|mewtwo|gengar|lucario|bulbasaur|squirtle|snorlax|dragonite)\b', t_lower)
        if pokemon_match and any(kw in t_lower for kw in ["kya", "kar sakta", "batao", "bata", "power", "ability", "stat", "species", "pokemon"]):
            poke_name = pokemon_match.group(1).title()
            if hasattr(self.bot, "pokemon") and self.bot.pokemon and hasattr(self.bot.pokemon, "get_pokemon_species_info"):
                return await self.bot.pokemon.get_pokemon_species_info(poke_name)

        # 2. Points / rank check
        if any(kw in t_lower for kw in ["points", "rank", "mera point", "mere point"]):
            if hasattr(self.bot, "viewers") and self.bot.viewers:
                return await self.execute_tool("get_my_points", {}, caller_name=user_name, caller_role=caller_role)

        # 3. Tip page / donation check
        if any(kw in t_lower for kw in ["tip", "donation", "donate", "upi", "paytm", "phonepe", "gpay", "google pay"]):
            return await self.execute_tool("get_tip_page_url", {}, caller_name=user_name, caller_role=caller_role)

        # 4. Leaderboard check
        if any(kw in t_lower for kw in ["leaderboard", "top 10", "top 5", "top viewer"]):
            return await self.execute_tool("get_leaderboard", {"limit": 5}, caller_name=user_name, caller_role=caller_role)

        return None

    async def process_request(
        self,
        user_name: str,
        user_id: str,
        text: str,
        ai_engine=None,
        caller_role: Optional[str] = None,
        allow_tools: bool = True
    ) -> str:
        """Main entry point for processing a natural language message through Piya.

        Handles system prompt assembly, LLM call, multi-tool parsing and execution,
        and follow-up response synthesis.
        """
        start_time = time.time()
        self.metrics["requests_total"] += 1

        if not self.is_feature_enabled("agent_enabled"):
            return "Agent is currently disabled."

        # Resolve role if not explicitly provided
        if caller_role is None:
            caller_role = self.resolve_role(user_name, user_id=user_id)

        # Intercept direct confirmation of a pending high-impact action (only when tools are enabled)
        clean_text = text.strip()
        if allow_tools:
            confirm_match = re.match(r"^!?(?:confirm|yes)\s+([A-Fa-f0-9]{6})$", clean_text, re.IGNORECASE)
            if confirm_match:
                code = confirm_match.group(1).upper()
                return await self.confirm_pending_action(user_name, caller_role, code)

        # Rate limit checks for non-owners
        now = time.time()
        cfg = self._get_agent_cfg()
        rate_limits = cfg.get("rate_limits", {})
        global_cd = rate_limits.get("global_cooldown", 0)
        user_cd = rate_limits.get("user_cooldown", 0)

        if caller_role != "owner":
            if now - self.last_global_request < global_cd:
                return "Agent is taking a quick breath, please wait a moment."
            last_u = self.last_user_request.get(user_name.lower(), 0)
            if now - last_u < user_cd:
                return f"@{user_name}, please wait {int(user_cd - (now - last_u))}s before asking again."

        self.last_global_request = now
        self.last_user_request[user_name.lower()] = now

        engine = ai_engine or getattr(self.bot, "ai_engine", None)
        if not engine:
            return "Arre, abhi AI service temporarily offline hai. Kripya thodi der baad poochhein!"

        # Build prompt with tools schema
        system_prompt = self.get_tools_schema() + f"\nAuthenticated Context: User='{user_name}' (ID: '{user_id}', Role: '{caller_role}')"
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ]

        try:
            response = await engine.chat(messages, system_prompt=system_prompt)
            raw_content = response.get("response") if isinstance(response, dict) else response
            if raw_content is None or str(raw_content).strip() == "":
                err_msg = response.get("error", "") if isinstance(response, dict) else ""
                logger.warning(f"AI engine returned no response. Details: {err_msg}")
                grounded = await self._try_grounded_fallback(text, user_name, caller_role)
                if grounded:
                    return grounded
                return "Arre, abhi AI service temporarily unavailable hai. Kripya thodi der baad poochhein!"

            content = str(raw_content).strip()

            # Check for tool call directives
            lines = content.split("\n")
            tool_lines = [l.strip() for l in lines if l.strip().startswith("TOOL:")]

            if tool_lines:
                executed_results = []
                for tool_line in tool_lines:
                    try:
                        raw = tool_line.replace("TOOL:", "", 1).strip()
                        parts = raw.split(" ", 1)
                        tool_name = parts[0].strip()
                        args_str = parts[1].strip() if len(parts) > 1 else "{}"
                        args = json.loads(args_str) if args_str else {}

                        tool_res = await self.execute_tool(
                            tool_name=tool_name,
                            args=args,
                            caller_name=user_name,
                            caller_role=caller_role,
                            allow_tools=allow_tools
                        )
                        executed_results.append({"tool": tool_name, "args": args, "result": tool_res})

                        # Broadcast action event to UI
                        if hasattr(self.bot, "broadcast_func") and callable(self.bot.broadcast_func):
                            await self.bot.broadcast_func({
                                "event": "AGENT_ACTION",
                                "data": {
                                    "tool": tool_name,
                                    "args": args,
                                    "result": tool_res,
                                    "user": user_name
                                }
                            })
                    except Exception as err:
                        executed_results.append({"tool": "parse_error", "result": str(err)})

                # Synthesize final natural response
                results_summary = "\n".join([f"- Tool '{r['tool']}': {r.get('result', '')}" for r in executed_results])
                messages.append({"role": "assistant", "content": content})
                messages.append({
                    "role": "system",
                    "content": (
                        f"Tool Execution Results:\n{results_summary}\n\n"
                        f"Now answer @{user_name} concisely in {cfg.get('language', 'Hinglish')}, confirming the result. "
                        f"Do NOT output any TOOL commands."
                    )
                })

                final_resp = await engine.chat(messages)
                raw_final = final_resp.get("response") if isinstance(final_resp, dict) else final_resp
                if raw_final is None or str(raw_final).strip() == "":
                    clean_results = [str(r.get('result', '')) for r in executed_results if r.get('result')]
                    return " ".join(clean_results) or "Action completed."

                final_text = str(raw_final).strip()

                # Sanitize output
                clean_lines = [l for l in final_text.split("\n") if not l.strip().startswith("TOOL:")]
                res_output = "\n".join(clean_lines).strip()
                return res_output or "Action completed."

            return content.strip()

        except Exception as e:
            logger.error(f"Error in Agent process_request: {e}", exc_info=True)
            self.metrics["errors_total"] += 1
            return "Arre, request process karte waqt ek chhota issue aaya. Kripya dobara try karein!"
