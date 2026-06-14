import paramiko
import os
import sys
import shutil

def deploy():
    server = '172.168.30.135'
    port = 22
    user = 'pradip'
    password = '1234'
    
    local_dir = r'd:\bot\pi-youtube-bot'
    remote_dir = '/home/pradip/pi-youtube-bot'

    files_to_upload = [
        ('backend/bot_service.py', 'backend/bot_service.py'),
        ('backend/api.py', 'backend/api.py'),
        ('backend/services/cloud_alert_client.py', 'backend/services/cloud_alert_client.py')
    ]

    print("Zipping frontend dist...")
    shutil.make_archive(r'd:\bot\pi-youtube-bot\dist_upload', 'zip', r'd:\bot\pi-youtube-bot\frontend\dist')
    files_to_upload.append(('dist_upload.zip', 'dist_upload.zip'))

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
        
        print("Extracting frontend on Raspberry Pi...")
        commands = [
            f"cd {remote_dir} && unzip -o dist_upload.zip -d frontend/dist && rm dist_upload.zip",
            "echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service || echo 1234 | sudo -S systemctl restart pi-youtube-bot"
        ]
        
        for cmd in commands:
            stdin, stdout, stderr = client.exec_command(cmd)
            stdout.channel.recv_exit_status()
            out = stdout.read().decode('utf-8', errors='replace')
            err = stderr.read().decode('utf-8', errors='replace')
            if out: print("STDOUT:", out.strip()[:200])
            if err: print("STDERR:", err.strip()[:200])

        client.close()
        print("Update applied to Raspberry Pi successfully.")
        
        # Cleanup local zip
        if os.path.exists(r'd:\bot\pi-youtube-bot\dist_upload.zip'):
            os.remove(r'd:\bot\pi-youtube-bot\dist_upload.zip')
            
    except Exception as e:
        print(f"Error during deployment: {e}")

if __name__ == '__main__':
    deploy()
