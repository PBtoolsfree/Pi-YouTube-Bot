import asyncio
from fastapi import FastAPI
import uvicorn
import websockets

app = FastAPI()

async def test_client():
    try:
        async with websockets.connect("ws://127.0.0.1:8002/invalid_ws") as ws:
            print("Connected!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    import threading
    def run_server():
        uvicorn.run(app, host="127.0.0.1", port=8002, log_level="error")
    
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    
    import time
    time.sleep(2)
    
    asyncio.run(test_client())
