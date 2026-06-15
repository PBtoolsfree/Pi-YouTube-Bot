@echo off
powershell -Command "(Get-Content payload_frontend.txt) -join \"`n\" | Set-Content -NoNewline payload_frontend_lf.txt"
powershell -Command "(Get-Content payload_api.txt) -join \"`n\" | Set-Content -NoNewline payload_api_lf.txt"
powershell -Command "(Get-Content payload_secret.txt) -join \"`n\" | Set-Content -NoNewline payload_secret_lf.txt"

plink -batch -T -pw 1234 pradip@172.168.30.135 < payload_frontend_lf.txt
plink -batch -T -pw 1234 pradip@172.168.30.135 < payload_api_lf.txt
plink -batch -T -pw 1234 pradip@172.168.30.135 < payload_secret_lf.txt

echo Payload Transfer Complete (LF)
