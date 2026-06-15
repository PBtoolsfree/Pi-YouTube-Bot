#!/usr/bin/env python3
"""
Restore local data from a backup snapshot.

Usage:
  python3 scripts/restore_local_data.py backups/pre_update_20260509_131500
  python3 scripts/restore_local_data.py backups/snapshot_20260509_131500
"""
import os
import sys
import shutil

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files that should be restored from backup (relative paths)
RESTORE_TARGETS = [
    "data/",
    "viewers.db",
    "viewers.json",
    "config.json",
    ".env",
    "client_secret.json",
    "sheets_client_secret.json",
    "token.json",
]


def restore(backup_path):
    if not os.path.isdir(backup_path):
        print(f"❌ Backup directory not found: {backup_path}")
        print("\nAvailable backups:")
        bk_dir = os.path.join(BASE, "backups")
        if os.path.isdir(bk_dir):
            for d in sorted(os.listdir(bk_dir)):
                full = os.path.join(bk_dir, d)
                if os.path.isdir(full):
                    print(f"  📁 {full}")
        return

    print(f"🔄 Restoring from: {backup_path}")
    print()

    restored = 0
    for target in RESTORE_TARGETS:
        src = os.path.join(backup_path, target)
        dst = os.path.join(BASE, target)

        if not os.path.exists(src):
            continue

        if os.path.isdir(src):
            if os.path.exists(dst):
                # Merge: don't delete existing files, only add/replace from backup
                for root, dirs, files in os.walk(src):
                    rel = os.path.relpath(root, src)
                    dst_dir = os.path.join(dst, rel)
                    os.makedirs(dst_dir, exist_ok=True)
                    for f in files:
                        src_file = os.path.join(root, f)
                        dst_file = os.path.join(dst_dir, f)
                        shutil.copy2(src_file, dst_file)
                        restored += 1
            else:
                shutil.copytree(src, dst)
                restored += sum(len(f) for _, _, f in os.walk(src))
            print(f"  📁 Restored: {target}")
        else:
            os.makedirs(os.path.dirname(dst) if os.path.dirname(dst) else ".", exist_ok=True)
            shutil.copy2(src, dst)
            restored += 1
            print(f"  📄 Restored: {target}")

    print(f"\n✅ Restore complete. {restored} items restored.")
    print("⚠️  Restart the bot to apply: sudo systemctl restart pibot")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/restore_local_data.py <backup_path>")
        print("\nExample:")
        print("  python3 scripts/restore_local_data.py backups/pre_update_20260509_131500")
        
        # List available backups
        bk_dir = os.path.join(BASE, "backups")
        if os.path.isdir(bk_dir):
            entries = sorted(os.listdir(bk_dir))
            if entries:
                print("\nAvailable backups:")
                for d in entries:
                    full = os.path.join(bk_dir, d)
                    if os.path.isdir(full):
                        print(f"  📁 {full}")
        sys.exit(1)

    backup_path = sys.argv[1]
    # Allow relative path from project root
    if not os.path.isabs(backup_path):
        backup_path = os.path.join(BASE, backup_path)

    confirm = input(f"Restore from {backup_path}? This may overwrite current files. (y/N): ")
    if confirm.lower() != "y":
        print("Cancelled.")
        sys.exit(0)

    restore(backup_path)
