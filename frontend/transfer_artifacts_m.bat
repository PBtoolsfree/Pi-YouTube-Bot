@echo off
plink -batch -pw 1234 -m cmd_frontend.txt pradip@172.168.30.135 < frontend_dist.b64
plink -batch -pw 1234 -m cmd_api.txt pradip@172.168.30.135 < api.b64
plink -batch -pw 1234 -m cmd_secret.txt pradip@172.168.30.135 < secret.b64
echo Transfer Complete
