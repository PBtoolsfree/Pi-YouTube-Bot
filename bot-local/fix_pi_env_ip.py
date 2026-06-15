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
    
    # Remove old CLOUD_ALERT_URL and add the direct IP URL
    stdin, stdout, stderr = client.exec_command('sed -i "/CLOUD_ALERT_URL/d" ~/pi-youtube-bot/.env')
    stdout.channel.recv_exit_status()
    
    stdin, stdout, stderr = client.exec_command('echo "CLOUD_ALERT_URL=\\"ws://80.225.201.233:8000/ws/pi-client\\"" >> ~/pi-youtube-bot/.env')
    stdout.channel.recv_exit_status()
    
    print("Restarting pibot service...")
    stdin, stdout, stderr = client.exec_command('echo 1234 | sudo -S systemctl restart pibot')
    stdout.channel.recv_exit_status()
    
    print("Done! Restarted!")
    
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
