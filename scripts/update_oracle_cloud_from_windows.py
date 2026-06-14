import paramiko
import os
import sys
import time

def update_oracle_cloud():
    print("========================================")
    print("   Oracle Cloud Auto-Updater Tool")
    print("========================================")
    
    server = input("Enter Oracle Cloud IP (e.g. 80.225.201.233): ").strip()
    user = input("Enter Username (default: ubuntu): ").strip() or "ubuntu"
    key_path = input("Enter path to SSH Private Key (.pem or .ppk): ").strip()

    if not os.path.exists(key_path):
        print(f"Error: Key file not found at {key_path}")
        input("Press Enter to exit...")
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
        # Run the update command
        cmd = "cd ~/pibot && bash scripts/update_cloud.sh"
        stdin, stdout, stderr = client.exec_command(cmd)
        
        # Print output in real-time
        for line in iter(stdout.readline, ""):
            print(line, end="")
            
        exit_status = stdout.channel.recv_exit_status()
        
        if exit_status == 0:
            print("\n✅ Oracle Cloud Update Completed Successfully!")
        else:
            print("\n❌ Update script returned an error.")
            err = stderr.read().decode()
            print("Error details:", err)

        client.close()
    except Exception as e:
        print(f"\n❌ Connection or execution failed: {e}")

    print("\n")
    input("Press Enter to exit...")

if __name__ == '__main__':
    update_oracle_cloud()
