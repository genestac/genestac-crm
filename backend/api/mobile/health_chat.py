"""
api/mobile/health_chat.py
==========================
Mobile-app AI Health Coach chat endpoint.

POST /api/mobile/health-chat
  - Auth: Supabase JWT (Bearer token) — verified server-side
  - Body: { "messages": [{"role": "user"|"assistant", "content": "..."}] }
  - Response: { "reply": "..." }

The endpoint:
  1. Verifies the Supabase JWT to get the user_id
  2. Fetches user health profile from DB (health_assessments, daily_logs, user_plans, users)
  3. Builds a rich system prompt with that context
  4. Calls OpenAI GPT-4o and returns the reply

This keeps the OpenAI key server-side and allows the AI to reference real user data.
"""

import os
import logging
from typing import Optional

import openai
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from supabase import create_client

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Request / Response models ─────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class HealthChatRequest(BaseModel):
    messages: list[ChatMessage]

class HealthChatResponse(BaseModel):
    reply: str

# ── Supabase auth verification ────────────────────────────────────────────────

def _verify_supabase_jwt(token: str) -> Optional[str]:
    """
    Verify a Supabase anon/user JWT and return the user_id (sub claim).
    Uses the Supabase service-role client to call auth.get_user().
    Returns None if invalid.
    """
    try:
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),  # service role key
        )
        resp = sb.auth.get_user(token)
        if resp and resp.user:
            return resp.user.id
    except Exception as e:
        logger.warning(f"[HealthChat] JWT verification failed: {e}")
    return None

# ── Context builder ───────────────────────────────────────────────────────────

