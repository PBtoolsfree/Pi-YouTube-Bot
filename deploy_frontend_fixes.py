import paramiko

def deploy_fixes():
    server = '172.168.30.135'
    port = 22
    user = 'pradip'
    password = '1234'
    
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(server, port, user, password)
        print("Connected to SSH.")
        
        sftp = client.open_sftp()
        print("Uploading GameOverlay.jsx...")
        sftp.put(r'd:\bot\pi-youtube-bot\frontend\src\pages\GameOverlay.jsx', '/home/pradip/pi-youtube-bot/frontend/src/pages/GameOverlay.jsx')
        print("Uploading PublicAvatarOverlay.jsx...")
        sftp.put(r'd:\bot\pi-youtube-bot\frontend\src\pages\PublicAvatarOverlay.jsx', '/home/pradip/pi-youtube-bot/frontend/src/pages/PublicAvatarOverlay.jsx')
        sftp.close()
        print("Files uploaded successfully.")

        commands = [
            "cd /home/pradip/pi-youtube-bot/frontend && npm install && npm run build",
            "echo 1234 | sudo -S systemctl restart pibot.service || echo 1234 | sudo -S systemctl restart bot_service.service"
        ]
        
        for cmd in commands:
            print(f"Executing: {cmd}")
            stdin, stdout, stderr = client.exec_command(cmd)
            # Read until done
            out = stdout.read().decode()
            err = stderr.read().decode()
            print("STDOUT:", out)
            if err:
                print("STDERR:", err)
            
        client.close()
        print("Deploy complete.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    deploy_fixes()
