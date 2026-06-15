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
    
    # Append the CLOUD_ALERT_URL to the .env file
    stdin, stdout, stderr = client.exec_command('echo "CLOUD_ALERT_URL=\\"wss://tip.pbherotip.qzz.io/ws/pi-client\\"" >> ~/pi-youtube-bot/.env')
    stdout.channel.recv_exit_status()
    
    print("Restarting pibot service...")
    stdin, stdout, stderr = client.exec_command('echo 1234 | sudo -S systemctl restart pibot')
    stdout.channel.recv_exit_status()
    
    print("Done! Restarted!")
    
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
