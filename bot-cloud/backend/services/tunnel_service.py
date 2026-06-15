import asyncio
import logging
import platform
import os
import subprocess
import shutil
import aiohttp
import re
import json
from backend.config_manager import ConfigManager

logger = logging.getLogger(__name__)

class TunnelService:
    def __init__(self, port=8000):
        self.port = port
        self.process = None
        self.public_url = None
        self.is_running = False
        self._binary_path = self._get_binary_path()

    def _get_binary_path(self):
        """Determine path for the cloudflared binary"""
        system = platform.system().lower()
        if system == "windows":
            return os.path.abspath("cloudflared.exe")
        return os.path.abspath("cloudflared")

    async def _download_binary(self):
        """Auto-detect OS/Arch and download correct binary"""
        if os.path.exists(self._binary_path):
            return True

        logger.info("Cloudflared binary not found. Downloading...")
        
        system = platform.system().lower()
        machine = platform.machine().lower()
        
        url = ""
        if system == "windows":
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        elif system == "linux":
            if "aarch64" in machine:
                url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
            elif "arm" in machine:
                url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
            else:
                url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        elif system == "darwin":
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz" # Simplified for now
            logger.warning("MacOS support is experimental.")

        if not url:
            logger.error(f"Unsupported Platform: {system} {machine}")
            return False

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        with open(self._binary_path, "wb") as f:
                            f.write(await resp.read())
                        
                        if system != "windows":
                            os.chmod(self._binary_path, 0o755)
                            
                        logger.info("Cloudflared downloaded successfully.")
                        return True
                    else:
                        logger.error(f"Download failed: {resp.status}")
                        return False
        except Exception as e:
            logger.error(f"Download error: {e}")
            return False

    async def start(self):
        if self.is_running:
            return {"status": "already_running", "url": self.public_url}

        if not os.path.exists(self._binary_path):
            logger.info("Cloudflared binary not found. Downloading...")
            success = await self._download_binary()
            if not success:
                return {"status": "error", "message": "Failed to download cloudflared"}

        # Load config to check for token
        try:
            config = ConfigManager.get_config()
            token = config.get("cloudflared_token", "").strip()
        except Exception:
            token = ""

        # Prepare Logfile
        self.log_file = os.path.abspath("cloudflared.log")
        # clean old log
        if os.path.exists(self.log_file):
            try:
                os.remove(self.log_file)
            except Exception:
                pass

        if token:
            logger.info("Starting Tunnel with Token (Persistent Mode)...")
            cmd = [self._binary_path, "tunnel", "--logfile", self.log_file, "run", "--token", token]
            
            # Check for manual override
            manual_url = config.get("public_url", "").strip()
            if manual_url:
                 self.public_url = manual_url
            else:
                 self.public_url = "Persistent URL (Check Cloudflare Dashboard)" 
        else:
            logger.info("Starting Tunnel in Quick Mode (Random URL)...")
            # Added --logfile so we can read it reliably on Windows
            cmd = [self._binary_path, "tunnel", "--logfile", self.log_file, "--url", f"http://localhost:{self.port}"]

        try:
            self.is_running = True
            asyncio.create_task(self._watchdog_loop(cmd, bool(token)))
            return {"status": "started", "message": "Tunnel initializing..."}
        except Exception as e:
            logger.error(f"Failed to start tunnel task: {e}")
            return {"status": "error", "message": str(e)}

    async def _watchdog_loop(self, cmd, has_token):
        logger.info("Tunnel Watchdog Started")
        failures = 0
        try:
            while self.is_running:
                if self.process is None or self.process.poll() is not None:
                    if failures > 0:
                        logger.warning(f"Tunnel process died. Restarting... (Attempt {failures})")
                        await asyncio.sleep(5)
                    
                    try:
                        # No need for PIPE on stderr since we use logfile
                        self.process = subprocess.Popen(
                            cmd, 
                            stdout=subprocess.DEVNULL, 
                            stderr=subprocess.DEVNULL, 
                            text=True
                        )
                        # Restart monitor for new process
                        asyncio.create_task(self._monitor_output(has_token))
                        failures = 0
                    except Exception as e:
                        logger.error(f"Failed to launch tunnel: {e}")
                        failures += 1
                
                await asyncio.sleep(2)

        except Exception as e:
            logger.error(f"Failed to start tunnel: {e}")
            self.is_running = False
            return {"status": "error", "message": str(e)}

    async def _monitor_output(self, has_token=False):
        """Reads logfile to find the trycloudflare.com URL"""
        logger.info("Monitoring Tunnel Logfile...")
        # Regex to capture https://....trycloudflare.com
        url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        
        # Poll the file
        retries = 0
        while self.is_running and retries < 30: # 30 seconds timeout
            if os.path.exists(self.log_file):
                try:
                    with open(self.log_file, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                        
                        if has_token:
                             if "inf Connection" in content:
                                 break # Ready
                        else:
                            match = url_pattern.search(content)
                            if match:
                                self.public_url = match.group(0)
                                logger.info(f"Tunnel URL Found: {self.public_url}")
                                return
                except Exception as e:
                    pass # file locked or something, retry
            
            await asyncio.sleep(1)
            retries += 1

        if not self.public_url and not has_token:
            logger.warning("Tunnel URL not found in logs.")

    def stop(self):
        if self.process:
            try:
                self.process.terminate()
                self.process = None
            except Exception:
                pass
        self.is_running = False
        self.public_url = None
        logger.info("Tunnel Stopped.")

    def get_status(self):
        # Dynamic Override Check
        try:
            cfg = ConfigManager.get_config()
            override = cfg.get("public_url", "").strip()
            if override:
                # If we have an override, return it while running
                return {"is_running": self.is_running, "url": override}
        except Exception:
            pass

        return {
            "is_running": self.is_running,
            "url": self.public_url
        }
