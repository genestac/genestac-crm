"""
Notification service — creates witty, lead-name-aware notifications in the DB.
"""
import logging
import random
from typing import Optional
from supabase import Client

logger = logging.getLogger(__name__)

# ── Humorous message templates ────────────────────────────────────────────────

_HOT_MSGS = [
    "🔥 {name} is ON FIRE! They're practically typing with oven mitts.",
    "🔥 {name} just became your hottest lead. Don't keep them waiting!",
    "🔥 {name} is ready to buy — or at least very ready to talk about buying.",
    "🔥 Plot twist: {name} actually WANTS to be called back.",
]

_COLD_MSGS = [
    "🥶 {name} has gone colder than a Monday morning. Might need some warming up.",
    "❄️ {name}'s enthusiasm has entered hibernation mode.",
    "❄️ {name} seems less interested now. Tread softly and carry a good offer.",
    "❄️ {name} ghosted the bot. Relatable, honestly.",
]

_WARM_MSGS = [
    "🌡️ {name} is warm — not hot, not cold, just chilling in the middle.",
    "🌡️ {name} is curious but not convinced yet. Keep the charm going!",
    "🌡️ {name} might convert with the right nudge. Or a mango shake. Who knows.",
]

_NEW_MSG_MSGS = [
    "💬 {name} just pinged! Don't leave them on read.",
    "💬 {name} messaged! Your bot is on it — no action needed (probably).",
    "💬 Incoming from {name}. The conversation is heating up.",
    "💬 {name} has entered the chat. Go get 'em!",
]

_CALL_DONE_MSGS = [
    "📞 AI called {name}. The robot did its job — now it's your turn.",
    "📞 Call with {name} is done! Check the transcript before {name} calls their cousin instead.",
    "📞 {name} just got a call from our friendly AI. Results incoming.",
    "📞 AI wrapped up with {name}. Time to read the transcript and pretend you knew all along.",
]

_CALL_MISSED_MSGS = [
    "📵 {name} didn't pick up. They're either busy or screening calls like a champion.",
    "📵 Missed call with {name}. The AI tried, I promise.",
    "📵 {name} ghosted the AI's call. Schedule a retry?",
]

_CALLBACK_MSGS = [
    "⏰ {name} asked to be called at this time. Don't blow it!",
    "⏰ Callback due for {name}. They requested it, so they're sort of expecting it.",
    "⏰ Time to call {name} — they literally scheduled this, no excuses.",
]

_CONVERTED_MSGS = [
    "🎉 {name} CONVERTED! Someone's getting a commission today!",
    "🎉 {name} is now a patient. The funnel did its job. Celebrate (briefly).",
    "🎉 Great news: {name} said yes! You can do a little dance now.",
]

_NOT_INTERESTED_MSGS = [
    "😔 {name} is not interested. It's not you, it's probably the price.",
    "😔 {name} passed. That's okay — the next one might say yes.",
    "😔 {name} said no thanks. Log it and move on, champion.",
]

_ABUSE_MSGS = [
    "🛡️ {name} got a little too spicy with the bot. They've been blocked.",
    "🛡️ {name} crossed the line — abuse guard activated. Bot is safe now.",
    "🛡️ Yikes! {name} was rude to the AI. It has feelings too (sort of).",
]


def _pick(templates: list, name: str) -> str:
    return random.choice(templates).format(name=name or "Mystery Lead")


# ── Public notification creators ─────────────────────────────────────────────

def _push(supabase: Client, type_: str, title: str, body: str,
          lead_id: Optional[str] = None, staff_id: Optional[str] = None):
    """Insert a notification row. Errors are swallowed so they never break callers."""
    try:
        supabase.table("notifications").insert({
            "type": type_,
            "title": title,
            "body": body,
            "lead_id": lead_id,
            "staff_id": staff_id,
            "is_read": False,
        }).execute()
    except Exception as e:
        logger.error(f"[Notifications] Failed to push notification: {e}")


def notify_new_wa_message(supabase: Client, lead_name: str, lead_id: str,
                           message_preview: str, staff_id: Optional[str] = None):
    title = _pick(_NEW_MSG_MSGS, lead_name)
    body = f'"{message_preview[:80]}{"…" if len(message_preview) > 80 else ""}"'
    _push(supabase, "wa_message", title, body, lead_id, staff_id)


def notify_lead_scored(supabase: Client, lead_name: str, lead_id: str,
                        score_label: str, staff_id: Optional[str] = None):
    if score_label == "hot":
        title = _pick(_HOT_MSGS, lead_name)
    elif score_label == "cold":
        title = _pick(_COLD_MSGS, lead_name)
    else:
        title = _pick(_WARM_MSGS, lead_name)
    body = f"AI confidence score updated to: {score_label.upper()}"
    _push(supabase, "lead_scored", title, body, lead_id, staff_id)


def notify_call_completed(supabase: Client, lead_name: str, lead_id: str,
                           status: str, staff_id: Optional[str] = None):
    if status in ("no_answer", "not_picked", "busy", "failed"):
        title = _pick(_CALL_MISSED_MSGS, lead_name)
    else:
        title = _pick(_CALL_DONE_MSGS, lead_name)
    body = f"Call status: {status.replace('_', ' ').title()}"
    _push(supabase, "call_complete", title, body, lead_id, staff_id)


def notify_callback_due(supabase: Client, lead_name: str, lead_id: str,
                         staff_id: Optional[str] = None):
    title = _pick(_CALLBACK_MSGS, lead_name)
    body = "Triggering scheduled AI callback call now."
    _push(supabase, "callback_due", title, body, lead_id, staff_id)


def notify_lead_converted(supabase: Client, lead_name: str, lead_id: str,
                            staff_id: Optional[str] = None):
    title = _pick(_CONVERTED_MSGS, lead_name)
    body = "Lead has been marked as CONVERTED. 🎊"
    _push(supabase, "lead_converted", title, body, lead_id, staff_id)


def notify_lead_not_interested(supabase: Client, lead_name: str, lead_id: str,
                                 staff_id: Optional[str] = None):
    title = _pick(_NOT_INTERESTED_MSGS, lead_name)
    body = "Lead status changed to NOT_INTERESTED."
    _push(supabase, "not_interested", title, body, lead_id, staff_id)


def notify_lead_abused(supabase: Client, lead_name: str, lead_id: str,
                        staff_id: Optional[str] = None):
    title = _pick(_ABUSE_MSGS, lead_name)
    body = "Bot has stopped responding. You can unblock from the WhatsApp chat."
    _push(supabase, "abuse_blocked", title, body, lead_id, staff_id)
