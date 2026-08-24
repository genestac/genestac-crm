"""
api/mobile/post_call_health.py
================================
Post-call health plan generation for the Genestac AI Health Coach.

Called automatically after a Sarvam AI outbound call completes (via _process_post_call).
Only runs for users who have an ACTIVE mobile subscription (plan_type = 'mobile').

Flow:
  1. Check if user has an active mobile subscription
  2. Fetch existing health_assessments row (if any)
  3. Call GPT-4o with transcript + extracted data → structured diet + exercise plan
  4. Upsert into user_plans table
  5. Insert welcome message into ai_doctor_sessions (appears in AI chat)
  6. Send Expo push notification to the user's device

Triggered from: api/webhooks/sarvam.py → _process_post_call()
"""

import os
import json
import logging
import asyncio
from typing import Optional
import httpx
import openai
from supabase import create_client

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _get_sb():
    return create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", ""))


# ── Expo Push Notification ────────────────────────────────────────────────────

async def _send_expo_push(token: str, title: str, body: str, data: dict = None):
    """Send a single Expo push notification."""
    if not token or not token.startswith("Exponent"):
        return
    payload = {"to": token, "title": title, "body": body, "sound": "default"}
    if data:
        payload["data"] = data
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(EXPO_PUSH_URL, json=payload,
                                     headers={"Accept": "application/json",
                                              "Accept-Encoding": "gzip, deflate",
                                              "Content-Type": "application/json"})
            logger.info(f"[PushNotif] Sent to {token[:30]}... status={resp.status_code}")
    except Exception as e:
        logger.warning(f"[PushNotif] Failed to send: {e}")


# ── Main entry point ──────────────────────────────────────────────────────────

