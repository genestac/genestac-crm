"""
api/mobile/health_chat.py
==========================
Mobile-app AI Health Coach chat endpoint.

POST /api/mobile/health-chat
  - Auth: Supabase JWT (Bearer token) — verified server-side
  - Body: { "messages": [...], "daily_context": "...(optional)" }
  - Response: { "reply": "..." }

The endpoint:
  1. Verifies the Supabase JWT to get the user_id
  2. Fetches user health profile + full today's daily_logs from DB
  3. Builds a rich system prompt with all that context + reminder capability
  4. Calls OpenAI GPT-4o and returns the reply

Reminder capability: The AI emits [REMINDER type="..." time="HH:MM" label="..."] tags
in its reply when the user asks to set a reminder. The mobile app parses and schedules
these as local notifications.
"""

import os
import logging
from datetime import date
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
    daily_context: Optional[str] = None        # today's health data summary from mobile (fallback)
    extra_instructions: Optional[str] = None   # future use

class HealthChatResponse(BaseModel):
    reply: str

# ── Supabase auth verification ────────────────────────────────────────────────

def _verify_supabase_jwt(token: str) -> Optional[str]:
    try:
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
        resp = sb.auth.get_user(token)
        if resp and resp.user:
            return resp.user.id
    except Exception as e:
        logger.warning(f"[HealthChat] JWT verification failed: {e}")
    return None

# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(val, unit="", fallback="not logged"):
    if val is None:
        return fallback
    return f"{val}{unit}"

def _fmt_workout(ids, total):
    if not ids or not isinstance(ids, list):
        return "none completed yet today"
    return f"{len(ids)} / {total or '?'} exercises completed"

def _fmt_meals(meal_logs):
    if not meal_logs or not isinstance(meal_logs, list) or len(meal_logs) == 0:
        return "none logged today"
    total_cal = sum(m.get("calories", 0) for m in meal_logs)
    types = ", ".join(m.get("meal_type", "") for m in meal_logs if m.get("meal_type"))
    return f"{len(meal_logs)} meals ({types}) — ~{total_cal} kcal total"

def _fmt_habits(habits):
    if not habits or not isinstance(habits, dict):
        return "none logged"
    done = [k for k, v in habits.items() if v]
    missed = [k for k, v in habits.items() if not v]
    parts = []
    if done:
        parts.append(f"completed: {', '.join(done)}")
    if missed:
        parts.append(f"missed: {', '.join(missed)}")
    return " | ".join(parts) if parts else "none"



# ── Rich UI system prompt block ───────────────────────────────────────────────

RICH_UI_FOOD_REMINDER_INSTRUCTIONS = """
=======================================================
RICH UI — FOOD & REMINDER CARDS
=======================================================

FOOD CARD — emit one per food item suggested:
[FOOD name="Name" desc="One line benefit." cals="CALORIES" thumb="UNSPLASH_URL"]

Use these Unsplash thumbnails:
- Oatmeal:   https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=400&q=80
- Salad:     https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80
- Eggs:      https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&q=80
- Dal:       https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&q=80
- Chicken:   https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=400&q=80
- Fruits:    https://images.unsplash.com/photo-1519996529931-28324d5a630e?w=400&q=80
- Smoothie:  https://images.unsplash.com/photo-1502741126161-b048400d085d?w=400&q=80

REMINDER CARD — emit at end of reply when scheduling a reminder:
[REMINDER type="TYPE" time="HH:MM" label="Label Text"]
Types: workout | water | sleep | meal | medication | meditation | walk | fasting

GLOBAL RULES FOR ALL CARDS:
1. NEVER wrap tags in code blocks, backticks, or quotes.
2. Each tag must be on its own line.
3. Brief intro text goes BEFORE the tags.
4. NEVER use plain numbered lists for exercises or food — always use card tags.
"""


# ── Exercise library fetcher ───────────────────────────────────────────────────

