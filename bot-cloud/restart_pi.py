import paramiko

def restart_bot():
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        print("Connecting to Raspberry Pi...")
        ssh.connect('172.168.30.135', username='pradip', password='1234', timeout=10)

        cmd = 'echo 1234 | sudo -S systemctl restart pibot || echo 1234 | sudo -S systemctl restart bot_service || echo 1234 | sudo -S systemctl restart pi-youtube-bot'
        print(f"Running: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        exit_status = stdout.channel.recv_exit_status()
        out = stdout.read().decode('utf-8')
        err = stderr.read().decode('utf-8')
        
        if out: print("STDOUT:\n" + out.strip())
        if err: print("STDERR:\n" + err.strip())
        
        print("Bot Restart Complete.")
        ssh.close()
    except Exception as e:
        print(f"Error restarting bot: {e}")

if __name__ == "__main__":
    restart_bot()
