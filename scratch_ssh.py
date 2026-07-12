import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

def run_ssh_command(host, port, username, password, command):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(hostname=host, port=port, username=username, password=password, timeout=10)
        stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        print("STDOUT:")
        print(out)
        print("STDERR:")
        print(err)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    command = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "ls -la /home/pradip/pibot"
    run_ssh_command("172.168.30.135", 22, "pradip", "1234", command)
