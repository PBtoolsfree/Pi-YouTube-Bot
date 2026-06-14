import paramiko
import os
import sys

def deploy_sync_changes():
    server = '172.168.30.135'
    port = 22
    user = 'pradip'
    password = '1234'
    
    local_dir = r'd:\bot\pi-youtube-bot'
    remote_dir = '/home/pradip/pi-youtube-bot'

    # Only upload the files that were changed for the history synchronization
    files_to_upload = [
        ('backend/api.py', 'backend/api.py'),
        ('backend/services/cloud_alert_client.py', 'backend/services/cloud_alert_client.py')
    ]

    try:
        print("Connecting to Raspberry Pi...")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(server, port, user, password, timeout=10)
        print("Connected.")
        
        sftp = client.open_sftp()
        for local_rel, remote_rel in files_to_upload:
            local_path = os.path.join(local_dir, local_rel.replace('/', '\\'))
            remote_path = f"{remote_dir}/{remote_rel}"
            print(f"Uploading {local_rel} to {remote_path}...")
            sftp.put(local_path, remote_path)

        sftp.close()
        
        print("Restarting bot service on Raspberry Pi...")
        commands = [
            "echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service || echo 1234 | sudo -S systemctl restart pi-youtube-bot"
        ]
        
        for cmd in commands:
            stdin, stdout, stderr = client.exec_command(cmd)
            stdout.channel.recv_exit_status() # Wait for command to complete
            out = stdout.read().decode('utf-8', errors='replace')
            err = stderr.read().decode('utf-8', errors='replace')
            if out: print("STDOUT:", out.strip())
            if err: print("STDERR:", err.strip())

        client.close()
        print("Update applied to Raspberry Pi successfully.")
    except Exception as e:
        print(f"Error during deployment: {e}")

if __name__ == '__main__':
    deploy_sync_changes()
