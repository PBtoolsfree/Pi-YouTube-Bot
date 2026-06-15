import paramiko
import os
import shutil

def clean_and_deploy_pi():
    server = '172.168.30.135'
    port = 22
    user = 'pradip'
    password = '1234'
    
    local_dir = r'd:\bot\pi-youtube-bot'
    remote_dir = '/home/pradip/pi-youtube-bot'

    # Files to upload to the local Pi
    files_to_upload = [
        ('backend/bot_service.py', 'backend/bot_service.py'),
        ('backend/api.py', 'backend/api.py'),
        ('backend/services/cloud_alert_client.py', 'backend/services/cloud_alert_client.py'),
        ('backend/services/viewer_service.py', 'backend/services/viewer_service.py'),
        ('backend/services/youtube_service.py', 'backend/services/youtube_service.py'),
        ('backend/services/moderation_service.py', 'backend/services/moderation_service.py'),
        ('frontend/src/pages/Moderation.jsx', 'frontend/src/pages/Moderation.jsx'),
        ('frontend/src/App.jsx', 'frontend/src/App.jsx'),
        ('frontend/src/components/Layout.jsx', 'frontend/src/components/Layout.jsx'),
        ('frontend/src/pages/Dashboard.jsx', 'frontend/src/pages/Dashboard.jsx'),
        ('frontend/src/components/ServiceStatus.jsx', 'frontend/src/components/ServiceStatus.jsx'),
        ('frontend/src/pages/Settings.jsx', 'frontend/src/pages/Settings.jsx'),
        ('frontend/src/pages/StreamerBot.jsx', 'frontend/src/pages/StreamerBot.jsx')
    ]

    # Files/directories to DELETE from the local Pi (load reduction & security)
    files_to_delete = [
        'backend/services/email_service.py',
        'backend/services/tunnel_service.py',
        'backend/services/phonepe_service.py',
        'backend/services/cloud_listener.py',
        'cloudflared',
        'cloudflared.exe',
        'cloudflared.log'
    ]

    print("Zipping frontend dist locally...")
    shutil.make_archive(os.path.join(local_dir, 'dist_upload'), 'zip', os.path.join(local_dir, 'frontend', 'dist'))
    files_to_upload.append(('dist_upload.zip', 'dist_upload.zip'))

    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(server, port, user, password)
        print("Connected to SSH on Raspberry Pi.")
        
        sftp = client.open_sftp()

        # 1. Upload updated files
        for local_rel, remote_rel in files_to_upload:
            local_path = os.path.join(local_dir, local_rel.replace('/', '\\'))
            remote_path = f"{remote_dir}/{remote_rel}"
            
            # Ensure remote parent directories exist
            remote_parent = os.path.dirname(remote_path)
            try:
                sftp.stat(remote_parent)
            except IOError:
                # Create remote directory recursively if needed
                print(f"Creating remote directory: {remote_parent}")
                parts = remote_parent.split('/')
                current = ""
                for part in parts:
                    if not part: continue
                    current += f"/{part}"
                    try:
                        sftp.stat(current)
                    except IOError:
                        sftp.mkdir(current)

            print(f"Uploading: {local_rel} -> {remote_path}")
            sftp.put(local_path, remote_path)

        # 2. Delete cloud-only files on the Pi
        for rel_path in files_to_delete:
            remote_path = f"{remote_dir}/{rel_path}"
            try:
                sftp.remove(remote_path)
                print(f"Deleted cloud-only file from Pi: {rel_path}")
            except IOError:
                # File already deleted or doesn't exist
                pass

        sftp.close()
        print("SFTP operations completed.")

        # 3. Extract frontend and restart Pi Bot service
        commands = [
            f"cd {remote_dir} && unzip -o dist_upload.zip -d frontend/dist && rm dist_upload.zip",
            "echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service || echo 1234 | sudo -S systemctl restart pi-youtube-bot"
        ]
        
        import sys
        for cmd in commands:
            print(f"Executing: {cmd}")
            stdin, stdout, stderr = client.exec_command(cmd)
            out = stdout.read().decode('utf-8', errors='replace')
            err = stderr.read().decode('utf-8', errors='replace')
            
            # Safe print encoding for Windows terminals
            enc = sys.stdout.encoding or 'utf-8'
            if out:
                safe_out = out.encode(enc, errors='replace').decode(enc)
                print("STDOUT:", safe_out)
            if err:
                safe_err = err.encode(enc, errors='replace').decode(enc)
                print("STDERR:", safe_err)
            
        client.close()
        
        # Cleanup local zip
        local_zip_path = os.path.join(local_dir, 'dist_upload.zip')
        if os.path.exists(local_zip_path):
            os.remove(local_zip_path)
            
        print("Deployment and cleanup complete.")
    except Exception as e:
        import sys
        enc = sys.stdout.encoding or 'utf-8'
        safe_msg = str(e).encode(enc, errors='replace').decode(enc)
        print(f"Error during clean deployment: {safe_msg}")

if __name__ == '__main__':
    clean_and_deploy_pi()
