#!/usr/bin/env python3
"""
Backup all local data before deploy/update.

Creates a timestamped snapshot of all persistent local files:
  - data/ directory (databases, JSON state files, uploads)
  - config.json, .env, credentials
  - viewers.db
  - token files

Usage:
  python3 scripts/backup_local_data.py              # auto-named snapshot
  python3 scripts/backup_local_data.py my_backup    # named snapshot
"""
import os
import sys
import shutil
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# All files/dirs to back up (relative to project root)
# NOTE: Do NOT include backups/ here — it would recurse infinitely
BACKUP_TARGETS = [
    "data/",
    "viewers.db",
    "viewers.json",
    "viewers.json.bak",
    "config.json",
    ".env",
    "client_secret.json",
    "sheets_client_secret.json",
    "token.json",
]


def backup(name=None):
    ts = time.strftime("%Y%m%d_%H%M%S")
    label = name or f"snapshot_{ts}"
    backup_dir = os.path.join(BASE, "backups", f"{label}")

    if os.path.exists(backup_dir):
        print(f"⚠️  Backup dir already exists: {backup_dir}")
        print("   Appending timestamp...")
        backup_dir = f"{backup_dir}_{ts}"

    os.makedirs(backup_dir, exist_ok=True)

    copied = 0
    for target in BACKUP_TARGETS:
        src = os.path.join(BASE, target)
        if not os.path.exists(src):
            continue

        dst = os.path.join(backup_dir, target)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
            file_count = sum(len(f) for _, _, f in os.walk(src))
            print(f"  📁 {target:40s} ({file_count} files)")
            copied += file_count
        else:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            size = os.path.getsize(src)
            print(f"  📄 {target:40s} ({size:,} bytes)")
            copied += 1

    if copied == 0:
        print("❌ No local data files found to backup!")
        shutil.rmtree(backup_dir)
        return None

    print(f"\n✅ Backup complete: {backup_dir}")
    print(f"   Total items: {copied}")
    return backup_dir


if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else None
    backup(name)
