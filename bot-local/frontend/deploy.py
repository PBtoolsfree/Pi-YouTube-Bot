import subprocess
import os

SERVER = '172.168.30.135'
USER = 'pradip'
PW = '1234'
PLINK = 'plink'
REMOTE_HOME = '/home/pradip'

def transfer(local_file, remote_file):
    print(f"Transferring {local_file} -> {remote_file}")
    try:
        # Read as text to filter lines
        with open(local_file, 'r') as f:
            lines = f.readlines()
        
        # Filter out certutil headers
        clean_lines = [l for l in lines if "-----" not in l]
        data = "".join(clean_lines)
        
        # Use simple cat command, plink handles the stream
        cmd = [PLINK, '-batch', '-pw', PW, f"{USER}@{SERVER}", f"cat > {remote_file}"]
        
        # Run plink, feeding data to stdin
        process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate(input=data.encode()) # Encode back to bytes
        
        if process.returncode != 0:
            print(f"Error transferring {local_file}:")
            print(stderr.decode())
        else:
            print(f"Success: {local_file}")
            
    except Exception as e:
        print(f"Exception transferring {local_file}: {e}")

# Transfer artifacts
transfer('frontend_dist.b64', f'{REMOTE_HOME}/frontend_dist.b64')
transfer('api.b64', f'{REMOTE_HOME}/api.b64')
transfer('secret.b64', f'{REMOTE_HOME}/secret.b64')

# Decode and Deploy
decode_cmd = (
    f"base64 -d -i {REMOTE_HOME}/frontend_dist.b64 > {REMOTE_HOME}/frontend_dist.tar && "
    f"tar -nm -xvf {REMOTE_HOME}/frontend_dist.tar -C {REMOTE_HOME}/ && "
    f"rm -rf {REMOTE_HOME}/pi-youtube-bot/frontend/dist && "
    f"mv {REMOTE_HOME}/dist {REMOTE_HOME}/pi-youtube-bot/frontend/dist && "
    f"base64 -d -i {REMOTE_HOME}/api.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/api.py && "
    f"base64 -d -i {REMOTE_HOME}/secret.b64 > {REMOTE_HOME}/pi-youtube-bot/client_secret.json && "
    "sudo systemctl restart pi-youtube-bot"
)

print(f"Running decode and deploy commands in {REMOTE_HOME}...")
cmd = [PLINK, '-batch', '-pw', PW, f"{USER}@{SERVER}", decode_cmd]
subprocess.run(cmd)
print("Deployment Complete!")