def _fetch_exercises(sb, limit: int = 40) -> list:
    """
    Fetch active exercises from DB so the AI uses real thumbnails and video URLs.
    Returns list of dicts: id, title, description, category, type,
    difficulty, duration_minutes, thumbnail_url, video_url, benefits, tags.
    """
    try:
        res = sb.table("exercises").select(
            "id, title, description, category, type, difficulty, "
            "duration_minutes, thumbnail_url, video_url, benefits, tags"
        ).eq("is_active", True).limit(limit).execute()
        return res.data or []
    except Exception as e:
        logger.warning(f"[HealthChat] _fetch_exercises error: {e}")
        return []


# ── Context builder ───────────────────────────────────────────────────────────

def _build_user_context(user_id: str) -> dict:
    ctx = {}
    try:
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

        # Basic user profile
        u = sb.table("users").select(
            "name, age, gender, phone, status, weight_loss_journey"
        ).eq("id", user_id).limit(1).execute()
        if u.data:
            ctx["user"] = u.data[0]

        # Health assessment
        ha = sb.table("health_assessments").select(
            "age, gender, height_cm, weight_kg, health_goals, "
            "diabetes, high_blood_pressure, thyroid_disorder, "
            "city, lifestyle_data, medical_data"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        if ha.data:
            ctx["health_assessment"] = ha.data[0]

        # Recent daily logs (last 7 days) — full tracking columns
        logs = sb.table("daily_logs").select(
            "date, weight, weight_kg, mood, notes, coach_feedback, "
            "steps, distance_km, calories_burned, water_ml, "
            "sleep_hours, sleep_quality, bed_time, wake_time, "
            "workout_completed_ids, workout_total, "
            "meal_logs, diet_followed, "
            "fasting_status, fasting_target_hours, fasting_started_at, fasting_ended_at, "
            "habits, measurements"
        ).eq("user_id", user_id).order("date", desc=True).limit(7).execute()
        if logs.data:
            ctx["recent_logs"] = logs.data

        # Today's log specifically
        today_str = date.today().isoformat()
        today_logs = [l for l in (logs.data or []) if l.get("date") == today_str]
        if today_logs:
            ctx["today_log"] = today_logs[0]

        # Current plan
        plan = sb.table("user_plans").select(
            "diet_plan, exercise_plan"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        if plan.data:
            ctx["current_plan"] = plan.data[0]

        # Exercise library — gives AI real thumbnails + video URLs
        ctx["exercises"] = _fetch_exercises(sb, limit=40)

    except Exception as e:
        logger.warning(f"[HealthChat] Context fetch error: {e}")

    return ctx



def _build_exercise_rich_ui(exercises: list) -> str:
    """
    Build the RICH UI instructions block for GPT.
    When exercises are available from DB, include them as a numbered catalogue
    so the AI picks real titles, real thumbs, and real video URLs.
    Falls back to a generic message if library is empty.
    """
    lines = [
        "=======================================================",
        "RICH UI — EXERCISE CARDS (MANDATORY)",
        "=======================================================",
        "",
        "The mobile app renders beautiful cards. For exercises you MUST emit:",
        '[EXERCISE name="..." desc="..." duration="..." thumb="THUMBNAIL_URL" videoUrl="VIDEO_URL"]',
        "",
        "RULES:",
        "1. ONLY suggest exercises from the EXERCISE LIBRARY below.",
        "2. Use EXACTLY the title and video_url from the library.",
        "3. For thumb: use the thumb value shown in the library (already resolved — never leave it blank).",
        "4. Emit one [EXERCISE ...] tag per suggested exercise — ALWAYS emit the tag, never skip it.",
        "5. Choose exercises that match the user's goals, difficulty, and category.",
        "6. Do NOT use numbered lists — use card tags only.",
        "7. NEVER leave thumb empty or omit it — a thumb value is always provided in the library.",
        "8. Suggest 2–4 exercises per reply.",
        "",
    ]

    if not exercises:
        lines.append("(Exercise library is currently empty — skip exercise card tags.)")
        return "\n".join(lines)

    # Per-category Unsplash fallback thumbnails (used when thumbnail_url is NULL in DB)
    FALLBACK_THUMBS: dict = {
        "yoga":       "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80",
        "strength":   "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&q=80",
        "cardio":     "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400&q=80",
        "breathing":  "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&q=80",
        "meditation": "https://images.unsplash.com/photo-1528715471579-d1bcf0ba5e83?w=400&q=80",
        "stretching": "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=400&q=80",
        "default":    "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=80",
    }

    lines.append("EXERCISE LIBRARY (choose from these only):")
    lines.append("")

    # Group by category for readability
    by_cat: dict = {}
    for ex in exercises:
        cat = ex.get("category") or "general"
        by_cat.setdefault(cat, []).append(ex)

    for cat, exs in sorted(by_cat.items()):
        lines.append(f"  [{cat.upper()}]")
        for ex in exs:
            db_thumb = ex.get("thumbnail_url") or ""
            fallback = FALLBACK_THUMBS.get(cat.lower(), FALLBACK_THUMBS["default"])
            # Always resolve to a non-empty thumb — AI receives a ready-to-use value
            thumb = db_thumb if db_thumb else fallback
            video = ex.get("video_url") or ""
            duration = f"{ex.get('duration_minutes')} mins" if ex.get("duration_minutes") else "—"
            diff = ex.get("difficulty") or "beginner"
            desc = (ex.get("description") or "").replace('"', "'")[:100]
            title = (ex.get("title") or "").replace('"', "'")
            lines.append(
                f'    - name="{title}" | difficulty={diff} | duration={duration} '
                f'| thumb="{thumb}" | videoUrl="{video}" | desc="{desc}"'
            )
        lines.append("")

    lines += [
        "EXAMPLE TAG FORMAT:",
        '[EXERCISE name="Sun Salutation A" desc="Full body warm-up flow." duration="15 mins" '
        'thumb="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80" videoUrl="https://res.cloudinary.com/example/video.mp4"]',
        "",
        "Always emit [EXERCISE ...] tags when suggesting exercises — never skip or replace with plain text.",
    ]

    return "\n".join(lines)


def _build_system_prompt(ctx: dict, mobile_daily_context: Optional[str] = None, extra_instructions: Optional[str] = None) -> str:
    user = ctx.get("user", {})
    ha   = ctx.get("health_assessment", {})
    logs = ctx.get("recent_logs", [])
    today = ctx.get("today_log", {})
    plan = ctx.get("current_plan", {})
    exercises: list = ctx.get("exercises", [])

    first_name = (user.get("name") or "").split()[0] if user.get("name") else ""

    # Compact 7-day log summary
    recent_summary_lines = []
    for log in logs[:7]:
        parts = [log.get("date", "")]
        w = log.get("weight_kg") or log.get("weight")
        if w:
            parts.append(f"weight {w}kg")
        if log.get("mood"):
            parts.append(f"mood {log['mood']}/5")
        if log.get("steps"):
            parts.append(f"{log['steps']} steps")
        if log.get("sleep_hours"):
            parts.append(f"sleep {log['sleep_hours']}h ({log.get('sleep_quality', '')})")
        if log.get("water_ml"):
            parts.append(f"water {log['water_ml']}ml")
        wids = log.get("workout_completed_ids")
        if wids:
            parts.append(f"workout {len(wids)}/{log.get('workout_total', '?')} done")
        if log.get("notes"):
            parts.append(f"note: {log['notes'][:80]}")
        recent_summary_lines.append(" | ".join(parts))
    recent_summary = "\n".join(f"  - {l}" for l in recent_summary_lines) if recent_summary_lines else "  (none yet)"

    # Today's detailed block
    today_block = ""
    if today:
        today_lines = [
            f"  Steps: {_fmt(today.get('steps'), ' steps')}",
            f"  Distance: {_fmt(today.get('distance_km'), ' km')}",
            f"  Calories burned: {_fmt(today.get('calories_burned'), ' kcal')}",
            f"  Water: {_fmt(today.get('water_ml'), ' ml')}",
            f"  Sleep last night: {_fmt(today.get('sleep_hours'), ' hours')} (quality: {today.get('sleep_quality') or 'not logged'})",
            f"  Bedtime: {_fmt(today.get('bed_time'))} | Wake: {_fmt(today.get('wake_time'))}",
            f"  Mood: {_fmt(today.get('mood'), '/5')}",
            f"  Weight: {_fmt(today.get('weight_kg') or today.get('weight'), ' kg')}",
            f"  Workout: {_fmt_workout(today.get('workout_completed_ids'), today.get('workout_total'))}",
            f"  Meals: {_fmt_meals(today.get('meal_logs'))}",
            f"  Fasting: {today.get('fasting_status') or 'not active'}" + (f" ({today.get('fasting_target_hours')}h target)" if today.get("fasting_target_hours") else ""),
            f"  Habits: {_fmt_habits(today.get('habits'))}",
        ]
        today_block = "\n".join(today_lines)
    elif mobile_daily_context:
        today_block = mobile_daily_context

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
        "   After that: NEVER use their name again. Talk like a real friend would.",
        "",
        "2. NO HOLLOW OPENERS — these phrases are BANNED:",
        "   'Great choice!', 'Absolutely!', 'Of course!', 'That's great!', 'Sure thing!',",
        "   'Great question!', 'Definitely!', 'Wonderful!', 'Fantastic!', 'You got it!',",
        "   'Great job!', 'Perfect!', 'Excellent!'",
        "   Just answer directly and naturally.",
        "",
        "3. CONVERSATION MEMORY — USE THE FULL CHAT HISTORY:",
        "   Reference specific things they said earlier. Follow up on problems they mentioned.",
        "   Never make the user feel like they're starting from scratch each time.",
        "",
        "4. NATURAL, CONCISE RESPONSES:",
        "   - Keep replies to 2-4 sentences max unless they explicitly asked for detail.",
        "   - Ask only ONE follow-up question per reply.",
        "   - Match the user's energy and language style.",
        "   - If they write in Hinglish or Hindi, respond in kind.",
        "",
        "5. MOTIVATION — genuine, specific, not performative:",
        "   Draw on their real data (steps, sleep, workout, water) to make encouragement specific.",
        "   Address dips with empathy + one small concrete suggestion.",
        "",
        "6. HEALTH LIMITS:",
        "   Never diagnose. For serious symptoms, always recommend a real doctor.",
        "",
        _build_exercise_rich_ui(exercises),
        "",
        "=======================================================",
        "REMINDER CAPABILITY — Follow exactly",
        "=======================================================",
        "",
        "When the user asks to SET, CREATE, or SCHEDULE a reminder (workout, water, sleep,",
        "meals, medication, meditation, walking, fasting, or any health habit):",
        "",
        "1. If no time was mentioned, suggest a sensible default and confirm.",
        "   If time is confirmed or already given, proceed immediately.",
        "2. At the END of your reply, emit this EXACT machine-readable tag:",
        '   [REMINDER type="TYPE" time="HH:MM" label="Label Text"]',
        "   - TYPE: workout | water | sleep | meal | medication | meditation | walk | fasting",
        "   - time: 24-hour HH:MM format",
        "   - label: short human-readable name for the notification",
        "3. You may emit multiple [REMINDER ...] tags if needed.",
        "4. Tell the user their reminder has been set in plain language.",
        "5. The app strips the tag silently and schedules the device notification.",
        "",
        "Example — 'Set a workout reminder at 7am':",
        "  Your morning workout reminder is set for 7:00 AM — you'll get a nudge every day.",
        '  [REMINDER type="workout" time="07:00" label="Morning Workout"]',
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

    if today_block:
        lines.append("TODAY'S HEALTH DATA (use to give real, personalised advice right now):")
        lines.append(today_block)
        lines.append("")

    lines.append("RECENT 7-DAY LOG (use for trends, follow-ups, motivation):")
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
        "REMEMBER: Be human, not a chatbot. Reference real data naturally.\n"
        "When suggesting exercises or food, ALWAYS use RICH UI CARD TAGS — never plain numbered lists."
    )

    if extra_instructions and extra_instructions.strip():
        lines.append("")
        lines.append("=======================================================")
        lines.append("ADDITIONAL CLIENT INSTRUCTIONS:")
        lines.append("=======================================================")
        lines.append(extra_instructions.strip())

    return "\n".join(lines)


# ── Main endpoint ─────────────────────────────────────────────────────────────

@router.post("", response_model=HealthChatResponse)
async def health_chat(body: HealthChatRequest, request: Request):
    """
    POST /api/mobile/health-chat
    Authenticated endpoint for the mobile app's AI Health Coach chat.
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
    system_prompt = _build_system_prompt(
        ctx,
        mobile_daily_context=body.daily_context,
        extra_instructions=body.extra_instructions,
    )

    # 4. Build messages array for OpenAI (keep last 20 turns to control token usage)
    recent_messages = body.messages[-20:]
    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    # Separate history from the last user message
    history = recent_messages[:-1] if len(recent_messages) > 1 else []
    last_user_msg = recent_messages[-1] if recent_messages else None

    for m in history:
        if m.role in ("user", "assistant"):
            messages.append({"role": m.role, "content": m.content})

    # ── Format-enforcement reminder ──────────────────────────────────────────
    # Injected as a system message right before every user turn.
    # GPT learns from conversation history and reverts to numbered lists after
    # 2-3 turns. This re-asserts the EXERCISE tag requirement every single turn.
    exercise_reminder = (
        "CRITICAL FORMAT REMINDER (applies to this reply, overrides prior patterns):\n"
        "When suggesting exercises, you MUST emit [EXERCISE name=\"...\" desc=\"...\" "
        "duration=\"...\" thumb=\"URL\" videoUrl=\"URL\"] tags — one per exercise.\n"
        "Do NOT use numbered lists, bullet points, or plain text for exercises.\n"
        "Use ONLY exercises from the EXERCISE LIBRARY. Always include a valid thumb URL."
    )
    messages.append({"role": "system", "content": exercise_reminder})

    if last_user_msg and last_user_msg.role == "user":
        messages.append({"role": "user", "content": last_user_msg.content})

    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Last message must be from the user")

    # 5. Call OpenAI GPT-4o
    try:
        client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=1200,   # increased: rich card tags need more tokens
            temperature=0.7,
        )
        reply = resp.choices[0].message.content.strip()
    except openai.OpenAIError as e:
        logger.error(f"[HealthChat] OpenAI error: {e}")
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable")

    logger.info(
        f"[HealthChat] user_id={user_id} | input_msgs={len(body.messages)} | reply_len={len(reply)} | "
        f"has_exercise={'[EXERCISE' in reply} | has_food={'[FOOD' in reply} | has_reminder={'[REMINDER' in reply}"
    )
    return HealthChatResponse(reply=reply)


# ── Dev/debug endpoint — key-protected, no user JWT needed ───────────────────
class DebugChatRequest(BaseModel):
    prompt: str = "Show me 3 yoga exercises for beginners"

class DebugChatResponse(BaseModel):
    reply: str
    has_exercise: bool
    has_food: bool
    has_reminder: bool
    tags: list[str]
    system_prompt_preview: str

@router.post("/debug", response_model=DebugChatResponse)
async def health_chat_debug(body: DebugChatRequest, request: Request):
    """
    POST /api/mobile/health-chat/debug
    Key-protected debug endpoint — tests exercise card generation without a user JWT.
    Set HEALTH_CHAT_DEBUG_KEY in .env to enable.
    """
    debug_key = os.getenv("HEALTH_CHAT_DEBUG_KEY", "")
    if not debug_key:
        raise HTTPException(status_code=404, detail="Debug endpoint not enabled")
    req_key = request.headers.get("X-Debug-Key", "")
    if req_key != debug_key:
        raise HTTPException(status_code=403, detail="Invalid debug key")

    # Build context with empty user data but real exercise library
    sb = create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", ""))
    exercises = _fetch_exercises(sb, limit=40)
    ctx = {"exercises": exercises}
    system_prompt = _build_system_prompt(ctx)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": body.prompt},
    ]

    try:
        client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=1200,
            temperature=0.7,
        )
        reply = resp.choices[0].message.content.strip()
    except openai.OpenAIError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI error: {e}")

    import re as _re
    tags = _re.findall(r"\[(?:EXERCISE|FOOD|REMINDER)[^\]]*\]", reply)
    return DebugChatResponse(
        reply=reply,
        has_exercise="[EXERCISE" in reply,
        has_food="[FOOD" in reply,
        has_reminder="[REMINDER" in reply,
        tags=tags,
        system_prompt_preview=system_prompt[:500],
    )
