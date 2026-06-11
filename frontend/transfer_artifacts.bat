@echo off
plink -batch -pw 1234 pradip@172.168.30.135 "cat > /home/pi/frontend_dist.b64" < frontend_dist.b64
plink -batch -pw 1234 pradip@172.168.30.135 "cat > /home/pi/api.b64" < api.b64
plink -batch -pw 1234 pradip@172.168.30.135 "cat > /home/pi/secret.b64" < secret.b64
echo Transfer Complete
