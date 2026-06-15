#!/usr/bin/env python3
import os
import time
import shutil
import argparse
import subprocess
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run_cmd(cmd):
    print(f"▶ {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        print(f"❌ Command failed with exit code {result.returncode}")
        sys.exit(1)

def do_backup():
    ts = time.strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(PROJECT_ROOT, "backups", f"manual_backup_{ts}")
    
    print("="*50)
    print(" 📦 CREATING LOCAL DATA BACKUP")
    print("="*50)
    print(f"Target: {backup_dir}")
    
    os.makedirs(backup_dir, exist_ok=True)
    os.makedirs(os.path.join(backup_dir, "data"), exist_ok=True)
    
    # Files to backup
    files_to_backup = [
        "viewers.json", "viewers.json.bak",
        "viewers.db", "config.json", ".env", ".env.bak",
        "token.json", "client_secret.json", "sheets_client_secret.json"
    ]
    
    # Try to backup root DB files as well
    for f in os.listdir(PROJECT_ROOT):
        if f.endswith('.db') or f.endswith('.sqlite') or f.endswith('.sqlite3'):
            if f not in files_to_backup:
                files_to_backup.append(f)
                
    for f in files_to_backup:
        src = os.path.join(PROJECT_ROOT, f)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(backup_dir, f))
            print(f"  ✅ Backed up: {f}")
            
    # Backup data folder
    data_dir = os.path.join(PROJECT_ROOT, "data")
    if os.path.exists(data_dir):
        for item in os.listdir(data_dir):
            src = os.path.join(data_dir, item)
            dst = os.path.join(backup_dir, "data", item)
            if os.path.isdir(src):
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)
        print("  ✅ Backed up: data/")
        
    print(f"\n✅ Local backup complete: {backup_dir}")
    return backup_dir

def do_push_code():
    print("="*50)
    print(" 🚀 PUSHING SOURCE CODE TO GITHUB")
    print("="*50)
    print("This will ONLY push source code based on .gitignore.")
    print("Live data, databases, and secrets are strictly protected.")
    
    # 1. Status check
    run_cmd("git status --short")
    
    # 2. Add files
    run_cmd("git add .")
    
    # 3. Check if there are changes
    status_check = subprocess.run("git diff --staged --quiet", shell=True, cwd=PROJECT_ROOT)
    if status_check.returncode == 0:
        print("No changes to commit. GitHub is up to date.")
        return
        
    # 4. Commit and push
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    run_cmd(f'git commit -m "Auto-backup from Pi: {ts}"')
    
    # Get current active branch dynamically
    branch_result = subprocess.run("git rev-parse --abbrev-ref HEAD", shell=True, cwd=PROJECT_ROOT, capture_output=True, text=True)
    branch = branch_result.stdout.strip() or "master"
    
    run_cmd(f"git push origin {branch}")
    print("\n✅ Source code pushed to GitHub safely.")

def main():
    parser = argparse.ArgumentParser(description="Safely backup and push code for Pi Bot.")
    parser.add_argument("--backup-only", action="store_true", help="Only create a local backup of live data.")
    parser.add_argument("--push-code", action="store_true", help="Create a local backup, then push source code to GitHub.")
    
    args = parser.parse_args()
    
    if not (args.backup_only or args.push_code):
        parser.print_help()
        sys.exit(1)
        
    do_backup()
    
    if args.push_code:
        do_push_code()

if __name__ == "__main__":
    main()
