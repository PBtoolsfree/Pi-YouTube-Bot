import asyncio
from fastapi import FastAPI, WebSocket, Request
import uvicorn
import websockets

app = FastAPI()

@app.middleware("http")
async def test_middleware(request: Request, call_next):
    return await call_next(request)

@app.websocket("/ws")
async def ws_endpoint(websocket):
    await websocket.accept()
    await websocket.send_text("Hello")

@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    from fastapi.responses import HTMLResponse
    return HTMLResponse("<html><body>Catch All</body></html>")
    await websocket.close()

async def test_client():
    try:
        async with websockets.connect("ws://127.0.0.1:8001/ws") as ws:
            msg = await ws.recv()
            print(f"Received: {msg}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    import threading
    def run_server():
        uvicorn.run(app, host="127.0.0.1", port=8001, log_level="error")
    
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    
    import time
    time.sleep(2)
    
    asyncio.run(test_client())