def _build_user_context(user_id: str) -> dict:
    """
    Pull user health data from Supabase and return a context dict.
    Gracefully handles missing tables / rows.
    """
    ctx = {}
    try:
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

        # ── Basic user profile ────────────────────────────────────────────
        u = sb.table("users").select(
            "name, age, gender, phone, status, weight_loss_journey"
        ).eq("id", user_id).limit(1).execute()
        if u.data:
            ctx["user"] = u.data[0]

        # ── Health assessment ─────────────────────────────────────────────
        ha = sb.table("health_assessments").select(
            "age, gender, height_cm, weight_kg, health_goals, "
            "diabetes, high_blood_pressure, thyroid_disorder, "
            "city, lifestyle_data, medical_data"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        if ha.data:
            ctx["health_assessment"] = ha.data[0]

        # ── Recent daily logs (last 5) ────────────────────────────────────
        logs = sb.table("daily_logs").select(
            "date, weight, mood, notes, coach_feedback"
        ).eq("user_id", user_id).order("date", desc=True).limit(5).execute()
        if logs.data:
            ctx["recent_logs"] = logs.data

        # ── Current plan ──────────────────────────────────────────────────
        plan = sb.table("user_plans").select(
            "diet_plan, exercise_plan"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        if plan.data:
            ctx["current_plan"] = plan.data[0]

    except Exception as e:
        logger.warning(f"[HealthChat] Context fetch error: {e}")

    return ctx


def _build_system_prompt(ctx: dict) -> str:
    """Build a rich, context-aware system prompt from the fetched user data."""

    user = ctx.get("user", {})
    ha   = ctx.get("health_assessment", {})
    logs = ctx.get("recent_logs", [])
    plan = ctx.get("current_plan", {})

    first_name = (user.get("name") or "").split()[0] if user.get("name") else ""

    # Compact recent log summary for context injection
    recent_summary_lines = []
    for log in logs[:3]:
        parts = [log.get("date", "")]
        if log.get("weight"):
            parts.append(f"weight {log['weight']}kg")
        if log.get("mood"):
            parts.append(f"mood: {log['mood']}")
        if log.get("notes"):
            parts.append(f"note: {log['notes'][:120]}")
        if log.get("coach_feedback"):
            parts.append(f"feedback: {log['coach_feedback'][:80]}")
        recent_summary_lines.append(" | ".join(parts))
    recent_summary = "\n".join(f"  - {l}" for l in recent_summary_lines) if recent_summary_lines else "  (none yet)"

    lines = [
        "You are the Genestac AI Health Coach — a warm, witty, and deeply empathetic health advisor.",
        "You are having a one-on-one conversation with a real person through the Genestac mobile app.",
        "",
        "======================================================",
        "PERSONALITY & TONE RULES — follow these strictly",
        "======================================================",
        "",
        "1. NAME USAGE — CRITICAL:",
        f"   The user's first name is '{first_name}'. Use it AT MOST ONCE across the entire conversation —",
        "   only in the very first greeting message if you have not said hello yet.",
        "   After that: NEVER use their name again. It feels robotic and irritating when an AI",
        "   keeps repeating someone's name every message. Talk like a real friend would.",
        "",
        "2. NO HOLLOW OPENERS — these phrases are BANNED:",
        "   Never start a response with any of these:",
        "     'Great choice!', 'Absolutely!', 'Of course!', 'That's great!', 'Sure thing!',",
        "     'Great question!', 'Definitely!', 'Wonderful!', 'Fantastic!', 'You got it!',",
        "     'Great job!', 'Perfect!', 'Excellent!'",
        "   These feel fake and hollow. Just answer directly and naturally.",
        "",
        "3. CONVERSATION MEMORY — USE THE FULL CHAT HISTORY:",
        "   Before replying, read the full conversation history carefully.",
        "   - If the user mentioned a problem in an earlier message (bad sleep, stress, cravings,",
        "     pain, low energy, skipped workout, bloating, emotional eating), proactively follow",
        "     up on it a few turns later — e.g. 'How's the sleep been — any better?'",
        "   - If the user committed to something (e.g. 'I'll try walking tomorrow'), check in on it.",
        "   - Never make the user feel like they're starting from scratch each time.",
        "   - Reference specific things they said earlier, not generic health advice.",
        "",
        "4. NATURAL, CONCISE RESPONSES:",
        "   - Keep replies to 2-4 sentences max unless they explicitly asked for detail.",
        "   - Ask only ONE follow-up question per reply — never fire multiple questions at once.",
        "   - Match the user's energy and language style.",
        "   - If they write in Hinglish or Hindi, respond in kind.",
        "",
        "5. MOTIVATION — genuine, specific, not performative:",
        "   - When someone logs progress (weight down, workout done, good meal choice), acknowledge",
        "     the specific achievement briefly, then keep moving. Don't over-celebrate.",
        "   - When recent logs show a dip (bad mood, weight up, missed days), address it with",
        "     empathy + one small, concrete suggestion. Don't ignore it or over-coddle either.",
        "   - Draw on their recent log data to make encouragement feel real and relevant.",
        "",
        "6. HEALTH LIMITS:",
        "   Never diagnose. For serious or persistent symptoms, always recommend a real doctor.",
        "",
        "=======================================================",
        "USER DATA — reference naturally, never dump it back at them",
        "=======================================================",
        "",
    ]

    if user:
        lines.append("PROFILE:")
        if first_name:
            lines.append(f"  Name: {first_name}")
        if user.get("age"):
            lines.append(f"  Age: {user['age']}")
        if user.get("gender"):
            lines.append(f"  Gender: {user['gender']}")
        wlj = user.get("weight_loss_journey")
        if wlj and isinstance(wlj, dict):
            history = wlj.get("history", [])
            meals   = wlj.get("meals", [])
            if history:
                lines.append(f"  Weight history (last 3): {history[-3:]}")
            if meals:
                lines.append(f"  Recent meals logged (last 3): {meals[-3:]}")
        lines.append("")

    if ha:
        lines.append("HEALTH ASSESSMENT:")
        if ha.get("height_cm"):
            lines.append(f"  Height: {ha['height_cm']} cm")
        if ha.get("weight_kg"):
            lines.append(f"  Current weight: {ha['weight_kg']} kg")
        if ha.get("health_goals"):
            lines.append(f"  Goals: {ha['health_goals']}")
        conditions = []
        if ha.get("diabetes"):            conditions.append("Diabetes")
        if ha.get("high_blood_pressure"): conditions.append("High BP")
        if ha.get("thyroid_disorder"):    conditions.append("Thyroid disorder")
        if conditions:
            lines.append(f"  Conditions: {', '.join(conditions)}")
        if ha.get("lifestyle_data"):
            lines.append(f"  Lifestyle: {ha['lifestyle_data']}")
        if ha.get("medical_data"):
            lines.append(f"  Medical Hx: {ha['medical_data']}")
        lines.append("")

    lines.append("RECENT DAILY LOGS (last 3 days — use to personalise follow-ups and motivation):")
    lines.append(recent_summary)
    lines.append("")

    if plan:
        lines.append("CURRENT PLAN (refer to when giving diet/exercise advice):")
        if plan.get("diet_plan"):
            lines.append(f"  Diet: {str(plan['diet_plan'])[:350]}")
        if plan.get("exercise_plan"):
            lines.append(f"  Exercise: {str(plan['exercise_plan'])[:350]}")
        lines.append("")

    lines.append(
        "REMEMBER: Be a real person, not a chatbot. No name-dropping every message, no hollow affirmations. "
        "Reference their actual data and past conversation naturally. Keep it human."
    )

    return "\n".join(lines)


# ── Main endpoint ─────────────────────────────────────────────────────────────

@router.post("", response_model=HealthChatResponse)
async def health_chat(body: HealthChatRequest, request: Request):
    """
    POST /api/mobile/health-chat

    Authenticated endpoint for the mobile app's AI Health Coach chat.
    Accepts the Supabase access token as a Bearer token.
    """

    # 1. Extract + verify Bearer token
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.removeprefix("Bearer ").strip()
    user_id = _verify_supabase_jwt(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # 2. Fetch user context from DB
    ctx = _build_user_context(user_id)

    # 3. Build system prompt
    system_prompt = _build_system_prompt(ctx)

    # 4. Build messages array for OpenAI
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for m in body.messages:
        if m.role in ("user", "assistant"):
            messages.append({"role": m.role, "content": m.content})

    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Last message must be from the user")

    # 5. Call OpenAI GPT-4o
    try:
        client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=400,
            temperature=0.7,
        )
        reply = resp.choices[0].message.content.strip()
    except openai.OpenAIError as e:
        logger.error(f"[HealthChat] OpenAI error: {e}")
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")

    logger.info(f"[HealthChat] user_id={user_id} | reply_len={len(reply)}")
    return HealthChatResponse(reply=reply)
