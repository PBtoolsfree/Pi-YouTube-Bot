@echo off
(
echo cat ^> /home/pi/frontend_dist.b64 ^<^<EOF
type frontend_dist.b64
echo.
echo EOF
) > payload_frontend.txt

(
echo cat ^> /home/pi/api.b64 ^<^<EOF
type api.b64
echo.
echo EOF
) > payload_api.txt

(
echo cat ^> /home/pi/secret.b64 ^<^<EOF
type secret.b64
echo.
echo EOF
) > payload_secret.txt

plink -batch -T -pw 1234 pradip@172.168.30.135 < payload_frontend.txt
plink -batch -T -pw 1234 pradip@172.168.30.135 < payload_api.txt
plink -batch -T -pw 1234 pradip@172.168.30.135 < payload_secret.txt

echo Payload Transfer Complete
