import paramiko
import os

def deploy():
    host = "172.168.30.135"
    port = 22
    username = "pradip"
    password = "1234"
    local_path = r"d:\bot\pi-youtube-bot\bot-local\backend\audio_service.py"
    remote_path = "/home/pradip/pibot/bot-local/backend/audio_service.py"

    try:
        transport = paramiko.Transport((host, port))
        transport.connect(username=username, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        print(f"Uploading {local_path} to {remote_path}...")
        sftp.put(local_path, remote_path)
        print("Upload complete!")
        sftp.close()
        transport.close()

        # Restart service
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, port=port, username=username, password=password)
        print("Restarting pibot service...")
        stdin, stdout, stderr = client.exec_command("sudo -S systemctl restart pibot")
        stdin.write(password + "\n")
        stdin.flush()
        print(stdout.read().decode())
        print(stderr.read().decode())
        client.close()
        print("Deployment successful.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    deploy()
