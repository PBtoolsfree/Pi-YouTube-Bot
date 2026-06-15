import paramiko
import sys
import time

def deploy():
    server = '172.168.30.135'
    port = 22
    user = 'pradip'
    password = '1234'

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting to Pi...")
    ssh.connect(server, port, user, password)

    sftp = ssh.open_sftp()
    
    files = {
        r'd:\bot\pi-youtube-bot\backend\audio_service.py': '/home/pradip/pi-youtube-bot/backend/audio_service.py',
        r'd:\bot\pi-youtube-bot\config.example.json': '/home/pradip/pi-youtube-bot/config.example.json',
        r'd:\bot\pi-youtube-bot\requirements.txt': '/home/pradip/pi-youtube-bot/requirements.txt',
        r'd:\bot\pi-youtube-bot\frontend\src\pages\AudioEngine.jsx': '/home/pradip/pi-youtube-bot/frontend/src/pages/AudioEngine.jsx'
    }

    for local, remote in files.items():
        print(f"Uploading {local} to {remote}...")
        sftp.put(local, remote)

    sftp.close()

    commands = [
        "echo 1234 | sudo -S systemctl stop pibot",
        "cd /home/pradip/pi-youtube-bot && .venv/bin/pip install -r requirements.txt",
        "cd /home/pradip/pi-youtube-bot/frontend && npm run build",
        "echo 1234 | sudo -S systemctl start pibot",
        "echo 1234 | sudo -S systemctl status pibot --no-pager | head -n 15"
    ]

    for cmd in commands:
        print(f"\nRunning: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        # We need to wait for build to finish, reading line by line
        while True:
            line = stdout.readline()
            if not line:
                break
            print(line, end="")
            sys.stdout.flush()
        
        err = stderr.read().decode()
        if err:
            print(f"STDERR: {err}")

    ssh.close()
    print("\nDeployment complete.")

if __name__ == '__main__':
    deploy()
