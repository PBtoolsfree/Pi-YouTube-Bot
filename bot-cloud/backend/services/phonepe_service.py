import hashlib
import base64
import json
import logging
import httpx
import uuid

logger = logging.getLogger(__name__)

class PhonePeService:
    """
    Service for handling PhonePe Payment Gateway integration (Standard Checkout).
    Async implementation.
    """

    def __init__(self, config_loader_func):
        self.config_loader = config_loader_func
        # Production URL: https://api.phonepe.com/apis/hermes
        # Sandbox URL: https://api-preprod.phonepe.com/apis/pg-sandbox
        self.BASE_URL = "https://api.phonepe.com/apis/hermes" 

    def _get_credentials(self):
        config = self.config_loader()
        gateway_config = config.get("tip_page", {}).get("gateway", {})
        
        # Check if provider is PhonePe
        if gateway_config.get("provider") != "phonepe":
            return None, None, None
            
        merchant_id = gateway_config.get("merchant_id")
        salt_key = gateway_config.get("salt_key")
        salt_index = gateway_config.get("salt_index", "1")
        
        return merchant_id, salt_key, salt_index

    def generate_checksum(self, payload_base64, salt_key, salt_index, api_endpoint):
        """
        Generates X-VERIFY checksum.
        Format: SHA256(Base64 payload + api endpoint + salt key) + ### + salt index
        """
        data_to_hash = payload_base64 + api_endpoint + salt_key
        checksum = hashlib.sha256(data_to_hash.encode('utf-8')).hexdigest()
        return f"{checksum}###{salt_index}"

    async def initiate_payment(self, amount, user_id, callback_url, redirect_url):
        """
        Initiates a payment request with PhonePe.
        Returns the redirect URL for the user.
        """
        merchant_id, salt_key, salt_index = self._get_credentials()
        
        if not merchant_id or not salt_key:
            raise Exception("PhonePe credentials not configured")

        # Amount in paise (multiply by 100)
        amount_paise = int(float(amount) * 100)
        merchant_order_id = f"TX{uuid.uuid4().hex[:12].upper()}"
        
        payload = {
            "merchantId": merchant_id,
            "merchantTransactionId": merchant_order_id,
            "merchantUserId": user_id[:30], # Max 36 chars
            "amount": amount_paise,
            "redirectUrl": redirect_url,
            "redirectMode": "POST",
            "callbackUrl": callback_url,
            "mobileNumber": "9999999999", # Optional but recommended
            "paymentInstrument": {
                "type": "PAY_PAGE"
            }
        }

        # Encode Payload
        payload_json = json.dumps(payload)
        payload_base64 = base64.b64encode(payload_json.encode('utf-8')).decode('utf-8')
        
        # Generate Checksum
        api_endpoint = "/pg/v1/pay"
        x_verify = self.generate_checksum(payload_base64, salt_key, salt_index, api_endpoint)
        
        headers = {
            "Content-Type": "application/json",
            "X-VERIFY": x_verify,
            "accept": "application/json"
        }
        
        # Make Request (Async)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(f"{self.BASE_URL}{api_endpoint}", json={"request": payload_base64}, headers=headers)
                response_data = response.json()
            
            if response_data.get("success"):
                return {
                    "url": response_data["data"]["instrumentResponse"]["redirectInfo"]["url"],
                    "order_id": merchant_order_id
                }
            else:
                logger.error(f"PhonePe Error: {response_data}")
                raise Exception(response_data.get("message", "Payment initiation failed"))
                
        except Exception as e:
            logger.error(f"PhonePe Exception: {e}")
            raise e

    async def verify_status(self, merchant_transaction_id):
        """
        Checks status of a transaction from PhonePe API.
        """
        merchant_id, salt_key, salt_index = self._get_credentials()
        if not merchant_id:
            return {"status": "ERROR", "message": "No Creds"}

        api_endpoint = f"/pg/v1/status/{merchant_id}/{merchant_transaction_id}"
        
        # Checksum for Status Check: SHA256(api endpoint + salt key) + ### + salt index
        data_to_hash = api_endpoint + salt_key
        checksum = hashlib.sha256(data_to_hash.encode('utf-8')).hexdigest()
        x_verify = f"{checksum}###{salt_index}"
        
        headers = {
            "Content-Type": "application/json",
            "X-VERIFY": x_verify,
            "X-MERCHANT-ID": merchant_id
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.BASE_URL}{api_endpoint}", headers=headers)
                return response.json()
        except Exception as e:
            logger.error(f"PhonePe Status Check Error: {e}")
            return {"success": False}
