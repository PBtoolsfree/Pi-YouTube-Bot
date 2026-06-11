import asyncio
import sys
import os

# Add the project root to sys.path so backend imports work
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

from backend.bot_service import BotService

async def test_trending():
    bot = BotService()
    
    print("Fetching trending gaming videos...")
    try:
        msg = await bot.youtube_api.fetch_trending_gaming()
        print("\n--- Result ---\n")
        print(msg)
        print("\n--------------\n")
        
        pass
             
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_trending())
