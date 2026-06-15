import paramiko
import sys

def create_ssh_client(server, port, user, password):
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(server, port, user, password)
    return client

server = '172.168.30.135'
port = 22
user = 'pradip'
password = '1234'

try:
    ssh = create_ssh_client(server, port, user, password)
    print("Connected to SSH.")
    
    sftp = ssh.open_sftp()
    print("Uploading audio_service.py...")
    sftp.put(r'd:\bot\pi-youtube-bot\backend\audio_service.py', '/home/pradip/pi-youtube-bot/backend/audio_service.py')
    print("Uploading AudioEngine.jsx...")
    sftp.put(r'd:\bot\pi-youtube-bot\frontend\src\pages\AudioEngine.jsx', '/home/pradip/pi-youtube-bot/frontend/src/pages/AudioEngine.jsx')
    sftp.close()
    
    print("Building frontend on Pi...")
    stdin, stdout, stderr = ssh.exec_command('cd /home/pradip/pi-youtube-bot/frontend && npm install && npm run build')
    exit_status = stdout.channel.recv_exit_status()
    print("Frontend Build Exit Status:", exit_status)
    if exit_status != 0:
        print("STDERR:", stderr.read().decode())
    
    print("Restarting bot service...")
    stdin, stdout, stderr = ssh.exec_command('echo 1234 | sudo -S systemctl restart pibot')
    stdout.channel.recv_exit_status()
    print("Restart STDOUT:", stdout.read().decode())
    
    ssh.close()
    print("Deployment for Piper TTS completed!")
except Exception as e:
    print(f"Error: {e}")
