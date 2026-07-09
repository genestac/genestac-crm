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
    OutputTransportMessageFrame,
    OutputTransportMessageUrgentFrame,
)
import base64
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

ENV = os.getenv("ENVIRONMENT", "development")


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

    # 3. Get Knowledge Base (Top 5 items)
    kb_res = supabase.table("ai_knowledge_base").select("title, content").limit(5).execute()
    kb_data = "\n".join([f"{item['title']}: {item['content']}" for item in kb_res.data]) if kb_res.data else "No company info available."

    # 4. Get Active Doctors
    doc_res = supabase.table("doctor_schedules").select("*, staffs(full_name)").eq("is_active", True).execute()
    doc_data = "\n".join([
        f"Dr. {d['staffs']['full_name']} (Phone: {d['exotel_number']}) - Available {d['start_time']} to {d['end_time']} on {', '.join(d['available_days'] or [])}"
        for d in doc_res.data
    ]) if doc_res.data else "No doctors currently active."

    # 5. Get Lead Context Memory (last 5 interactions)
    mem_res = supabase.table("lead_context_memory").select("memory_text").eq("lead_id", lead_id).order("created_at", desc=True).limit(5).execute()
    mem_data = "\n".join([m["memory_text"] for m in mem_res.data]) if mem_res.data else "No past memory available."

    lead_name = lead.get("name", "the customer")

    system_instruction = f"""{base_prompt}

LEAD INFORMATION:
Name: {lead_name}
Status: {lead.get('status', 'Unknown')}
Context/Metadata: {json.dumps(lead.get('metadata', {}))}

PAST MEMORY/INTERACTIONS WITH THIS LEAD:
{mem_data}

COMPANY KNOWLEDGE BASE:
{kb_data}

AVAILABLE DOCTORS:
{doc_data}

INSTRUCTIONS:
You are speaking to {lead_name} on a live phone call via Exotel.
Speak naturally, briefly, and confidently.
If they want to book an appointment or transfer to a doctor, refer to the available doctors listed above.
Start by greeting {lead_name} warmly and asking how you can help them today.
Keep responses short and conversational — this is a phone call, not a chat."""

    return system_instruction, lead_name


# ---------------------------------------------------------------------------
# Exotel TwiML/ExoML webhook
# ---------------------------------------------------------------------------
@router.api_route("/twiml", methods=["GET", "POST"])
async def exotel_twiml(lead_id: str, request: Request):
    host = request.url.hostname
    ws_url = f"wss://{host}/api/webhooks/exotel/stream/{lead_id}"
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{ws_url}" />
    </Connect>
