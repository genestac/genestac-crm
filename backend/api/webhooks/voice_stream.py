import os
import json
import asyncio
from fastapi import APIRouter, WebSocket, Request
from fastapi.responses import Response
from supabase import Client
from db.supabase import get_supabase_client

from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketTransport,
    FastAPIWebsocketParams
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.pipeline.runner import PipelineRunner
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.serializers.exotel import ExotelFrameSerializer
from pipecat.frames.frames import (
    AudioRawFrame,
    InterruptionFrame,
    LLMMessagesAppendFrame,
    OutputTransportMessageFrame,
    OutputTransportMessageUrgentFrame,
)
from pipecat.services.llm_service import FunctionCallParams
import base64
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

ENV = os.getenv("ENVIRONMENT", "development")


# ---------------------------------------------------------------------------
# Per-lead active session guard: prevents double-bot when Exotel opens two
# call legs (WebSocket connections) for a single connect.json call.
# ---------------------------------------------------------------------------
_active_lead_sessions: dict[str, str] = {}  # lead_id -> stream_sid


# ---------------------------------------------------------------------------
# Custom Exotel Serializer
# Fixes pipecat's bug: Exotel requires "stream_sid" (underscore) not "streamSid"
# ---------------------------------------------------------------------------
class CustomExotelSerializer(ExotelFrameSerializer):
    async def serialize(self, frame):
        if isinstance(frame, InterruptionFrame):
            answer = {
                "event": "clear",
                "streamSid": self._stream_sid,
                "stream_sid": self._stream_sid,
            }
            return json.dumps(answer)
        elif isinstance(frame, AudioRawFrame):
            data = frame.audio
            serialized_data = await self._output_resampler.resample(
                data, frame.sample_rate, self._exotel_sample_rate
            )
            if not serialized_data:
                return None
            payload = base64.b64encode(serialized_data).decode("ascii")
            answer = {
                "event": "media",
                "streamSid": self._stream_sid,
                "stream_sid": self._stream_sid,
                "media": {"payload": payload},
            }
            return json.dumps(answer)
        elif isinstance(frame, (OutputTransportMessageFrame, OutputTransportMessageUrgentFrame)):
            if self.should_ignore_frame(frame):
                return None
            return json.dumps(frame.message)
        return None


from datetime import datetime
import pytz

def is_doctor_available(doc: dict, current_time: datetime) -> bool:
    if not doc.get("allow_ai_calls", True):
        return False
        
    if not doc.get("is_active"):
        return False
        
    # If they are active and allow AI calls, check their schedule
    
    start_time_str = doc.get("start_time")
    end_time_str = doc.get("end_time")
    available_days = doc.get("available_days") or []
    
    if not start_time_str or not end_time_str or not available_days:
        return False
        
    current_day = current_time.strftime("%A")
    if current_day not in available_days:
        return False
        
    try:
        start_time = datetime.strptime(start_time_str, "%H:%M:%S").time()
    except ValueError:
        try:
            start_time = datetime.strptime(start_time_str, "%H:%M").time()
        except Exception:
            return False
            
    try:
        end_time = datetime.strptime(end_time_str, "%H:%M:%S").time()
    except ValueError:
        try:
            end_time = datetime.strptime(end_time_str, "%H:%M").time()
        except Exception:
            return False
            
    return start_time <= current_time.time() <= end_time

# ---------------------------------------------------------------------------
# RAG context builder
# ---------------------------------------------------------------------------
async def build_rag_context(lead_id: str, supabase: Client):
    # 1. Get Lead
    lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
    lead = lead_res.data[0] if lead_res.data else {}

    # 2. Get AI Call Settings
    settings_res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_settings").execute()
    settings = settings_res.data[0]["settings_value"] if settings_res.data else {}
    base_prompt = settings.get("base_prompt", "You are a helpful AI assistant.")

    # 3. Get Active Doctors
    ist = pytz.timezone("Asia/Kolkata")
    current_dt_ist = datetime.now(ist)
    current_time_ist = current_dt_ist.strftime("%A, %d %B %Y, %I:%M %p IST")

    doc_res = supabase.table("doctor_schedules").select("*, staffs(full_name)").not_.is_("exotel_number", "null").execute()
    
    available_docs = []
    if doc_res.data:
        for d in doc_res.data:
            if is_doctor_available(d, current_dt_ist):
                available_docs.append(d)

    doc_data = "\n".join([
        f"Dr. {d['staffs']['full_name']} (Phone: {d['exotel_number']}) - Available {d['start_time']} to {d['end_time']} on {', '.join(d['available_days'] or [])}"
        for d in available_docs
    ]) if available_docs else "No doctors currently active."

    # 4. Get Lead Context Memory (last 5 interactions)
    mem_res = supabase.table("lead_context_memory").select("memory_text").eq("lead_id", lead_id).order("created_at", desc=True).limit(5).execute()
    mem_data = "\n".join([m["memory_text"] for m in mem_res.data]) if mem_res.data else "No past memory available."

    lead_name = lead.get("name", "the customer")

    system_instruction = f"""{base_prompt}

LEAD INFORMATION:
Name: {lead_name}
Status: {lead.get('status', 'Unknown')}
Context/Metadata: {json.dumps(lead.get('metadata', {}))}

CURRENT DATE & TIME: {current_time_ist}

PAST MEMORY/INTERACTIONS WITH THIS LEAD:
{mem_data}

AVAILABLE DOCTORS:
{doc_data}

INSTRUCTIONS:
You are an AI Sales Representative calling from Genestac. You are speaking to {lead_name} on a live phone call via Exotel.
Your primary goal is to actively pitch and sell Genestac's doctor-guided weight loss plans and health programs. Do not act like a generic customer support agent waiting for questions; proactively guide the conversation toward enrollment and purchasing.
You MUST speak with an energetic, engaging, persuasive, and professional tone.
CRITICAL LANGUAGE INSTRUCTION: If the user speaks in Hindi or Hinglish, YOU MUST REPLY IN HINDI. Never reply in English if the user speaks Hindi. This is a strict requirement. Always match the user's spoken language.
CRITICAL LIMIT: Keep general conversational responses very brief (1-2 sentences). However, if the user asks for specific details about plans, pricing, or programs, you may explain in normal depth to persuade them, but avoid rambling.
If they want to book an appointment or transfer to a doctor, refer to the available doctors listed above.
Start the call by warmly greeting {lead_name}, introducing yourself as an AI Sales Representative from Genestac, and asking if they are ready to achieve their health and weight loss goals with our plans. Do not repeat this introduction later in the call.

CRITICAL TOOL RULES — READ CAREFULLY:

connect_to_doctor:
- ONLY trigger this if the user CLEARLY and EXPLICITLY says they want to talk to a doctor RIGHT NOW in THIS call.
  Examples that DO trigger it: "doctor se baat karni hai", "doctor ko connect karo", "I want to speak with a doctor now", "doctor chahiye".
  Examples that do NOT trigger it: "doctor" mentioned in passing, any time/number the user says (e.g. "3:25", "825"), discussing plans, asking questions.
- DO NOT proactively suggest "let me connect you to a doctor" unless the user first shows CLEAR purchase intent (e.g. says "I want to buy", "enroll me", "sign me up") AND then specifically asks for a doctor.
- DO NOT connect to doctor based on past call memories or summaries.
- If unsure whether the user wants a doctor, ASK: "Kya aap abhi kisi doctor se baat karna chahenge?" — wait for a clear yes.
- NEVER connect to a doctor just because the word "doctor" or "डॉक्टर" appeared in a number/time the user said.

schedule_callback:
- ONLY use this when the user explicitly asks to be called back at a later time.

schedule_call (doctor appointment):
- Only use this when the user explicitly asks to BOOK a future appointment with a doctor (not an immediate transfer).

search_knowledge_base:
- Use the information in your instructions first. Only call this if the user asks for pricing or program details not already provided."""

    return system_instruction, lead_name


