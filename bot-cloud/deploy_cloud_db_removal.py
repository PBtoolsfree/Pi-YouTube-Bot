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
        print("Uploading Settings.jsx...")
        sftp.put(r'd:\bot\pi-youtube-bot\frontend\src\pages\Settings.jsx', '/home/pradip/pi-youtube-bot/frontend/src/pages/Settings.jsx')
        print("Uploading bot_service.py...")
        sftp.put(r'd:\bot\pi-youtube-bot\backend\bot_service.py', '/home/pradip/pi-youtube-bot/backend/bot_service.py')
        
        print("Removing cloud_listener.py...")
        try:
            sftp.remove('/home/pradip/pi-youtube-bot/backend/services/cloud_listener.py')
            print("Removed successfully.")
        except IOError as e:
            print(f"cloud_listener.py already removed or not found: {e}")
            pass
            
        sftp.close()
        print("Files handled successfully via SFTP.")

        commands = [
            "cd /home/pradip/pi-youtube-bot/frontend && npm install && npm run build",
            "echo 1234 | sudo -S systemctl restart pibot.service || echo 1234 | sudo -S systemctl restart bot_service.service || echo 1234 | sudo -S systemctl restart pi-youtube-bot"
        ]
        
        for cmd in commands:
            print(f"Executing over SSH: {cmd}")
            stdin, stdout, stderr = client.exec_command(cmd)
            out = stdout.read().decode()
            err = stderr.read().decode()
            print("STDOUT:", out)
            if err:
                print("STDERR:", err)
            
        client.close()
        print("Deploy complete.")
    except Exception as e:
        print(f"Deployment Error: {e}")

if __name__ == '__main__':
    deploy_fixes()
