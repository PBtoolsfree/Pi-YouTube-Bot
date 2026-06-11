# =============================================================================
#  Pi YouTube Bot — Dockerfile v3
#  Multi-stage: Node.js builds frontend, Python slim runs backend
# =============================================================================

# ── Stage 1: Build React Frontend ─────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --silent

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python Runtime ───────────────────────────────────────────────────
FROM python:3.11-slim

LABEL org.opencontainers.image.title="Pi YouTube Bot"
LABEL org.opencontainers.image.version="3.0.0"
LABEL org.opencontainers.image.source="https://github.com/PBtoolsfree/pi-youtube-bot"

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 pibot

WORKDIR /app

# Install Python dependencies as root (faster layer caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY main.py VERSION ./

# Copy built frontend from stage 1
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Runtime directories
RUN mkdir -p /app/logs /app/data && chown -R pibot:pibot /app

USER pibot

# config.json and .env are mount points — validated at runtime
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

EXPOSE 8000

CMD ["python", "main.py"]
