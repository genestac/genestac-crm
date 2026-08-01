"""
Lead scoring via GPT-4o-mini. Analyzes recent WhatsApp messages to classify a
lead as hot / warm / cold and stores the result in the lead's metadata.
"""
import os
import json
import logging
from typing import Optional
from supabase import Client

logger = logging.getLogger(__name__)


async def score_lead_from_chat(lead_id: str, lead_name: str, supabase: Client,
                                table: str = "leads") -> Optional[str]:
    """
    Fetch last 10 messages for this lead and ask GPT-4o-mini to classify them.
    Returns the score_label ('hot', 'warm', 'cold') or None on failure.
    Writes score_label + score (0-100) to the lead's metadata field.
    Also creates a notification.
    """
    try:
        import openai as _openai

        # ── 1. Fetch last 10 messages ─────────────────────────────────────────
        col = "user_id" if table == "users" else "lead_id"
        msg_res = (
            supabase.table("whatsapp_messages")
            .select("message_body, sender_type, created_at")
            .eq(col, lead_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        messages = list(reversed(msg_res.data or []))

        if not messages:
            logger.warning(f"[Scoring] No messages for lead {lead_id}, skipping.")
            return None

        # ── 2. Format conversation for GPT ───────────────────────────────────
        convo_text = "\n".join([
            f"{'LEAD' if m['sender_type'] == 'lead' else 'BOT'}: {m['message_body']}"
            for m in messages
        ])

        # ── 3. Ask GPT-4o-mini ────────────────────────────────────────────────
        client = _openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        prompt = f"""You are a lead qualification expert for a health & weight loss company called Genestac.

Analyze this WhatsApp conversation and classify the lead's buying intent.

CONVERSATION:
{convo_text}

Respond ONLY with a JSON object in exactly this format:
{{
  "label": "hot" | "warm" | "cold",
  "score": <integer 0-100>,
  "reason": "<one sentence explanation>"
}}

Guidelines:
- hot (70-100): Excited, asking about price/enrollment, wants to talk to doctor, ready to buy
- warm (35-69): Interested but has questions/hesitations, polite engagement
- cold (0-34): Unresponsive, rude, gave vague/short replies, lost interest
"""

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=150,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        label = result.get("label", "warm").lower()
        score = int(result.get("score", 50))
        reason = result.get("reason", "")

        if label not in ("hot", "warm", "cold"):
            label = "warm"
        score = max(0, min(100, score))

        logger.warning(f"[Scoring] Lead {lead_id} ({lead_name}): {label} ({score}) — {reason}")

        # ── 4. Update metadata ────────────────────────────────────────────────
        # Fetch current metadata first to merge
        id_col = "id"
        rec_res = supabase.table(table).select("metadata").eq(id_col, lead_id).execute()
        current_meta = (rec_res.data[0].get("metadata") or {}) if rec_res.data else {}
        current_meta["lead_score_label"] = label
        current_meta["lead_score"] = score
        current_meta["lead_score_reason"] = reason

        supabase.table(table).update({"metadata": current_meta}).eq(id_col, lead_id).execute()

        # ── 5. Notify ─────────────────────────────────────────────────────────
        from services.notification_service import notify_lead_scored
        notify_lead_scored(supabase, lead_name, lead_id, label)

        return label

    except Exception as e:
        logger.error(f"[Scoring] Failed to score lead {lead_id}: {e}")
        return None
