import os
import json
import logging
import google_auth_oauthlib.flow
import google.oauth2.credentials
from google.auth.transport.requests import Request

logger = logging.getLogger(__name__)

_OAUTH_STATE_STORE = {}

class AuthService:
    def __init__(self, config_loader):
        self.config_loader = config_loader
        self.client_secrets_file = "client_secret.json"
        
        # Scopes needed for YouTube Data API (Read and Moderate)
        self.SCOPES = [
            'https://www.googleapis.com/auth/youtube',
            'https://www.googleapis.com/auth/youtube.force-ssl'
        ]
        # Default redirect URI (fallback)
        self.DEFAULT_REDIRECT_URI = "http://localhost:8000/api/auth/youtube/callback"

    def get_auth_url(self, redirect_uri=None, scopes=None, client_secrets_file=None):
        """Generates the Google OAuth 2.0 authorization URL."""
        secrets_file = client_secrets_file or self.client_secrets_file
        if not os.path.exists(secrets_file):
            raise FileNotFoundError(f"Missing {secrets_file}. User must download this from Google Cloud Console.")

        # Use provided scopes or fall back to default
        target_scopes = scopes or self.SCOPES

        flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
            secrets_file, scopes=target_scopes)

        # Use the provided redirect_uri (based on request host) or fall back to default
        flow.redirect_uri = redirect_uri or self.DEFAULT_REDIRECT_URI

        authorization_url, state = flow.authorization_url(
            access_type='offline',
            prompt='consent')
            
        if getattr(flow, 'code_verifier', None):
            _OAUTH_STATE_STORE[state] = flow.code_verifier

        return authorization_url, state

    def exchange_code(self, code, redirect_uri=None, scopes=None, client_secrets_file=None, state=None):
        """Exchanges the authorization code for tokens."""
        secrets_file = client_secrets_file or self.client_secrets_file
        if not os.path.exists(secrets_file):
            raise FileNotFoundError(f"Missing {secrets_file}")
            
        # Use provided scopes or fall back to default
        target_scopes = scopes or self.SCOPES
        logger.info(f"Exchanging code. Provided scopes: {scopes}. Target scopes: {target_scopes}")

        flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
            secrets_file, scopes=target_scopes)
        flow.redirect_uri = redirect_uri or self.DEFAULT_REDIRECT_URI
        
        if state and state in _OAUTH_STATE_STORE:
            flow.code_verifier = _OAUTH_STATE_STORE.pop(state)
        
        flow.fetch_token(code=code)
        
        credentials = flow.credentials
        
        return self._credentials_to_dict(credentials)

    def _credentials_to_dict(self, credentials):
        expiry_str = None
        if credentials.expiry:
            expiry_str = credentials.expiry.isoformat()
        return {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': list(credentials.scopes) if credentials.scopes else [],
            'expiry': expiry_str
        }
