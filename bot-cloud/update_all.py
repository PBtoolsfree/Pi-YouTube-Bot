import paramiko
import os
import shutil
import sys

def update_raspberry_pi():
    print("========================================")
    print("   Raspberry Pi Updater")
    print("========================================")
    server = '172.168.30.135'
    port = 22
    user = 'pradip'
    password = '1234'
    
    local_dir = os.path.dirname(os.path.abspath(__file__))
    remote_dir = '/home/pradip/pi-youtube-bot'

    # Standard files to update
    files_to_upload = [
        ('backend/bot_service.py', 'backend/bot_service.py'),
        ('backend/api.py', 'backend/api.py'),
        ('backend/services/cloud_alert_client.py', 'backend/services/cloud_alert_client.py'),
        ('backend/services/viewer_service.py', 'backend/services/viewer_service.py'),
        ('backend/services/youtube_service.py', 'backend/services/youtube_service.py'),
        ('backend/services/moderation_service.py', 'backend/services/moderation_service.py')
    ]

    print("Building and Zipping frontend locally for Raspberry Pi...")
    os.system("cd frontend && npm install && npm run build")
    shutil.make_archive(os.path.join(local_dir, 'dist_upload'), 'zip', os.path.join(local_dir, 'frontend', 'dist'))
    files_to_upload.append(('dist_upload.zip', 'dist_upload.zip'))

    try:
        print("\nConnecting to Raspberry Pi SSH...")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(server, port, user, password)
        print("Connected successfully!")
        
        sftp = client.open_sftp()

        for local_rel, remote_rel in files_to_upload:
            local_path = os.path.join(local_dir, local_rel.replace('/', '\\'))
            remote_path = f"{remote_dir}/{remote_rel}"
            
            if os.path.exists(local_path):
                print(f"Uploading: {local_rel} -> {remote_path}")
                sftp.put(local_path, remote_path)
            else:
                print(f"File not found locally, skipping: {local_rel}")

        sftp.close()

        # Extract frontend and restart service
        commands = [
            f"cd {remote_dir} && unzip -o dist_upload.zip -d frontend/dist && rm dist_upload.zip",
            "echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service || echo 1234 | sudo -S systemctl restart pi-youtube-bot"
        ]
        
        print("\nExtracting frontend and restarting service on Pi...")
        for cmd in commands:
            stdin, stdout, stderr = client.exec_command(cmd)
            stdout.channel.recv_exit_status()  # wait to finish
            
        client.close()
        
        # Cleanup local zip
        local_zip_path = os.path.join(local_dir, 'dist_upload.zip')
        if os.path.exists(local_zip_path):
            os.remove(local_zip_path)
            
        print("✅ Raspberry Pi Update Completed Successfully!")
    except Exception as e:
        print(f"❌ Raspberry Pi Error: {e}")


def update_oracle_cloud():
    print("\n========================================")
    print("   Oracle Cloud Auto-Updater Tool")
    print("========================================")
    
    server = input("Enter Oracle Cloud IP (e.g. 80.225.201.233): ").strip()
    if not server:
        server = "80.225.201.233"
        print(f"Using default IP: {server}")

    user = input("Enter Username (default: ubuntu): ").strip() or "ubuntu"
    key_path = input("Enter path to SSH Private Key (.pem or .ppk): ").strip()

    if not os.path.exists(key_path):
        print(f"❌ Error: Key file not found at {key_path}")
        print("Skipping Oracle Cloud update.")
        return

    try:
        print("\nConnecting to Oracle Cloud...")
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        # Load the private key
        try:
            key = paramiko.RSAKey.from_private_key_file(key_path)
        except Exception:
            try:
                key = paramiko.Ed25519Key.from_private_key_file(key_path)
            except Exception:
                key = paramiko.ECDSAKey.from_private_key_file(key_path)

        client.connect(hostname=server, port=22, username=user, pkey=key, timeout=10)
        print("Connected successfully!\n")
        
        print("Running update script on Oracle Cloud...")
        cmd = "cd ~/pibot && bash scripts/update_cloud.sh --frontend"
        stdin, stdout, stderr = client.exec_command(cmd)
        
        for line in iter(stdout.readline, ""):
            print(line, end="")
            
        exit_status = stdout.channel.recv_exit_status()
        
        if exit_status == 0:
            print("\n✅ Oracle Cloud Update Completed Successfully!")
        else:
            print("\n❌ Update script returned an error.")
            print("Error details:", stderr.read().decode())

        client.close()
    except Exception as e:
        print(f"\n❌ Connection or execution failed: {e}")


if __name__ == '__main__':
    print("Select update target:")
    print("1. Update Raspberry Pi Only")
    print("2. Update Oracle Cloud Only")
    print("3. Update Both Raspberry Pi & Oracle Cloud")
    
    choice = input("\nEnter choice (1-3): ").strip()
    
    if choice == '1':
        update_raspberry_pi()
    elif choice == '2':
        update_oracle_cloud()
    elif choice == '3':
        update_raspberry_pi()
        update_oracle_cloud()
    else:
        print("Invalid choice. Exiting.")
    
    print("\n")
    input("Press Enter to exit...")
