import os
import json
import openai
from supabase import Client
from typing import Dict, Any, Tuple

# Initialize OpenAI client
# Assumes OPENAI_API_KEY is in environment variables
oai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def get_rag_context(query: str, supabase: Client) -> str:
    """Generates an embedding for the query and fetches relevant knowledge base items."""
    try:
        # Generate embedding
        embed_res = oai_client.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        query_embedding = embed_res.data[0].embedding

        # Match in Supabase
        res = supabase.rpc(
            'match_knowledge_base',
            {'query_embedding': query_embedding, 'match_threshold': 0.5, 'match_count': 3}
        ).execute()

        if not res.data:
            return ""

        context_pieces = []
        for item in res.data:
            context_pieces.append(f"Title: {item.get('title')}\nContent: {item.get('content')}")
        
        return "\n\n".join(context_pieces)
    except Exception as e:
        print(f"[OpenAI Agent] Failed to fetch RAG context: {e}")
        return ""

async def process_whatsapp_message(lead: dict, message: str, supabase: Client) -> Tuple[str, bool]:
    """
    Processes the incoming WhatsApp message using GPT-4o-mini and RAG context.
    Returns a tuple of (AI_Response_Text, Should_Trigger_Call).
    """
    metadata = lead.get("metadata", {})
    
    # 1. Fetch Chat History from Database
    lead_col = "user_id" if "phone" in lead else "lead_id"
    history_res = supabase.table("whatsapp_messages") \
        .select("sender_type, message_body") \
        .eq(lead_col, lead["id"]) \
        .order("created_at", desc=False) \
        .limit(20) \
        .execute()
        
    chat_history = []
    if history_res.data:
        for msg in history_res.data:
            role = "user" if msg["sender_type"] == "lead" else "assistant"
            chat_history.append({"role": role, "content": msg["message_body"]})
            
    # Remove the incoming message if it's already at the end of the history (webhook inserted it)
    if chat_history and chat_history[-1]["content"] == message:
        chat_history.pop()

    # 2. Fetch RAG Context
    rag_context = await get_rag_context(message, supabase)
    
    # 2. Fetch Dashboard AI Settings (Base Prompt)
    base_prompt = "You are a helpful, empathetic, and professional AI assistant for Genestac CRM (a clinic/medical center)."
    settings_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
    if settings_res.data and "settings_value" in settings_res.data[0]:
        base_prompt = settings_res.data[0]["settings_value"].get("base_prompt", base_prompt)

    # 3. Build System Prompt
    system_prompt = f"""{base_prompt}

Your secondary goal is to answer the user's questions using the provided Knowledge Base, and gently collect their information to schedule a consultation.

Current Knowledge Base Context for the user's query:
{rag_context if rag_context else "No specific knowledge base context found for this query."}

Lead Information we currently have:
- Name: {lead.get('name') or 'Not provided yet'}
- Medical Condition: {metadata.get('medical_condition') or 'Not provided yet'}

Instructions:
1. Be concise, warm, and conversational. Do not sound like a robot.
2. If the user asks a question, answer it using the Knowledge Base context.
3. If we don't have their Name, naturally ask for it.
4. If we have their name but not their Medical Condition, ask them what condition they are seeking treatment for (e.g., Diabetes, Fatty Liver, PCOS, etc.).
5. If we have both their name and condition, ask if they would like to speak to our doctor/team on a phone call.
6. If the user explicitly asks for a call, says "yes" to a call, or wants to talk to a human, call the `trigger_exotel_call` function.
"""

    # 4. Construct Messages
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add history (last 10 messages to keep context window small)
    for msg in chat_history[-10:]:
        messages.append(msg)
        
    messages.append({"role": "user", "content": message})

    # 4. Define Functions (Tools)
    tools = [
        {
            "type": "function",
            "function": {
                "name": "trigger_exotel_call",
                "description": "Triggers an outbound phone call to the user immediately. Call this ONLY when the user explicitly agrees to or requests a phone call.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "save_lead_info",
                "description": "Saves critical structured medical and personal information about the user. Call this anytime the user reveals new information about themselves.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "The user's full name."},
                        "age": {"type": "number", "description": "The user's age."},
                        "medical_condition": {"type": "string", "description": "The primary medical condition or disease they have (e.g. Diabetes, PCOS, Fatty Liver)."},
                        "weight": {"type": "string", "description": "The user's current weight."},
                        "budget": {"type": "string", "description": "The user's budget for treatment, if mentioned."},
                        "goals": {"type": "string", "description": "The user's health goals (e.g. weight loss, reversal)."},
                        "other_critical_info": {"type": "string", "description": "Any other critical medical or personal information mentioned."}
                    },
                    "required": []
                }
            }
        }
    ]

    try:
        response = oai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=250
        )

        response_message = response.choices[0].message
        ai_text = response_message.content or ""
        should_trigger_call = False

        # Handle function calls
        if response_message.tool_calls:
            for tool_call in response_message.tool_calls:
                func_name = tool_call.function.name
                
                if func_name == "trigger_exotel_call":
                    should_trigger_call = True
                    if not ai_text:
                        ai_text = "I've arranged for our team to call you right away. Please expect a call shortly!"
                        
                elif func_name == "save_lead_info":
                    args = json.loads(tool_call.function.arguments)
                    update_data = {}
                    
                    
                    if "name" in args and args["name"]:
                        update_data["name"] = args["name"]
                        lead["name"] = args["name"]
                        
                    # Extract structured metadata fields
                    metadata_fields = ["age", "medical_condition", "weight", "budget", "goals", "other_critical_info"]
                    metadata_updated = False
                    for field in metadata_fields:
                        if field in args and args[field]:
                            metadata[field] = args[field]
                            metadata_updated = True
                            
                    if metadata_updated:
                        update_data["metadata"] = metadata
                        
                    if update_data:
                        # We use 'leads' or 'users' depending on where they came from
                        # The webhook handler will save the updated metadata anyway, but we can do a quick update here
                        table = "users" if "phone" in lead else "leads"
                        supabase.table(table).update(update_data).eq("id", lead["id"]).execute()

            # If the AI only called a function and didn't provide text, we can do a second pass or just use a default
            if not ai_text and not should_trigger_call:
                messages.append(response_message)
                messages.append({
                    "role": "tool",
                    "tool_call_id": response_message.tool_calls[0].id,
                    "name": response_message.tool_calls[0].function.name,
                    "content": "Success"
                })
                second_response = oai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    temperature=0.7,
                    max_tokens=250
                )
                ai_text = second_response.choices[0].message.content or "Thank you!"

        # We don't save chat history to metadata anymore, it is stored in whatsapp_messages
        return ai_text, should_trigger_call

    except Exception as e:
        print(f"[OpenAI Agent] Error generating response: {e}")
        import traceback
        traceback.print_exc()
        return "I apologize, but I am having trouble connecting right now. A member of our team will reach out to you shortly.", False
