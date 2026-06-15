from backend.services.email_service import EmailService

def loader():
    return {
        "email_verification": {
            "email": "pbtoolsfree@gmail.com",
            "app_password": "jnvwkkyxasqvdwcf",
            "imap_server": "imap.gmail.com"
        }
    }

service = EmailService(loader)
print("Connecting...")
res = service._connect()
print("Result:", res)
print("Error:", service.last_error)
