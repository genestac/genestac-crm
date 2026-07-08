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
    lead_id = ""

    for _ in range(10):
        try:
            msg_data = await asyncio.wait_for(websocket.receive_text(), timeout=3.0)
            logger.warning(f"EXOTEL MSG: {msg_data}")
            msg = json.loads(msg_data)

            if msg.get("event") == "start":
                start = msg["start"]
                stream_sid = start.get("stream_sid", "")

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

                logger.warning(f"Parsed stream_sid={stream_sid!r}, lead_id={lead_id!r}")
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
    from pipecat.audio.vad.silero import SileroVADAnalyzer

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            sample_rate=16000,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
            vad_audio_passthrough=True,
            serializer=CustomExotelSerializer(stream_sid=stream_sid),
        )
    )

    # -----------------------------------------------------------------------
    # Step 4: Configure the LLM
    # -----------------------------------------------------------------------
    if ENV == "development":
        from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService

        # Subclass to immediately trigger the greeting when the Gemini
        # session WebSocket opens (before any user audio arrives).
        # _handle_session_ready is the exact moment the session is live.
        class GreetingGeminiService(GeminiLiveLLMService):
            async def _handle_session_ready(self, session):
                await super()._handle_session_ready(session)
                # _session is now set; send greeting directly
                logger.warning("Gemini session ready — sending greeting trigger")
                await self._create_single_response([{
                    "role": "user",
                    "content": f"Hi, my name is {lead_name}. Please greet me warmly and ask how you can help.",
                }])

        llm = GreetingGeminiService(
            api_key=os.getenv("GEMINI_API_KEY"),
            system_instruction=system_instruction,
        )
    else:
        from pipecat.services.openai_realtime import OpenAIRealtimeLLMService
        llm = OpenAIRealtimeLLMService(
            model="gpt-realtime-preview",
            api_key=os.getenv("OPENAI_API_KEY"),
            system_instruction=system_instruction,
        )

    # Empty context — conversation history accumulates from here
    context = LLMContext(messages=[])
    context_aggregator = LLMContextAggregatorPair(context)

    # -----------------------------------------------------------------------
    # Step 5: Build and run the pipeline
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
            messages = context.messages
            conversation = [m for m in messages if m.get("role") in ("user", "assistant")]
            full_transcript = "\n".join([
                f"{m['role']}: {m['content']}"
                for m in conversation
                if isinstance(m.get("content"), str)
            ])

            if full_transcript and lead_id:
                summary = f"AI Call with {lead_name}. " + full_transcript[:150] + "..."

                log_res = supabase.table("ai_call_logs").select("id").eq("lead_id", lead_id).order("created_at", desc=True).limit(1).execute()
                if log_res.data:
                    log_id = log_res.data[0]["id"]
                    supabase.table("ai_call_logs").update({
                        "transcript": full_transcript,
                        "summary": summary,
                        "status": "completed",
                    }).eq("id", log_id).execute()

                    supabase.table("lead_context_memory").insert({
                        "lead_id": lead_id,
                        "memory_text": f"Discussed: {summary}",
                        "source_call_id": log_id,
                    }).execute()
        except Exception as e:
            logger.error(f"Failed to save transcript/memory: {e}", exc_info=True)
