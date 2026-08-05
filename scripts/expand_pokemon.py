import re
import os

extra_pokes = [
    (2, "Ivysaur", 11), (3, "Venusaur", 16),
    (4, "Charmander", 8), (5, "Charmeleon", 11), 
    (8, "Wartortle", 11), (9, "Blastoise", 16),
    (10, "Caterpie", 3), (11, "Metapod", 4), (12, "Butterfree", 10),
    (13, "Weedle", 3), (14, "Kakuna", 4), (15, "Beedrill", 10),
    (16, "Pidgey", 4), (17, "Pidgeotto", 9), (18, "Pidgeot", 14),
    (19, "Rattata", 4), (20, "Raticate", 10),
    (21, "Spearow", 4), (22, "Fearow", 11),
    (23, "Ekans", 5), (24, "Arbok", 12),
    (26, "Raichu", 14),
    (27, "Sandshrew", 6), (28, "Sandslash", 12),
    (29, "Nidoran F", 5), (30, "Nidorina", 9), (31, "Nidoqueen", 16),
    (32, "Nidoran M", 5), (33, "Nidorino", 9), (34, "Nidoking", 16),
    (35, "Clefairy", 6), (36, "Clefable", 13),
    (37, "Vulpix", 6), (38, "Ninetales", 14),
    (39, "Jigglypuff", 5), (40, "Wigglytuff", 12),
    (41, "Zubat", 4), (42, "Golbat", 11),
    (43, "Oddish", 5), (44, "Gloom", 9), (45, "Vileplume", 14),
    (46, "Paras", 5), (47, "Parasect", 11),
    (48, "Venonat", 5), (49, "Venomoth", 12),
    (50, "Diglett", 4), (51, "Dugtrio", 11),
    (52, "Meowth", 5), (53, "Persian", 12),
    (54, "Psyduck", 6), (55, "Golduck", 13),
    (56, "Mankey", 6), (57, "Primeape", 13),
    (58, "Growlithe", 7), (59, "Arcanine", 16),
    (60, "Poliwag", 5), (61, "Poliwhirl", 10), (62, "Poliwrath", 15),
    (63, "Abra", 6), (64, "Kadabra", 11), (65, "Alakazam", 16),
    (66, "Machop", 7), (67, "Machoke", 12), (68, "Machamp", 17),
    (69, "Bellsprout", 5), (70, "Weepinbell", 9), (71, "Victreebel", 15),
    (72, "Tentacool", 6), (73, "Tentacruel", 13),
    (74, "Geodude", 6), (75, "Graveler", 10), (76, "Golem", 15),
    (77, "Ponyta", 7), (78, "Rapidash", 13),
    (79, "Slowpoke", 5), (80, "Slowbro", 13),
    (81, "Magnemite", 6), (82, "Magneton", 13),
    (83, "Farfetch'd", 8),
    (84, "Doduo", 6), (85, "Dodrio", 12),
    (86, "Seel", 6), (87, "Dewgong", 12),
    (88, "Grimer", 6), (89, "Muk", 13),
    (90, "Shellder", 6), (91, "Cloyster", 14),
    (92, "Gastly", 6), (93, "Haunter", 11),
    (95, "Onix", 9),
    (96, "Drowzee", 6), (97, "Hypno", 13),
    (98, "Krabby", 6), (99, "Kingler", 13),
    (100, "Voltorb", 6), (101, "Electrode", 12),
    (102, "Exeggcute", 6), (103, "Exeggutor", 15),
    (104, "Cubone", 6), (105, "Marowak", 11),
    (106, "Hitmonlee", 13), (107, "Hitmonchan", 13),
    (108, "Lickitung", 9),
    (109, "Koffing", 6), (110, "Weezing", 13),
    (111, "Rhyhorn", 7), (112, "Rhydon", 14),
    (113, "Chansey", 10),
    (114, "Tangela", 9),
    (115, "Kangaskhan", 13),
    (116, "Horsea", 5), (117, "Seadra", 11),
    (118, "Goldeen", 5), (119, "Seaking", 11),
    (120, "Staryu", 6), (121, "Starmie", 14),
    (122, "Mr. Mime", 11),
    (123, "Scyther", 13),
    (124, "Jynx", 12),
    (125, "Electabuzz", 13),
    (126, "Magmar", 13),
    (127, "Pinsir", 13),
    (128, "Tauros", 13),
    (129, "Magikarp", 1), (130, "Gyarados", 16),
    (131, "Lapras", 15),
    (132, "Ditto", 5),
    (134, "Vaporeon", 14), (135, "Jolteon", 14), (136, "Flareon", 14),
    (137, "Porygon", 9),
    (138, "Omanyte", 7), (139, "Omastar", 13),
    (140, "Kabuto", 7), (141, "Kabutops", 13),
    (142, "Aerodactyl", 14),
    (144, "Articuno", 18), (145, "Zapdos", 18), (146, "Moltres", 18),
    (147, "Dratini", 6), (148, "Dragonair", 11),
    (151, "Mew", 18)
]

with open(r'd:\bot\pi-youtube-bot\bot-cloud\backend\services\pokemon_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_list_str = "POKEMON_LIST = [\n"
for idx, name, power in extra_pokes:
    new_list_str += f'    {{"name": "{name}", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/{idx}.gif", "power": {power}}},\n'
new_list_str += "    # Existing base pokemons are also included here\n"
new_list_str += '    {"name": "Pikachu", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/25.gif", "power": 10},\n'
new_list_str += '    {"name": "Charizard", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/6.gif", "power": 15},\n'
new_list_str += '    {"name": "Mewtwo", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/150.gif", "power": 20},\n'
new_list_str += '    {"name": "Gengar", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/94.gif", "power": 14},\n'
new_list_str += '    {"name": "Lucario", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/448.gif", "power": 13},\n'
new_list_str += '    {"name": "Bulbasaur", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/1.gif", "power": 8},\n'
new_list_str += '    {"name": "Squirtle", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/7.gif", "power": 8},\n'
new_list_str += '    {"name": "Snorlax", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/143.gif", "power": 12},\n'
new_list_str += '    {"name": "Dragonite", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/149.gif", "power": 16},\n'
new_list_str += '    {"name": "Eevee", "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/133.gif", "power": 7},\n'
new_list_str += "]"

# Replace POKEMON_LIST
content = re.sub(r"POKEMON_LIST\s*=\s*\[.*?\]", new_list_str, content, flags=re.DOTALL)

# Replace send_chat_message with _send_chat
content = content.replace("self.bot.send_chat_message", "self.bot._send_chat")

with open(r'd:\bot\pi-youtube-bot\bot-cloud\backend\services\pokemon_service.py', 'w', encoding='utf-8') as f:
    f.write(content)
