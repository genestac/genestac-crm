#!/usr/bin/env python3
"""
Sarvam AI Webhook Local Tester
Uses only built-in Python libraries (urllib) — no pip install needed.

Usage:
  python3 test_sarvam_webhooks.py
"""

import json
import sys
import urllib.request
import urllib.error

BASE_URL = "http://localhost:8000/api/webhooks/sarvam"

LEAD_ID = "de00a3ae-cc23-4f7d-944a-fbb05f9bbdaa"
CUSTOMER_PHONE = "+919999999999"  # update if you want real doctor bridge


def post(endpoint: str, payload: dict) -> tuple[int, dict]:
    url = f"{BASE_URL}/{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body}
    except Exception as ex:
        return 0, {"error": str(ex)}


def print_result(name: str, status: int, data: dict):
    icon = "✅" if status == 200 else "❌"
    print(f"\n{icon} [{name}] HTTP {status}")
    print(f"   Response: {json.dumps(data, ensure_ascii=False, indent=2)}")


def health_check():
    print("\n" + "="*60)
    print("Checking backend is reachable ...")
    try:
        with urllib.request.urlopen("http://localhost:8000/", timeout=4) as r:
            print(f"✅ Backend is UP — HTTP {r.status}")
    except Exception as e:
        print(f"❌ Backend not reachable: {e}")
        print("   Make sure Docker backend is running on port 8000")
        sys.exit(1)


def test_search_kb():
    print("\n" + "="*60)
    print("TEST 1 — search_knowledge_base (RAG)")
    print("="*60)
    status, data = post("tool/search-kb", {
        "parameters": {
            "lead_id": LEAD_ID,
            "query": "What is the price of the Medical program?"
        },
        "caller_number": CUSTOMER_PHONE,
        "call_id": "test-001"
    })
    print_result("search-kb", status, data)


def test_schedule_callback():
    print("\n" + "="*60)
    print("TEST 2 — schedule_callback")
    print("="*60)
    status, data = post("tool/schedule-callback", {
        "parameters": {
            "lead_id": LEAD_ID,
            "callback_datetime": "2026-08-01T18:00:00+05:30"
        },
        "caller_number": CUSTOMER_PHONE,
        "call_id": "test-002"
    })
    print_result("schedule-callback", status, data)
    print("   → Supabase check: leads.ai_callback_time should be updated")


def test_schedule_call():
    print("\n" + "="*60)
    print("TEST 3 — schedule_call (book appointment)")
    print("="*60)
    status, data = post("tool/schedule-call", {
        "parameters": {
            "lead_id": LEAD_ID,
            "time_preference": "2026-08-02T10:00:00+05:30",
            "reason": "Weight loss consultation — Sarvam AI test"
        },
        "caller_number": CUSTOMER_PHONE,
        "call_id": "test-003"
    })
    print_result("schedule-call", status, data)
    print("   → Supabase check: appointments table should have a new row")


def test_post_call():
    print("\n" + "="*60)
    print("TEST 4 — post-call webhook (transcript + lead scoring)")
    print("="*60)
    fake_transcript = (
        "assistant: Namaste! Main Aalya bol rahi hu, Genestac se. "
        "Kya aap apna health goal share kar sakti hain?\n"
        "user: Haan, main weight loss karna chahti hu. Mere 15 kilo zyada hain.\n"
        "assistant: Bilkul, main samajhti hu. Hamare Medical Program ke baare mein jaanna chahenge?\n"
        "user: Haan, price kya hai?\n"
        "assistant: Medical program ki cost around 8000 rupaye per month hai.\n"
        "user: Theek hai, mujhe ek appointment chahiye kal subah.\n"
        "assistant: Perfect! Appointment book ho gaya hai kal subah 10 baje. Dhanyavaad!"
    )
    status, data = post("post-call", {
        "call_id": "test-post-call-001",
        "duration_seconds": 185,
        "transcript": fake_transcript,
        "recording_url": "",
        "custom_data": {"lead_id": LEAD_ID}
    })
    print_result("post-call", status, data)
    print("   → Supabase check:")
    print("     ai_call_logs   — new row with transcript + lead_score")
    print("     interactions   — AI call timeline note")
    print("     lead_context_memory — vectorized memory row")
    print("     leads/users    — status updated (CONTACTED / QUALIFIED / etc.)")


def test_connect_doctor():
    print("\n" + "="*60)
    print("TEST 5 — connect_to_doctor")
    print("⚠️  This may make a REAL Exotel bridge call!")
    print("="*60)
    confirm = input("   Proceed? (y/N): ").strip().lower()
    if confirm != "y":
        print("   Skipped.")
        return
    status, data = post("tool/connect-doctor", {
        "parameters": {
            "lead_id": LEAD_ID,
            "user_explicitly_confirmed": True,
            "reason": "user said: doctor se baat karni hai (TEST)"
        },
        "caller_number": CUSTOMER_PHONE,
        "call_id": "test-004"
    })
    print_result("connect-doctor", status, data)


if __name__ == "__main__":
    print("🧪 Sarvam AI Webhook Tester")
    print(f"   Lead ID : {LEAD_ID}")
    print(f"   Backend : {BASE_URL}")

    health_check()

    print("\nWhich tests? (space-separated numbers, or 'a' for all except connect-doctor)")
    print("  1 — search_knowledge_base")
    print("  2 — schedule_callback")
    print("  3 — schedule_call")
    print("  4 — post-call (transcript + lead score)")
    print("  5 — connect_to_doctor (real call!)")
    print("  a — run 1 2 3 4")
    choice = input("\nChoice: ").strip().lower()

    if "a" in choice or "1" in choice:
        test_search_kb()
    if "a" in choice or "2" in choice:
        test_schedule_callback()
    if "a" in choice or "3" in choice:
        test_schedule_call()
    if "a" in choice or "4" in choice:
        test_post_call()
    if "5" in choice:
        test_connect_doctor()

    print("\n" + "="*60)
    print("✅ Tests done! Check your Supabase tables to verify.")
    print("="*60)