</Response>"""
    return Response(content=twiml, media_type="application/xml")


# ---------------------------------------------------------------------------
# Main voice stream WebSocket handler
# ---------------------------------------------------------------------------
@router.websocket("/stream")
async def voice_stream(websocket: WebSocket):
    await websocket.accept()

    # -----------------------------------------------------------------------
    # Step 1: Parse the Exotel handshake (connected + start events)
    # -----------------------------------------------------------------------
    stream_sid = ""
    call_sid = ""    # Exotel call SID — needed to redirect live call to conference
    lead_id = ""

    for _ in range(10):
        try:
            msg_data = await asyncio.wait_for(websocket.receive_text(), timeout=3.0)
            logger.warning(f"EXOTEL MSG: {msg_data}")
            msg = json.loads(msg_data)

            if msg.get("event") == "start":
                start = msg["start"]
                stream_sid = start.get("stream_sid", "")
                # Exotel also exposes the actual call SID in the start message
                call_sid = start.get("call_sid", stream_sid)

                # Exotel passes the lead_id as CustomField value OR as a key
                custom_params = start.get("custom_parameters", {})
                if custom_params:
                    # New format: {"CustomField": "<uuid>"}
                    if "CustomField" in custom_params and custom_params["CustomField"]:
                        lead_id = custom_params["CustomField"]
                    else:
                        # Old format: {"<uuid>": ""}
                        first_key = list(custom_params.keys())[0]
                        # Validate it looks like a UUID (not "CustomField")
                        if len(first_key) > 10 and first_key != "CustomField":
                            lead_id = first_key

                logger.warning(f"Parsed stream_sid={stream_sid!r}, call_sid={call_sid!r}, lead_id={lead_id!r}")
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
            # Gemini Live has its own server-side VAD built-in.
            # Running SileroVAD locally causes double-detection and adds ~300ms
            # extra silence wait before Gemini receives end-of-turn signal.
            vad_enabled=False,
            vad_audio_passthrough=True,
            serializer=CustomExotelSerializer(stream_sid=stream_sid),
        )
    )

    # -----------------------------------------------------------------------
    # Step 4: Configure the LLM with doctor-handoff tool
    # -----------------------------------------------------------------------
    # Tool definition: Gemini will call this when user wants to connect with a doctor
    doctor_connect_tool = {
        "function_declarations": [{
            "name": "connect_to_doctor",
            "description": (
                "Connect the user with a real doctor from our staff. "
                "Call this function when the user asks to speak with a doctor, "
                "requests a consultation, or wants to be transferred to medical staff. "
                "Do NOT call this for booking future appointments — only for immediate live connection."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Brief reason why the user wants to connect with a doctor"
                    }
                },
                "required": ["reason"],
            },
        }]
    }

    if ENV == "development":
        from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService

        class GreetingGeminiService(GeminiLiveLLMService):
            async def _handle_session_ready(self, session):
                await super()._handle_session_ready(session)
                logger.warning("Gemini session ready — sending greeting trigger")
                await self._create_single_response([{
                    "role": "user",
                    "content": f"Hi, my name is {lead_name}. Please greet me warmly and ask how you can help.",
                }])
                self._ready_for_realtime_input = True

        llm = GreetingGeminiService(
            api_key=os.getenv("GEMINI_API_KEY"),
            system_instruction=system_instruction,
            tools=[doctor_connect_tool],
        )
    else:
        from pipecat.services.openai_realtime import OpenAIRealtimeLLMService
        llm = OpenAIRealtimeLLMService(
            model="gpt-realtime-preview",
            api_key=os.getenv("OPENAI_API_KEY"),
            system_instruction=system_instruction,
            tools=[doctor_connect_tool],
        )

    # Empty context — conversation history accumulates from here
    context = LLMContext(messages=[])
    context_aggregator = LLMContextAggregatorPair(context)

    # -----------------------------------------------------------------------
    # Step 5: Doctor handoff handler (registered before pipeline starts)
    # -----------------------------------------------------------------------
    @llm.register_function("connect_to_doctor")
    async def handle_connect_to_doctor(function_name, tool_call_id, arguments, llm_obj, ctx, result_callback):
        """
        Called by Gemini when user wants to connect with a doctor.
        Steps:
          1. Find an available doctor from doctor_schedules
          2. Return doctor name to Gemini so it can announce the handoff
          3. In background: call doctor + redirect user's call to conference
          4. Cancel Gemini pipeline (AI leaves the call)
        """
        reason = arguments.get("reason", "consultation")
        logger.warning(f"[Doctor Handoff] Triggered. Reason: {reason}")

        # Find an available, active doctor
        try:
            doc_res = (
                supabase.table("doctor_schedules")
                .select("exotel_number, staffs(full_name)")
                .eq("is_active", True)
                .not_.is_("exotel_number", "null")
                .limit(1)
                .execute()
            )
        except Exception as db_err:
            logger.error(f"[Doctor Handoff] DB error fetching doctor: {db_err}")
            doc_res = type("R", (), {"data": []})()  # empty result

        if not doc_res.data:
            # No doctors available — tell Gemini to inform the user
            logger.warning("[Doctor Handoff] No active doctors found.")
            await result_callback({
                "status": "unavailable",
                "message": "No doctors are currently available. Offer to book a future appointment instead."
            })
            return

        doctor = doc_res.data[0]
        doctor_phone = doctor["exotel_number"]
        doctor_name = (
            doctor.get("staffs", {}).get("full_name", "our doctor")
            if isinstance(doctor.get("staffs"), dict)
            else "our doctor"
        )
        conference_name = f"conf_{stream_sid}"

        logger.warning(f"[Doctor Handoff] Connecting {lead_name} with {doctor_name} ({doctor_phone})")

        # Tell Gemini the doctor's name so it can speak the handoff message
        await result_callback({
            "status": "connecting",
            "doctor_name": doctor_name,
            "message": f"Please say: 'Great! I'm connecting you with {doctor_name} right now. Please hold for a moment.'"
        })

        # After a short delay (give Gemini time to speak the announcement),
        # trigger the Exotel conference bridge and cancel the AI pipeline.
        async def _do_handoff():
            import asyncio as _asyncio
            from services.exotel_service import call_doctor_into_conference, redirect_call_to_conference

            # Determine the public base URL for conference ExoML
            base_url = os.getenv("BACKEND_PUBLIC_URL", "").rstrip("/")
            if not base_url:
                # Fallback: derive from ngrok/localtunnel if running locally
                base_url = "https://my-genestac-voices.loca.lt"
                # For ngrok, you'd set PUBLIC_URL in .env

            await _asyncio.sleep(4)  # Wait for Gemini to finish speaking the announcement

            # 1. Call the doctor and put them in the conference room
            call_doctor_into_conference(doctor_phone, conference_name, base_url)

            # 2. Redirect the user's live call to the same conference room
            #    (this removes Gemini from the audio path)
            redirect_call_to_conference(call_sid, conference_name, base_url)

            logger.warning(f"[Doctor Handoff] Conference '{conference_name}' initiated — cancelling AI pipeline.")

            # 3. Cancel Gemini pipeline — AI leaves the call
            await task.cancel()

        asyncio.create_task(_do_handoff())

    # -----------------------------------------------------------------------
    # Step 6: Build and run the pipeline
    # -----------------------------------------------------------------------
    pipeline = Pipeline([
        transport.input(),
        context_aggregator.user(),
        llm,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))

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
        # Step 6: Save transcript and memory when call ends
        # -----------------------------------------------------------------------
        try:
            raw_messages = context.messages
            logger.warning(f"[Transcript] context.messages count: {len(raw_messages)}")

            conversation_lines = []
            for m in raw_messages:
                # Handle both plain dict {role, content} and Gemini Content objects
                if isinstance(m, dict):
                    role = m.get("role", "")
                    content = m.get("content", "")
                else:
                    # Gemini Content object: .role and .parts[].text
                    role = getattr(m, "role", "")
                    parts = getattr(m, "parts", [])
                    content = " ".join(
                        getattr(p, "text", "") for p in parts if hasattr(p, "text")
                    )

                if role in ("user", "model", "assistant") and content:
                    display_role = "assistant" if role == "model" else role
                    conversation_lines.append(f"{display_role}: {content}")

            full_transcript = "\n".join(conversation_lines)
            logger.warning(f"[Transcript] full_transcript length: {len(full_transcript)}, lead_id: {lead_id}")

            if full_transcript and lead_id:
                # -----------------------------------------------------------
                # Generate an intelligent summary using Gemini
                # -----------------------------------------------------------
                summary = f"AI Call with {lead_name}."  # fallback
                try:
                    from google import genai as gai
                    from google.genai import types as gai_types
                    gai_client = gai.Client(api_key=os.getenv("GEMINI_API_KEY"))
                    summary_prompt = f"""You are a CRM assistant. Summarize this AI sales call in 3-4 concise bullet points for a sales rep.

