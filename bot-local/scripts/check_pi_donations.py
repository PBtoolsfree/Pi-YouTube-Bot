import paramiko

server = '172.168.30.135'
port = 22
user = 'pradip'
password = '1234'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(server, port, user, password, timeout=10)

cmd = "cat /home/pradip/pi-youtube-bot/data/donations.json"
stdin, stdout, stderr = client.exec_command(cmd)
print(stdout.read().decode('utf-8'))
client.close()
