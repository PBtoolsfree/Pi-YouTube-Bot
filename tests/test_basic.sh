#!/usr/bin/env bash
# ============================================================
#  Pi YouTube Bot — Smoke Test Script
#  Usage: bash tests/test_basic.sh [--live]
#  Pass --live to also check the running service endpoints.
# ============================================================
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$PROJECT_DIR/.venv"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

PASS=0; FAIL=0; SKIP=0
LIVE_CHECK=false
[[ "${1:-}" == "--live" ]] && LIVE_CHECK=true

pass() { echo -e "${GREEN}  ✓ PASS${NC} — $*"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ FAIL${NC} — $*"; ((FAIL++)); }
skip() { echo -e "${YELLOW}  ↷ SKIP${NC} — $*"; ((SKIP++)); }
section() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

echo ""
echo "Pi YouTube Bot — Smoke Tests"
echo "=============================="
echo "Project: $PROJECT_DIR"
echo ""

# ── 1. Virtual Environment ────────────────────────────────────────────────────
section "Virtual Environment"

if [ -d "$VENV" ]; then
    pass "Virtual environment exists at $VENV"
else
    fail "Virtual environment NOT found at $VENV  → run setup.sh"
fi

if [ -x "$VENV/bin/python" ]; then
    PYTHON_VER=$("$VENV/bin/python" --version 2>&1)
    pass "Python executable: $PYTHON_VER"
else
    fail "Python not executable in venv"
fi

# ── 2. Key Python Imports ──────────────────────────────────────────────────────
section "Python Dependencies"

MODULES=("fastapi" "uvicorn" "edge_tts" "httpx" "psutil" "pytchat" "dotenv")
for mod in "${MODULES[@]}"; do
    if "$VENV/bin/python" -c "import $mod" 2>/dev/null; then
        pass "import $mod"
    else
        fail "import $mod FAILED  → pip install -r requirements.txt"
    fi
done

# ── 3. Config Files ────────────────────────────────────────────────────────────
section "Configuration"

if [ -f "$PROJECT_DIR/config.json" ]; then
    # Validate JSON syntax
    if "$VENV/bin/python" -c "import json; json.load(open('$PROJECT_DIR/config.json'))" 2>/dev/null; then
        pass "config.json exists and is valid JSON"
    else
        fail "config.json exists but contains INVALID JSON"
    fi
else
    fail "config.json NOT found  → cp config.example.json config.json"
fi

if [ -f "$PROJECT_DIR/.env" ]; then
    pass ".env file exists"
else
    skip ".env not found (optional — using config.json)"
fi

if [ -f "$PROJECT_DIR/VERSION" ]; then
    VER=$(cat "$PROJECT_DIR/VERSION")
    pass "VERSION file: $VER"
else
    fail "VERSION file NOT found"
fi

# ── 4. Frontend Build ──────────────────────────────────────────────────────────
section "Frontend Build"

DIST_DIR="$PROJECT_DIR/frontend/dist"
if [ -d "$DIST_DIR" ]; then
    INDEX="$DIST_DIR/index.html"
    if [ -f "$INDEX" ]; then
        pass "frontend/dist/index.html exists"
    else
        fail "frontend/dist/ exists but index.html is missing  → rebuild frontend"
    fi
    ASSET_COUNT=$(find "$DIST_DIR/assets" -type f 2>/dev/null | wc -l)
    if [ "$ASSET_COUNT" -gt 0 ]; then
        pass "Frontend assets: $ASSET_COUNT files"
    else
        fail "No assets found in frontend/dist/assets"
    fi
else
    fail "frontend/dist/ NOT built  → cd frontend && npm run build"
fi

# ── 5. System Tools ────────────────────────────────────────────────────────────
section "System Tools"

for tool in ffmpeg git node npm; do
    if command -v "$tool" &>/dev/null; then
        pass "$tool: $(command -v $tool)"
    else
        fail "$tool NOT found in PATH"
    fi
done

# ── 6. Systemd Service ────────────────────────────────────────────────────────
section "Systemd Service"

if command -v systemctl &>/dev/null; then
    STATUS=$(systemctl is-active pibot 2>/dev/null || echo "not-found")
    if [ "$STATUS" = "active" ]; then
        pass "pibot service: active"
    elif [ "$STATUS" = "not-found" ]; then
        skip "pibot service not installed yet"
    else
        fail "pibot service status: $STATUS"
    fi
else
    skip "systemctl not available (not Linux?)"
fi

# ── 7. Live API Checks (optional) ─────────────────────────────────────────────
section "Live API Checks"

if [ "$LIVE_CHECK" = true ]; then
    BASE="http://localhost:8000"

    # Health check
    if curl -sf "$BASE/api/health" | grep -q '"status"'; then
        HEALTH=$(curl -sf "$BASE/api/health")
        pass "/api/health responded: ${HEALTH:0:80}"
    else
        fail "/api/health did not respond — is the bot running?"
    fi

    # Version check
    if curl -sf "$BASE/api/version" | grep -q '"version"'; then
        pass "/api/version responded"
    else
        fail "/api/version did not respond"
    fi
else
    skip "Live API checks skipped (use --live to enable)"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════"
echo "  Results: ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}  ${YELLOW}${SKIP} skipped${NC}"
echo "══════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}Some tests FAILED. Fix the issues above and re-run.${NC}"
    exit 1
else
    echo -e "${GREEN}All tests PASSED! ✓${NC}"
    exit 0
fi
