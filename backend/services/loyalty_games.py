
import random
import logging
import os
import json
import time

class GambleService:
    def __init__(self, audio_service=None):
        self.audio = audio_service
        self.logger = logging.getLogger(__name__)
        self.history_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "gambling_history.json")
        self.active_challenge = None



    def _get_game_config(self, game_key, default_chance):
        from backend.config_manager import ConfigManager
        v = ConfigManager.get_config().get("loyalty", {}).get("games", {}).get(game_key, {}).get("win_chance", default_chance * 100)
        return v / 100.0

    def _is_game_enabled(self, game_key):
        from backend.config_manager import ConfigManager
        return ConfigManager.get_config().get("loyalty", {}).get("games", {}).get(game_key, {}).get("enabled", True)

    def _log_gamble(self, user, game_type, bet_amount, payout_amount, win):
        try:
            os.makedirs(os.path.dirname(self.history_file), exist_ok=True)
            history = []
            if os.path.exists(self.history_file):
                with open(self.history_file, "r") as f:
                    try:
                        loaded = json.load(f)
                        if isinstance(loaded, list):
                            history = loaded
                    except json.JSONDecodeError:
                        pass
            
            entry = {
                "user": user,
                "game": game_type,
                "bet": bet_amount,
                "payout": payout_amount,
                "net": payout_amount - bet_amount,
                "win": win,
                "timestamp": time.time()
            }
            history.insert(0, entry)
            if len(history) > 1000:
                history = history[:1000]
                
            with open(self.history_file, "w") as f:
                json.dump(history, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to log gamble history: {e}")

    def _log_economy_action(self, user, action_type, amount, target=None, win=None, payout=0):
        try:
            os.makedirs(os.path.dirname(self.history_file), exist_ok=True)
            history = []
            if os.path.exists(self.history_file):
                with open(self.history_file, "r") as f:
                    try:
                        loaded = json.load(f)
                        if isinstance(loaded, list):
                            history = loaded
                    except json.JSONDecodeError:
                        pass
            
            entry = {
                "user": user,
                "game": action_type,
                "amount": amount,
                "target": target,
                "win": win,
                "payout": payout,
                "timestamp": time.time()
            }
            history.insert(0, entry)
            if len(history) > 1000:
                history = history[:1000]
                
            with open(self.history_file, "w") as f:
                json.dump(history, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to log economy history: {e}")

    async def gamble(self, user, amount, current_points, viewer_service):
        """
        50/50 Roll for double or nothing.
        """
        if not self._is_game_enabled("gamble"):
            return {"success": False, "message": "The !gamble command is currently disabled by the streamer."}
            
        if amount <= 0:
            return {"success": False, "message": "Amount must be positive!"}
        
        if current_points < amount:
            return {"success": False, "message": f"Not enough points! You have {current_points}."}

        # 50% chance
        base_chance = self._get_game_config("gamble", 0.50)
        total_chance = base_chance
        
        win = random.random() < total_chance

        if win:
            new_balance = current_points + amount
            viewer_service.add_points(user, amount) # Adds the win amount on top of keeping the bet
            self._log_gamble(user, "gamble", amount, amount * 2, True)
            return {
                "success": True, 
                "message": f"🎰 WINNER! {user} rolled high and won {amount} points! Balance: {new_balance}",
                "win": True,
                "amount": amount
            }
        else:
            new_balance = current_points - amount
            viewer_service.deduct_points(user, amount)
            self._log_gamble(user, "gamble", amount, 0, False)
            return {
                "success": True, 
                "message": f"💸 {user} rolled low and lost {amount} points. Better luck next time! Balance: {new_balance}",
                "win": False,
                "amount": amount
            }

    async def slots(self, user, amount, current_points, viewer_service):
        """
        Slot machine with multiple multipliers.
        """
        if not self._is_game_enabled("slots"):
            return {"success": False, "message": "The !slots command is currently disabled by the streamer."}
            
        if amount <= 0:
            return {"success": False, "message": "Amount must be positive!"}
        
        if current_points < amount:
            return {"success": False, "message": f"Not enough points! You have {current_points}."}

        # Deduct cost first (standard slots mechanic)
        viewer_service.deduct_points(user, amount)

        emojis = ["🍒", "🔔", "💎", "7️⃣", "🍋", "🍇"]
        weights = [30, 25, 15, 10, 15, 5] # Probabilities (Total 100)
        
        # Roll 3 slots
        slot1 = random.choices(emojis, weights=weights, k=1)[0]
        slot2 = random.choices(emojis, weights=weights, k=1)[0]
        slot3 = random.choices(emojis, weights=weights, k=1)[0]
        
        result_display = f"| {slot1} | {slot2} | {slot3} |"
        
        winnings = 0
        message = ""
        
        # Win Logic
        if slot1 == slot2 == slot3:
            # Jackpot!
            if slot1 == "7️⃣":
                winnings = amount * 10
                message = f"JACKPOT!! 🚨🚨 {user} hit triple 7s! Won {winnings}!"
            elif slot1 == "💎":
                winnings = amount * 5
                message = f"DIAMONDS! 💎 {user} won {winnings}!"
            else:
                winnings = amount * 3
                message = f"TRIPLE! {user} won {winnings}!"
        elif slot1 == slot2 or slot2 == slot3 or slot1 == slot3:
            # Pair
            winnings = int(amount * 1.5)
            message = f"Nice pair! {user} won {winnings}!"
        else:
            message = f"No luck! {user} lost {amount}."

        # Payout
        if winnings > 0:
            viewer_service.add_points(user, winnings)
            final_balance = current_points - amount + winnings
            self._log_gamble(user, "slots", amount, winnings, True)
        else:
            final_balance = current_points - amount
            self._log_gamble(user, "slots", amount, 0, False)

        return {
            "success": True,
            "message": f"{result_display} {message} (Bal: {final_balance})",
            "slots": [slot1, slot2, slot3],
            "winnings": winnings
        }

    async def rob(self, user, target, viewer_service):
        """
        Attempt to rob points from another user.
        40% chance of success. 60% chance of failure (you get fined and target gets the fine).
        """
        if not self._is_game_enabled("rob"):
            return {"success": False, "message": "The !rob command is currently disabled by the streamer."}
            
        if user.lower() == target.lower():
            return {"success": False, "message": f"@{user} You can't rob yourself!"}

        target_data = viewer_service.get_viewer(target)
        user_data = viewer_service.get_viewer(user)
        
        target_points = target_data.get("points", 0)
        user_points = user_data.get("points", 0)
        
        if target_points < 10:
            return {"success": False, "message": f"@{user} {target} has almost no points. Leave them alone!"}
            
        rob_amount = max(10, int(target_points * 0.10))
        
        if user_points < rob_amount:
            return {"success": False, "message": f"@{user} You need at least {rob_amount} points as collateral to rob {target}!"}

        # 40% win
        base_chance = self._get_game_config("rob", 0.40)
        total_chance = base_chance

        win = random.random() < total_chance
        
        if win:
            viewer_service.deduct_points(target, rob_amount)
            viewer_service.add_points(user, rob_amount)
            self._log_economy_action(user, "rob", rob_amount, target=target, win=True, payout=rob_amount)
            return {
                "success": True, 
                "message": f"🥷 SUCCESS! @{user} sneaked past security and successfully robbed {rob_amount} points from {target}!",
                "win": True,
                "amount": rob_amount
            }
        else:
            viewer_service.deduct_points(user, rob_amount)
            viewer_service.add_points(target, rob_amount)  # Target gets the fine as compensation
            self._log_economy_action(user, "rob", rob_amount, target=target, win=False, payout=0)
            return {
                "success": True, 
                "message": f"🚨 BUSTED! @{user} tried to rob {target} but got caught! They had to pay a fine of {rob_amount} points to {target}.",
                "win": False,
                "amount": rob_amount
            }

    async def bowl(self, user, amount, current_points, viewer_service):
        if not self._is_game_enabled("bowl"):
            return {"success": False, "message": "The !bowl command is currently disabled."}
            
        if amount <= 0:
            return {"success": False, "message": "Amount must be positive!"}
            
        if current_points < amount:
            return {"success": False, "message": f"Not enough points! You have {current_points}."}

        # Check if already a challenge active
        now = time.time()
        if self.active_challenge and (now - self.active_challenge["timestamp"] < 30):
            return {"success": False, "message": f"Wait! @{self.active_challenge['challenger']} already has an active challenge."}

        # Set challenge
        self.active_challenge = {
            "challenger": user,
            "amount": amount,
            "timestamp": now
        }
        
        # Public audio announcement
        # if self.audio:
        #     await self.audio.speak(f"{user} ne {amount} points ka khula challenge diya hai! Kisme hai dum batting karne ka?", "public")
            
        return {"success": True, "message": f"🏏 @{user} has bowled a {amount} points delivery! First person to type !bat faces it! (30s limit)"}

    async def bat(self, user, amount, current_points, viewer_service):
        if not self._is_game_enabled("bat"):
            return {"success": False, "message": "The !bat command is currently disabled."}
            
        now = time.time()
        
        # Check if intercepting a challenge
        if self.active_challenge and (now - self.active_challenge["timestamp"] <= 30):
            challenger = self.active_challenge["challenger"]
            challenge_amount = self.active_challenge["amount"]
            
            if user.lower() == challenger.lower():
                return {"success": False, "message": "You cannot bat your own ball!"}
                
            if current_points < challenge_amount:
                return {"success": False, "message": f"You need {challenge_amount} points to face this delivery!"}
                
            # Accept challenge
            self.active_challenge = None
            
            # Roll for 1v1 (50/50 chance)
            win = random.random() < 0.50
            if win:
                viewer_service.deduct_points(challenger, challenge_amount)
                viewer_service.add_points(user, challenge_amount)
                msg = f"💥 @{user} smashed @{challenger}'s delivery for a SIX! Won {challenge_amount} points!"
                # if self.audio:
                #     await self.audio.speak(f"Wah! {user} ne chakka maar kar {challenger} ke points jeet liye!", "public")
                self._log_economy_action(user, "bat_duel", challenge_amount, target=challenger, win=True, payout=challenge_amount)
            else:
                viewer_service.deduct_points(user, challenge_amount)
                viewer_service.add_points(challenger, challenge_amount)
                msg = f"🎯 CLEAN BOWLED! @{challenger} knocked out @{user}! {challenger} wins {challenge_amount} points!"
                # if self.audio:
                #     await self.audio.speak(f"Oh ho! {user} clean bowled ho gaya, {challenger} jeet gaya!", "public")
                self._log_economy_action(user, "bat_duel", challenge_amount, target=challenger, win=False, payout=0)
                
            return {"success": True, "message": msg}
            
        # No active challenge, play solo game
        if amount is None or amount <= 0:
            return {"success": False, "message": "Usage: !bat <amount> (if not responding to a !bowl challenge)"}
            
        if current_points < amount:
            return {"success": False, "message": f"Not enough points! You have {current_points}."}
            
        # Deduct cost
        viewer_service.deduct_points(user, amount)
        
        # Roll probabilities for solo: 30% Out, 30% 1 run, 20% 2 runs, 10% 4 runs, 10% 6 runs
        outcomes = ["out", "1", "2", "4", "6"]
        weights = [40, 20, 20, 10, 10]
        result = random.choices(outcomes, weights=weights, k=1)[0]
        
        winnings = 0
        audio_msg = ""
        chat_msg = ""
        
        if result == "out":
            winnings = 0
            audio_msg = f"{user} hawa mein shot khel kar catch out ho gaya! {amount} points gaye."
            chat_msg = f"☝️ CATCH OUT! @{user} lost {amount} points."
        elif result == "1":
            winnings = amount
            audio_msg = f"{user} ne halke se khel kar single liya."
            chat_msg = f"🏏 @{user} took a single. Returned {amount} points."
        elif result == "2":
            winnings = int(amount * 1.5)
            audio_msg = f"{user} ne gap mein khel kar double run churaye!"
            chat_msg = f"🏃 @{user} ran hard for a double! Won {winnings} points."
        elif result == "4":
            winnings = amount * 2
            audio_msg = f"Shandar shot! {user} ke bat se nikla chouka! Dogune points jeete."
            chat_msg = f"✨ FOUR! @{user} hit a boundary! Won {winnings} points."
        elif result == "6":
            winnings = amount * 3
            audio_msg = f"Ball maidan ke bahar! {user} ne maara lamba chakka! Teen gune points jeete."
            chat_msg = f"🚀 SIX! @{user} hit it out of the park! Won {winnings} points."
            
        if winnings > 0:
            viewer_service.add_points(user, winnings)
            self._log_gamble(user, "bat", amount, winnings, True)
        else:
            self._log_gamble(user, "bat", amount, 0, False)
            
        # if self.audio:
        #     await self.audio.speak(audio_msg, "public")
            
        return {"success": True, "message": f"{chat_msg} (Bal: {current_points - amount + winnings})"}

class BossFightService:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.active = False
        self.max_hp = 0
        self.current_hp = 0
        self.participants = {} # user -> damage
        self.boss_type = ""
        self.history_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "gambling_history.json")

    def _log_economy_action(self, user, action_type, amount, target=None, win=None, payout=0):
        try:
            os.makedirs(os.path.dirname(self.history_file), exist_ok=True)
            history = []
            if os.path.exists(self.history_file):
                with open(self.history_file, "r") as f:
                    try:
                        loaded = json.load(f)
                        if isinstance(loaded, list):
                            history = loaded
                    except json.JSONDecodeError:
                        pass
            
            entry = {
                "user": user,
                "game": action_type,
                "amount": amount,
                "target": target,
                "win": win,
                "payout": payout,
                "timestamp": time.time()
            }
            history.insert(0, entry)
            if len(history) > 1000:
                history = history[:1000]
                
            with open(self.history_file, "w") as f:
                json.dump(history, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to log economy history: {e}")

    def spawn_boss(self, hp, boss_type="thanos"):
        self.active = True
        self.max_hp = hp
        self.current_hp = hp
        self.participants = {}
        self.boss_type = boss_type
        return {"success": True, "message": f"🚨 A Boss ({self.boss_type.capitalize()}) with {self.max_hp} HP has appeared! Use !attack <amount> to fight it!"}

    def attack_boss(self, user, amount, current_points, viewer_service):
        if not self.active:
            return {"success": False, "message": "There is no active boss right now!"}
        
        if amount <= 0:
            return {"success": False, "message": "Amount must be positive!"}
        
        if current_points < amount:
            return {"success": False, "message": f"Not enough points! You have {current_points}."}
        
        # Deduct points
        viewer_service.deduct_points(user, amount)
        
        # Cap damage to current HP so users don't overkill for extra rank, but they still spend the full amount
        actual_damage = min(amount, self.current_hp)
        self.current_hp -= actual_damage
        
        if user not in self.participants:
            self.participants[user] = 0
            
        self.participants[user] += actual_damage
        
        # Log to gambling history for UI
        self._log_economy_action(user, "boss_fight", amount, target=f"Damage: {actual_damage}", win=True, payout=0)
        
        defeated = self.current_hp <= 0
        
        return {
            "success": True,
            "actual_damage": actual_damage,
            "points_spent": amount,
            "current_hp": self.current_hp,
            "defeated": defeated
        }

    def process_rewards(self, viewer_service):
        if self.current_hp > 0:
            return None # Not defeated yet
            
        self.active = False
        sorted_attackers = sorted(self.participants.items(), key=lambda x: x[1], reverse=True)
        
        if not sorted_attackers:
            return {"top_rewards": [], "others_count": 0, "others_reward": 0}
            
        top_3 = sorted_attackers[:3]
        others = sorted_attackers[3:]
        
        reward_pool = self.max_hp
        
        # Give others 50 points participation reward
        others_reward = 50
        others_cost = len(others) * others_reward
        
        for user, dmg in others:
            viewer_service.add_points(user, others_reward)
            
        # Distribute remaining pool to top 3
        remaining_pool = reward_pool - others_cost
        
        # Ensure top 3 get a minimum pool if there were too many participants
        if remaining_pool < 300: 
            remaining_pool = max(reward_pool, 300) 
            
        top_rewards = []
        if len(top_3) == 1:
            viewer_service.add_points(top_3[0][0], remaining_pool)
            top_rewards.append((top_3[0][0], remaining_pool))
        elif len(top_3) == 2:
            r1 = int(remaining_pool * 0.6)
            r2 = remaining_pool - r1
            viewer_service.add_points(top_3[0][0], r1)
            viewer_service.add_points(top_3[1][0], r2)
            top_rewards.append((top_3[0][0], r1))
            top_rewards.append((top_3[1][0], r2))
        elif len(top_3) >= 3:
            r1 = int(remaining_pool * 0.5)
            r2 = int(remaining_pool * 0.3)
            r3 = remaining_pool - r1 - r2
            viewer_service.add_points(top_3[0][0], r1)
            viewer_service.add_points(top_3[1][0], r2)
            viewer_service.add_points(top_3[2][0], r3)
            top_rewards.append((top_3[0][0], r1))
            top_rewards.append((top_3[1][0], r2))
            top_rewards.append((top_3[2][0], r3))
            
        return {
            "top_rewards": top_rewards,
            "others_count": len(others),
            "others_reward": others_reward
        }
