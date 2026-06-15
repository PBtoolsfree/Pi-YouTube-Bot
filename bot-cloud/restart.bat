@echo off
plink -pw 1234 pradip@172.168.30.135 -batch \"echo 1234 | sudo -S systemctl restart bot_service\"
plink -pw 1234 pradip@172.168.30.135 -batch \"echo 1234 | sudo -S systemctl restart pibot\"
plink -pw 1234 pradip@172.168.30.135 -batch \"echo 1234 | sudo -S systemctl restart pi-youtube-bot\"
