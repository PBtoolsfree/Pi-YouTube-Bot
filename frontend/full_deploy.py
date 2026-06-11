import subprocess
import os
import base64
import sys

SERVER = '172.168.30.135'
USER = 'pradip'
PW = '1234'
PLINK = 'plink'
REMOTE_HOME = '/home/pradip'

def run_command(command, cwd=None):
    print(f"Running: {command}")
    try:
        result = subprocess.run(command, cwd=cwd, shell=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(result.stdout.decode())
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {command}")
        print(e.stderr.decode())
def build_frontend():
    print("Building frontend...")
    # Clean up previous build
    if os.path.exists("dist"):
        import shutil
        print("Cleaning previous dist...")
        shutil.rmtree("dist")
        
    # Clean Vite Cache
    if os.path.exists("node_modules/.vite"):
        import shutil
        print("Cleaning Vite cache...")
        try:
            shutil.rmtree("node_modules/.vite")
        except:
            print("Warning: Could not clean Vite cache (file lock?)")

    # Install dependencies first
    if not os.path.exists("node_modules"):
        print("Installing dependencies...")
        run_command("npm.cmd install", cwd=".")
    
    # Using 'npm.cmd' for Windows compatibility
    run_command("npm.cmd run build", cwd=".")

def package_frontend():
    print("Packaging frontend...")
    # Create tarball of dist folder
    # Assuming 'tar' is available (Windows 10+ has it)
    if os.path.exists("frontend_dist.tar"):
        os.remove("frontend_dist.tar")
    
    # We need to tar the 'dist' folder so it unzips as 'dist'
    run_command("tar -cf frontend_dist.tar dist")

def encode_file(filename, output_filename):
    print(f"Encoding {filename} -> {output_filename}...")
    with open(filename, "rb") as f:
        data = f.read()
    encoded = base64.b64encode(data)
    with open(output_filename, "wb") as f:
        f.write(encoded)

def transfer(local_file, remote_file):
    print(f"Transferring {local_file} -> {remote_file}")
    try:
        # Read as text/bytes depending on how we send it.
        # plink cat > file expects content on stdin
        
        # We are sending base64 text, so read as bytes is fine but communicating as bytes
        with open(local_file, 'rb') as f:
            data = f.read()
        
        # Use simple cat command, plink handles the stream
        cmd = [PLINK, '-batch', '-pw', PW, f"{USER}@{SERVER}", f"cat > {remote_file}"]
        
        # Run plink, feeding data to stdin
        process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate(input=data) 
        
        if process.returncode != 0:
            print(f"Error transferring {local_file}:")
            print(stderr.decode())
            sys.exit(1)
        else:
            print(f"Success: {local_file}")
            
    except Exception as e:
        print(f"Exception transferring {local_file}: {e}")
        sys.exit(1)

def deploy():
    # Decode and Deploy command on remote
    decode_cmd = (
        f"base64 -d -i {REMOTE_HOME}/frontend_dist.b64 > {REMOTE_HOME}/frontend_dist.tar && "
        f"tar -nm -xvf {REMOTE_HOME}/frontend_dist.tar -C {REMOTE_HOME}/ && "
        f"rm -rf {REMOTE_HOME}/pi-youtube-bot/frontend/dist && "
        f"mv {REMOTE_HOME}/dist {REMOTE_HOME}/pi-youtube-bot/frontend/dist && "
        f"source {REMOTE_HOME}/pi-youtube-bot/venv/bin/activate 2>/dev/null; pip install psutil gspread oauth2client 2>/dev/null; "
        f"base64 -d -i {REMOTE_HOME}/api.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/api.py && "
        f"base64 -d -i {REMOTE_HOME}/audio_service.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/audio_service.py && "
        f"base64 -d -i {REMOTE_HOME}/bot_service.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/bot_service.py && "
        f"base64 -d -i {REMOTE_HOME}/config_manager.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/config_manager.py && "
        f"base64 -d -i {REMOTE_HOME}/sheets_service.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/sheets_service.py && "
        f"base64 -d -i {REMOTE_HOME}/redeem_service.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/redeem_service.py && "
        f"base64 -d -i {REMOTE_HOME}/viewer_service.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/viewer_service.py && "
        f"base64 -d -i {REMOTE_HOME}/youtube_memory.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/youtube_memory.py && "
        f"base64 -d -i {REMOTE_HOME}/moderation_service.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/moderation_service.py && "
        f"base64 -d -i {REMOTE_HOME}/brain_service.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/brain_service.py && "
        f"base64 -d -i {REMOTE_HOME}/chat_logger.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/chat_logger.py && "
        f"base64 -d -i {REMOTE_HOME}/auth_service.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/auth_service.py && "
        f"base64 -d -i {REMOTE_HOME}/ai_handler.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/ai_handler.py && "
        f"base64 -d -i {REMOTE_HOME}/loyalty_games.b64 > {REMOTE_HOME}/pi-youtube-bot/backend/services/loyalty_games.py && "
        "sudo systemctl restart pibot"
    )
    
    print(f"Running decode and deploy commands in {REMOTE_HOME}...")
    cmd = [PLINK, '-batch', '-pw', PW, f"{USER}@{SERVER}", decode_cmd]
    subprocess.run(cmd)
    print("Deployment Complete!")

if __name__ == "__main__":
    build_frontend()
    package_frontend()
    encode_file("frontend_dist.tar", "frontend_dist.b64")
    
    
    # Also encode API, Audio Service, Bot Service, and all backend services
    encode_file("../backend/api.py", "api.b64")
    encode_file("../backend/audio_service.py", "audio_service.b64")
    encode_file("../backend/bot_service.py", "bot_service.b64")
    encode_file("../backend/config_manager.py", "config_manager.b64")
    encode_file("../backend/services/sheets_service.py", "sheets_service.b64")
    encode_file("../backend/services/redeem_service.py", "redeem_service.b64")
    encode_file("../backend/services/viewer_service.py", "viewer_service.b64")
    encode_file("../backend/services/youtube_memory.py", "youtube_memory.b64")
    encode_file("../backend/services/moderation_service.py", "moderation_service.b64")
    encode_file("../backend/services/brain_service.py", "brain_service.b64")
    encode_file("../backend/services/chat_logger.py", "chat_logger.b64")
    encode_file("../backend/services/auth_service.py", "auth_service.b64")
    encode_file("../backend/services/ai_handler.py", "ai_handler.b64")
    encode_file("../backend/services/loyalty_games.py", "loyalty_games.b64")
    
    transfer("frontend_dist.b64", f"{REMOTE_HOME}/frontend_dist.b64")
    transfer("api.b64", f"{REMOTE_HOME}/api.b64")
    transfer("audio_service.b64", f"{REMOTE_HOME}/audio_service.b64")
    transfer("bot_service.b64", f"{REMOTE_HOME}/bot_service.b64")
    transfer("config_manager.b64", f"{REMOTE_HOME}/config_manager.b64")
    transfer("sheets_service.b64", f"{REMOTE_HOME}/sheets_service.b64")
    transfer("redeem_service.b64", f"{REMOTE_HOME}/redeem_service.b64")
    transfer("viewer_service.b64", f"{REMOTE_HOME}/viewer_service.b64")
    transfer("youtube_memory.b64", f"{REMOTE_HOME}/youtube_memory.b64")
    transfer("moderation_service.b64", f"{REMOTE_HOME}/moderation_service.b64")
    transfer("brain_service.b64", f"{REMOTE_HOME}/brain_service.b64")
    transfer("chat_logger.b64", f"{REMOTE_HOME}/chat_logger.b64")
    transfer("auth_service.b64", f"{REMOTE_HOME}/auth_service.b64")
    transfer("ai_handler.b64", f"{REMOTE_HOME}/ai_handler.b64")
    transfer("loyalty_games.b64", f"{REMOTE_HOME}/loyalty_games.b64")
    
    deploy()