Focus on:
- What the lead was interested in (products/plans/concerns)
- Key information shared by the lead (health goals, constraints, objections)
- What was offered or discussed
- Outcome / next steps (booked appointment, declined, asked for follow-up, etc.)

Call transcript:
{full_transcript}

Return ONLY the bullet points, no intro text. Use plain text bullets starting with •"""
                    resp = gai_client.models.generate_content(
                        model="gemini-2.0-flash",
                        contents=summary_prompt,
                    )
                    summary = resp.text.strip()
                    logger.warning(f"[Transcript] AI summary generated: {summary[:100]}...")
                except Exception as sum_err:
                    logger.warning(f"[Transcript] Summary generation failed, using fallback: {sum_err}")
                    # Fallback: extract just user lines
                    user_lines = [l for l in conversation_lines if l.startswith("user:")]
                    summary = f"Lead interested in: {'; '.join(user_lines[:3])}"

                log_res = supabase.table("ai_call_logs").select("id").eq("lead_id", lead_id).order("created_at", desc=True).limit(1).execute()
                log_id = None
                if log_res.data:
                    log_id = log_res.data[0]["id"]
                    supabase.table("ai_call_logs").update({
                        "transcript": full_transcript,
                        "summary": summary,
                        "status": "completed",
                    }).eq("id", log_id).execute()
                    logger.warning(f"[Transcript] Updated existing log {log_id}")
                else:
                    new_log = supabase.table("ai_call_logs").insert({
                        "lead_id": lead_id,
                        "transcript": full_transcript,
                        "summary": summary,
                        "status": "completed",
                    }).execute()
                    log_id = new_log.data[0]["id"]
                    logger.warning(f"[Transcript] Created new log {log_id}")

                supabase.table("lead_context_memory").insert({
                    "lead_id": lead_id,
                    "memory_text": f"Call summary:\n{summary}",
                    "source_call_id": log_id,
                }).execute()
                logger.warning(f"[Transcript] Memory saved for lead {lead_id}")
            else:
                logger.warning(f"[Transcript] Skipped saving — transcript empty or no lead_id")
        except Exception as e:
            logger.error(f"Failed to save transcript/memory: {e}", exc_info=True)
