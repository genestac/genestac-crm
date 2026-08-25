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

    lines = [
        "You are the Genestac AI Health Coach — a warm, professional, and empathetic AI health advisor.",
        "You are chatting with this specific user through the Genestac mobile app.",
        "",
        "YOUR ROLE:",
        "1. On first interaction: Greet warmly, then ask ONE question at a time to understand their health profile.",
        "   Collect: name, age, gender, primary health goal, weight/height (if comfortable), medical conditions, lifestyle basics.",
        "   Skip fields you already know from the profile below. Never overwhelm with multiple questions at once.",
        "2. After collecting basics: Provide personalised health guidance, answer health questions, check in on progress.",
        "3. Always respond in the same language the user uses (English/Hindi/Hinglish all supported).",
        "4. Be concise — 2-4 sentences max per turn unless a detailed explanation is truly needed.",
        "5. Never diagnose. For serious symptoms, always recommend consulting a real doctor.",
        "6. Tone: warm, encouraging — like a knowledgeable friend, not clinical or robotic.",
        "",
    ]

    user = ctx.get("user", {})
    if user:
        lines.append("USER PROFILE:")
        if user.get("name"):
            lines.append(f"  Name: {user['name']}")
        if user.get("age"):
            lines.append(f"  Age: {user['age']}")
        if user.get("gender"):
            lines.append(f"  Gender: {user['gender']}")
        if user.get("status"):
            lines.append(f"  CRM Status: {user['status']}")
        wlj = user.get("weight_loss_journey")
        if wlj and isinstance(wlj, dict):
            lines.append(f"  Weight loss journey data: {wlj}")
        lines.append("")

    ha = ctx.get("health_assessment", {})
    if ha:
        lines.append("HEALTH ASSESSMENT:")
        if ha.get("age"):
            lines.append(f"  Age: {ha['age']}")
        if ha.get("gender"):
            lines.append(f"  Gender: {ha['gender']}")
        if ha.get("height_cm"):
            lines.append(f"  Height: {ha['height_cm']} cm")
        if ha.get("weight_kg"):
            lines.append(f"  Weight: {ha['weight_kg']} kg")
        if ha.get("health_goals"):
            lines.append(f"  Health goals: {ha['health_goals']}")
        conditions = []
        if ha.get("diabetes"):
            conditions.append("Diabetes")
        if ha.get("high_blood_pressure"):
            conditions.append("High blood pressure")
        if ha.get("thyroid_disorder"):
            conditions.append("Thyroid disorder")
        if conditions:
            lines.append(f"  Known conditions: {', '.join(conditions)}")
        if ha.get("lifestyle_data"):
            lines.append(f"  Lifestyle data: {ha['lifestyle_data']}")
        if ha.get("medical_data"):
            lines.append(f"  Medical history: {ha['medical_data']}")
        lines.append("")

    logs = ctx.get("recent_logs", [])
    if logs:
        lines.append("RECENT DAILY LOGS (last 5 days):")
        for log in logs:
            parts = [f"  {log.get('date', 'Unknown date')}"]
            if log.get("weight"):
                parts.append(f"weight={log['weight']}kg")
            if log.get("mood"):
                parts.append(f"mood={log['mood']}")
            if log.get("notes"):
                parts.append(f"notes={log['notes'][:100]}")
            lines.append(" | ".join(parts))
        lines.append("")

    plan = ctx.get("current_plan", {})
    if plan:
        lines.append("CURRENT PLAN:")
        if plan.get("diet_plan"):
            dp = plan["diet_plan"]
            lines.append(f"  Diet plan: {str(dp)[:400]}")
        if plan.get("exercise_plan"):
            ep = plan["exercise_plan"]
            lines.append(f"  Exercise plan: {str(ep)[:400]}")
        lines.append("")

    lines.append(
        "Use this context to give personalised, specific advice. "
        "Reference the user's data naturally when relevant — don't just list it back at them."
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
