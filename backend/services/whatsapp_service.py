import os
import httpx

WHATSAPP_API_URL = "https://graph.facebook.com/v25.0"

async def send_whatsapp_template(phone_number: str, template_name: str, language_code: str = "en_US", components: list = None):
    """
    Sends a WhatsApp template message using Meta Cloud API.
    """
    token = os.getenv("WHATSAPP_TOKEN")
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    
    if not token or not phone_number_id:
        print("WhatsApp credentials not found in environment.")
        return {"error": "Missing credentials"}
        
    url = f"{WHATSAPP_API_URL}/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Strip any formatting like + or spaces from phone
    clean_phone = ''.join(filter(str.isdigit, phone_number))
    
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {
                "code": language_code
            }
        }
    }
    
    if components:
        payload["template"]["components"] = components
        
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"WhatsApp API Error: {e}")
            return {"error": str(e)}

async def sync_templates_from_meta():
    """
    Fetches all approved templates from Meta and returns them.
    """
    token = os.getenv("WHATSAPP_TOKEN")
    waba_id = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID")
    
    if not token or not waba_id:
        return {"error": "Missing WHATSAPP_BUSINESS_ACCOUNT_ID or Token"}
        
    url = f"{WHATSAPP_API_URL}/{waba_id}/message_templates?limit=1000"
    
    headers = {
        "Authorization": f"Bearer {token}",
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Meta Template Sync Error: {e}")
            return {"error": str(e)}

async def send_whatsapp_text(phone_number: str, text: str):
    """
    Sends a standard text message.
    """
    token = os.getenv("WHATSAPP_TOKEN")
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    
    if not token or not phone_number_id:
        return {"error": "Missing credentials"}
        
    url = f"{WHATSAPP_API_URL}/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    clean_phone = ''.join(filter(str.isdigit, phone_number))
    
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "text",
        "text": {
            "body": text
        }
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"WhatsApp API Error (Text): {e}")
            return {"error": str(e)}

async def send_whatsapp_interactive(phone_number: str, interactive_payload: dict):
    """
    Sends an interactive message (list or buttons).
    """
    token = os.getenv("WHATSAPP_TOKEN")
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    
    if not token or not phone_number_id:
        return {"error": "Missing credentials"}
        
    url = f"{WHATSAPP_API_URL}/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    clean_phone = ''.join(filter(str.isdigit, phone_number))
    
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "interactive",
        "interactive": interactive_payload
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"WhatsApp API Error (Interactive): {e}")
            return {"error": str(e)}
