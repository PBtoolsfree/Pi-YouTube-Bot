#!/usr/bin/env python3
import os
import sys
import subprocess
import time
import argparse

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def print_warning():
    print("="*60)
    print(" ⚠️  WARNING: MANUAL UPDATE FROM GITHUB ⚠️ ")
    print("="*60)
    print(" You are about to pull code from GitHub to this Raspberry Pi.")
    print(" The Raspberry Pi should normally be the source of truth.")
    print(" Pulling from GitHub could introduce code changes.")
    print("")
    print(" Safety Measures Enabled:")
    print("  ✅ A full local backup of live data will be created first.")
    print("  ✅ Destructive commands like 'git clean' or 'git reset' are blocked.")
    print("  ✅ Live data files (JSON/DB/Config) are protected by .gitignore.")
    print("="*60)

def main():
    parser = argparse.ArgumentParser(description="Manually update Pi Bot codebase from GitHub.")
    parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation prompt (non-interactive mode).")
    args = parser.parse_args()

    if not args.yes:
        print_warning()
        confirm = input("\nAre you absolutely sure you want to pull from GitHub? (yes/no): ").strip().lower()
        if confirm not in ['yes', 'y']:
            print("Update cancelled. No changes were made.")
            sys.exit(0)
        
    print("\n[Step 1/4] Creating mandatory full backup...")
    backup_script = os.path.join(PROJECT_ROOT, "scripts", "backup_manager.py")
    
    try:
        # Run the backup_manager.py script
        result = subprocess.run([sys.executable, backup_script, "--backup-only"], check=True)
    except subprocess.CalledProcessError:
        print("\n❌ CRITICAL: Backup failed! Update aborted to protect data.")
        sys.exit(1)
        
    print("\n✅ Backup successful.")
    
    print("\n[Step 2/4] Pulling latest code from GitHub...")
    try:
        # Get current active branch dynamically
        branch_result = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=PROJECT_ROOT, capture_output=True, text=True)
        branch = branch_result.stdout.strip() or "master"
        print(f"Active branch detected: {branch}")
        
        # ONLY run git pull. No resets, no cleans.
        subprocess.run(["git", "pull", "origin", branch], cwd=PROJECT_ROOT, check=True)
    except subprocess.CalledProcessError as e:
        print(f"\n❌ ERROR: Git pull failed! Please check for merge conflicts. Error: {e}")
        print("Your data is still safe in the 'backups/' directory.")
        sys.exit(1)
        
    print("\n[Step 3/4] Updating dependencies...")
    try:
        venv_pip = os.path.join(PROJECT_ROOT, ".venv", "bin", "pip")
        if not os.path.exists(venv_pip):
            venv_pip = "pip3"  # Fallback
            
        subprocess.run([venv_pip, "install", "-r", "requirements.txt", "--quiet"], cwd=PROJECT_ROOT)
        
        # Build frontend if needed
        frontend_dir = os.path.join(PROJECT_ROOT, "frontend")
        if os.path.exists(frontend_dir):
            subprocess.run(["npm", "install", "--silent"], cwd=frontend_dir)
            subprocess.run(["npm", "run", "build"], cwd=frontend_dir)
    except Exception as e:
        print(f"⚠️ Warning during dependency update: {e}")
        print("Continuing anyway...")
        
    print("\n[Step 4/4] Restarting Pi Bot Service...")
    try:
        # Restart the systemd service (requires sudo, might ask for password if not configured for nopasswd)
        subprocess.run(["sudo", "systemctl", "restart", "pibot.service"], check=False)
        subprocess.run(["sudo", "systemctl", "restart", "bot_service.service"], check=False)
        print("✅ Services restarted (if they exist on this system).")
    except Exception as e:
        print(f"⚠️ Could not restart services automatically: {e}")
        print("Please run: sudo systemctl restart pibot.service")
        
    print("\n" + "="*60)
    print(" ✅ UPDATE COMPLETE ")
    print("="*60)
    print(" If anything went wrong, your data is safe in the 'backups/' folder.")

if __name__ == "__main__":
    main()
