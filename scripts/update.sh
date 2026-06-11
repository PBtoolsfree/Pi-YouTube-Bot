#!/bin/bash
echo "============================================================"
echo " ERROR: AUTOMATIC GITHUB PULLS ARE DISABLED"
echo "============================================================"
echo " To protect live data on the Raspberry Pi, pulling from"
echo " GitHub automatically is strictly prohibited."
echo ""
echo " If you need to manually update from GitHub, run:"
echo " python3 scripts/manual_update_from_github.py"
echo "============================================================"
exit 1
