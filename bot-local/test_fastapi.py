from fastapi import FastAPI, Body
from typing import Optional, Dict
import uvicorn

app = FastAPI()

@app.post("/test1")
async def test1(payload: Optional[Dict[str, str]] = None):
    return {"payload": payload}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
