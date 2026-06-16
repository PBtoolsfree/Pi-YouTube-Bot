import time
import logging
import asyncio

logger = logging.getLogger(__name__)

class AIHandler:
    def __init__(self, ai_engine):
        self.ai = ai_engine
        self.last_ai_time = 0
        self.user_last_ai = {} # {username: timestamp}
        self.last_warning_time = {} # {username: timestamp}
        self.history = {} # {username: [{"role": "user", "content": "..."}]}
        self._last_cleanup = time.time()

    def _cleanup_memory(self, now):
        self._last_cleanup = now
        expired_users = [u for u, ts in self.user_last_ai.items() if now - ts > 3600]
        for u in expired_users:
            self.user_last_ai.pop(u, None)
            self.last_warning_time.pop(u, None)
            self.history.pop(u, None)
        if expired_users:
            logger.info(f"Cleaned up AI memory for {len(expired_users)} inactive users.")

    async def ensure_history(self, author, loader_func):
        """Populate history from external source if empty"""
        if author not in self.history or not self.history[author]:
            past = await loader_func(author)
            if past:
                # Convert to format expected by AI (role, content)
                # Ensure we don't duplicate if loader returns overlaps (unlikely if empty)
                self.history[author] = past
                logger.info(f"Restored {len(past)} msgs of history for {author}")

    async def process_ai(self, author, prompt, config, viewer_service, audio_service, log_ui_cb, send_chat_cb, trigger_action_cb=None, force_ai=False, live_context=None):
        try:
            cooldowns = config.get("cooldowns", {})
            now = time.time()
            
            if not force_ai:
                # Global Cooldown
                if now - self.last_ai_time < cooldowns.get("global", 15):
                    logger.info("Global Cooldown Active - Skipping AI")
                    return None

                # User Cooldown
                if now - self.user_last_ai.get(author, 0) < cooldowns.get("user", 60):
                    logger.info(f"User Cooldown Active for {author} - Skipping AI")
                    if now - self.last_warning_time.get(author, 0) > 30:
                        warn_msg = cooldowns.get("warning_message", "Slow down!")
                        await send_chat_cb(f"@{author} {warn_msg}")
                        self.last_warning_time[author] = now
                    return None

            if now - getattr(self, '_last_cleanup', 0) > 3600:
                self._cleanup_memory(now)

            old_last_ai = self.last_ai_time
            old_user_last_ai = self.user_last_ai.get(author, 0)

            # Update Timestamps
            self.last_ai_time = now
            self.user_last_ai[author] = now

            # Manage Memory
            if author not in self.history:
                self.history[author] = []
            
            # Add user message
            self.history[author].append({"role": "user", "content": prompt})
            
            # Trim History (Keep last 10 interactions, i.e., 20 messages)
            max_history = 20
            if len(self.history[author]) > max_history:
                 self.history[author] = self.history[author][-max_history:]
                 if self.history[author] and self.history[author][0]["role"] == "assistant":
                     self.history[author].pop(0)

            # Get AI Response
            viewer = viewer_service.get_viewer(author)
            rank = viewer_service.get_rank(viewer.get("points", 0))
            
            logger.info(f"Processing AI Prompt from {author}: {prompt}")
            
            # Inject Point System Rules into system prompt
            system_prompt = config.get("ai_topology", {}).get("system_prompt", "You are a helpful, hype moderator bot for a YouTube live stream. Your name is Pi Bot.")
            
            msg_lower = prompt.lower()
            if any(kw in msg_lower for kw in ["point", "rank", "rob", "give", "gamble", "slot", "game", "coin", "score", "level", "bowl", "bat", "cricket", "boss", "attack", "bet", "gambling", "shop", "redeem", "loot", "claim", "secret"]):
                loyalty_cfg = config.get("loyalty", {})
                ranks_list = loyalty_cfg.get("ranks", viewer_service.ranks if hasattr(viewer_service, 'ranks') else [])
                if ranks_list:
                    sorted_ranks = sorted(ranks_list, key=lambda x: int(x.get("min_points", 0)))
                    rank_tiers_str = " → ".join(f"{rnk.get('name')} ({rnk.get('emoji', '')})" for rnk in sorted_ranks)
                else:
                    rank_tiers_str = "Noob → Bronze → Silver → Gold → Diamond → GOD"

                system_prompt += f"""

## 🎮 FULL GAME & ECONOMY GUIDE (Pi Bot Channel)

### 💰 Points System
- Viewers earn Points by chatting in the stream.
- Rank tiers (lowest to highest): {rank_tiers_str}
- Points se games khel sakte ho, shop se rewards kharid sakte ho, aur dusron ko de bhi sakte ho.
- Command: `!points` — Apne points aur rank dekho.

### 🎰 Games Available:

**1. !gamble <amount>** — Double or Nothing
- 50/50 chance hai. Jeet gaye to double points milte hain, haare to sab jayenge.
- Example: `!gamble 500` — Jeetoge to 1000, haroge to 0.

**2. !slots <amount>** — Slot Machine
- 3 reels spin hote hain: 🍒🔔💎7️⃣🍋🍇
- Triple 7s = 10x JACKPOT! Triple 💎 = 5x! Triple koi bhi = 3x! Pair = 1.5x!
- Example: `!slots 200` — Agar triple 7s aaye to 2000 milenge!

**3. !rob <username>** — Points Chori Karo
- 40% chance ki chori successful hogi. 60% chance ki pakde jaoge aur fine lagega.
- Fine target ko milta hai as compensation. 60 second cooldown hai.
- Example: `!rob samzu_000` — Target ke 10% points chori karne ki koshish.

**4. !bowl <amount>** — Cricket: Bowling Challenge
- Ek challenge dete ho amount ke saath. 30 seconds tak koi bhi `!bat` karke accept kar sakta hai.
- Agar koi accept kare to 1v1 duel hoti hai — 50/50 chance, winner sab le jaata hai!
- Example: `!bowl 1000` — 1000 points ka challenge diya, koi bat karega?

**5. !bat [amount]** — Cricket: Batting
- Agar kisi ne `!bowl` kiya hai to bina amount ke `!bat` likho — 1v1 duel start!
- Solo play: `!bat 500` — Out (40%), Single/return (20%), Double/1.5x (20%), Four/2x (10%), SIX/3x (10%)
- Chakka maarne pe 3 guna points milte hain! 🚀

**6. !attack <amount>** — Boss Fight (Streamer Event)
- Streamer boss spawn karta hai (e.g., Thanos). Sab milke attack karte hain apne points laga ke.
- Boss ki HP 0 hone pe Top 3 attackers ko reward pool milta hai. Baaki sab ko 50 pts participation reward.
- Ye streamer-triggered event hai, randomly nahi aata.

### 🤝 Economy Commands:
- `!give <user> <amount>` — Apne points dusre ko do.
- `!top` / `!leaderboard` — Top 5 viewers by points.
- `!shop` / `!redeem <name>` — Points se rewards kharido (memes, OBS effects, etc.)
- `!claim` — Jab Loot Box drop ho tab pehle claim karo (100-1000 random points!)

### 🎁 Special Events (Auto-triggered):
- **Loot Box**: Random time pe bot loot box drop karta hai. `!claim` karo pehle!
- **Secret Word**: Bot secretly ek word choose karta hai. Chat mein guess karo aur 1000 points jeeto!
- **Rivalry**: Jab do viewers ka score close ho, bot announce karta hai competition.

IMPORTANT: Jab koi viewer game ke baare mein puche, to ENTHUSIASTICALLY aur DETAIL mein samjhao. Commands, rules, chances, examples — sab batao!"""
            
            # Inject Context
            if live_context and any(kw in msg_lower for kw in ["game", "play", "spec", "pc", "discord", "insta", "link", "about", "what"]):
                system_prompt += f"\n\nLive Stream Context: The streamer is currently live. Title: '{live_context.get('title')}'. Description: '{live_context.get('description')}'. Use this context to answer questions about the game being played, discord links, PC specs, or Instagram IDs if they are in the description."

            # Inject Viewer Lore/Stats
            points = viewer.get("points", 0)
            if prompt.lower().startswith("bot roast"):
                system_prompt += f"\n\nThe user {author} asked you to roast them or someone else. Make it funny, safe, and reference their point balance ({points}) and rank ({rank['name']})."
            elif prompt.lower().startswith("bot hype"):
                system_prompt += f"\n\nThe user {author} asked for hype. Give them a WWE-style intro using their rank ({rank['name']}) and points ({points})."
            else:
                system_prompt += f"\n\nViewer Info: The viewer asking this is {author} (Points: {points}, Rank: {rank['name']}). Be concise and engaging."
            
            # Pass full history to AI
            result = await self.ai.chat(self.history[author], system_prompt=system_prompt)
            
            logger.info(f"AI Result: {result}")
            raw_response = result.get("response")
            
            if raw_response:
                # ----------------------------------------------------
                # 4. Stream Control (Action Parsing)
                # ----------------------------------------------------
                import re
                clean_response = raw_response
                actions_triggered = []
                
                # Regex for <action name="scare" />
                for match in re.finditer(r'<action\s+name=["\'](.*?)["\']\s*/>', raw_response):
                    actions_triggered.append(match.group(1))
                    
                clean_response = re.sub(r'<action\s+name=["\'](.*?)["\']\s*/>', '', raw_response).strip()
                
                # Add AI response to memory (Clean version)
                self.history[author].append({"role": "assistant", "content": clean_response})
                
                # Double-check trim to ensure we don't grow indefinitely if logic changes
                if len(self.history[author]) > max_history:
                     self.history[author] = self.history[author][-max_history:]
                     if self.history[author] and self.history[author][0]["role"] == "assistant":
                         self.history[author].pop(0)

                prefix = f"[{rank['emoji']} {rank['name']}] "
                full_response = f"{prefix}To {author}: {clean_response}"
                
                # Log to UI
                await log_ui_cb("AI_RESPONSE", full_response, meta=result)
                
                # Speak
                if audio_service:
                    await audio_service.speak(clean_response, "public")
                
                # Send to Chat
                await send_chat_cb(full_response)
                
                # Trigger Action
                for act in actions_triggered:
                     logger.info(f"🤖 AI Triggering Action: {act}")
                     await log_ui_cb("AI_ACTION", f"AI evoked action: {act}")
                     if trigger_action_cb:
                         await trigger_action_cb(act)
                
                return clean_response
            else:
                self.last_ai_time = old_last_ai
                self.user_last_ai[author] = old_user_last_ai
                if self.history[author] and self.history[author][-1].get("role") == "user":
                    self.history[author].pop()
                await log_ui_cb("AI_ERROR", "Failed to generate response", meta=result)
                return None
                
        except Exception as e:
            logger.error(f"AI Processing Error: {e}")
            if 'old_last_ai' in locals():
                self.last_ai_time = old_last_ai
                self.user_last_ai[author] = old_user_last_ai
            if author in self.history and self.history[author] and self.history[author][-1].get("role") == "user":
                self.history[author].pop()
            return None

    def check_cooldowns_for_api(self, user, config, force_ai=False):
        """Used by the HTTP /chat endpoint which needs immediate return values."""
        now = time.time()
        cooldowns = config.get("cooldowns", {})
        
        if force_ai:
            return True, None

        global_cd = cooldowns.get("global", 15)
        if now - self.last_ai_time < global_cd:
            return False, "global_cooldown"
        
        user_cd = cooldowns.get("user", 60)
        if now - self.user_last_ai.get(user, 0) < user_cd:
            if now - self.last_warning_time.get(user, 0) > 10:
                warning_msg = cooldowns.get("warning_message", "")
                self.last_warning_time[user] = now
                return False, warning_msg
            return False, ""

        return True, None
