import paramiko
import sys

try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('172.168.30.135', username='pradip', password='1234', timeout=10)

    def run_cmd(cmd):
        print(f"\n--- {cmd} ---")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8').strip()
        if out: print("STDOUT:\n" + out)

    run_cmd('systemctl status pibot --no-pager | head -n 5')
    run_cmd('systemctl status bot_service --no-pager | head -n 5')
    run_cmd('systemctl status pi-youtube-bot --no-pager | head -n 5')
    
    ssh.close()
except Exception as e:
    print(f"Error: {e}")
