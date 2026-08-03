"""
Lead scoring via GPT-4o-mini. Analyzes recent WhatsApp messages to classify a
lead as hot / warm / cold and stores the result in the lead's metadata.

Score storage strategy (channel isolation):
  - Chat scores  → metadata: chat_score, chat_score_label, chat_score_reason, chat_scored_at
  - Call scores  → metadata: call_score, call_score_label, call_score_reason, call_scored_at
                   (written by voice_stream.py post-call handler)
  - Display score → metadata: lead_score, lead_score_label
                   Always equals whichever channel produced the MOST RECENT score.
"""
import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from supabase import Client

logger = logging.getLogger(__name__)


async def score_lead_from_chat(lead_id: str, lead_name: str, supabase: Client,
                                table: str = "leads") -> Optional[str]:
    """
    Fetch last 10 messages for this lead and ask GPT-4o-mini to classify them.
    Returns the score_label ('hot', 'warm', 'cold') or None on failure.
    Writes channel-isolated score keys to metadata and updates the shared
    display score only if this chat score is the most recent across channels.
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
        prompt = f"""You are a strict lead qualification expert for a health & weight loss company called Genestac.

Analyze this WhatsApp conversation and score the lead's ACTUAL buying intent based ONLY on what was said.

CONVERSATION:
{convo_text}

Respond ONLY with a JSON object in exactly this format:
{{
  "score": <integer 0-100>,
  "reason": "<one sentence explanation>"
}}

STRICT SCORING RULES — read carefully before scoring:
- Score 0–15: Lead only said hello / gave their name / gave a one-word reply. No interest shown whatsoever.
- Score 16–39 (Cold): Minimal engagement. Polite but non-committal, short replies, no questions about the product.
- Score 40–69 (Warm): Lead asked questions about the program, price, process, or their health. Shows genuine curiosity.
- Score 70–100 (Hot): Lead explicitly asked about enrollment, price breakdown, appointment with a doctor, or said they want to join.

IMPORTANT RULES:
- A greeting or name introduction ALONE must score 0–15. Never above 20 for only an intro.
- Do NOT give high scores for polite small talk. Politeness ≠ intent.
- Score based on EXPLICIT buying signals, not assumptions.
- If the conversation is one-sided (lead barely replied), score ≤ 20."""

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=150,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        score = int(result.get("score", 20))
        reason = result.get("reason", "")

        score = max(0, min(100, score))

        # Derive label from score in code — never trust AI for label
        # Unified thresholds used by both chatbot and voicebot
        if score >= 70:
            label = "hot"
        elif score >= 40:
            label = "warm"
        else:
            label = "cold"

        logger.warning(f"[Scoring] Lead {lead_id} ({lead_name}): {label} ({score}) — {reason}")

        # ── 4. Update metadata ────────────────────────────────────────────────
        # Fetch current metadata first to merge
        rec_res = supabase.table(table).select("metadata").eq("id", lead_id).execute()
        current_meta = (rec_res.data[0].get("metadata") or {}) if rec_res.data else {}

        now_iso = datetime.now(timezone.utc).isoformat()

        # Always write channel-specific chat score keys (never clobbers call score)
        current_meta["chat_score"] = score
        current_meta["chat_score_label"] = label
        current_meta["chat_score_reason"] = reason
        current_meta["chat_scored_at"] = now_iso

        # Update the shared display score (lead_score / lead_score_label) only if
        # this chat score is more recent than the latest call score.
        call_scored_at_str = current_meta.get("call_scored_at")
        chat_is_latest = True
        if call_scored_at_str:
            try:
                call_scored_at = datetime.fromisoformat(call_scored_at_str)
                # Ensure both are timezone-aware for comparison
                if call_scored_at.tzinfo is None:
                    call_scored_at = call_scored_at.replace(tzinfo=timezone.utc)
                chat_is_latest = datetime.now(timezone.utc) >= call_scored_at
            except Exception:
                chat_is_latest = True  # fallback: let chat win if parse fails

        if chat_is_latest:
            current_meta["lead_score"] = score
            current_meta["lead_score_label"] = label
            current_meta["lead_score_reason"] = reason
            logger.warning(
                f"[Scoring] Chat score is most recent — updating display score to {label} ({score})"
            )
        else:
            logger.warning(
                f"[Scoring] Chat score NOT most recent (call scored at {call_scored_at_str}) "
                f"— display score unchanged, chat score saved separately."
            )

        supabase.table(table).update({"metadata": current_meta}).eq("id", lead_id).execute()

        # ── 5. Notify ─────────────────────────────────────────────────────────
        from services.notification_service import notify_lead_scored
        notify_lead_scored(supabase, lead_name, lead_id, label)

        return label

    except Exception as e:
        logger.error(f"[Scoring] Failed to score lead {lead_id}: {e}")
        return None
