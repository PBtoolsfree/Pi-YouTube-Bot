import random
import logging
import os
import json
import time
import asyncio
from typing import Optional, Dict, Any, List, Union

# We will load the list of pokemons dynamically from a JSON file.
POKEMON_LIST_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "pokemon_list.json")
POKEMON_LIST = []

def load_pokemon_list():
    global POKEMON_LIST
    if os.path.exists(POKEMON_LIST_FILE):
        try:
            with open(POKEMON_LIST_FILE, "r") as f:
                POKEMON_LIST = json.load(f)
        except Exception as e:
            logging.error(f"Failed to load pokemon list JSON: {e}")
            
    if not POKEMON_LIST:
        # Default starter pokemons
        POKEMON_LIST = [
            {"name": "Pikachu", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/25.gif", "power": 10},
            {"name": "Charizard", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/6.gif", "power": 15},
            {"name": "Mewtwo", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/150.gif", "power": 20},
            {"name": "Gengar", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/94.gif", "power": 14},
            {"name": "Lucario", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/448.gif", "power": 13},
            {"name": "Bulbasaur", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/1.gif", "power": 8},
            {"name": "Squirtle", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/7.gif", "power": 8},
            {"name": "Snorlax", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/143.gif", "power": 12},
            {"name": "Dragonite", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/149.gif", "power": 16},
            {"name": "Eevee", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/133.gif", "power": 7},
        ]
        # Save default list to JSON for user to edit later
        os.makedirs(os.path.dirname(POKEMON_LIST_FILE), exist_ok=True)
        try:
            with open(POKEMON_LIST_FILE, "w") as f:
                json.dump(POKEMON_LIST, f, indent=4)
        except Exception as e:
            logging.error(f"Failed to create pokemon list JSON: {e}")

load_pokemon_list()

class PokemonService:
    def __init__(self, bot):
        self.bot = bot # Reference to BotService for broadcasting and accessing viewers
        self.logger = logging.getLogger(__name__)
        self.data_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "pokemons.json")
        self.users_data = {}
        self.active_wild_pokemon = None
        self.pending_battles = {} # challenger -> { target, bet, timeout_task }
        self.active_summoned = {} # user -> pokemon dict
        self.attack_cooldowns = {} # user -> last attack timestamp
        
        self.load_data()
        
        # Background task for periodic spawning
        self.spawn_task = None
        self._despawn_task = None
        self.target_spawn_time = 0
        self._was_live = False
        self._last_spawn_time = 0
        self.is_running = False

    def start(self):
        if self.spawn_task and not self.spawn_task.done():
            self.logger.info("PokemonService spawn loop is already active.")
            return
        self.is_running = True
        self.spawn_task = asyncio.create_task(self._spawn_loop())
        self.logger.info("PokemonService background spawn loop started.")

    def stop(self):
        self.is_running = False
        if self.spawn_task and not self.spawn_task.done():
            self.spawn_task.cancel()
        self.spawn_task = None
        if self._despawn_task and not self._despawn_task.done():
            self._despawn_task.cancel()
        self._despawn_task = None
        self.target_spawn_time = 0
        self.logger.info("PokemonService stopped.")

    def get_config(self) -> dict:
        """Returns the current pokemon configuration dictionary."""
        config = getattr(self.bot, "load_config", lambda: {})() if self.bot else {}
        loyalty = config.get("loyalty", {})
        games = loyalty.get("games", {}) or config.get("games", {})
        return games.get("pokemon", {})

    def _is_stream_live(self) -> bool:
        """Checks if stream is genuinely live via bot.is_stream_live property or fallback."""
        if hasattr(self.bot, "is_stream_live"):
            return bool(self.bot.is_stream_live)
        # Fallback if bot instance is mocked or lacks property:
        # Require explicit _remote_stream_live or is_stream_live_state; do NOT assume is_sb_connected means stream is live!
        cfg = getattr(self.bot, "load_config", lambda: {})() if self.bot else {}
        if cfg.get("stream_offline", False):
            return False
        return bool(getattr(self.bot, "_remote_stream_live", getattr(self.bot, "is_stream_live_state", False)))

    def load_data(self):
        try:
            os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
            if os.path.exists(self.data_file):
                with open(self.data_file, "r") as f:
                    self.users_data = json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to load pokemon data: {e}")

    def get_all_pokemons(self):
        return POKEMON_LIST
    
    def add_custom_pokemon(self, data):
        new_poke = {
            "name": data.get("name", "Unknown").strip(),
            "sprite": data.get("sprite", "").strip(),
            "power": int(data.get("power", 10)),
            "is_custom": True
        }
        
        # Check if exists and update it, else append
        exists = False
        for p in POKEMON_LIST:
            if p.get("name", "").lower() == new_poke["name"].lower():
                p["sprite"] = new_poke["sprite"]
                p["power"] = new_poke["power"]
                p["is_custom"] = True
                exists = True
                break
                
        if not exists:
            POKEMON_LIST.append(new_poke)
            
        self._save_pokemon_list()
        return True, "Pokémon saved successfully!"
        
    def delete_custom_pokemon(self, name):
        global POKEMON_LIST
        initial_len = len(POKEMON_LIST)
        POKEMON_LIST = [p for p in POKEMON_LIST if p.get("name", "").lower() != name.lower()]
        if len(POKEMON_LIST) < initial_len:
            self._save_pokemon_list()
            return True, "Pokémon deleted successfully!"
        return False, "Pokémon not found!"
        
    def _save_pokemon_list(self):
        try:
            with open(POKEMON_LIST_FILE, "w") as f:
                json.dump(POKEMON_LIST, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to save pokemon list: {e}")
            
    def save_data(self):
        try:
            with open(self.data_file, "w") as f:
                json.dump(self.users_data, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to save pokemon data: {e}")

    async def _spawn_loop(self):
        self.logger.info("PokemonService: _spawn_loop initialized.")
        while self.is_running:
            try:
                pokemon_config = self.get_config()
                
                # 1. Game Enabled check
                if not pokemon_config.get("enabled", True):
                    if self.target_spawn_time != 0:
                        self.logger.info("Pokemon Safari Adventure disabled in config. Spawning paused.")
                        self.target_spawn_time = 0
                    await asyncio.sleep(10)
                    continue
                    
                # 2. Live Status check
                is_live = self._is_stream_live()
                if not is_live:
                    if self._was_live:
                        self.logger.info("Live stream ended or disconnected. Pokemon spawning paused.")
                        self._was_live = False
                        self.target_spawn_time = 0
                    await asyncio.sleep(10)
                    continue

                # Parse configured spawn interval (minutes, default 15)
                try:
                    interval_min = int(pokemon_config.get("spawn_interval", 15))
                    if interval_min < 1:
                        interval_min = 1
                except (ValueError, TypeError):
                    interval_min = 15

                base_delay = interval_min * 60
                if base_delay < 60:
                    base_delay = 60

                # Stream just transitioned from offline to live
                if not self._was_live:
                    self._was_live = True
                    delay = base_delay
                    self.target_spawn_time = time.time() + delay
                    self.logger.info(
                        f"Stream is LIVE! Pokemon Safari active. Next automatic spawn in {delay / 60:.1f}m (due {time.strftime('%H:%M:%S', time.localtime(self.target_spawn_time))})."
                    )
                    await asyncio.sleep(delay)
                    continue

                # Initialize target time if missing
                if self.target_spawn_time == 0:
                    delay = base_delay
                    self.target_spawn_time = time.time() + delay
                    self.logger.info(f"Target spawn time set for in {delay / 60:.1f}m.")

                # 3. Check if due for spawn
                if time.time() >= self.target_spawn_time:
                    # Spawn if no wild pokemon is currently active
                    if self.active_wild_pokemon is None:
                        await self.spawn_wild_pokemon(force=False, is_test=False)
                    else:
                        self.logger.info("Active wild Pokemon already present; delaying next spawn cycle.")

                    # Calculate next spawn time exactly from the spawn moment
                    delay = base_delay
                    self.target_spawn_time = time.time() + delay
                    self.logger.info(
                        f"Next automatic Pokemon spawn scheduled in {delay / 60:.1f}m (due {time.strftime('%H:%M:%S', time.localtime(self.target_spawn_time))})."
                    )
                    await asyncio.sleep(delay)
                else:
                    sleep_time = min(10, max(1, self.target_spawn_time - time.time()))
                    await asyncio.sleep(sleep_time)

            except asyncio.CancelledError:
                self.logger.info("PokemonService: _spawn_loop cancelled.")
                break
            except Exception as e:
                self.logger.error(f"Unexpected error in Pokemon _spawn_loop: {e}", exc_info=True)
                await asyncio.sleep(5)

    async def spawn_wild_pokemon(self, force=False, is_test=False):
        cfg = self.get_config()
        if not force:
            if not cfg.get("enabled", True):
                return None
            if not self._is_stream_live():
                return None
            if self.active_wild_pokemon is not None:
                return None

        if not POKEMON_LIST:
            load_pokemon_list()
        if not POKEMON_LIST:
            self.logger.error("Pokemon list is empty!")
            return None

        # Cancel any active despawn task before setting up a new spawn
        if self._despawn_task and not self._despawn_task.done():
            self._despawn_task.cancel()

        pokemon = random.choice(POKEMON_LIST)
        enable_images = cfg.get("enable_images", cfg.get("images", True))
        enable_cries = cfg.get("enable_cries", cfg.get("cries", True))

        spawn_id = f"spawn_{int(time.time())}_{random.randint(1000, 9999)}"
        poke_data = {
            "id": spawn_id,
            "event_id": spawn_id,
            "name": pokemon["name"],
            "sprite": pokemon.get("sprite", ""),
            "power": pokemon.get("power", 10),
            "type": pokemon.get("type", "Normal"),
            "spawn_time": time.time(),
            "duration": 60,
            "expires_at": time.time() + 60,
            "is_test": is_test,
            "settings": {
                "images": enable_images,
                "cries": enable_cries
            }
        }
        self.active_wild_pokemon = {
            **poke_data,
            "pokemon": poke_data
        }
        self._last_spawn_time = time.time()

        self.logger.info(f"Wild {pokemon['name']} spawned! (ID: {spawn_id}, Test: {is_test}, Images: {enable_images}, Cries: {enable_cries})")

        # Broadcast spawn to overlays (both POKEMON_EVENT for Pi sync and pokemon_event for web overlays)
        if self.bot and getattr(self.bot, "broadcast_func", None):
            try:
                payload = {
                    "type": "POKEMON_EVENT",
                    "action": "spawn",
                    "pokemon": poke_data,
                    "is_test": is_test,
                    "remaining_seconds": 60,
                    "event_id": spawn_id
                }
                await self.bot.broadcast_func(payload)
                await self.bot.broadcast_func({**payload, "type": "pokemon_event"})
            except Exception as b_err:
                self.logger.error(f"Failed to broadcast Pokemon spawn: {b_err}")

        # Announce in YouTube chat only for genuine live spawns
        if not is_test and self.bot and hasattr(self.bot, "_send_chat"):
            try:
                await self.bot._send_chat(f"🚨 A wild {pokemon['name']} has appeared on stream! Type !catch to capture it!")
            except Exception as c_err:
                self.logger.error(f"Failed to send Pokemon spawn chat: {c_err}")

        # Auto-despawn timer
        async def _despawn_timer():
            try:
                await asyncio.sleep(60)
                await self._auto_despawn(spawn_id, is_test=is_test)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                self.logger.error(f"Error in auto_despawn task: {e}")

        self._despawn_task = asyncio.create_task(_despawn_timer())
        return self.active_wild_pokemon

    async def _auto_despawn(self, spawn_id: str, is_test: bool = False):
        if self.active_wild_pokemon and (self.active_wild_pokemon.get("id") == spawn_id or self.active_wild_pokemon.get("event_id") == spawn_id):
            despawned = self.active_wild_pokemon
            self.active_wild_pokemon = None
            self.logger.info(f"Wild {despawned['name']} (ID: {spawn_id}) despawned.")
            if self.bot and getattr(self.bot, "broadcast_func", None):
                payload = {
                    "type": "POKEMON_EVENT",
                    "action": "despawn",
                    "pokemon": despawned,
                    "is_test": is_test,
                    "event_id": spawn_id
                }
                await self.bot.broadcast_func(payload)
                await self.bot.broadcast_func({**payload, "type": "pokemon_event"})
            if not is_test and self.bot and hasattr(self.bot, "_send_chat"):
                await self.bot._send_chat(f"💨 The wild {despawned['name']} fled into the tall grass!")

    async def handle_catch(self, user):
        if not self.active_wild_pokemon:
            return f"@{user}, there is no wild Pokemon to catch right now!"

        # Block catching test spawns from mutating real user state
        if self.active_wild_pokemon.get("is_test"):
            return f"@{user}, that was a test spawn for the stream overlay! Test Pokemon cannot be caught."

        cfg = self.get_config()
        
        # 1. Catch Cost check
        try:
            catch_cost = int(cfg.get("catch_cost", 10))
        except (ValueError, TypeError):
            catch_cost = 10

        if catch_cost > 0 and self.bot and hasattr(self.bot, "viewers"):
            viewers_map = getattr(self.bot.viewers, "viewers", {})
            user_entry = viewers_map.get(user, {})
            user_pts = user_entry.get("points", 0)
            if user_pts < catch_cost:
                return f"@{user}, you need {catch_cost} points to attempt catching! (Your balance: {int(user_pts)} pts)"
            # Deduct points for the catch attempt
            if hasattr(self.bot.viewers, "deduct_points"):
                self.bot.viewers.deduct_points(user, catch_cost)
            elif hasattr(self.bot.viewers, "add_points"):
                self.bot.viewers.add_points(user, -catch_cost)
            else:
                user_entry["points"] = user_pts - catch_cost

        # 2. Catch Success Rate (RNG roll)
        try:
            catch_rate = int(cfg.get("catch_rate", 50))
            catch_rate = max(1, min(100, catch_rate))
        except (ValueError, TypeError):
            catch_rate = 50

        roll = random.randint(1, 100)
        pokemon = self.active_wild_pokemon

        if roll > catch_rate:
            # Catch failed — Pokemon breaks free but remains active for remaining time
            cost_msg = f" ({catch_cost} pts spent)" if catch_cost > 0 else ""
            return f"💨 Oh no @{user}! The wild {pokemon['name']} broke free from the Pokéball!{cost_msg} Try again!"

        # 3. Catch Succeeded!
        if self._despawn_task and not self._despawn_task.done():
            self._despawn_task.cancel()
        caught_pokemon = {
            "name": pokemon["name"],
            "power": pokemon.get("power", 10),
            "sprite": pokemon.get("sprite", ""),
            "type": pokemon.get("type", "Normal")
        }
        self.active_wild_pokemon = None

        if user not in self.users_data:
            self.users_data[user] = {"pokemons": [], "wins": 0, "losses": 0}

        user_data = self.users_data[user]
        user_data.setdefault("pokemons", []).append(caught_pokemon)
        self.save_data()

        # Keep viewer record in sync if available
        if self.bot and hasattr(self.bot, "viewers"):
            viewers_map = getattr(self.bot.viewers, "viewers", {})
            if user in viewers_map:
                viewers_map[user].setdefault("pokemons", []).append(caught_pokemon)

        # Broadcast catch to overlays
        if self.bot and getattr(self.bot, "broadcast_func", None):
            try:
                payload = {
                    "type": "POKEMON_EVENT",
                    "action": "catch",
                    "user": user,
                    "pokemon": caught_pokemon
                }
                await self.bot.broadcast_func(payload)
                await self.bot.broadcast_func({**payload, "type": "pokemon_event"})
            except Exception as b_err:
                self.logger.error(f"Failed to broadcast catch event: {b_err}")

        return f"🎉 @{user} caught the wild {caught_pokemon['name']}! Added to your Pokédex!"

    def get_status(self):
        pokemon_config = self.get_config()
        return {
            "enabled": bool(pokemon_config.get("enabled", True)),
            "images": bool(pokemon_config.get("images", True)),
            "cries": bool(pokemon_config.get("cries", True)),
            "scheduler_running": bool(self.spawn_task and not self.spawn_task.done()),
            "stream_live": self._is_stream_live(),
            "active_pokemon": self.active_wild_pokemon,
            "next_spawn_in_seconds": max(0, int(self.target_spawn_time - time.time())) if self.target_spawn_time > 0 else None,
            "spawn_interval_minutes": int(pokemon_config.get("spawn_interval", 15)),
            "catch_rate": int(pokemon_config.get("catch_rate", 50)),
            "catch_cost": int(pokemon_config.get("catch_cost", 10)),
            "duel_cost": int(pokemon_config.get("duel_cost", 50)),
            "duel_reward": int(pokemon_config.get("duel_reward", 100)),
            "pokedex_count": len(POKEMON_LIST)
        }

    async def handle_battle(self, challenger, target, bet=50):
        challenger_poke = self.get_user_pokemon(challenger)
        if not challenger_poke:
            challenger_poke = {"name": "Pikachu", "power": 55, "sprite": "https://play.pokemonshowdown.com/sprites/gen5/pikachu.png"}
        target_poke = self.get_user_pokemon(target)
        if not target_poke:
            target_poke = {"name": "Charizard", "power": 85, "sprite": "https://play.pokemonshowdown.com/sprites/gen5/charizard.png"}

        winner = challenger if challenger_poke.get("power", 10) >= target_poke.get("power", 10) else target
        loser = target if winner == challenger else challenger

        cfg = self.get_config()
        reward = int(cfg.get("duel_reward", 100))

        if self.bot and hasattr(self.bot, "viewers"):
            if hasattr(self.bot.viewers, "add_points"):
                self.bot.viewers.add_points(winner, reward)

        if self.bot and getattr(self.bot, "broadcast_func", None):
            payload = {
                "type": "POKEMON_EVENT",
                "action": "battle",
                "challenger": {"name": challenger, "pokemon": challenger_poke},
                "target": {"name": target, "pokemon": target_poke},
                "winner": winner,
                "bet": bet
            }
            await self.bot.broadcast_func(payload)
            await self.bot.broadcast_func({**payload, "type": "pokemon_event"})

        return f"⚔️ @{winner} won the battle against @{loser}!"

    @staticmethod
    def normalize_pokemon(entry) -> dict:
        """Safely normalizes either a legacy string entry or dict entry into a standard pokemon dict.
        Fills missing metadata from catalog without altering or losing existing attributes.
        """
        if not entry:
            return {"name": "Unknown", "power": 10, "sprite": "", "type": "Normal"}
        if isinstance(entry, str):
            name = entry.strip()
            found = next((p for p in POKEMON_LIST if p.get("name", "").lower() == name.lower()), None)
            if found:
                return {
                    "name": found["name"],
                    "power": int(found.get("power", 10)),
                    "sprite": found.get("sprite", ""),
                    "type": found.get("type", "Normal")
                }
            return {"name": name, "power": 10, "sprite": "", "type": "Normal"}
        elif isinstance(entry, dict):
            name = str(entry.get("name", "Unknown")).strip()
            found = next((p for p in POKEMON_LIST if p.get("name", "").lower() == name.lower()), None)
            base_pwr = found.get("power", 10) if found else 10
            base_sprite = found.get("sprite", "") if found else ""
            base_type = found.get("type", "Normal") if found else "Normal"

            try:
                pwr = int(entry.get("power", base_pwr))
            except (ValueError, TypeError):
                pwr = base_pwr

            res = {
                "name": entry.get("name") or (found.get("name") if found else name),
                "power": pwr,
                "sprite": entry.get("sprite") or base_sprite,
                "type": entry.get("type") or base_type
            }
            if entry.get("is_custom"):
                res["is_custom"] = True
            return res
        return {"name": str(entry), "power": 10, "sprite": "", "type": "Normal"}

    def get_user_inventory(self, user: str) -> list:
        """Retrieves and normalizes user's pokemon collection without mutating on-disk data."""
        user_data = self.users_data.get(user)
        if not user_data:
            for u, data in self.users_data.items():
                if u.lower() == user.lower():
                    user_data = data
                    break
        if not user_data and self.bot and hasattr(self.bot, "viewers"):
            viewers_map = getattr(self.bot.viewers, "viewers", {})
            user_data = viewers_map.get(user)
            if not user_data:
                for u, data in viewers_map.items():
                    if u.lower() == user.lower():
                        user_data = data
                        break
        if not user_data:
            return []

        raw_list = user_data.get("pokemons", [])
        if not raw_list and user_data.get("pokemon"):
            raw_list = [user_data["pokemon"]]
        return [self.normalize_pokemon(p) for p in raw_list]

    def get_active_pokemon(self, user: str) -> Optional[dict]:
        """Gets currently summoned active pokemon, or active_pokemon from users_data, or falls back to strongest owned."""
        for u, poke in self.active_summoned.items():
            if u.lower() == user.lower():
                return poke

        inv = self.get_user_inventory(user)
        if not inv:
            return None

        user_data = self.users_data.get(user, {})
        saved_active = user_data.get("active_pokemon")
        if saved_active:
            match = next((p for p in inv if p["name"].lower() == str(saved_active).lower()), None)
            if match:
                self.active_summoned[user] = match
                return match

        strongest = max(inv, key=lambda p: p.get("power", 0))
        return strongest

    async def handle_my_pokemon(self, user: str) -> str:
        """Formats caller's pokemon collection with count, duplicate display (e.g. Pikachu ×2), and stats."""
        inv = self.get_user_inventory(user)
        if not inv:
            return f"@{user}, you don't own any Pokémon yet! Wait for a wild spawn on stream and type !catch."

        counts = {}
        first_seen = {}
        for p in inv:
            name = p["name"]
            counts[name] = counts.get(name, 0) + 1
            if name not in first_seen:
                first_seen[name] = p

        formatted_items = []
        for name, count in counts.items():
            poke = first_seen[name]
            pwr = poke.get("power", 10)
            ptype = poke.get("type")
            type_str = f"/{ptype}" if ptype and ptype != "Normal" else ""
            if count > 1:
                formatted_items.append(f"{name} ×{count} (PWR {pwr}{type_str})")
            else:
                formatted_items.append(f"{name} (PWR {pwr}{type_str})")

        user_data = self.users_data.get(user, {})
        wins = user_data.get("wins", 0)
        losses = user_data.get("losses", 0)
        total_count = len(inv)

        active = self.get_active_pokemon(user)
        active_str = f" [Active: {active['name']}]" if active else ""

        items_str = ", ".join(formatted_items)
        if len(items_str) > 350:
            items_str = items_str[:347] + "..."

        return f"🎒 @{user}'s Pokémon ({total_count} total | {wins}W-{losses}L){active_str}: {items_str}. Commands: !summon <name> | !attack <@user>"

    async def handle_view_pokemon(self, caller: str, target: str) -> str:
        """Displays another viewer's public pokemon collection."""
        clean_target = target.replace("@", "").strip()
        if not clean_target or clean_target.lower() == caller.lower():
            return await self.handle_my_pokemon(caller)

        inv = self.get_user_inventory(clean_target)
        if not inv:
            return f"@{caller}, {clean_target} doesn't own any Pokémon yet!"

        counts = {}
        first_seen = {}
        for p in inv:
            name = p["name"]
            counts[name] = counts.get(name, 0) + 1
            if name not in first_seen:
                first_seen[name] = p

        formatted_items = []
        for name, count in counts.items():
            poke = first_seen[name]
            pwr = poke.get("power", 10)
            if count > 1:
                formatted_items.append(f"{name} ×{count} (PWR {pwr})")
            else:
                formatted_items.append(f"{name} (PWR {pwr})")

        user_data = self.users_data.get(clean_target, {})
        wins = user_data.get("wins", 0)
        losses = user_data.get("losses", 0)
        total_count = len(inv)

        active = self.get_active_pokemon(clean_target)
        active_str = f" [Active: {active['name']}]" if active else ""

        items_str = ", ".join(formatted_items)
        if len(items_str) > 350:
            items_str = items_str[:347] + "..."

        return f"🎒 @{clean_target}'s Pokémon ({total_count} total | {wins}W-{losses}L){active_str}: {items_str}"

    async def handle_summon(self, user: str, pokemon_name: str) -> str:
        """Allows a viewer to summon an owned Pokemon to be their active battle buddy on stream."""
        inv = self.get_user_inventory(user)
        if not inv:
            return f"@{user}, you don't have any Pokémon to summon! Wait for a wild spawn and type !catch."

        if not pokemon_name or not pokemon_name.strip():
            active = self.get_active_pokemon(user)
            if active:
                return f"@{user}, your active Pokémon is {active['name']} (PWR {active.get('power', 10)})! To switch, type: !summon <pokemon_name>"
            return f"@{user}, please specify which Pokémon to summon! e.g. !summon Pikachu. Use !mypokemon to see your collection."

        clean_name = pokemon_name.strip().lower()
        match = next((p for p in inv if p["name"].lower() == clean_name), None)
        if not match:
            match = next((p for p in inv if clean_name in p["name"].lower()), None)

        if not match:
            return f"@{user}, you don't own a Pokémon named '{pokemon_name}'! Type !mypokemon to view your collection."

        self.active_summoned[user] = match
        if user not in self.users_data:
            self.users_data[user] = {"pokemons": inv, "wins": 0, "losses": 0}
        self.users_data[user]["active_pokemon"] = match["name"]
        self.save_data()

        if self.bot and getattr(self.bot, "broadcast_func", None):
            try:
                payload = {
                    "type": "POKEMON_EVENT",
                    "action": "summon",
                    "user": user,
                    "pokemon": match
                }
                await self.bot.broadcast_func(payload)
                await self.bot.broadcast_func({**payload, "type": "pokemon_event"})
            except Exception as b_err:
                self.logger.error(f"Failed to broadcast summon event: {b_err}")

        ptype = match.get("type", "Normal")
        return f"⭐ @{user} summoned {match['name']}! (Power: {match['power']} | Type: {ptype}). Ready for action!"

    async def handle_attack(self, attacker: str, target_user: str) -> str:
        """Direct attack skirmish between viewer's active Pokemon and target viewer's Pokemon."""
        if not target_user:
            return f"@{attacker}, Usage: !attack @username"

        clean_target = target_user.replace("@", "").strip()
        if not clean_target:
            return f"@{attacker}, please specify an opponent! Usage: !attack @username"

        if clean_target.lower() == attacker.lower():
            return f"@{attacker}, you cannot attack yourself! Challenge another viewer."

        attacker_poke = self.get_active_pokemon(attacker)
        if not attacker_poke:
            return f"@{attacker}, you don't own any Pokémon to attack with! Catch one with !catch."

        target_poke = self.get_active_pokemon(clean_target)
        if not target_poke:
            return f"@{attacker}, {clean_target} doesn't own any Pokémon to battle!"

        now = time.time()
        last_attack = self.attack_cooldowns.get(attacker, 0)
        cooldown_duration = 30
        if now - last_attack < cooldown_duration:
            rem = int(cooldown_duration - (now - last_attack))
            return f"@{attacker}, your {attacker_poke['name']} is recovering! You can attack again in {rem}s."

        self.attack_cooldowns[attacker] = now

        att_pwr = attacker_poke.get("power", 10)
        def_pwr = target_poke.get("power", 10)

        power_diff = att_pwr - def_pwr
        win_chance = max(0.20, min(0.80, 0.50 + (power_diff * 0.02)))
        attacker_won = (random.random() < win_chance)

        winner = attacker if attacker_won else clean_target
        loser = clean_target if attacker_won else attacker
        winner_poke = attacker_poke if attacker_won else target_poke
        loser_poke = target_poke if attacker_won else attacker_poke

        if attacker not in self.users_data:
            self.users_data[attacker] = {"pokemons": self.get_user_inventory(attacker), "wins": 0, "losses": 0}
        if clean_target not in self.users_data:
            self.users_data[clean_target] = {"pokemons": self.get_user_inventory(clean_target), "wins": 0, "losses": 0}

        self.users_data[winner]["wins"] = self.users_data[winner].get("wins", 0) + 1
        self.users_data[loser]["losses"] = self.users_data[loser].get("losses", 0) + 1
        self.save_data()

        win_bonus = 25
        if self.bot and hasattr(self.bot, "viewers") and hasattr(self.bot.viewers, "add_points"):
            try:
                self.bot.viewers.add_points(winner, win_bonus)
            except Exception as pe:
                self.logger.warning(f"Failed to award attack points: {pe}")

        if self.bot and getattr(self.bot, "broadcast_func", None):
            try:
                payload = {
                    "type": "POKEMON_EVENT",
                    "action": "battle",
                    "challenger": {"name": attacker, "pokemon": attacker_poke},
                    "target": {"name": clean_target, "pokemon": target_poke},
                    "winner": winner,
                    "reward": win_bonus
                }
                await self.bot.broadcast_func(payload)
                await self.bot.broadcast_func({**payload, "type": "pokemon_event"})
            except Exception as b_err:
                self.logger.error(f"Failed to broadcast attack event: {b_err}")

        return f"⚔️ @{attacker}'s {attacker_poke['name']} (PWR {att_pwr}) attacked @{clean_target}'s {target_poke['name']} (PWR {def_pwr})! 🏆 @{winner} won! (+{win_bonus} pts)"

    async def handle_check_pokemon(self, user):
        return await self.handle_my_pokemon(user)

    def get_user_pokemon(self, user, pokemon_name=None):
        inv = self.get_user_inventory(user)
        if not inv:
            return None

        if pokemon_name:
            match = next((p for p in inv if p["name"].lower() == pokemon_name.strip().lower()), None)
            if not match:
                match = next((p for p in inv if pokemon_name.strip().lower() in p["name"].lower()), None)
            return match

        return self.get_active_pokemon(user)

    async def handle_show_pokemon(self, user, pokemon_name):
        pokemon = self.get_user_pokemon(user, pokemon_name)
        if not pokemon:
            return f"@{user}, you don't own a Pokemon named {pokemon_name}!"
            
        if self.bot and getattr(self.bot, "broadcast_func", None):
            await self.bot.broadcast_func({
                "type": "POKEMON_EVENT",
                "action": "show",
                "user": user,
                "pokemon": pokemon
            })
            await self.bot.broadcast_func({
                "type": "pokemon_event",
                "action": "show",
                "user": user,
                "pokemon": pokemon
            })
        return f"✨ @{user} is showing off their {pokemon['name']} on stream!"

    async def handle_battle_challenge(self, challenger, target, bet_amount, pokemon_name=None):
        if target == "random":
            valid_targets = [u for u, data in self.users_data.items() if u != challenger and (data.get("pokemons") or data.get("pokemon"))]
            if not valid_targets:
                return f"@{challenger}, nobody else has a Pokemon to battle right now!"
            active_chatters = getattr(self.bot, "session_chatters", {})
            active_valid = [u for u in valid_targets if u in active_chatters]
            target = random.choice(active_valid) if active_valid else random.choice(valid_targets)
            
        target = target.replace("@", "").strip()
        
        if challenger == target:
            return f"@{challenger}, you cannot battle yourself!"
            
        challenger_poke = self.get_user_pokemon(challenger, pokemon_name)
        if not challenger_poke:
            if pokemon_name:
                return f"@{challenger}, you don't own a Pokemon named {pokemon_name}!"
            else:
                return f"@{challenger}, you have multiple Pokemons! Please specify: !battle @user <bet> <pokemon_name>"
            
        # Target's pokemon doesn't need to be specified by challenger.
        # But we check if target has ANY pokemon
        target_poke_test = self.users_data.get(target, {}).get("pokemons", [])
        if not target_poke_test and not self.users_data.get(target, {}).get("pokemon"):
            return f"@{challenger}, {target} doesn't have any Pokemons to battle!"
            
        config = getattr(self.bot, "load_config", lambda: {})() if self.bot else {}
        pokemon_config = config.get("loyalty", {}).get("games", {}).get("pokemon", {})
        min_bet = int(pokemon_config.get("duel_cost", 50))

        try:
            bet_amount = int(bet_amount)
            if bet_amount < min_bet:
                return f"Bet amount must be at least {min_bet} points."
        except ValueError:
            return "Invalid bet amount."
            
        # Check balances
        challenger_bal = self.bot.viewers.get_viewer(challenger).get("points", 0)
        target_bal = self.bot.viewers.get_viewer(target).get("points", 0)
        
        if challenger_bal < bet_amount:
            return f"@{challenger}, you don't have enough points. (Bal: {int(challenger_bal)})"
        if target_bal < bet_amount:
            return f"@{challenger}, {target} doesn't have enough points to match the bet. (Bal: {int(target_bal)})"
            
        # Register pending battle
        if target in [b["target"] for b in self.pending_battles.values()]:
            return f"@{challenger}, {target} already has a pending battle challenge!"
            
        # Expire challenge in 60s
        async def expire_challenge():
            await asyncio.sleep(60)
            if challenger in self.pending_battles:
                del self.pending_battles[challenger]
                await self.bot._send_chat(f"@{challenger}, your battle challenge to {target} expired.")

        task = asyncio.create_task(expire_challenge())
        
        self.pending_battles[challenger] = {
            "target": target,
            "bet": bet_amount,
            "task": task,
            "challenger_poke": challenger_poke
        }
        
        return f"⚔️ @{target}, {challenger} challenged you using {challenger_poke['name']} for {bet_amount} points! Type !accept <pokemon_name> to fight!"

    async def handle_accept(self, target, pokemon_name=None):
        # Find who challenged this target
        challenger = None
        for ch, data in self.pending_battles.items():
            if data["target"] == target:
                challenger = ch
                break
                
        if not challenger:
            return f"@{target}, you don't have any pending battle challenges."
            
        battle_data = self.pending_battles.pop(challenger)
        battle_data["task"].cancel()
        
        bet = battle_data["bet"]
        
        # Verify balances again just in case
        challenger_bal = self.bot.viewers.get_viewer(challenger).get("points", 0)
        target_bal = self.bot.viewers.get_viewer(target).get("points", 0)
        
        if challenger_bal < bet or target_bal < bet:
            return f"Battle cancelled! Someone doesn't have enough points for the {bet} bet."
            
        target_poke = self.get_user_pokemon(target, pokemon_name)
        if not target_poke:
            if pokemon_name:
                return f"@{target}, you don't own a Pokemon named {pokemon_name}!"
            else:
                return f"@{target}, you have multiple Pokemons! Please specify: !accept <pokemon_name>"
                
        challenger_poke = battle_data["challenger_poke"]
        
        # RNG Battle resolution
        # Slight advantage if power is higher
        power_diff = challenger_poke["power"] - target_poke["power"]
        # Base 50% chance, +/- 2% per power diff, max 80% min 20%
        win_chance = 0.5 + (power_diff * 0.02)
        win_chance = max(0.2, min(0.8, win_chance))
        
        challenger_wins = random.random() < win_chance
        
        config = getattr(self.bot, "load_config", lambda: {})() if self.bot else {}
        pokemon_config = config.get("loyalty", {}).get("games", {}).get("pokemon", {})
        try:
            duel_reward = int(pokemon_config.get("duel_reward", 0))
        except (ValueError, TypeError):
            duel_reward = 0

        if challenger_wins:
            winner = challenger
            loser = target
            winner_poke = challenger_poke
            loser_poke = target_poke
            self.bot.viewers.update_viewer(winner, points=challenger_bal + bet + duel_reward)
            self.bot.viewers.update_viewer(loser, points=target_bal - bet)
            self.users_data[winner]["wins"] += 1
            self.users_data[loser]["losses"] += 1
        else:
            winner = target
            loser = challenger
            winner_poke = target_poke
            loser_poke = challenger_poke
            self.bot.viewers.update_viewer(winner, points=target_bal + bet + duel_reward)
            self.bot.viewers.update_viewer(loser, points=challenger_bal - bet)
            self.users_data[winner]["wins"] += 1
            self.users_data[loser]["losses"] += 1
            
        self.save_data()
        
        # Broadcast battle to overlays
        if self.bot and getattr(self.bot, "broadcast_func", None):
            try:
                await self.bot.broadcast_func({
                    "type": "POKEMON_EVENT",
                    "action": "battle",
                    "challenger": {"name": challenger, "pokemon": challenger_poke},
                    "target": {"name": target, "pokemon": target_poke},
                    "winner": winner,
                    "bet": bet,
                    "reward": duel_reward
                })
            except Exception as b_err:
                self.logger.error(f"Failed to broadcast battle event: {b_err}")
        
        bonus_msg = f" (+{duel_reward} bonus)" if duel_reward > 0 else ""
        return f"🏆 BATTLE RESULTS: @{winner}'s {winner_poke['name']} defeated @{loser}'s {loser_poke['name']} and won {bet}{bonus_msg} points!"


normalize_pokemon = PokemonService.normalize_pokemon
