#!/usr/bin/env python3
import sys

print("="*60)
print(" ERROR: AUTOMATIC GITHUB PULLS ARE DISABLED")
print("="*60)
print(" To protect live data on the Raspberry Pi, pulling from")
print(" GitHub automatically is strictly prohibited.")
print("")
print(" If you need to manually update from GitHub, run:")
print(" python3 scripts/manual_update_from_github.py")
print("="*60)
sys.exit(1)
