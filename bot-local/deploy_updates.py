import paramiko
import sys
import os

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
    
    # Upload bot_service.py
    local_bot = r'd:\bot\pi-youtube-bot\backend\bot_service.py'
    remote_bot = '/home/pradip/pi-youtube-bot/backend/bot_service.py'
    print(f"Uploading {local_bot} -> {remote_bot}")
    sftp.put(local_bot, remote_bot)
    
    # Upload viewer_service.py
    local_viewer = r'd:\bot\pi-youtube-bot\backend\services\viewer_service.py'
    remote_viewer = '/home/pradip/pi-youtube-bot/backend/services/viewer_service.py'
    print(f"Uploading {local_viewer} -> {remote_viewer}")
    sftp.put(local_viewer, remote_viewer)
    
    # Upload youtube_service.py
    local_youtube = r'd:\bot\pi-youtube-bot\backend\services\youtube_service.py'
    remote_youtube = '/home/pradip/pi-youtube-bot/backend/services/youtube_service.py'
    print(f"Uploading {local_youtube} -> {remote_youtube}")
    sftp.put(local_youtube, remote_youtube)
    
    sftp.close()
    print("Files uploaded successfully.")
    
    print("Restarting bot service...")
    stdin, stdout, stderr = ssh.exec_command('echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service || echo 1234 | sudo -S systemctl restart pi-youtube-bot')
    print("Restart STDOUT:", stdout.read().decode())
    print("Restart STDERR:", stderr.read().decode())
    
    ssh.close()
except Exception as e:
    print(f"Error: {e}")