# ---------------------------------------------------------------------------
# Exotel TwiML/ExoML webhook
# ---------------------------------------------------------------------------
@router.api_route("/twiml", methods=["GET", "POST"])
async def exotel_twiml(lead_id: str, request: Request):
    # Build the WebSocket URL — do NOT put lead_id in the path because
    # our WebSocket route is /stream (no path param). The lead_id is
    # automatically passed by Exotel via custom_parameters.CustomField
    # in the start event, which voice_stream.py already reads.
    host = request.url.hostname
    ws_url = f"wss://{host}/api/webhooks/exotel/stream"
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{ws_url}" bidirectional="true" />
    </Connect>
</Response>"""
    return Response(content=twiml, media_type="application/xml")


# ---------------------------------------------------------------------------
# Main voice stream WebSocket handler
# ---------------------------------------------------------------------------
# Alias for old Exotel apps that still point to /stream/deepgram
@router.websocket("/stream")
async def voice_stream(websocket: WebSocket):
    await websocket.accept()

    # -----------------------------------------------------------------------
    # Step 1: Parse the Exotel handshake (connected + start events)
    # -----------------------------------------------------------------------
    stream_sid = ""
    call_sid = ""    # Exotel call SID (not needed for bridge — kept for session guard)
    lead_id = ""
    customer_phone = ""       # Customer's actual phone number (from start event)
    exotel_caller_id = ""     # Our Exotel virtual number (from start event)
    _session_registered = False  # tracks whether we registered in _active_lead_sessions

    for _ in range(10):
        try:
            msg_data = await asyncio.wait_for(websocket.receive_text(), timeout=3.0)
            logger.warning(f"EXOTEL MSG: {msg_data}")
            msg = json.loads(msg_data)

            if msg.get("event") == "start":
                start = msg["start"]
                stream_sid = start.get("stream_sid", "")
                call_sid = start.get("call_sid", stream_sid)

                # Customer's phone number and our caller ID from Exotel
                customer_phone = start.get("from", "")       # e.g. "08319212779"
                exotel_caller_id = start.get("to", "")       # e.g. "01141189316"

                # Exotel passes the lead_id as CustomField value OR as a key
                custom_params = start.get("custom_parameters", {})
                if custom_params:
                    # New format: {"CustomField": "<uuid>"}
                    if "CustomField" in custom_params and custom_params["CustomField"]:
                        lead_id = custom_params["CustomField"]
                    else:
                        # Old format: {"<uuid>": ""}
                        first_key = list(custom_params.keys())[0]
                        if len(first_key) > 10 and first_key != "CustomField":
                            lead_id = first_key

                logger.warning(
                    f"Parsed stream_sid={stream_sid!r}, call_sid={call_sid!r}, "
                    f"lead_id={lead_id!r}, customer_phone={customer_phone!r}"
                )
                break

        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for Exotel start message")
            break
        except Exception as e:
            logger.error(f"Error reading Exotel handshake: {e}")
            break

    if not stream_sid:
        logger.error("Closing WebSocket: stream_sid is missing from Exotel start message")
        await websocket.close()
        return


    # -----------------------------------------------------------------------
    # Double-bot guard: if another WebSocket already owns this lead's session,
    # close this duplicate leg immediately (Exotel opens two legs per call).
    # -----------------------------------------------------------------------
    if lead_id and lead_id in _active_lead_sessions:
        existing_sid = _active_lead_sessions[lead_id]
        logger.warning(
            f"[DuplicateBot] lead_id={lead_id} already has active session "
            f"{existing_sid}. Rejecting duplicate stream_sid={stream_sid}."
        )
        await websocket.close()
        return

    if lead_id:
        _active_lead_sessions[lead_id] = stream_sid
        _session_registered = True
        logger.warning(f"[Session] Registered lead_id={lead_id} -> stream_sid={stream_sid}")

    # -----------------------------------------------------------------------
    # Step 2: Build RAG context from Supabase
    # -----------------------------------------------------------------------
    supabase = get_supabase_client()
    try:
        system_instruction, lead_name = await build_rag_context(lead_id, supabase)
    except Exception as e:
        logger.error(f"Failed to build RAG context for lead_id={lead_id}: {e}")
        # Fall back to a generic prompt so the call can still proceed
        system_instruction = "You are a helpful AI assistant on a phone call. Greet the caller warmly and ask how you can help."
        lead_name = "the customer"

    # -----------------------------------------------------------------------
    # Step 3: Configure transport with Exotel serializer
    # -----------------------------------------------------------------------

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            sample_rate=16000,
            # OpenAI Realtime handles audio over its own internal WebSocket
            # connection — InputAudioRawFrames do NOT need to flow downstream
            # through the pipeline to the output transport.
            # With vad_audio_passthrough=True (old Gemini setting), user audio
            # frames reach transport.output(), get serialized as Exotel "media"
            # events, and are played back to the caller (echo bug).
            vad_enabled=False,
            vad_audio_passthrough=False,
            serializer=CustomExotelSerializer(stream_sid=stream_sid),
        )
    )

    # -----------------------------------------------------------------------
    # Step 4: Configure the LLM with doctor-handoff tool
    # -----------------------------------------------------------------------
    # Tool definition: Gemini will call this when user wants to connect with a doctor
    doctor_connect_tool = {
        "type": "function",
        "name": "connect_to_doctor",
        "description": (
            "Immediately connect the user to a live doctor on this call. "
            "ONLY call this when the user has EXPLICITLY said in this conversation that they want to speak with a doctor right now. "
            "Do NOT call this for booking future appointments, for times/numbers, or based on assumptions."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "user_explicitly_confirmed": {
                    "type": "boolean",
                    "description": (
                        "Set to true ONLY if the user said something like: "
                        "'doctor se baat karo', 'connect me to a doctor', 'I want a doctor now', 'doctor chahiye'. "
                        "Set to false if you are guessing, if the word doctor appeared in a number/time, "
                        "or if the user has NOT clearly asked for a live doctor transfer."
                    )
                },
                "reason": {
                    "type": "string",
                    "description": "Quote the exact words the user said that triggered this request."
                }
            },
            "required": ["user_explicitly_confirmed", "reason"],
        }
    }

    search_kb_tool = {
        "type": "function",
        "name": "search_knowledge_base",
        "description": (
            "Search the company knowledge base for answers to user questions. "
            "Call this function whenever the user asks about our services, pricing, "
            "address, operating hours, policies, or general company information."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The specific question or topic to search for"
                }
            },
            "required": ["query"],
        }
    }

    schedule_call_tool = {
        "type": "function",
        "name": "schedule_call",
        "description": (
            "Book a future doctor consultation appointment for the user. "
            "Call this ONLY when the user explicitly asks to schedule, book, or set an appointment with a doctor at a specific future time. "
            "Examples: 'Book me with a doctor tomorrow at 3pm', 'Can I have an appointment on Friday?', 'Schedule a consultation for next week'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "time_preference": {
                    "type": "string",
                    "description": "The exact ISO 8601 datetime for the appointment (e.g. '2026-07-11T15:00:00+05:30'). Calculate this relative to the CURRENT DATE & TIME provided in your instructions."
                },
                "reason": {
                    "type": "string",
                    "description": "The reason for the consultation (e.g. weight loss, health checkup)"
                }
            },
            "required": ["time_preference", "reason"],
        }
    }

    schedule_callback_tool = {
        "type": "function",
        "name": "schedule_callback",
        "description": (
            "Schedule an automated AI callback call for the user. "
            "Call this whenever the user says they are busy, asks to be called back, or wants to continue the conversation later. "
            "Do NOT use this for doctor consultations — use schedule_call for that.\n\n"
            "TIME CALCULATION RULES (use the CURRENT DATE & TIME from your instructions as the base):\n"
            "- 'thodi der baad' / 'thode time baad' / 'after some time' / 'after a while' / 'in a bit' → add 1 hour\n"
            "- 'call me later' / 'baad mein call karo' / 'abhi busy hoon' → add 3 hours to current time\n"
            "- 'call me after 2 hours' / '2 ghante baad' → add exactly 2 hours\n"
            "- 'call me after 30 minutes' / '30 minute baad' → add exactly 30 minutes\n"
            "- 'call me after 1 day' / 'kal call karo' / 'tomorrow' → add 24 hours\n"
            "- 'call me at 3pm' / '3 baje call karo' → today at 15:00 IST (if already past, use tomorrow)\n"
            "- 'call me in the morning' / 'subah call karo' → next day at 09:00 IST\n"
            "- 'call me in the evening' / 'shaam ko call karo' → today at 18:00 IST (if already past, next day)\n"
            "- 'call me tonight' / 'raat ko call karo' → today at 20:00 IST\n"
            "Always output a precise ISO 8601 datetime. NEVER leave it vague."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "callback_datetime": {
                    "type": "string",
                    "description": (
                        "The exact ISO 8601 datetime for the callback in IST (+05:30). "
                        "Example: '2026-07-11T15:00:00+05:30'. "
                        "Calculate this relative to the CURRENT DATE & TIME provided in your system instructions."
                    )
                }
            },
            "required": ["callback_datetime"],
        }
    }

    # ---------------------------------------------------------------------------
    # OpenAI Realtime LLM — used for both development and production
    # (Gemini voice path commented out below for reference)
    # ---------------------------------------------------------------------------
    from pipecat.services.openai.realtime.llm import OpenAIRealtimeLLMService
    from pipecat.services.openai.realtime import events

    session_properties = events.SessionProperties(
        instructions=system_instruction,
        tools=[doctor_connect_tool, search_kb_tool, schedule_call_tool, schedule_callback_tool],
        audio=events.AudioConfiguration(
            input=events.AudioInput(
                # No language= set → Whisper auto-detects Hindi / English / Hinglish per utterance.
                # The prompt acts as a vocabulary prior — include number formats, times, and
                # common phrases so Whisper transcribes them accurately instead of mangling
                # them as Hindi phonetics (e.g. "3:25 PM" not "तीन बजकर पचीस मिनट").
                transcription=events.InputAudioTranscription(
                    model="gpt-realtime-whisper",
                    prompt=(
                        "This is a bilingual Hindi-English (Hinglish) sales call for Genestac, a weight loss company. "
                        "The customer may speak Hindi, English, or mix both. "
                        "Transcribe numbers and times as digits: 3:25 PM, 10:30 AM, 825, 1 hour, 2 ghante, kal, 5 baje. "
                        "Common phrases: call me at, call me later, baad mein call karo, "
                        "thodi der baad, kal call karo, 3 baje, weight loss, doctor, Genestac, plan, price."
                    )
                ),
                turn_detection=events.TurnDetection(
                    threshold=0.8,
                    silence_duration_ms=400
                )
            ),
            output=events.AudioOutput(voice="alloy")
        )
    )

    llm = OpenAIRealtimeLLMService(
        api_key=os.getenv("OPENAI_API_KEY"),
        settings=OpenAIRealtimeLLMService.Settings(
            model="gpt-realtime-2.1-mini",
            session_properties=session_properties
        )
    )

    # ---------------------------------------------------------------------------
    # COMMENTED OUT: Gemini Live voice path
    # ---------------------------------------------------------------------------
    # if ENV == "development":
    #     from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
    #     class GreetingGeminiService(GeminiLiveLLMService):
    #         async def _handle_session_ready(self, session):
    #             await super()._handle_session_ready(session)
    #             logger.warning("Gemini session ready — sending greeting trigger")
    #             await self._create_single_response([{
    #                 "role": "user",
    #                 "content": f"Hi, my name is {lead_name}. Please greet me warmly and ask how you can help.",
    #             }])
    #             self._ready_for_realtime_input = True
    #     llm = GreetingGeminiService(
    #         api_key=os.getenv("GEMINI_API_KEY"),
    #         system_instruction=system_instruction,
    #         tools=[doctor_connect_tool, search_kb_tool],
    #         settings=GeminiLiveLLMService.Settings(voice="Aoede"),
    #     )
    # else:
    #     from pipecat.services.openai_realtime import OpenAIRealtimeLLMService
    #     llm = OpenAIRealtimeLLMService(
    #         model="gpt-realtime-preview",
    #         api_key=os.getenv("OPENAI_API_KEY"),
    #         system_instruction=system_instruction,
    #         tools=[doctor_connect_tool, search_kb_tool],
    #     )

    # Empty context — conversation history accumulates from here
    context = LLMContext(messages=[])
    context_aggregator = LLMContextAggregatorPair(context)

    # -----------------------------------------------------------------------
    # Step 5: Doctor handoff handler (registered before pipeline starts)
    # -----------------------------------------------------------------------
    async def handle_connect_to_doctor(params: FunctionCallParams):
        """
        Called by the LLM when user wants to connect with a doctor live on this call.
        Two-layer guard:
          1. LLM must set user_explicitly_confirmed=True in the tool arguments.
          2. Code-level keyword scan of actual user transcript turns as a hard backstop.
        """
        arguments = params.arguments
        result_callback = params.result_callback
        reason = arguments.get("reason", "consultation")
        user_explicitly_confirmed = arguments.get("user_explicitly_confirmed", False)

        logger.warning(f"[Doctor Handoff] Requested. confirmed={user_explicitly_confirmed} reason={reason}")

        # ── Layer 1: LLM confirmation flag ────────────────────────────────────
        if not user_explicitly_confirmed:
            logger.warning("[Doctor Handoff] BLOCKED — LLM did not set user_explicitly_confirmed=True")
            await result_callback({
                "status": "blocked",
                "message": (
                    "Do NOT connect to a doctor yet. Ask the user first: "
                    "'Kya aap abhi kisi doctor se baat karna chahenge?' and wait for a clear yes."
                )
            })
            return

        # ── Layer 2: Keyword scan on real user utterances (hard backstop) ────
        # This catches cases where Whisper garbled text is misinterpreted as a doctor request.
        DOCTOR_KEYWORDS = [
            "doctor", "डॉक्टर", "doc",
            "baat karo", "baat karni", "baat chahiye",
            "connect", "transfer", "speak with", "talk to",
            "consultation", "consult",
        ]
        # conversation_tracker is defined later in the function scope;
        # at call time it's already created and populated.
        recent_user_text = " ".join(getattr(conversation_tracker, "user_turns", [])).lower()
        keyword_found = any(kw in recent_user_text for kw in DOCTOR_KEYWORDS)

        if not keyword_found:
            logger.warning(
                f"[Doctor Handoff] BLOCKED — no doctor-intent keywords found in user turns. "
                f"User said: {recent_user_text[:200]}"
            )
            await result_callback({
                "status": "blocked",
                "message": (
                    "Do NOT connect to a doctor. The user has not clearly asked for one. "
                    "Ask: 'Kya aap abhi kisi doctor se baat karna chahenge?'"
                )
            })
            return

        logger.warning(f"[Doctor Handoff] ✅ Confirmed. Proceeding with connection. Reason: {reason}")

        # Find an available, active doctor
        try:
            doc_res = (
                supabase.table("doctor_schedules")
                .select("*, staffs(full_name)")
                .not_.is_("exotel_number", "null")
                .execute()
            )
            
            ist = pytz.timezone("Asia/Kolkata")
            current_dt_ist = datetime.now(ist)
            
            available_docs = []
            if doc_res.data:
                for d in doc_res.data:
                    if is_doctor_available(d, current_dt_ist):
                        available_docs.append(d)
        except Exception as db_err:
            logger.error(f"[Doctor Handoff] DB error fetching doctor: {db_err}")
            available_docs = []

        if not available_docs:
            # No doctors available — tell Gemini to inform the user
            logger.warning("[Doctor Handoff] No active doctors found.")
            await result_callback({
                "status": "unavailable",
                "message": "No doctors are currently available. Offer to book a future appointment instead."
            })
            return

        doctor = available_docs[0]
        doctor_phone = doctor["exotel_number"]
        doctor_name = (
            doctor.get("staffs", {}).get("full_name", "our doctor")
            if isinstance(doctor.get("staffs"), dict)
            else "our doctor"
        )
        conference_name = f"conf_{stream_sid}"

        logger.warning(f"[Doctor Handoff] Connecting {lead_name} with {doctor_name} ({doctor_phone})")

        # Update lead status
        try:
            if lead_id:
                supabase.table("leads").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()
                logger.warning(f"[Doctor Handoff] Lead {lead_id} status updated to CONSULTATION_SCHEDULED")
        except Exception as e:
            logger.error(f"[Doctor Handoff] Failed to update lead status: {e}")

        # Tell Gemini the doctor's name so it can speak the handoff message
        await result_callback({
            "status": "connecting",
            "doctor_name": doctor_name,
            "message": (
                f"Please say exactly this: 'Great! I'm arranging a call with {doctor_name} right now. "
                f"You will receive a call back from our number in just a moment. "
                f"You can hang up this call now. Thank you!'"
            )
        })

        # After a short delay (give Gemini time to speak the announcement),
        # initiate a fresh Exotel bridge call between doctor and customer.
        async def _do_handoff():
            import asyncio as _asyncio
            from services.exotel_service import bridge_doctor_and_customer

            await _asyncio.sleep(5)  # Let Gemini finish the announcement

            # Use connect.json with From=doctor + To=customer to bridge them.
            # Exotel calls the doctor first; when doctor answers, Exotel calls
            # the customer and bridges both parties.
            # The customer will receive a new call from our Exotel number.
            if not customer_phone:
                logger.error("[Doctor Handoff] customer_phone is empty — cannot bridge!")
                return

            bridge_res = bridge_doctor_and_customer(
                doctor_phone=doctor_phone,
                customer_phone=customer_phone
            )
            if bridge_res:
                logger.warning(
                    f"[Doctor Handoff] ✅ Bridge initiated: "
                    f"{doctor_phone} ⇔ {customer_phone} — cancelling AI pipeline."
                )
                await task.cancel()
            else:
                logger.error(
                    "[Doctor Handoff] ❌ Bridge failed — customer stays on AI call."
                )

        asyncio.create_task(_do_handoff())

    async def handle_search_kb(params: FunctionCallParams):
        arguments = params.arguments
        result_callback = params.result_callback
        query = arguments.get("query", "")
        logger.warning(f"[RAG Search] Searching knowledge base for: '{query}'")

        # Use OpenAI text-embedding-3-small (1536 dims) for vector search
        import openai as _openai
        try:
            # 1. Embed the user's query using OpenAI embeddings
            oai_client = _openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            embed_res = await oai_client.embeddings.create(
                model="text-embedding-3-small",
                input=query,
            )
            query_vector = embed_res.data[0].embedding

            # 2. Search Supabase via the RPC match function (pgvector cosine similarity)
            search_res = supabase.rpc("match_knowledge_base", {
                "query_embedding": query_vector,
                "match_threshold": 0.5,
                "match_count": 3
            }).execute()

            results = search_res.data
            if results:
                formatted_results = "\n\n".join([f"**{r['title']}**\n{r['content']}" for r in results])
                logger.warning(f"[RAG Search] Found {len(results)} matches.")
                await result_callback({
                    "status": "success",
                    "results": formatted_results
                })
            else:
                logger.warning("[RAG Search] No matches found.")
                await result_callback({
                    "status": "success",
                    "message": "No matches found. Gracefully tell the user that you don't have those exact details on hand right now, but offer to connect them with a doctor or schedule a callback to discuss it further."
                })
        except Exception as e:
            logger.error(f"[RAG Search] Error during vector search: {e}")
            await result_callback({
                "status": "error",
                "message": "Sorry, I had trouble searching the knowledge base right now."
            })


    # Register tools with the LLM service
    llm.register_function("connect_to_doctor", handle_connect_to_doctor)
    llm.register_function("search_knowledge_base", handle_search_kb)

    async def handle_schedule_call(params: FunctionCallParams):
        arguments = params.arguments
        result_callback = params.result_callback
        time_preference = arguments.get("time_preference")
        reason = arguments.get("reason", "Follow-up consultation")
        
        logger.warning(f"[Schedule Call] Appointment requested for '{time_preference}', reason: {reason}")
        
        try:
            # --- Parse the time string into an ISO datetime ---
            # The LLM provides a human-readable time like "tomorrow at 3pm" or "2026-07-11T15:00:00+05:30"
            # We'll store whatever it provides; if it's already ISO format, great.
            # The LLM is instructed to provide ISO 8601 in schedule_callback — for schedule_call
            # we accept natural language as well, so we store as notes and try to parse.
            import re as _re
            from datetime import datetime as _dt
            import pytz as _pytz

            ist = _pytz.timezone("Asia/Kolkata")
            scheduled_at_iso = None

            # Try to parse ISO 8601 directly first
            try:
                parsed = _dt.fromisoformat(time_preference)
                scheduled_at_iso = parsed.isoformat()
            except Exception:
                # Fallback: schedule for 24 hours from now and note the original preference
                scheduled_at_iso = _dt.now(ist).replace(hour=10, minute=0, second=0, microsecond=0)
                # Try to advance the date by 1 day as a sensible default
                from datetime import timedelta as _td
                scheduled_at_iso = (scheduled_at_iso + _td(days=1)).isoformat()
                logger.warning(f"[Schedule Call] Could not parse '{time_preference}' as ISO — defaulting to tomorrow 10AM IST")

            # --- Find the lead's assigned sales rep and a doctor ---
            sales_rep_id = None
            patient_id = None
            patient_phone_fallback = None
            
            # Try users table first (most leads are stored as users)
            user_res = supabase.table("users").select("id, assigned_sales_rep_id, phone").eq("id", lead_id).execute()
            if user_res.data:
                patient_id = user_res.data[0]["id"]
                sales_rep_id = user_res.data[0].get("assigned_sales_rep_id")
                patient_phone_fallback = user_res.data[0].get("phone")

            # Fallback: try leads table
            if not sales_rep_id:
                lead_res = supabase.table("leads").select("id, assigned_sales_rep_id, phone_number").eq("id", lead_id).execute()
                if lead_res.data:
                    sales_rep_id = lead_res.data[0].get("assigned_sales_rep_id")
                    patient_phone_fallback = lead_res.data[0].get("phone_number")

            # Last resort: pick any admin staff as the sales rep
            if not sales_rep_id:
                admin_res = supabase.table("staffs").select("id").limit(1).execute()
                if admin_res.data:
                    sales_rep_id = admin_res.data[0]["id"]

            # --- Find all eligible doctors ---
            doc_res = supabase.table("doctor_schedules").select("staff_id, staffs(full_name), allow_scheduling").eq("allow_scheduling", True).execute()
            
            if not doc_res.data:
                logger.error("[Schedule Call] No doctors with allow_scheduling=True found.")
                await result_callback({
                    "status": "error",
                    "message": "Tell the user: 'I was unable to schedule the appointment automatically. Our team will reach out to you to confirm the booking.'"
                })
                return

            from services.slot_service import find_nearest_available_slot as _find_slot
            from datetime import datetime as _dt2

            preferred_dt = _dt2.fromisoformat(scheduled_at_iso)
            
            best_slot = None
            best_doctor_id = None
            best_doctor_name = "our doctor"
            
            # Find the doctor with the nearest slot across all doctors
            for doc in doc_res.data:
                did = doc["staff_id"]
                slot = _find_slot(
                    doctor_id=did,
                    preferred_dt=preferred_dt,
                    duration_minutes=10,
                    supabase=supabase,
                    search_days=7,
                )
                if slot:
                    # Compare distance to preferred_dt
                    slot_start = _dt2.fromisoformat(slot["start"])
                    # Remove tz for naive subtraction if preferred_dt is naive, or ensure both are aware
                    if slot_start.tzinfo and not preferred_dt.tzinfo:
                        import pytz
                        ist = pytz.timezone("Asia/Kolkata")
                        preferred_dt = ist.localize(preferred_dt)
                    dist = abs((slot_start - preferred_dt).total_seconds())
                    
                    if best_slot is None or dist < best_slot["dist"]:
                        slot["dist"] = dist
                        best_slot = slot
                        best_doctor_id = did
                        staff_info = doc.get("staffs")
                        if isinstance(staff_info, dict):
                            best_doctor_name = staff_info.get("full_name", "our doctor")

            if not best_slot:
                logger.warning(f"[Schedule Call] No available slot found in the next 7 days across any doctor")
                await result_callback({
                    "status": "error",
                    "message": "Tell the user: 'I'm sorry, I couldn't find an available appointment slot in the next 7 days. Our team will contact you to confirm a convenient time.'"
                })
                return

            doctor_id = best_doctor_id
            doctor_name = best_doctor_name
            actual_scheduled_at = best_slot["start"]
            slot_was_adjusted = actual_scheduled_at != scheduled_at_iso

            if slot_was_adjusted:
                logger.warning(
                    f"[Schedule Call] Requested slot {scheduled_at_iso} was taken. "
                    f"Auto-adjusted to nearest free slot: {actual_scheduled_at} with doctor {doctor_name}"
                )

            # --- Insert into appointments table ---
            appt_payload = {
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "sales_rep_id": sales_rep_id,
                "scheduled_at": actual_scheduled_at,
                "status": "pending",
                "notes": (
                    f"Booked via AI Voice Agent. Patient requested: {time_preference}. Reason: {reason}"
                    + (f"\n[Note: Slot adjusted from {time_preference} to nearest available]" if slot_was_adjusted else "")
                    + (f"\n[PHONE: {patient_phone_fallback}]" if patient_phone_fallback else "")
                ),
                "title": f"AI-Booked: Consultation with {lead_name}",
                "type": "consultation",
                "duration_minutes": 10,
            }
            appt_res = supabase.table("appointments").insert(appt_payload).execute()

            appt_id = appt_res.data[0]["id"] if appt_res.data else None
            logger.warning(f"[Schedule Call] Appointment {appt_id} created for lead {lead_id} with doctor {doctor_id}")

            # --- Update lead status ---
            supabase.table("leads").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()
            supabase.table("users").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()

            # --- Notify the doctor ---
            try:
                supabase.table("system_notifications").insert({
                    "target_role": "doctor",
                    "target_id": doctor_id,
                    "notification_type": "in_app",
                    "title": "New Appointment via AI Agent",
                    "message": f"{lead_name} requested a consultation: {time_preference}. Reason: {reason}. Appointment ID: {appt_id}"
                }).execute()
                logger.warning(f"[Schedule Call] Doctor {doctor_id} notified")
            except Exception as notif_err:
                logger.error(f"[Schedule Call] Failed to notify doctor: {notif_err}")

            # Friendly time for the verbal confirmation — use actual booked slot, not requested
            friendly_time = time_preference
            try:
                parsed_appt = _dt2.fromisoformat(actual_scheduled_at)
                import pytz as _pytz2
                friendly_time = parsed_appt.astimezone(_pytz2.timezone("Asia/Kolkata")).strftime("%d %B %Y at %I:%M %p IST")
            except Exception:
                pass

            if slot_was_adjusted:
                # Distinguish: was the slot taken by another patient, or just boundary-rounded?
                from services.slot_service import check_conflict as _check_conflict2
                from datetime import datetime as _dt3
                requested_dt = _dt3.fromisoformat(scheduled_at_iso)
                actual_conflict = _check_conflict2(
                    doctor_id=doctor_id,
                    scheduled_at=requested_dt,
                    duration_minutes=10,
                    supabase=supabase,
                )
                if actual_conflict:
                    verbal_message = (
                        f"Tell the user verbally: 'The time you requested, {time_preference}, was already booked by another patient. "
                        f"I've scheduled you for the next available slot with Dr. {doctor_name} at {friendly_time}. "
                        f"Does that work for you?'"
                    )
                else:
                    # Slot boundary rounding (e.g. user asked 3:45, nearest slot is 3:40 or 3:50)
                    verbal_message = (
                        f"Tell the user verbally: 'Our appointments are in fixed time slots, "
                        f"so I've booked the closest available time: Dr. {doctor_name} at {friendly_time}. "
                        f"Is that okay with you?'"
                    )
            else:
                verbal_message = (
                    f"Tell the user verbally: 'Your appointment with Dr. {doctor_name} "
                    f"has been scheduled for {friendly_time}. You will receive a confirmation shortly. "
                    f"Is there anything else I can help you with?'"
                )

            await result_callback({
                "status": "success",
                "appointment_id": appt_id,
                "message": verbal_message,
            })
        except Exception as e:
            logger.error(f"[Schedule Call] Unexpected error: {e}", exc_info=True)
            await result_callback({
                "status": "error",
                "message": "Tell the user: 'I encountered an issue while scheduling your appointment. Our team will contact you to confirm the booking manually.'"
            })
        
    llm.register_function("schedule_call", handle_schedule_call)

    async def handle_schedule_callback(params: FunctionCallParams):
        arguments = params.arguments
        result_callback = params.result_callback
        callback_time = arguments.get("callback_datetime")
        
        logger.warning(f"[Schedule Callback] Requested callback at {callback_time}")
        if lead_id:
            try:
                # Update in both users and leads tables
                supabase.table("leads").update({
                    "ai_callback_time": callback_time,
                    "status": "CALLBACK_SCHEDULED"
                }).eq("id", lead_id).execute()
                supabase.table("users").update({
                    "ai_callback_time": callback_time,
                    "status": "CALLBACK_SCHEDULED"
                }).eq("id", lead_id).execute()
                logger.warning(f"[Schedule Callback] Lead {lead_id} ai_callback_time set to {callback_time}, status -> CALLBACK_SCHEDULED")
            except Exception as e:
                logger.error(f"[Schedule Callback] Failed to update lead: {e}")

        # Friendly time for verbal confirmation
        friendly_time = callback_time
        try:
            from datetime import datetime as _dt
            import pytz as _pytz
            parsed = _dt.fromisoformat(callback_time)
            ist = _pytz.timezone("Asia/Kolkata")
            parsed_ist = parsed.astimezone(ist)
            friendly_time = parsed_ist.strftime("%d %B %Y at %I:%M %p IST")
        except Exception:
            pass
                
        await result_callback({
            "status": "success",
            "message": f"Please inform the user verbally: 'I have noted your request. We will call you back on {friendly_time}. Thank you for your time!'"
        })
    llm.register_function("schedule_callback", handle_schedule_callback)

    # -----------------------------------------------------------------------
    # Step 6: Build and run the pipeline
    # -----------------------------------------------------------------------
    
    from pipecat.frames.frames import Frame, TranscriptionFrame
    from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

    class ConversationTracker(FrameProcessor):
        """
        Captures user speech turns in real-time via TranscriptionFrame.

        Assistant turns are NOT captured here because LLMContextAssistantTurnFrame
        flows UPSTREAM in the pipeline and bypasses this processor (which sits
        upstream of the LLM). Instead, assistant turns are read from context.messages
        at the end of the call and interleaved with user turns by index.

        Conversation pattern is always: AI greets → user replies → AI responds → ...
        So we interleave: assistant[0], user[0], assistant[1], user[1], ...
        """
        def __init__(self):
            super().__init__()
            # Each entry: text of the user's turn, in order spoken
            self.user_turns: list[str] = []

        async def process_frame(self, frame: Frame, direction: FrameDirection):
            await super().process_frame(frame, direction)

            # User speech — TranscriptionFrame is emitted by the Realtime STT
            if isinstance(frame, TranscriptionFrame):
                text = frame.text.strip() if frame.text else ""
                if text:
                    self.user_turns.append(text)
                    logger.warning(f"[Transcript:user] {text}")

            await self.push_frame(frame, direction)

        def build_transcript(self, context_messages: list) -> str:
            """
            Build a fully interleaved transcript by combining:
            - Assistant turns from context.messages (role=assistant, in order)
            - User turns from real-time STT (in order spoken)

            Interleave as: assistant[0], user[0], assistant[1], user[1], ...
            The AI always speaks first (greeting), so assistant leads.
            """
            # Extract assistant turns from context in order, skip empty/short ones
            assistant_turns: list[str] = []
            for m in context_messages:
                role = m.get("role", "") if isinstance(m, dict) else getattr(m, "role", "")
                if isinstance(m, dict):
                    content = m.get("content", "")
                else:
                    parts = getattr(m, "parts", [])
                    content = " ".join(getattr(p, "text", "") for p in parts if hasattr(p, "text"))
                if role in ("model", "assistant") and content and len(content.strip()) > 5:
                    assistant_turns.append(content.strip())
                    logger.warning(
                        f"[Transcript:assistant] {content[:80]}..." if len(content) > 80
                        else f"[Transcript:assistant] {content}"
                    )

            lines: list[str] = []
            max_turns = max(len(assistant_turns), len(self.user_turns))
            for i in range(max_turns):
                if i < len(assistant_turns):
                    lines.append(f"assistant: {assistant_turns[i]}")
                if i < len(self.user_turns):
                    lines.append(f"user: {self.user_turns[i]}")

            return "\n".join(lines)

    conversation_tracker = ConversationTracker()

    pipeline = Pipeline([
        transport.input(),
        context_aggregator.user(),
        conversation_tracker,
        llm,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.warning("Exotel client connected — sending greeting trigger")
        context.add_message({
            "role": "user",
            "content": f"Hi, my name is {lead_name}. Please greet me warmly, introduce yourself as an AI Sales Representative from Genestac, and ask if I am looking to achieve my weight loss goals with your plans."
        })
        await task.queue_frames([LLMMessagesAppendFrame(context.get_messages())])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.warning("Exotel client disconnected — cancelling pipeline.")
        await task.cancel()

    runner = PipelineRunner()

    try:
        await runner.run(task)
    except Exception as e:
        logger.error(f"Pipecat Pipeline Error: {e}", exc_info=True)
    finally:
        # -----------------------------------------------------------------------
        # Step 7: Save transcript, lead score, and vectorized memory when call ends
        # -----------------------------------------------------------------------
        try:
            # Build the fully interleaved transcript:
            # - User turns: real-time from ConversationTracker (TranscriptionFrame STT)
            # - Assistant turns: from context.messages (most reliable source for voice)
            # - Interleaved by index: AI greets first, then alternates user/AI
            full_transcript = conversation_tracker.build_transcript(context.messages)
            logger.warning(f"[Transcript] turns={len(conversation_tracker.user_turns)} user, lead_id={lead_id}")
            logger.warning(f"[Transcript Content]\n{full_transcript}")

            if full_transcript and lead_id:
                # -----------------------------------------------------------
                # Generate summary + lead score using OpenAI gpt-4o-mini
                # Extended JSON now includes warmth scoring
                # -----------------------------------------------------------
                summary = f"AI Call with {lead_name}."  # fallback
                lead_score: int | None = None
                score_label: str | None = None
                score_reason: str | None = None
                is_not_interested = False
                callback_requested = False
                appointment_booked = False

                try:
                    import openai as _openai
                    oai_client = _openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                    summary_prompt = f"""You are a CRM analyst reviewing an AI sales call for a healthcare company (Genestac — weight loss programs).

