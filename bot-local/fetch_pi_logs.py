import paramiko

def run_ssh_commands():
    hostname = '172.168.30.135'
    port = 22
    username = 'pradip'
    password = '1234'
    
    commands = [
        "echo 1234 | sudo -S journalctl -u pibot -n 100 --no-pager"
    ]

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(hostname, port, username, password, timeout=10)
        for cmd in commands:
            stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
            if cmd.startswith("echo"):
                stdin.write(password + "\n")
                stdin.flush()
            
            out = stdout.read().decode('utf-8', errors='replace').strip()
            print(out)
    except Exception as e:
        print(f"Connection error: {e}")
    finally:
        client.close()

if __name__ == '__main__':
    run_ssh_commands()
