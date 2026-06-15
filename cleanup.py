import os
import glob

files_to_delete = []

patterns = [
    "deploy_*.py", "deploy_*.ps1",
    "test_*.py", "check_*.py",
    "scratch_*.py", "temp_*.ps1",
    "fetch_*.py", "update_*.py",
    "pi_*.txt", "pi_*.log",
    "old_bot_service.py", "pi-youtube-bot.zip",
    "session_report.json", "build_pi.py",
    "extract_missing.py", "fix_pi_env*.py",
    "remove_bg.py", "restart_pi.py",
    "ssh_updater.py", "cmds.txt",
    "pi_config.json"
]

directories = [".", "bot-local", "bot-cloud"]

for d in directories:
    for pattern in patterns:
        path_pattern = os.path.join(d, pattern)
        for f in glob.glob(path_pattern):
            files_to_delete.append(f)

# Deleting root files that shouldn't be there as well, since they were moved to bot-local/bot-cloud
root_files_to_delete = [
    "main.py", "requirements.txt", "Dockerfile", "docker-compose.yml",
    "restart.bat"
]

for f in root_files_to_delete:
    if os.path.isfile(f):
        files_to_delete.append(f)

# Also delete leftover folders in root except for bot-local, bot-cloud, .git, .github, docs?
# Wait, I shouldn't aggressively delete folders, maybe just git rm the files.
import subprocess

files_to_delete = list(set(files_to_delete))

for f in files_to_delete:
    print(f"Deleting {f}")
    if os.path.exists(f):
        os.remove(f)

# For git, we can just run git add -A, then git commit
print("Cleanup done.")
