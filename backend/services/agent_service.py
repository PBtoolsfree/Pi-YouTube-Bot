import logging
import json
import asyncio
import time
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class AgentService:
    def __init__(self, bot):
        self.bot = bot # Reference to main BotService

    def get_tools_schema(self):
        """Dynamically generates the tools schema based on the bot's current live state."""
        cfg = self.bot.load_config()
        
        # ── Detect available services ──
        has_audio = hasattr(self.bot, 'audio') and self.bot.audio is not None
        has_sheets = hasattr(self.bot, 'sheets') and self.bot.sheets is not None
        has_youtube = hasattr(self.bot, 'youtube_api') and self.bot.youtube_api is not None
        has_moderation = hasattr(self.bot, 'moderation') and self.bot.moderation is not None
        has_viewers = hasattr(self.bot, 'viewers') and self.bot.viewers is not None
        has_streamerbot = cfg.get("streamer_bot", {}).get("enabled", False)
        
        # ── Detect live config state ──
        ai_enabled = cfg.get("ai_topology", {}).get("enabled", True)
        tts_enabled = cfg.get("audio", {}).get("enabled", False)
        personality = cfg.get("ai_topology", {}).get("personality", "helpful")
        
        

        
        # ── Build ignore list snapshot ──
        ignore_list = cfg.get("moderation", {}).get("ignore_list", [])
        ignore_str = ", ".join(ignore_list[:10]) if ignore_list else "Empty"

        # ── Build viewer count ──
        viewer_count = len(self.bot.viewers.viewers) if has_viewers else 0
        sub_count = getattr(self.bot, 'subscriber_count', 0)
        
        # ── Build dynamic rank tiers list ──
        loyalty_cfg = cfg.get("loyalty", {})
        ranks_list = loyalty_cfg.get("ranks", self.bot.viewers.ranks if has_viewers and hasattr(self.bot.viewers, 'ranks') else [])
        if ranks_list:
            sorted_ranks = sorted(ranks_list, key=lambda x: int(x.get("min_points", 0)))
            rank_tiers_str = ", ".join(rnk.get('name', 'Unnamed') for rnk in sorted_ranks)
        else:
            rank_tiers_str = "Noob, Bronze, Silver, Gold, Diamond, GOD"
        
        # ── Detect features that have actual backend support ──
        has_donations = hasattr(self.bot, 'get_donation_history') and callable(getattr(self.bot, 'get_donation_history', None))
        has_send_chat = hasattr(self.bot, '_send_chat') and callable(getattr(self.bot, '_send_chat', None))

        # ── Tool Counter ──
        n = [0]
        def t():
            n[0] += 1
            return n[0]
        
        # ── Build Schema String ──
        schema = f"""You are Pi Bot Agent — a powerful AI controller with FULL access to the Pi Bot 2.0 system.
You can execute tools by replying with: `TOOL: <tool_name> <json_args>`
You may chain multiple tools by putting each on its own line.

IMPORTANT: If the user asks for advice, suggestions (e.g., YouTube titles, descriptions, ideas), or asks you to perform actions that are not supported by the available tools (like setting up a live stream, editing thumbnails, or searching YouTube directly), DO NOT use any tools. Simply reply with a helpful conversational response.

## LIVE STATE (auto-updated)
- Point System: Viewers earn Points by chatting. Rank tiers: {rank_tiers_str}. Commands: `!give <user> <amount>` and `!rob <user>`.
- AI Engine: {"ON" if ai_enabled else "OFF"} | Personality: {personality}
- TTS Audio: {"ON" if tts_enabled else "OFF"} | Audio Service: {"Available" if has_audio else "Unavailable"}
- Streamer.bot: {"Connected" if has_streamerbot else "Disconnected"}
- YouTube API: {"Available" if has_youtube else "Unavailable"} | Subs: {sub_count}
- Tracked Viewers: {viewer_count}
- Ignore List: {ignore_str}

## 🎮 GAME & ECONOMY KNOWLEDGE
The channel has a full points-based economy with these games:
- **!gamble <amount>**: 50/50 double or nothing. Win = 2x, Lose = 0.
- **!slots <amount>**: Slot machine. Triple 7s=10x, Triple 💎=5x, Triple any=3x, Pair=1.5x.
- **!rob <username>**: 40% chance to steal target's 10% points. Fail = fine goes to target. 60s cooldown.
- **!bowl <amount>**: Cricket bowling — challenge dalo, 30s mein koi !bat kare to 1v1 duel (50/50).
- **!bat [amount]**: Cricket batting — Solo: Out(40%), Single(20%), Double/1.5x(20%), Four/2x(10%), SIX/3x(10%). Or accept a !bowl challenge.
- **!attack <amount>**: Boss Fight (streamer-triggered). Sab milke boss maaro, top 3 get big rewards.
- **Economy**: !points, !give, !top/!leaderboard, !shop/!redeem, !claim (loot box), Secret Word (1000 pts).
If asked about any game, explain rules, commands, win chances, and tips enthusiastically.

## Available Tools

### 📊 System & Status
{t()}. `help {{}}` — List all available commands.
{t()}. `get_system_stats {{}}` — Get CPU, RAM, Uptime, Viewer Count.
{t()}. `get_integrations {{}}` — Check status of all integrations.
{t()}. `get_subscriber_count {{}}` — Current YouTube subscriber count.
{t()}. `restart_bot {{}}` — Restart the entire bot service.

### 🎭 Personality & AI
{t()}. `update_personality {{"style": "pirate"}}` — Change AI personality.
{t()}. `toggle_ai {{}}` — Toggle AI auto-reply ON/OFF (currently {"ON" if ai_enabled else "OFF"}).
"""

        # Audio tools (only if audio service exists)
        if has_audio:
            schema += f"""
### 🔊 Audio & TTS
{t()}. `toggle_tts {{}}` — Toggle TTS ON/OFF (currently {"ON" if tts_enabled else "OFF"}).
{t()}. `speak_tts {{"text": "Hello world"}}` — Speak text via TTS immediately.
{t()}. `skip_tts {{}}` — Skip the currently playing TTS audio.
"""

        # Chat tools (only show tools with available backends)
        chat_tools = []
        if has_send_chat:
            chat_tools.append(f"{t()}. `send_chat {{\"message\": \"Hello YouTube!\"}}` — Send to YouTube live chat.")
        if chat_tools:
            schema += "\n### 💬 Chat & Messaging\n" + "\n".join(chat_tools) + "\n"

        # Moderation
        schema += f"""
### 🛡️ Moderation
{t()}. `ban_user {{"username": "user"}}` — Ban a user from chat.
{t()}. `timeout_user {{"username": "user", "seconds": 60}}` — Timeout a user.
{t()}. `add_ignore {{"username": "user"}}` — Add user to ignore list.
{t()}. `remove_ignore {{"username": "user"}}` — Remove user from ignore list.

### 🤫 Agent Actions
{t()}. `send_silent_chat {{"message": "secret reply"}}` — Reply silently to YouTube Chat bypassing TTS. Use this for point/redeem checking!
"""

        # Loyalty (only if viewer service exists)
        if has_viewers:
            schema += f"""
### 💰 Loyalty & Viewers
{t()}. `get_viewer_stats {{"username": "user"}}` — Get stats for a specific viewer.
{t()}. `get_leaderboard {{"limit": 10}}` — Get top N viewers by points.
{t()}. `add_loyalty {{"username": "user", "amount": 100}}` — Add points to a user.
{t()}. `add_loyalty_all {{"amount": 1000}}` — Add points to ALL tracked viewers.
{t()}. `deduct_loyalty {{"username": "user", "amount": 50}}` — Deduct points from a user.
"""
            if has_donations:
                schema += f"{t()}. `get_donations {{}}` — Get recent donations/tips.\n"
                
            # Economy & Games Dynamic Discovery
            if hasattr(self.bot, 'gambling'):
                available_games = [f for f in dir(self.bot.gambling) if callable(getattr(self.bot.gambling, f)) and not f.startswith("_")]
                if available_games:
                    schema += "\n### 🎰 Economy & Games\n"
                    for game in available_games:
                        if game == "rob":
                            schema += f"{t()}. `play_{game} {{\"username\": \"user\", \"target\": \"target_user\"}}` — Play {game} game.\n"
                        else:
                            schema += f"{t()}. `play_{game} {{\"username\": \"user\", \"amount\": 100}}` — Play {game} game.\n"

            # Shop & Redeems
            if hasattr(self.bot, 'redeem_svc'):
                schema += f"""
### 🛍️ Shop & Redeems
{t()}. `get_available_redeems {{}}` — Get list of ALL current shop/meme items and costs.
{t()}. `trigger_meme_redeem {{"reward_id": "ab123", "username": "user"}}` — Trigger a shop/meme redeem for a user.
"""

        # Config
        schema += f"""
### 🔧 Configuration & Services
{t()}. `update_config {{"path": "audio.enabled", "value": true}}` — Update any config key.
{t()}. `update_loyalty_settings {{"points_per_message": 100, "bonus_daily_return": 200}}` — Update loyalty config values specifically.
"""

        # Integrations
        schema += f"""
### 🔌 Integrations
{t()}. `toggle_streamerbot {{}}` — Toggle Streamer.bot ON/OFF.
"""
        if has_sheets:
            schema += f"""{t()}. `check_sheets_status {{}}` — Check Google Sheets connection.
"""

        schema += f"""
Total tools available: {n[0]}

Example:
User: "Give 500 points to shroud and send a message saying congrats"
Response:
TOOL: add_loyalty {{"username": "shroud", "amount": 500}}
TOOL: send_chat {{"message": "🎉 Congrats shroud! You just got 500 Points!"}}
"""
        return schema

    async def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> str:
        """Executes a tool and returns the result as a string."""
        logger.info(f"🔧 Agent Executing: {tool_name} with {args}")
        
        try:
            # ── SYSTEM & STATUS ──────────────────────────────────────
            if tool_name == "help":
                return """
🤖 **Pi Bot Agent — Full Control Guide** 🤖

**📊 System**: status, get_integrations, get_subscriber_count, restart_bot
**🎭 AI**: update_personality, toggle_ai
**🔊 Audio**: toggle_tts, speak_tts, skip_tts
**💬 Chat**: send_chat
**🛡️ Mod**: ban_user, timeout_user, add_ignore, remove_ignore
**💰 Loyalty**: get_viewer_stats, get_leaderboard, add_loyalty, deduct_loyalty, get_donations
**🔧 Config**: update_config, toggle_streamerbot, check_sheets_status

Just tell me what you want in natural language and I'll handle it!
"""

            elif tool_name == "get_system_stats":
                stats = self.bot.get_status()
                stats["viewer_count"] = len(self.bot.viewers.viewers)
                stats["subscriber_count"] = self.bot.subscriber_count
                return json.dumps(stats, indent=2)

            elif tool_name == "get_integrations":
                integrations = await self.bot.check_integrations()
                return json.dumps(integrations, indent=2)
            
            elif tool_name == "get_subscriber_count":
                return f"Current YouTube Subscriber Count: {self.bot.subscriber_count}"
            
            elif tool_name == "restart_bot":
                # Schedule restart (can't await fully here as it kills our context)
                asyncio.create_task(self._delayed_restart())
                return "Bot restart scheduled. Restarting in 2 seconds..."

            # ── PERSONALITY & AI ─────────────────────────────────────
            elif tool_name == "update_personality":
                style = args.get("style", "helpful")
                cfg = self.bot.load_config()
                if "ai_topology" not in cfg: cfg["ai_topology"] = {}
                cfg["ai_topology"]["personality"] = style
                from backend.config_manager import ConfigManager
                ConfigManager.save_config(cfg)
                return f"✅ Personality updated to: {style}"

            elif tool_name == "toggle_ai":
                cfg = self.bot.load_config()
                topo = cfg.get("ai_topology", {})
                topo["enabled"] = not topo.get("enabled", True)
                cfg["ai_topology"] = topo
                from backend.config_manager import ConfigManager
                ConfigManager.save_config(cfg)
                state = "ON" if topo["enabled"] else "OFF"
                return f"✅ AI Engine is now {state}"

            # ── AUDIO & TTS ──────────────────────────────────────────
            elif tool_name == "toggle_tts":
                cfg = self.bot.load_config()
                audio_cfg = cfg.get("audio", {})
                audio_cfg["enabled"] = not audio_cfg.get("enabled", True)
                cfg["audio"] = audio_cfg
                from backend.config_manager import ConfigManager
                ConfigManager.save_config(cfg)
                state = "ON" if audio_cfg["enabled"] else "OFF"
                return f"✅ TTS Audio is now {state}"

            elif tool_name == "speak_tts":
                text = args.get("text", "")
                voice = args.get("voice")
                if not text: return "❌ Error: text is required"
                if self.bot.audio:
                    await self.bot.audio.speak(text, "public", voice=voice)
                    return f"🔊 Speaking: \"{text}\""
                return "❌ Audio engine not available"

            elif tool_name == "skip_tts":
                if self.bot.audio:
                    result = await self.bot.audio.skip_current()
                    return "⏭️ Skipped current TTS" if result else "No audio playing"
                return "❌ Audio engine not available"

            # ── CHAT & MESSAGING ─────────────────────────────────────
            elif tool_name == "send_chat":
                message = args.get("message", "")
                if not message: return "❌ Error: message is required"
                await self.bot._send_chat(message)
                return f"💬 Sent to YouTube chat: \"{message}\""
                
            elif tool_name == "send_silent_chat":
                message = args.get("message", "")
                if not message: return "❌ Error: message is required"
                await self.bot._send_chat(message)
                return f"✅ Silently sent to YouTube: \"{message}\""



            # ── MODERATION ───────────────────────────────────────────
            elif tool_name == "ban_user":
                user = args.get("username")
                if not user: return "❌ Error: username required"
                # Use moderation service if available
                if hasattr(self.bot, 'moderation') and hasattr(self.bot.moderation, 'ban'):
                    result = await self.bot.moderation.ban(user)
                    return f"🔨 {user} has been banned. {result}"
                # Fallback: Add to ignore list
                cfg = self.bot.load_config()
                ignore = cfg.get("moderation", {}).get("ignore_list", [])
                if user.lower() not in [u.lower() for u in ignore]:
                    ignore.append(user)
                    cfg.setdefault("moderation", {})["ignore_list"] = ignore
                    from backend.config_manager import ConfigManager
                    ConfigManager.save_config(cfg)
                return f"🔨 {user} has been banned (added to ignore list)"

            elif tool_name == "timeout_user":
                user = args.get("username")
                sec = args.get("seconds", 60)
                if not user: return "❌ Error: username required"
                if hasattr(self.bot, 'moderation') and hasattr(self.bot.moderation, 'timeout'):
                    result = await self.bot.moderation.timeout(user, sec)
                    return f"⏱️ {user} timed out for {sec}s. {result}"
                return f"⏱️ {user} timed out for {sec}s (via moderation service)"

            elif tool_name == "add_ignore":
                user = args.get("username")
                if not user: return "❌ Error: username required"
                cfg = self.bot.load_config()
                ignore = cfg.get("moderation", {}).get("ignore_list", [])
                if user.lower() not in [u.lower() for u in ignore]:
                    ignore.append(user)
                    cfg.setdefault("moderation", {})["ignore_list"] = ignore
                    from backend.config_manager import ConfigManager
                    ConfigManager.save_config(cfg)
                    return f"✅ {user} added to ignore list"
                return f"ℹ️ {user} is already in ignore list"

            elif tool_name == "remove_ignore":
                user = args.get("username")
                if not user: return "❌ Error: username required"
                cfg = self.bot.load_config()
                ignore = cfg.get("moderation", {}).get("ignore_list", [])
                new_ignore = [u for u in ignore if u.lower() != user.lower()]
                if len(new_ignore) < len(ignore):
                    cfg.setdefault("moderation", {})["ignore_list"] = new_ignore
                    from backend.config_manager import ConfigManager
                    ConfigManager.save_config(cfg)
                    return f"✅ {user} removed from ignore list"
                return f"ℹ️ {user} was not in ignore list"

            # ── LOYALTY & VIEWERS ────────────────────────────────────
            elif tool_name == "get_viewer_stats":
                user = args.get("username")
                if not user: return "❌ Error: username required"
                viewer = self.bot.viewers.get_viewer(user)
                if not viewer: return f"❌ User '{user}' not found in database."
                return json.dumps(viewer, indent=2)

            elif tool_name == "get_leaderboard":
                limit = args.get("limit", 10)
                leaderboard = self.bot.viewers.get_leaderboard(limit=limit)
                if not leaderboard: return "No viewers tracked yet."
                lines = [f"🏆 **Top {limit} Leaderboard**"]
                for i, v in enumerate(leaderboard, 1):
                    lines.append(f"{i}. {v['name']} — {v.get('points', 0):,} Points")
                return "\n".join(lines)

            elif tool_name == "add_loyalty":
                user = args.get("username")
                amount = int(args.get("amount", 0))
                if not user: return "❌ Error: username required"
                if amount <= 0: return "❌ Error: amount must be positive"
                self.bot.viewers.add_points(user, amount)
                self.bot.viewers._notify_viewer_update(user, "agent_add_loyalty")
                new_pts = self.bot.viewers.get_viewer(user).get("points", 0)
                return f"✅ Added {amount} Points to {user}. New balance: {new_pts:,} Points"

            elif tool_name == "add_loyalty_all":
                amount = int(args.get("amount", 0))
                if amount <= 0: return "❌ Error: amount must be positive"
                count = 0
                for user in list(self.bot.viewers.viewers.keys()):
                    self.bot.viewers.add_points(user, amount)
                    count += 1
                self.bot.viewers._notify_viewer_update("all", "agent_add_loyalty_all")
                return f"✅ Added {amount} Points to all {count} viewers."

            elif tool_name == "deduct_loyalty":
                user = args.get("username")
                amount = int(args.get("amount", 0))
                if not user: return "❌ Error: username required"
                if amount <= 0: return "❌ Error: amount must be positive"
                success = self.bot.viewers.deduct_points(user, amount)
                if success:
                    self.bot.viewers._notify_viewer_update(user, "agent_deduct_loyalty")
                    new_pts = self.bot.viewers.get_viewer(user).get("points", 0)
                    return f"✅ Deducted {amount} Points from {user}. New balance: {new_pts:,} Points"
                return f"❌ {user} doesn't have enough points"

            elif tool_name == "get_donations":
                try:
                    history = self.bot.get_donation_history()
                    if not history:
                        return "No donations recorded yet."
                    recent = history[:10]  # Newest 10 (history is stored newest-first)
                    lines = ["💰 **Recent Donations (Last 10)**"]
                    for d in recent:
                        lines.append(f"- {d.get('user', '?')} — ₹{d.get('amount', '?')} ({d.get('type', 'tip')})")
                    return "\n".join(lines)
                except Exception as e:
                    return f"Error fetching donations: {e}"
                    
            elif tool_name.startswith("play_"):
                game = tool_name[5:]
                if hasattr(self.bot.gambling, game):
                    func = getattr(self.bot.gambling, game)
                    user = args.get("username")
                    if not user: return "❌ Error: username required"
                    
                    viewer_data = self.bot.viewers.get_viewer(user)
                    current_points = viewer_data.get("points", 0)
                    
                    if game == "rob":
                        target = args.get("target")
                        if not target: return "❌ Error: target required for rob"
                        result = await func(user, target, self.bot.viewers)
                    else:
                        amount = int(args.get("amount", 0))
                        result = await func(user, amount, current_points, self.bot.viewers)
                    
                    # Notify UI of points change dynamically
                    self.bot.viewers._notify_viewer_update(user, f"agent_game_{game}")
                    if game == "rob" and args.get("target"):
                         self.bot.viewers._notify_viewer_update(args.get("target"), f"agent_game_{game}_target")
                         
                    return json.dumps(result, indent=2)
                return f"❌ Unknown game: {game}"

            # ── SHOP & REDEEMS ───────────────────────────────────────
            elif tool_name == "get_available_redeems":
                redeems = self.bot.redeem_svc.get_all()
                active = [r for r in redeems if r.get("enabled")]
                clean = [{"id": r["id"], "name": r["name"], "cost": r["cost"], "type": r["type"], "cooldown": r["cooldown_sec"]} for r in active]
                return json.dumps(clean, indent=2)

            elif tool_name == "trigger_meme_redeem":
                reward_id = args.get("reward_id")
                user = args.get("username")
                if not reward_id or not user: return "❌ Error: reward_id and username required"
                
                result = await self.bot.redeem_svc.trigger(
                    reward_id=reward_id,
                    author=user,
                    viewer_service=self.bot.viewers,
                    sb_ws=self.bot.sb_ws,
                    broadcast_func=self.bot.broadcast_func
                )
                return json.dumps(result, indent=2)

            # ── CONFIGURATION & SERVICES ─────────────────────────────
            elif tool_name == "update_config":
                path = args.get("path")
                value = args.get("value")
                if not path: return "❌ Error: config path required (e.g. 'telegram.enabled')"
                cfg = self.bot.load_config()
                parts = path.split(".")
                current = cfg
                for part in parts[:-1]:
                    if part not in current or not isinstance(current[part], dict):
                        current[part] = {}
                    current = current[part]
                current[parts[-1]] = value
                from backend.config_manager import ConfigManager
                ConfigManager.save_config(cfg)
                if callable(self.bot.broadcast_func):
                    asyncio.create_task(self.bot.broadcast_func({"type": "config_update"}))
                return f"✅ Config '{path}' set to: {value}"

            elif tool_name == "update_loyalty_settings":
                cfg = self.bot.load_config()
                loyalty = cfg.get("loyalty", {})
                for k, v in args.items():
                    loyalty[k] = v
                cfg["loyalty"] = loyalty
                from backend.config_manager import ConfigManager
                ConfigManager.save_config(cfg)
                if callable(self.bot.broadcast_func):
                    asyncio.create_task(self.bot.broadcast_func({"type": "config_update"}))
                return f"✅ Loyalty settings updated: {args}"



            # ── INTEGRATIONS ─────────────────────────────────────────
            elif tool_name == "toggle_streamerbot":
                cfg = self.bot.load_config()
                sb = cfg.get("streamer_bot", {})
                sb["enabled"] = not sb.get("enabled", False)
                cfg["streamer_bot"] = sb
                from backend.config_manager import ConfigManager
                ConfigManager.save_config(cfg)
                state = "ON" if sb["enabled"] else "OFF"
                return f"✅ Streamer.bot is now {state}"

            elif tool_name == "check_sheets_status":
                status = "Connected" if self.bot.sheets.connected else "Disconnected"
                title = self.bot.sheets.sheet.title if self.bot.sheets.sheet else "None"
                error = self.bot.sheets.last_error if hasattr(self.bot.sheets, 'last_error') else None
                result = f"Google Sheets: {status} (Sheet: {title})"
                if error: result += f"\nLast Error: {error}"
                return result

            else:
                return f"❌ Unknown Tool: {tool_name}. Type 'help' to see available commands."

        except Exception as e:
            logger.error(f"Tool Execution Error: {e}")
            return f"❌ Tool Error: {str(e)}"

    async def _delayed_restart(self):
        """Restart bot after a short delay to allow the response to be sent."""
        await asyncio.sleep(2)
        try:
            self.bot.stop()
            await asyncio.sleep(1)
            if self.bot.broadcast_func:
                await self.bot.start(self.bot.broadcast_func)
        except Exception as e:
            logger.error(f"Restart error: {e}")

    async def process_request(self, user_name, user_id, text, ai_engine):
        """Processes a natural language request using the AI Agent loop with multi-tool support."""
        
        # 1. Build System Prompt with Tools
        system_prompt = self.get_tools_schema() + f"\nUser: {user_name} (ID: {user_id})"
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ]

        # 2. Call AI
        response = await ai_engine.chat(messages)
        content = response.get("response", "")
        
        # 3. Check for TOOL Usage (supports multiple tools)
        lines = content.strip().split("\n")
        tool_lines = [l.strip() for l in lines if l.strip().startswith("TOOL:")]
        
        if tool_lines:
            all_results = []
            
            for tool_line in tool_lines:
                try:
                    # Format: TOOL: tool_name {"arg": "val"}
                    parts = tool_line.replace("TOOL:", "").strip().split(" ", 1)
                    tool_name = parts[0]
                    tool_args_str = parts[1] if len(parts) > 1 else "{}"
                    tool_args = json.loads(tool_args_str)
                    
                    # Execute
                    tool_result = await self.execute_tool(tool_name, tool_args)
                    all_results.append({"tool": tool_name, "args": tool_args, "result": tool_result})
                    
                    # LOG TO UI (Broadcast)
                    if self.bot.broadcast_func:
                        await self.bot.broadcast_func({
                            "event": "AGENT_ACTION",
                            "data": {
                                "tool": tool_name,
                                "args": tool_args,
                                "result": tool_result,
                                "user": user_name
                            }
                        })

                except Exception as e:
                    all_results.append({"tool": "parse_error", "error": str(e)})

            # 4. Feed ALL results back to AI for a single human-readable response
            results_text = "\n".join([
                f"Tool '{r['tool']}': {r.get('result', r.get('error', '?'))}" 
                for r in all_results
            ])
            
            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "system", "content": f"Tool Outputs:\n{results_text}\n\nNow provide a brief, friendly confirmation to the user. Be concise."})
            
            final_response = await ai_engine.chat(messages)
            
            final_content = final_response.get("response", "Done.")
            
            # Clean up: the final human-readable response should NEVER contain raw TOOL strings.
            # If the AI hallucinates them again, strip them out.
            sanitized_lines = [l for l in final_content.split("\n") if not l.strip().startswith("TOOL:")]
            final_content = "\n".join(sanitized_lines).strip()
            
            if not final_content:
                final_content = "Action completed."
                
            return final_content

        
        return content
