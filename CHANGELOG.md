# Changelog

All notable changes to Pi YouTube Bot are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
This project uses [Semantic Versioning](https://semver.org/).

---

## [3.0.2] — 2026-05-06

### Fixed
- **CRITICAL**: Fixed `UnboundLocalError` in `audio_service.py` crashing the audio loop when auto-language detects Hinglish/Benglish.
- **CRITICAL**: Fixed `/dev/shm` memory leak in `audio_service.py` where failed TTS generation left 0-byte `.mp3` files in RAM disk, eventually crashing the Pi.
- Fixed an architectural flaw in `audio_service.py` where ALSA fallback using `bash -c` created unkillable zombie processes (`ffmpeg` and `aplay`) upon skipping or timeout. Now uses `ffplay` natively.
- Fixed a bug where skipping an audio track or pausing the queue would artificially degrade system health status due to untreated non-zero exit codes.
- Fixed aggressive URL removal regex in `_clean_for_tts` which incorrectly stripped regular sentences missing spaces after punctuation (e.g., "Hello.How").

### Added
- Implemented Async Logging for `audio_service.py` (`_append_audio_log`) using `loop.run_in_executor` to offload synchronous SD card file I/O to a background thread pool, preventing micro-blocking of the main async event loop. Added thread lock for safe log rotation.

## [3.0.1] — 2026-02-28

### 🔒 Security Patch Release

### Fixed — Critical Security
- **CRITICAL**: `client_secret.json` (Google OAuth credentials) was tracked in git — now removed from tracking via `git rm --cached`. Added to `.gitignore`
- **CRITICAL**: `backend/services/api.py` — raw `open("config.json","r")` at module import replaced with `ConfigManager.get_config()`
- **CRITICAL**: `backend/services/api.py` — all `open("config.json","w")` writes replaced with `ConfigManager.save_config()` (9 endpoints fixed)

### Added
- **`client_secret.example.json`** — Template with setup instructions; real file gitignored
- **`.github/workflows/ci.yml`** — GitHub Actions CI with 3 jobs:
  - `backend`: Python import check, secrets scan, raw file access check, VERSION check
  - `frontend`: `npm ci` + `npm run build` + dist verification
  - `security`: gitignore enforcement (.env, config.json, client_secret.json), required files check
- **`docs/Update-Guide.md`** — Manual update, force reinstall, auto-update cron, rollback, backup
- **`docs/Cloudflare-Setup.md`** — Quick temp tunnel, permanent named tunnel (full step-by-step), webhook URLs, troubleshooting

### Changed
- **VERSION** → `3.0.1`
- All 33 `print()` calls in `backend/services/api.py` → `logger.*`
- `ai_handler.py` and `auth_service.py` — logging headers added, `print()` replaced
- Removed `scripts/expose_publicly.ps1`, `scripts/expose_publicly.sh`
- Removed root-level duplicate `setup.sh`, `update.sh`, `uninstall.sh`

### Security — Audit Results
- Hardcoded API keys: **CLEAN** (none found)
- `.env` gitignored: **CONFIRMED**
- `config.json` gitignored: **CONFIRMED**
- `client_secret.json` gitignored: **CONFIRMED** (fixed in this release)
- `node_modules` / `__pycache__` tracked: **NONE**
- `open("config.json")` in production code: **ZERO** (eliminated)

---

## [3.0.0] — 2026-02-28

### 🚀 Major Release — Clean Production Rebuild

This release is a complete structural overhaul of the codebase.
All features from v2.x are preserved and improved.

### Added
- **`scripts/` directory** — All management scripts consolidated:
  - `scripts/setup.sh` — Full production installer with Python version check, logrotate, inline service generation
  - `scripts/start.sh` — systemd start wrapper with optional auto-update on boot
  - `scripts/update.sh` — Rollback-capable update with stash protection and `--force` flag
  - `scripts/uninstall.sh` — Clean removal including logrotate config
  - `scripts/auto-update.sh` — Daily cron with stale-lock detection (1hr threshold)
- **`CHANGELOG.md`** — This file; semantic versioning records
- **`/api/health`** endpoint — Version, uptime, service status
- **`/api/version`** endpoint — Current version string
- **Log rotation** — logrotate config installed by setup.sh (7 days, 20 MB max)
- **`.env` support** — All secrets can be stored in `.env` instead of `config.json`
- **`ConfigManager.validate_config()`** — Startup config validation with warnings
- **Structured logging** — Rotating file handler (10 MB × 5) → `logs/pibot.log`
- **Multi-stage Dockerfile** — Node build stage + Python slim runtime
- **`docker-compose.yml`** — Production compose with UDP ports, volumes, healthcheck
- **`tests/test_basic.sh`** — Smoke test script (`--live` for API checks)
- **`docs/`** — 9 comprehensive documentation files

### Changed
- **VERSION** → `3.0.0`
- **`scripts/`** replaces `pi_setup/` entirely
- **`backend/config_manager.py`** — Atomic save (`.tmp` → replace), proper singleton
- **`backend/ai_service.py`** — Uses `ConfigManager`, structured logging throughout
- **`backend/audio_service.py`** — Fixed hardcoded `config.json` path, `shutil.which()` for ffplay
- **`backend/api.py`** — `ConfigManager` throughout, CORS from config, `/api/health`
- **`main.py`** — `reload=False`, rotating file logs, version banner
- **`requirements.txt`** — All 23 packages pinned for reproducible installs

### Removed
- `pi_setup/` — Replaced by `scripts/`
- `verify_*.py` — Leftover test scripts
- `run_prod.py` — Superseded by `main.py`
- `restart.sh` — Use `sudo systemctl restart pibot`
- `push_to_github.ps1` — Windows-only dev convenience script
- `setup_ffmpeg.ps1` — Windows-only; Linux uses apt-get
- `test_tts.py` — Replaced by `tests/test_basic.sh`
- `EMAIL_SETUP.md` — Content merged into `docs/Donations-Setup.md`

### Fixed
- **CRITICAL**: `pibot.service` had `PLACEHOLDER_USER`/`PLACEHOLDER_DIR` never substituted → service always failed on boot. Now generated inline by `setup.sh`.
- `audio_service.py` opened `config.json` with relative path → failed under systemd
- `api.py` top-level `open("config.json")` — same relative path issue
- `update.sh` had no rollback — bad update permanently broke bot
- `main.py` had `reload=True` in production — CPU hog on Pi 4
- `ffplay` path used fragile string replacement on `ffmpeg_exe`

### Security
- Webhook endpoints protected by `webhook_secret` config key
- Cloudflare Tunnel allows only approved paths via `allowed_public_paths`
- Rate limiting: 60 req/min per IP on tunnel traffic
- CORS origins configurable via `security.cors_origins`
- Secrets in `.env` (gitignored), not in `config.json`

---

## [2.0.0] — 2026-02-28

### Added
- Version pinning in `requirements.txt`
- `ConfigManager` singleton with file-change polling
- `/api/health` endpoint draft
- `Dockerfile` (multi-stage)
- `docker-compose.yml`
- `.env.example`
- `tests/test_basic.sh` smoke tests

### Changed
- `backend/api.py` — Replaced `print()` with `logger.*`
- `backend/audio_service.py` — Partial config path fix
- `main.py` — Logging improvements

---

## [1.x.x] — 2026-02-14

### Initial public versions
- YouTube Live Chat reading via pytchat
- AI chat response (Gemini, OpenAI, OpenRouter)
- Edge-TTS audio via UDP to gaming PC
- Donation alerts (PhonePe, Paytm)
- Telegram notifications
- Cloudflare Tunnel integration
- OBS WebSocket overlay
- Loyalty points system
- Google Sheets logging
- React dashboard (Vite)
- Basic Raspberry Pi setup scripts

---

[3.0.0]: https://github.com/PBtoolsfree/pi-youtube-bot/releases/tag/v3.0.0
[2.0.0]: https://github.com/PBtoolsfree/pi-youtube-bot/releases/tag/v2.0.0

[3.0.1]: https://github.com/PBtoolsfree/pi-youtube-bot/releases/tag/v3.0.1
