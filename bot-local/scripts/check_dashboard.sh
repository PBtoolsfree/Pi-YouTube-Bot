#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BLUE='\033[0;34m'
CYAN='\033[0;36m'

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}       PiBot Dashboard Diagnostics & Health Check    ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Find script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

# Initialize failure count and warnings list
FAILURES=0
WARNINGS=0
FIX_SUGGESTIONS=()

# 1. Check Service Status
echo -e "\n${BLUE}[1/8] Checking systemd services...${NC}"
SERVICES=("pibot" "bot_service" "pi-youtube-bot")
ANY_SERVICE_FOUND=false
ACTIVE_SERVICE=""

for svc in "${SERVICES[@]}"; do
    if systemctl list-unit-files | grep -F "${svc}.service" > /dev/null; then
        ANY_SERVICE_FOUND=true
        systemctl is-active --quiet "$svc"
        if [ $? -eq 0 ]; then
            echo -e "✅ Service '${svc}' is ${GREEN}RUNNING${NC}."
            ACTIVE_SERVICE="$svc"
        else
            echo -e "❌ Service '${svc}' is ${RED}NOT RUNNING${NC} (Active status: $(systemctl is-active "$svc"))."
            FIX_SUGGESTIONS+=("Start the service: sudo systemctl start $svc")
            FIX_SUGGESTIONS+=("Check service logs: sudo journalctl -u $svc -n 50 --no-pager")
            ((FAILURES++))
        fi
    fi
done

if [ "$ANY_SERVICE_FOUND" = false ]; then
    echo -e "❌ ${RED}None of the expected systemd services (${SERVICES[*]}) were found!${NC}"
    FIX_SUGGESTIONS+=("Check if the service is installed or run setup: cd $PROJECT_ROOT && ./scripts/setup.sh")
    ((FAILURES++))
fi

# 2. Check Listening Port
echo -e "\n${BLUE}[2/8] Checking if port 8000 is listening...${NC}"
PORT_LISTENERS=$(sudo ss -tulpn | grep ':8000 ')
if [ -n "$PORT_LISTENERS" ]; then
    echo -e "✅ Port 8000 is ${GREEN}LISTENING${NC}."
    echo "$PORT_LISTENERS"
    
    # Check if listening on wildcard vs local only
    if echo "$PORT_LISTENERS" | grep -E '0\.0\.0\.0:8000|\*:8000' > /dev/null; then
        echo -e "✅ Listening on all interfaces (0.0.0.0), accessible externally."
    else
        echo -e "⚠️  ${YELLOW}Listening locally only (not on 0.0.0.0). External access may be blocked!${NC}"
        FIX_SUGGESTIONS+=("Ensure 'host' is set to '0.0.0.0' in config.json under the 'server' section.")
        ((WARNINGS++))
    fi
else
    echo -e "❌ ${RED}Port 8000 is NOT listening!${NC}"
    FIX_SUGGESTIONS+=("Make sure the backend server starts. Check logs using: sudo journalctl -u ${ACTIVE_SERVICE:-pibot} -n 50 --no-pager")
    ((FAILURES++))
fi

# 3. Check Frontend Build Files
echo -e "\n${BLUE}[3/8] Checking frontend build files...${NC}"
DIST_DIR="$PROJECT_ROOT/frontend/dist"
INDEX_HTML="$DIST_DIR/index.html"
if [ -d "$DIST_DIR" ] && [ -f "$INDEX_HTML" ]; then
    echo -e "✅ Frontend build folder and index.html exist."
    ls -la "$INDEX_HTML"
else
    echo -e "❌ ${RED}Frontend build files are MISSING!${NC}"
    echo -e "   Expected: $INDEX_HTML"
    FIX_SUGGESTIONS+=("Rebuild frontend: cd $PROJECT_ROOT/frontend && npm install && npm run build")
    ((FAILURES++))
fi