Analyze the transcript and return a JSON object with:
1. A 3-4 bullet point summary for the sales rep
2. Boolean flags for call outcome
3. A lead warmth SCORE from 0 to 100

Scoring rubric:
- 0-39 (Cold): Lead was disinterested, hostile, or non-responsive
- 40-69 (Warm): Lead showed curiosity, asked questions, didn't commit
- 70-100 (Hot): Lead showed strong intent — asked about pricing, requested callback, asked about doctors, or booked

Call transcript:
{full_transcript}

Return ONLY a valid JSON object:
{{
  "summary": "bullet point summary (use • character)",
  "is_not_interested": true or false,
  "callback_requested": true or false,
  "appointment_booked": true or false,
  "lead_score": integer 0-100,
  "score_label": "Cold" or "Warm" or "Hot",
  "score_reason": "1-2 sentence explanation for the score"
}}
Rules:
- `is_not_interested`: true if lead said things like 'not interested', 'mujhe interest nahi', 'mat call karo', 'please remove my number'.
- `callback_requested`: true if lead asked to be called back or said 'call me later/baad mein'.
- `appointment_booked`: true if a doctor consultation was explicitly scheduled.
- `lead_score`: must be an integer, never null.
- `score_label`: must exactly match the score range (Cold 0-39, Warm 40-69, Hot 70-100)."""

                    resp = oai_client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": summary_prompt}],
                        max_tokens=400,
                        response_format={"type": "json_object"}
                    )

                    response_text = resp.choices[0].message.content.strip()
                    try:
                        parsed = json.loads(response_text)
                        summary = parsed.get("summary", response_text)
                        is_not_interested = parsed.get("is_not_interested", False)
                        callback_requested = parsed.get("callback_requested", False)
                        appointment_booked = parsed.get("appointment_booked", False)
                        lead_score = parsed.get("lead_score")
                        score_label = parsed.get("score_label")
                        score_reason = parsed.get("score_reason")
                    except Exception as parse_err:
                        logger.warning(f"[LeadScore] JSON parse failed: {parse_err}")
                        summary = response_text

                    logger.warning(
                        f"[LeadScore] lead={lead_id} score={lead_score} ({score_label}) | "
                        f"not_interested={is_not_interested} callback={callback_requested} appt={appointment_booked}"
                    )

                    if is_not_interested:
                        try:
                            supabase.table("leads").update({"status": "NOT_INTERESTED"}).eq("id", lead_id).execute()
                            supabase.table("users").update({"status": "NOT_INTERESTED"}).eq("id", lead_id).execute()
                            logger.warning(f"[LeadScore] Lead {lead_id} -> NOT_INTERESTED")
                        except Exception as status_err:
                            logger.error(f"[LeadScore] Failed to update NOT_INTERESTED status: {status_err}")

                    if callback_requested:
                        logger.warning(f"[LeadScore] Lead {lead_id} requested callback — status already set during call.")
                    if appointment_booked:
                        logger.warning(f"[LeadScore] Lead {lead_id} appointment booked — status already set during call.")

                    # -------------------------------------------------------
                    # Hot Lead Alert: notify the assigned sales rep immediately
                    # -------------------------------------------------------
                    if lead_score is not None and lead_score >= 70:
                        try:
                            # Look up assigned sales rep from both tables
                            rep_id = None
                            rep_res = supabase.table("users").select("assigned_sales_rep_id").eq("id", lead_id).execute()
                            if rep_res.data and rep_res.data[0].get("assigned_sales_rep_id"):
                                rep_id = rep_res.data[0]["assigned_sales_rep_id"]
                            else:
                                rep_res2 = supabase.table("leads").select("assigned_sales_rep_id").eq("id", lead_id).execute()
                                if rep_res2.data and rep_res2.data[0].get("assigned_sales_rep_id"):
                                    rep_id = rep_res2.data[0]["assigned_sales_rep_id"]

                            if rep_id:
                                notif_msg = (
                                    f"{lead_name} scored {lead_score}/100 ({score_label}). "
                                    f"{score_reason or ''} Call them now before they go cold!"
                                )
                                supabase.table("system_notifications").insert({
                                    "target_role": "sales",
                                    "target_id": rep_id,
                                    "notification_type": "in_app",
                                    "title": f"🔥 Hot Lead: {lead_name} ({lead_score}/100)",
                                    "message": notif_msg,
                                }).execute()
                                logger.warning(f"[LeadScore] 🔥 Hot lead alert sent to sales rep {rep_id}")
                            else:
                                logger.warning(f"[LeadScore] No assigned sales rep found for lead {lead_id} — skipping hot alert.")
                        except Exception as notif_err:
                            logger.error(f"[LeadScore] Failed to send hot lead notification: {notif_err}")

                except Exception as sum_err:
                    logger.warning(f"[LeadScore] Analysis failed, using fallback: {sum_err}")
                    summary = f"AI Call with {lead_name}."

                # -----------------------------------------------------------
                # Persist call log with score
                # -----------------------------------------------------------
                log_payload = {
                    "transcript": full_transcript,
                    "summary": summary,
                    "status": "completed",
                }
                if lead_score is not None:
                    log_payload["lead_score"] = lead_score
                if score_label is not None:
                    log_payload["score_label"] = score_label
                if score_reason is not None:
                    log_payload["score_reason"] = score_reason

                log_res = supabase.table("ai_call_logs").select("id").eq("lead_id", lead_id).order("created_at", desc=True).limit(1).execute()
                log_id = None
                if log_res.data:
                    log_id = log_res.data[0]["id"]
                    supabase.table("ai_call_logs").update(log_payload).eq("id", log_id).execute()
                    logger.warning(f"[Transcript] Updated existing log {log_id}")
                else:
                    new_log = supabase.table("ai_call_logs").insert({"lead_id": lead_id, **log_payload}).execute()
                    log_id = new_log.data[0]["id"]
                    logger.warning(f"[Transcript] Created new log {log_id}")

                # -----------------------------------------------------------
                # Vectorize the memory text and store embedding for semantic RAG
                # The lead_context_memory table has an `embedding vector(1536)` column.
                # We generate an OpenAI embedding so future context retrieval can
                # use vector similarity search instead of plain recency limit.
                # -----------------------------------------------------------
                memory_text = f"Call summary:\n{summary}"
                if score_label and score_reason:
                    memory_text += f"\nLead warmth: {score_label} ({lead_score}/100). {score_reason}"

                memory_embedding = None
                try:
                    import openai as _openai2
                    oai_embed = _openai2.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                    embed_res = oai_embed.embeddings.create(
                        model="text-embedding-3-small",
                        input=memory_text,
                    )
                    memory_embedding = embed_res.data[0].embedding
                    logger.warning(f"[Memory] Generated embedding ({len(memory_embedding)} dims) for lead {lead_id}")
                except Exception as embed_err:
                    logger.error(f"[Memory] Embedding generation failed — storing raw text only: {embed_err}")

                memory_payload = {
                    "lead_id": lead_id,
                    "memory_text": memory_text,
                    "source_call_id": log_id,
                }
                if memory_embedding is not None:
                    memory_payload["embedding"] = memory_embedding

                supabase.table("lead_context_memory").insert(memory_payload).execute()
                logger.warning(f"[Memory] Vectorized memory saved for lead {lead_id}")

            else:
                logger.warning(f"[Transcript] Skipped saving — transcript empty or no lead_id")
        except Exception as e:
            logger.error(f"Failed to save transcript/memory: {e}", exc_info=True)
        finally:
            # Release the per-lead session lock so a future call can connect
            if _session_registered and lead_id in _active_lead_sessions:
                del _active_lead_sessions[lead_id]
                logger.warning(f"[Session] Released lead_id={lead_id} session lock")