async def generate_and_save_health_plan(
    user_id: str,
    transcript: str,
    extracted_data: dict,
):
    """
    Called after a Sarvam post-call webhook processes a lead.
    Only acts if the user has an active mobile subscription.

    extracted_data keys: weight_goal, current_weight, health_concerns, lead_name
    """
    if not user_id:
        return

    sb = _get_sb()

    # ── 1. Check for active mobile subscription ───────────────────────────────
    try:
        sub_res = sb.table("subscriptions") \
            .select("id, status, plan_type") \
            .eq("user_id", user_id) \
            .eq("status", "active") \
            .execute()

        mobile_subs = [s for s in (sub_res.data or [])
                       if (s.get("plan_type") or "").lower() in ("mobile", "app", "digital", "online")]

        if not mobile_subs:
            logger.info(f"[PostCallHealth] user {user_id} has no active mobile subscription. Skipping.")
            return
    except Exception as e:
        logger.warning(f"[PostCallHealth] Subscription check failed: {e}")
        return

    lead_name = extracted_data.get("lead_name", "there")
    weight_goal = extracted_data.get("weight_goal", "")
    current_weight = extracted_data.get("current_weight", "")
    health_concerns = extracted_data.get("health_concerns", "")

    # ── 2. Fetch existing health assessment for richer context ────────────────
    health_ctx = {}
    try:
        ha = sb.table("health_assessments") \
            .select("age, gender, height_cm, weight_kg, health_goals, "
                    "diabetes, high_blood_pressure, thyroid_disorder, lifestyle_data") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        if ha.data:
            health_ctx = ha.data[0]
    except Exception as e:
        logger.warning(f"[PostCallHealth] Health assessment fetch failed: {e}")

    # ── 3. Generate diet + exercise plan via GPT-4o ───────────────────────────
    prompt = f"""You are a professional health coach and certified dietitian for Genestac, an Indian wellness company.

Based on the following user data extracted from a voice call, generate a detailed, personalised, and practical health plan.

USER DATA:
- Name: {lead_name}
- Current weight: {current_weight or health_ctx.get('weight_kg', 'unknown')} kg
- Weight / health goal: {weight_goal or health_ctx.get('health_goals', 'weight loss and healthy lifestyle')}
- Height: {health_ctx.get('height_cm', 'unknown')} cm
- Age: {health_ctx.get('age', 'unknown')}
- Gender: {health_ctx.get('gender', 'unknown')}
- Health concerns: {health_concerns or 'none mentioned'}
- Diabetes: {health_ctx.get('diabetes', False)}
- High blood pressure: {health_ctx.get('high_blood_pressure', False)}
- Thyroid: {health_ctx.get('thyroid_disorder', False)}
- Lifestyle: {health_ctx.get('lifestyle_data', {})}

CALL TRANSCRIPT EXCERPT (for context):
{transcript[:1500]}

Generate a structured JSON response with EXACTLY this format (all Indian foods, practical portions):
{{
  "diet_plan": {{
    "daily_calories": 1800,
    "meals": [
      {{"name": "Early Morning", "time": "6:30 AM", "foods": ["Warm lemon water", "5 soaked almonds"], "calories": 50}},
      {{"name": "Breakfast", "time": "8:00 AM", "foods": ["2 besan chilla with mint chutney", "1 glass buttermilk"], "calories": 350}},
      {{"name": "Mid-Morning Snack", "time": "11:00 AM", "foods": ["1 medium apple", "Green tea (no sugar)"], "calories": 100}},
      {{"name": "Lunch", "time": "1:00 PM", "foods": ["1 cup brown rice", "2 phulka roti", "Dal tadka", "Seasonal sabzi", "Salad"], "calories": 600}},
      {{"name": "Evening Snack", "time": "5:30 PM", "foods": ["Handful of roasted chana", "Cucumber sticks"], "calories": 150}},
      {{"name": "Dinner", "time": "7:30 PM", "foods": ["2 multigrain roti", "Paneer bhurji or dal", "Curd", "Cooked vegetables"], "calories": 500}},
      {{"name": "Bedtime", "time": "9:30 PM", "foods": ["1 glass warm turmeric milk (low fat)"], "calories": 80}}
    ],
    "foods_to_avoid": ["Refined flour (maida)", "Fried foods", "Sugary drinks", "White rice in excess", "Processed snacks"],
    "hydration": "Drink 8-10 glasses of water daily",
    "key_guidelines": ["Eat every 2-3 hours to keep metabolism active", "Do not skip breakfast", "Eat dinner by 8 PM"],
    "weekly_cheat_meal": "Saturday lunch — 1 moderate cheat meal allowed"
  }},
  "exercise_plan": {{
    "weekly_goal": "4-5 days of activity",
    "schedule": [
      {{"day": "Monday", "workout": "30-min brisk walk + 15-min yoga/stretching", "intensity": "Low-Moderate"}},
      {{"day": "Tuesday", "workout": "20-min HIIT cardio (jumping jacks, spot jog, burpees)", "intensity": "Moderate"}},
      {{"day": "Wednesday", "workout": "Active rest — light walk + deep breathing", "intensity": "Low"}},
      {{"day": "Thursday", "workout": "Strength training — bodyweight squats, lunges, push-ups (3 sets each)", "intensity": "Moderate"}},
      {{"day": "Friday", "workout": "45-min brisk walk or cycling", "intensity": "Low-Moderate"}},
      {{"day": "Saturday", "workout": "Dance workout or Zumba (30 min)", "intensity": "Moderate"}},
      {{"day": "Sunday", "workout": "Complete rest or gentle stretching", "intensity": "Rest"}}
    ],
    "morning_routine": "5-min warm-up before any workout",
    "key_guidelines": [
      "Start slowly and increase intensity each week",
      "Never exercise on an empty stomach",
      "Aim for 10,000 steps daily"
    ]
  }},
  "coach_message": "Hi {lead_name}! 👋 Your personalised health plan is ready. Based on our conversation, I've designed a practical Indian diet and exercise routine just for you. Let's start this journey together — small steps every day lead to big changes! 💪"
}}

Return ONLY the JSON object. No extra text."""

    try:
        oai = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        resp = await oai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1800,
            temperature=0.5,
            response_format={"type": "json_object"},
        )
        plan_data = json.loads(resp.choices[0].message.content.strip())
        diet_plan = plan_data.get("diet_plan", {})
        exercise_plan = plan_data.get("exercise_plan", {})
        coach_message = plan_data.get("coach_message", f"Hi {lead_name}! Your personalised health plan is ready. Let's get started! 💪")
    except Exception as e:
        logger.error(f"[PostCallHealth] GPT-4o plan generation failed: {e}")
        return

    # ── 4. Upsert into user_plans ─────────────────────────────────────────────
    try:
        existing_plan = sb.table("user_plans").select("id").eq("user_id", user_id).maybeSingle().execute()
        if existing_plan.data:
            sb.table("user_plans").update({
                "diet_plan": diet_plan,
                "exercise_plan": exercise_plan,
            }).eq("user_id", user_id).execute()
            logger.info(f"[PostCallHealth] Updated user_plans for user {user_id}")
        else:
            sb.table("user_plans").insert({
                "user_id": user_id,
                "diet_plan": diet_plan,
                "exercise_plan": exercise_plan,
            }).execute()
            logger.info(f"[PostCallHealth] Created user_plans for user {user_id}")
    except Exception as e:
        logger.error(f"[PostCallHealth] user_plans upsert failed: {e}")

    # ── 5. Insert welcome message into ai_doctor_sessions ─────────────────────
    try:
        from datetime import datetime, timezone
        welcome_msg = {
            "id": f"plan_{int(datetime.now(timezone.utc).timestamp())}",
            "role": "assistant",
            "content": coach_message,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        existing_session = sb.table("ai_doctor_sessions").select("id, messages").eq("user_id", user_id).maybeSingle().execute()
        if existing_session.data:
            existing_msgs = existing_session.data.get("messages") or []
            updated_msgs = [welcome_msg] + existing_msgs  # Prepend so it's the first message
            sb.table("ai_doctor_sessions").update({
                "messages": updated_msgs,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("user_id", user_id).execute()
        else:
            sb.table("ai_doctor_sessions").insert({
                "user_id": user_id,
                "messages": [welcome_msg],
            }).execute()
        logger.info(f"[PostCallHealth] Welcome message saved to ai_doctor_sessions for user {user_id}")
    except Exception as e:
        logger.error(f"[PostCallHealth] ai_doctor_sessions insert failed: {e}")

    # ── 6. Send Expo push notification ────────────────────────────────────────
    try:
        user_res = sb.table("users").select("metadata").eq("id", user_id).maybeSingle().execute()
        push_token = ((user_res.data or {}).get("metadata") or {}).get("expo_push_token")
        if push_token:
            await _send_expo_push(
                token=push_token,
                title="🎉 Your Health Plan is Ready!",
                body=f"Hi {lead_name}! Your personalised diet and exercise plan is ready. Open the AI Health Coach to see it.",
                data={"screen": "ai-doctor-chat"},
            )
        else:
            logger.info(f"[PostCallHealth] No push token for user {user_id} — skipping notification")
    except Exception as e:
        logger.warning(f"[PostCallHealth] Push notification failed: {e}")

    logger.info(f"[PostCallHealth] ✅ Health plan pipeline complete for user {user_id}")
