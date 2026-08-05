import random
import logging
import os
import json
import time
import asyncio

# A small list of starter pokemons. We can expand this later.
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

class PokemonService:
    def __init__(self, bot):
        self.bot = bot # Reference to BotService for broadcasting and accessing viewers
        self.logger = logging.getLogger(__name__)
        self.data_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "pokemons.json")
        self.users_data = {}
        self.active_wild_pokemon = None
        self.pending_battles = {} # challenger -> { target, bet, timeout_task }
        
        self.load_data()
        
        # Start background task to spawn pokemons periodically
        self.spawn_task = asyncio.create_task(self._spawn_loop())
        
    def load_data(self):
        try:
            os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
            if os.path.exists(self.data_file):
                with open(self.data_file, "r") as f:
                    self.users_data = json.load(f)
        except Exception as e:
            self.logger.error(f"Failed to load pokemon data: {e}")
            
    def save_data(self):
        try:
            with open(self.data_file, "w") as f:
                json.dump(self.users_data, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to save pokemon data: {e}")

    async def _spawn_loop(self):
        while True:
            # Spawn every 10-20 minutes
            delay = random.randint(600, 1200)
            await asyncio.sleep(delay)
            await self.spawn_wild_pokemon()

    async def spawn_wild_pokemon(self):
        if self.active_wild_pokemon is not None:
            return # Already one spawned

        pokemon = random.choice(POKEMON_LIST)
        self.active_wild_pokemon = {
            "name": pokemon["name"],
            "sprite": pokemon["sprite"],
            "spawn_time": time.time()
        }
        
        self.logger.info(f"A wild {pokemon['name']} appeared!")
        
        # Broadcast spawn to overlays
        if self.bot.broadcast_func:
            await self.bot.broadcast_func({
                "type": "POKEMON_EVENT",
                "action": "spawn",
                "pokemon": self.active_wild_pokemon
            })
        
        # Announce in chat
        await self.bot.send_chat_message(f"🚨 A wild {pokemon['name']} has appeared on stream! Type !catch to capture it!")

    async def handle_catch(self, user):
        if not self.active_wild_pokemon:
            return f"@{user}, there is no wild Pokemon to catch right now!"
            
        pokemon = self.active_wild_pokemon
        self.active_wild_pokemon = None # Caught!
        
        # Initialize user if not exists
        if user not in self.users_data:
            self.users_data[user] = {"pokemon": None, "wins": 0, "losses": 0}
            
        old_pokemon = self.users_data[user].get("pokemon")
        self.users_data[user]["pokemon"] = pokemon["name"]
        self.save_data()
        
        # Broadcast catch to overlays
        if self.bot.broadcast_func:
            await self.bot.broadcast_func({
                "type": "POKEMON_EVENT",
                "action": "catch",
                "user": user,
                "pokemon": pokemon
            })
        
        if old_pokemon:
            return f"🎉 @{user} caught the wild {pokemon['name']}! (Replaced their {old_pokemon})"
        return f"🎉 @{user} caught their first Pokemon: {pokemon['name']}! Use '!battle @user <bet>' to fight others!"

    def get_user_pokemon(self, user):
        user_data = self.users_data.get(user)
        if not user_data or not user_data.get("pokemon"):
            return None
        poke_name = user_data["pokemon"]
        return next((p for p in POKEMON_LIST if p["name"] == poke_name), None)

    async def handle_battle_challenge(self, challenger, target, bet_amount):
        target = target.replace("@", "").strip()
        
        if challenger == target:
            return f"@{challenger}, you cannot battle yourself!"
            
        challenger_poke = self.get_user_pokemon(challenger)
        if not challenger_poke:
            return f"@{challenger}, you don't have a Pokemon! Wait for one to spawn and !catch it."
            
        target_poke = self.get_user_pokemon(target)
        if not target_poke:
            return f"@{challenger}, {target} doesn't have a Pokemon to battle!"
            
        try:
            bet_amount = int(bet_amount)
            if bet_amount < 1:
                return "Bet amount must be at least 1."
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
                await self.bot.send_chat_message(f"@{challenger}, your battle challenge to {target} expired.")

        task = asyncio.create_task(expire_challenge())
        
        self.pending_battles[challenger] = {
            "target": target,
            "bet": bet_amount,
            "task": task
        }
        
        return f"⚔️ @{target}, {challenger} has challenged your {target_poke['name']} to a battle for {bet_amount} points! Type !accept to fight!"

    async def handle_accept(self, target):
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
            
        challenger_poke = self.get_user_pokemon(challenger)
        target_poke = self.get_user_pokemon(target)
        
        # RNG Battle resolution
        # Slight advantage if power is higher
        power_diff = challenger_poke["power"] - target_poke["power"]
        # Base 50% chance, +/- 2% per power diff, max 80% min 20%
        win_chance = 0.5 + (power_diff * 0.02)
        win_chance = max(0.2, min(0.8, win_chance))
        
        challenger_wins = random.random() < win_chance
        
        if challenger_wins:
            winner = challenger
            loser = target
            winner_poke = challenger_poke
            loser_poke = target_poke
            self.bot.viewers.update_viewer(winner, points=challenger_bal + bet)
            self.bot.viewers.update_viewer(loser, points=target_bal - bet)
            self.users_data[winner]["wins"] += 1
            self.users_data[loser]["losses"] += 1
        else:
            winner = target
            loser = challenger
            winner_poke = target_poke
            loser_poke = challenger_poke
            self.bot.viewers.update_viewer(winner, points=target_bal + bet)
            self.bot.viewers.update_viewer(loser, points=challenger_bal - bet)
            self.users_data[winner]["wins"] += 1
            self.users_data[loser]["losses"] += 1
            
        self.save_data()
        
        # Broadcast battle to overlays
        if self.bot.broadcast_func:
            await self.bot.broadcast_func({
                "type": "POKEMON_EVENT",
                "action": "battle",
                "challenger": {"name": challenger, "pokemon": challenger_poke},
                "target": {"name": target, "pokemon": target_poke},
                "winner": winner,
                "bet": bet
            })
        
        return f"🏆 BATTLE RESULTS: @{winner}'s {winner_poke['name']} defeated @{loser}'s {loser_poke['name']} and won {bet} points!"
