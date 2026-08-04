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

ABUSE_WARNING_MSG = (
    "⚠️ We noticed your message was inappropriate. Please keep the conversation respectful. "
    "One more such message and our support team will take over."
)

ABUSE_FINAL_MSG = (
    "Our team will contact you shortly. This automated assistant has stopped responding to this conversation. 🙏"
)

async def is_abusive(text: str) -> bool:
    """
    Uses OpenAI's free Moderation API to detect harassment, hate, sexual content,
    violence, or self-harm. Returns True if the message is flagged.
    """
    try:
        mod_res = oai_client.moderations.create(input=text)
        result = mod_res.results[0]
        cats = result.categories
        return any([
            cats.harassment,
            cats.harassment_threatening,
            cats.hate,
            cats.hate_threatening,
            cats.sexual,
            cats.sexual_minors,
            cats.violence,
            cats.violence_graphic,
            cats.self_harm,
            cats.self_harm_intent,
            cats.self_harm_instructions,
        ])
    except Exception as e:
        print(f"[Moderation] API error: {e}")
        return False


async def process_whatsapp_message(lead: dict, message: str, supabase: Client) -> Tuple[str, bool]:
    """
    Processes the incoming WhatsApp message using GPT-4o-mini and RAG context.
    Returns a tuple of (AI_Response_Text, Should_Trigger_Call).
    """
    metadata = lead.get("metadata", {}) or {}
    table = "users" if "phone" in lead else "leads"

    # ── Two-Strike Abuse Guard ───────────────────────────────────────────────
    # If already hard-blocked from a previous session, stay silent
    if metadata.get("abuse_blocked"):
        print(f"[Abuse Guard] Lead {lead['id']} is hard-blocked. Ignoring message.")
        return "", False

    flagged = await is_abusive(message)
    if flagged:
        strikes = int(metadata.get("abuse_strikes", 0)) + 1
        metadata["abuse_strikes"] = strikes
        print(f"[Abuse Guard] Lead {lead['id']} — strike {strikes}")

        if strikes >= 2:
            # Hard limit: pause bot permanently
            metadata["bot_paused"] = True
            metadata["abuse_blocked"] = True
            supabase.table(table).update({"metadata": metadata}).eq("id", lead["id"]).execute()
            print(f"[Abuse Guard] Lead {lead['id']} — HARD BLOCKED after {strikes} strikes.")
            return ABUSE_FINAL_MSG, False
        else:
            # First strike: warn and save count, do not pass to GPT
            supabase.table(table).update({"metadata": metadata}).eq("id", lead["id"]).execute()
            return ABUSE_WARNING_MSG, False
    # ─────────────────────────────────────────────────────────────────────────


    
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

Your goal is to answer questions using the Knowledge Base and gently guide the lead toward booking a consultation.

Knowledge Base Context:
{rag_context if rag_context else "No specific context found."}

Lead Information:
- Name: {lead.get('name') or 'Not provided'}
- Medical Condition: {metadata.get('medical_condition') or 'Not provided'}

STRICT RULES — follow these exactly:
1. NEVER use markdown: no *, **, •, -, #, or any bullet points or bold text. WhatsApp shows them as raw characters.
2. Keep every reply SHORT — maximum 2-3 sentences. If you need to share multiple points, pick the most important one only.
3. Write in a natural Hinglish mix (Hindi + English) — casual, warm, human. Not robotic or formal.
4. Do NOT repeat yourself or re-introduce yourself in every message.
5. If the user asks a question, answer it briefly using the Knowledge Base, then ask ONE follow-up.
6. If we don't have their name, ask for it naturally in one short sentence.
7. If we have their name but not their condition, ask what health issue they want help with.
8. If we have both, ask if they'd like a call with our doctor/team.
9. If the user says "yes" to a call, says "call me", or wants to speak to someone, call trigger_exotel_call immediately.
10. NEVER write long paragraphs. If your reply is more than 3 lines, it is too long — cut it down.
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
            max_tokens=120
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
                    max_tokens=120
                )
                ai_text = second_response.choices[0].message.content or "Thank you!"

        # We don't save chat history to metadata anymore, it is stored in whatsapp_messages
        return ai_text, should_trigger_call

    except Exception as e:
        print(f"[OpenAI Agent] Error generating response: {e}")
        import traceback
        traceback.print_exc()
        return "I apologize, but I am having trouble connecting right now. A member of our team will reach out to you shortly.", False
