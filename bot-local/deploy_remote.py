import paramiko
import sys

def create_ssh_client(server, port, user, password):
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(server, port, user, password, timeout=120)
    return client

server = '172.168.30.135'
port = 22
user = 'pradip'
password = '1234'

try:
    ssh = create_ssh_client(server, port, user, password)
    print("Connected to SSH.")
    
    print("Running npm install and npm run build. This may take a minute or two...")
    # Executing the build and restart
    command = "cd /home/pradip/pi-youtube-bot/frontend && npm install && npm run build && echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service || echo 1234 | sudo -S systemctl restart pi-youtube-bot"
    
    # We use Get pty = True if needed, but exec_command is fine
    stdin, stdout, stderr = ssh.exec_command(command)
    
    # Wait for the command to finish and print output
    exit_status = stdout.channel.recv_exit_status()
    print("Exit Status:", exit_status)
    print("STDOUT:", stdout.read().decode())
    print("STDERR:", stderr.read().decode())
    
    ssh.close()
    print("Finished.")
except Exception as e:
    print(f"Error: {e}")
