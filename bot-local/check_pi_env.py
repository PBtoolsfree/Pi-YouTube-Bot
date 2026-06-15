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
    
    stdin, stdout, stderr = client.exec_command('cat ~/pi-youtube-bot/.env')
    
    print("--- .env ---")
    for line in stdout:
        print(line, end="")
        
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
