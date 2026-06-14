import paramiko
import sys

server = '172.168.30.135'
port = 22
user = 'pradip'
password = '1234'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(server, port, user, password, timeout=10)

cmd = "journalctl -u pibot -n 50 --no-pager"
stdin, stdout, stderr = client.exec_command(cmd)
with open('pi_logs.txt', 'w', encoding='utf-8') as f:
    f.write(stdout.read().decode('utf-8', errors='replace'))
client.close()
