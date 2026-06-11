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
    
    script = """import urllib.request
try:
    req = urllib.request.Request("http://80.225.201.233:8000/api/status")
    with urllib.request.urlopen(req) as response:
        print(f"Status 200 OK! {response.read()}")
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code}")
    print(e.read())
except Exception as e:
    print(f"Error: {e}")
"""
    stdin, stdout, stderr = client.exec_command(f'cat << \'EOF\' > /tmp/test_http.py\n{script}\nEOF\npython3 /tmp/test_http.py')
    
    print("--- OUTPUT ---")
    for line in stdout:
        print(line, end="")
    for line in stderr:
        print(line, end="")
        
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
