import paramiko
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

host = '172.168.30.135'
port = 22
user = 'pradip'
password = '1234'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(host, port=port, username=user, password=password, timeout=10)
    
    script = """import asyncio
import websockets

async def test_ws():
    uri = "ws://80.225.201.233:8000/ws/pi-client?token=a65b93019b388dc315a9dc42e4d8cbfe"
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as ws:
            print("Successfully connected!")
            await ws.close()
    except Exception as e:
        print(f"Failed to connect: {e}")

asyncio.run(test_ws())
"""
    stdin, stdout, stderr = client.exec_command(f'cat << \'EOF\' > /tmp/test_ws.py\n{script}\nEOF\n/home/pradip/pi-youtube-bot/.venv/bin/python /tmp/test_ws.py')
    
    print("--- OUTPUT ---")
    for line in stdout:
        print(line, end="")
    for line in stderr:
        print(line, end="")
        
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
