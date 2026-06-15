import gspread
from google.oauth2.service_account import Credentials
import logging
import datetime
import os
import json
import asyncio
import traceback
from backend.config_manager import ConfigManager

logger = logging.getLogger(__name__)

class GoogleSheetsService:
    def __init__(self, config_loader):
        self.config_loader = config_loader
        self.client = None
        self.sheet = None
        self.sheet_id = None
        self.connected = False
        self.last_error = None
        self._lock = asyncio.Lock()
        
        # Modern Scopes for Google Sheets API v4
        self.scope = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]

    def _refresh_oauth_token(self, oauth_creds, config_key="google_sheets"):
        """
        Attempts to refresh an expired OAuth token using the refresh_token.
        Saves the new token back to config.json if successful.
        Returns refreshed Credentials object or None.
        """
        from google.oauth2.credentials import Credentials as UserCredentials
        from google.auth.transport.requests import Request as AuthRequest

        refresh_token = oauth_creds.get("refresh_token")
        client_id = oauth_creds.get("client_id")
        client_secret = oauth_creds.get("client_secret")
        token_uri = oauth_creds.get("token_uri", "https://oauth2.googleapis.com/token")

        if not refresh_token or not client_id or not client_secret:
            logger.warning("Cannot refresh token: missing refresh_token, client_id, or client_secret.")
            return None

        try:
            creds = UserCredentials(
                token=None,  # Force refresh
                refresh_token=refresh_token,
                token_uri=token_uri,
                client_id=client_id,
                client_secret=client_secret,
                scopes=self.scope
            )
            creds.refresh(AuthRequest())
            logger.info(f"Successfully refreshed OAuth token for {config_key}.")

            # Save the new token back to config.json via ConfigManager
            try:
                config = self.config_loader()
                section = config.get(config_key, {})
                if "oauth_credentials" in section:
                    section["oauth_credentials"]["token"] = creds.token
                    if creds.expiry:
                        section["oauth_credentials"]["expiry"] = creds.expiry.isoformat()
                    config[config_key] = section
                    ConfigManager.save_config(config)
                    logger.info(f"Saved refreshed token and expiry to config.json [{config_key}].")
            except Exception as save_err:
                logger.warning(f"Token refreshed but failed to save to config: {save_err}")

            return creds
        except Exception as e:
            logger.error(f"Failed to refresh OAuth token: {e}")
            return None

    def _connect_sync(self):
        """
        Synchronous connection logic (to be run in thread).
        Includes automatic token refresh for OAuth credentials.
        """
        self.last_error = None
        try:
            config = self.config_loader()
            sheets_config = config.get("google_sheets", {})
            yt_config = config.get("youtube", {})
            
            if not sheets_config.get("enabled", False):
                self.last_error = "Google Sheets integration is disabled."
                return False
                
            self.sheet_id = sheets_config.get("sheet_id")
            creds_file = sheets_config.get("credentials_file", "service_account.json")
            
            creds = None
            
            # 1. Try Specific Sheets OAuth Credentials
            if "oauth_credentials" in sheets_config:
                try:
                    oauth_creds = sheets_config["oauth_credentials"]
                    from google.oauth2.credentials import Credentials as UserCredentials
                    
                    expiry_val = None
                    if oauth_creds.get("expiry"):
                        try:
                            from datetime import datetime as dt
                            expiry_str = oauth_creds.get("expiry")
                            if expiry_str.endswith('Z'):
                                expiry_str = expiry_str[:-1] + '+00:00'
                            expiry_val = dt.fromisoformat(expiry_str)
                        except Exception as parse_err:
                            logger.warning(f"Failed to parse expiry: {parse_err}")

                    creds = UserCredentials(
                        token=oauth_creds.get("token"),
                        refresh_token=oauth_creds.get("refresh_token"),
                        token_uri=oauth_creds.get("token_uri"),
                        client_id=oauth_creds.get("client_id"),
                        client_secret=oauth_creds.get("client_secret"),
                        scopes=self.scope,
                        expiry=expiry_val
                    )
                    # Auto-refresh if token is expired or missing
                    if not creds.token or creds.expired:
                        logger.info("Sheets OAuth token expired or missing, refreshing...")
                        creds = self._refresh_oauth_token(oauth_creds, "google_sheets")
                        if not creds:
                            logger.warning("Token refresh failed for Sheets OAuth.")
                            creds = None
                    else:
                        logger.info("Using Separate Sheets OAuth Credentials.")
                except Exception as e:
                    logger.warning(f"Failed to load Sheets OAuth creds: {e}")

            # 2. Try YouTube OAuth Credentials (fallback)
            if not creds and "oauth_credentials" in yt_config:
                try:
                    oauth_creds = yt_config["oauth_credentials"]
                    from google.oauth2.credentials import Credentials as UserCredentials
                    
                    expiry_val = None
                    if oauth_creds.get("expiry"):
                        try:
                            from datetime import datetime as dt
                            expiry_str = oauth_creds.get("expiry")
                            if expiry_str.endswith('Z'):
                                expiry_str = expiry_str[:-1] + '+00:00'
                            expiry_val = dt.fromisoformat(expiry_str)
                        except Exception as parse_err:
                            logger.warning(f"Failed to parse expiry: {parse_err}")

                    creds = UserCredentials(
                        token=oauth_creds.get("token"),
                        refresh_token=oauth_creds.get("refresh_token"),
                        token_uri=oauth_creds.get("token_uri"),
                        client_id=oauth_creds.get("client_id"),
                        client_secret=oauth_creds.get("client_secret"),
                        scopes=self.scope,
                        expiry=expiry_val
                    )
                    # Auto-refresh if token is expired or missing
                    if not creds.token or creds.expired:
                        logger.info("YouTube OAuth token expired, refreshing for Sheets...")
                        creds = self._refresh_oauth_token(oauth_creds, "youtube")
                        if not creds:
                            logger.warning("Token refresh failed for YouTube OAuth fallback.")
                            creds = None
                    else:
                        logger.info("Using YouTube OAuth Credentials for Sheets (Fallback).")
                except Exception as e:
                    logger.warning(f"Failed to load YouTube OAuth creds: {e}")
            
            # 3. Fallback to Service Account
            if not creds:
                if os.path.exists(creds_file):
                    creds = Credentials.from_service_account_file(creds_file, scopes=self.scope)
                    logger.info("Using Service Account Credentials.")
                else:
                    self.last_error = "No valid credentials found (OAuth or Service Account)."
                    return False
                
            if not self.sheet_id:
                self.last_error = "Sheet ID not configured."
                return False
                
            try:
                self.client = gspread.authorize(creds)
                self.sheet = self.client.open_by_key(self.sheet_id).sheet1
            except Exception as e:
                # If connection fails, and we have OAuth credentials, try to refresh and retry once!
                oauth_creds = None
                config_key = None
                if "oauth_credentials" in sheets_config and sheets_config["oauth_credentials"].get("refresh_token"):
                    oauth_creds = sheets_config["oauth_credentials"]
                    config_key = "google_sheets"
                elif "oauth_credentials" in yt_config and yt_config["oauth_credentials"].get("refresh_token"):
                    oauth_creds = yt_config["oauth_credentials"]
                    config_key = "youtube"
                
                if oauth_creds:
                    logger.info(f"Connection to Google Sheets failed: {e}. Attempting token refresh and retry...")
                    creds = self._refresh_oauth_token(oauth_creds, config_key)
                    if creds:
                        try:
                            self.client = gspread.authorize(creds)
                            self.sheet = self.client.open_by_key(self.sheet_id).sheet1
                        except Exception as retry_err:
                            logger.error(f"Retry after Sheets OAuth token refresh failed: {retry_err}")
                            raise retry_err
                    else:
                        raise e
                else:
                    raise e
                
            self.connected = True
            logger.info(f"Successfully connected to Google Sheet: {self.sheet.title}")
            return True
            
        except PermissionError:
            self.last_error = f"Permission denied: The connected Google account cannot access the sheet '{self.sheet_id}'. Share the sheet with this account or create a new one."
            logger.error(f"Permission denied for sheet {self.sheet_id}")
            self.connected = False
            return False
        except Exception as e:
            self.last_error = str(e) or f"{type(e).__name__}: Connection failed"
            logger.error(f"Failed to connect to Google Sheets: {type(e).__name__}: {e}")
            self.connected = False
            return False

    async def connect(self):
        """Async wrapper for connection."""
        return await asyncio.to_thread(self._connect_sync)

    def _log_transaction_sync(self, data):
        """Synchronous logging logic."""
        if not self.connected:
            if not self._connect_sync():
                return
                
        try:
            # Prepare row data
            now = datetime.datetime.now()
            date_str = now.strftime("%Y-%m-%d")
            time_str = now.strftime("%H:%M:%S")
            
            row = [
                date_str,
                time_str,
                data.get("user", "Unknown"),
                str(data.get("amount", 0)),
                data.get("type", "Tip"),
                data.get("message", ""),
                data.get("transaction_id", "")
            ]
            
            self.sheet.append_row(row)
            logger.info(f"Logged transaction to Sheets: {data.get('transaction_id')}")
            
        except Exception as e:
            logger.error(f"Failed to log transaction to Sheets: {e}")
            # Attempt reconnect on next try
            self.connected = False

    async def log_transaction(self, data):
        """
        Logs a transaction to Google Sheets asynchronously (non-blocking).
        Waits for the operation to complete in a worker thread.
        """
        await asyncio.to_thread(self._log_transaction_sync, data)