# 4. Check Local HTTP Connectivity
echo -e "\n${BLUE}[4/8] Checking local HTTP connectivity...${NC}"
HTTP_RESPONSE=$(curl -I -s -o /dev/null -w "%{http_code}" http://localhost:8000/)
if [ "$HTTP_RESPONSE" = "200" ] || [ "$HTTP_RESPONSE" = "401" ] || [ "$HTTP_RESPONSE" = "302" ] || [ "$HTTP_RESPONSE" = "307" ]; then
    echo -e "✅ Local HTTP check succeeded (HTTP Status: ${GREEN}$HTTP_RESPONSE${NC})."
    if [ "$HTTP_RESPONSE" = "401" ]; then
        echo -e "   (HTTP 401 is normal, indicates Basic Authentication is active)"
    fi
else
    echo -e "❌ ${RED}Local HTTP check failed! HTTP Status: $HTTP_RESPONSE${NC}"
    FIX_SUGGESTIONS+=("Verify backend API is healthy: curl -I http://localhost:8000/api/health")
    ((FAILURES++))
fi

# 5. IP Address Verification
echo -e "\n${BLUE}[5/8] Checking Raspberry Pi LAN IP addresses...${NC}"
PI_IPS=$(hostname -I)
echo -e "Current Raspberry Pi LAN IP(s): ${GREEN}$PI_IPS${NC}"

EXPECTED_IP="172.168.30.135"
IP_MATCHED=false
for ip in $PI_IPS; do
    if [ "$ip" = "$EXPECTED_IP" ]; then
        IP_MATCHED=true
    fi
done

if [ "$IP_MATCHED" = true ]; then
    echo -e "✅ Pi IP matches the configured expected IP ($EXPECTED_IP)."
else
    echo -e "⚠️  ${YELLOW}Warning: Current IP(s) do NOT include $EXPECTED_IP!${NC}"
    echo -e "   If the router DHCP reassigned the Pi a new IP, you must connect via the new IP."
    for ip in $PI_IPS; do
        echo -e "   👉 Try opening: ${CYAN}http://$ip:8000${NC}"
    done
    FIX_SUGGESTIONS+=("If IP changed permanently, update any static configurations or scripts pointing to $EXPECTED_IP.")
    ((WARNINGS++))
fi

# 6. Check Firewall
echo -e "\n${BLUE}[6/8] Checking for active firewalls...${NC}"
if command -v ufw >/dev/null 2>&1; then
    UFW_STATUS=$(sudo ufw status | head -n 1)
    echo -e "UFW Status: $UFW_STATUS"
    if echo "$UFW_STATUS" | grep -i "active" > /dev/null; then
        # Check if port 8000 is allowed
        if sudo ufw status | grep -E '8000.*ALLOW' > /dev/null; then
            echo -e "✅ Port 8000 is ALLOWED in firewall."
        else
            echo -e "❌ ${RED}Port 8000 is NOT allowed in active UFW firewall!${NC}"
            FIX_SUGGESTIONS+=("Allow port 8000: sudo ufw allow 8000/tcp")
            ((FAILURES++))
        fi
    fi
else
    echo -e "ℹ️  UFW firewall is not installed (typical for default Raspberry Pi OS, no port blocking)."
fi

# 7. Check Cloudflared Tunnel
echo -e "\n${BLUE}[7/8] Checking Cloudflared Tunnel status...${NC}"
if pgrep -x "cloudflared" > /dev/null; then
    echo -e "✅ cloudflared process is ${GREEN}RUNNING${NC}."
    if [ -f "$PROJECT_ROOT/cloudflared.log" ]; then
        echo -e "   Last 3 tunnel log lines:"
        tail -n 3 "$PROJECT_ROOT/cloudflared.log" | sed 's/^/   /g'
    fi
else
    echo -e "ℹ️  cloudflared is not running (only required for public/remote access)."
fi

# 8. Service Logs
echo -e "\n${BLUE}[8/8] Showing last 15 systemd logs for pibot...${NC}"
if [ -n "$ACTIVE_SERVICE" ]; then
    sudo journalctl -u "$ACTIVE_SERVICE" -n 15 --no-pager | sed 's/^/   /g'
else
    echo -e "   No active service found to dump logs."
fi

# Summary
echo -e "\n${CYAN}====================================================${NC}"
echo -e "                  DIAGNOSTICS SUMMARY               "
echo -e "${CYAN}====================================================${NC}"
echo -e "Failures detected: ${RED}$FAILURES${NC}"
echo -e "Warnings detected: ${YELLOW}$WARNINGS${NC}"

if [ $FAILURES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "\n${GREEN}💚 Everything looks healthy! The dashboard should be accessible at:${NC}"
    for ip in $PI_IPS; do
        echo -e "   👉 http://$ip:8000"
    done
else
    echo -e "\n${YELLOW}🛠️  SUGGESTED ACTION(S) TO FIX THE DASHBOARD:${NC}"
    # Deduplicate suggestions
    IFS=$'\n' SORTED_SUGGESTIONS=($(sort -u <<<"${FIX_SUGGESTIONS[*]}"))
    unset IFS
    for idx in "${!SORTED_SUGGESTIONS[@]}"; do
        echo -e "   $(($idx+1)). ${SORTED_SUGGESTIONS[$idx]}"
    done
fi
echo -e "${CYAN}====================================================${NC}"
