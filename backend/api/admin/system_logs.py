"""
System log streaming via SSE.
A custom logging handler buffers the last 500 log records in memory.
Clients connect to /stream and receive a live feed of new lines.
"""
import asyncio
import json
import logging
import time
from collections import deque
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from api.deps import get_current_user

router = APIRouter()

# ── In-memory log ring buffer ────────────────────────────────────────────────

MAX_BUFFER = 500

class LogBufferHandler(logging.Handler):
    """Captures Python log records into a shared in-memory deque."""

    def __init__(self, buffer: deque):
        super().__init__()
        self.buffer = buffer

    def emit(self, record: logging.LogRecord):
        try:
            entry = {
                "ts":      datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
                "level":   record.levelname,          # DEBUG / INFO / WARNING / ERROR / CRITICAL
                "logger":  record.name,
                "message": self.format(record),
                "id":      id(record),
            }
            self.buffer.append(entry)
        except Exception:
            pass  # Never crash the app because of a log handler


# Global shared buffer — populated by the handler below
_log_buffer: deque = deque(maxlen=MAX_BUFFER)
_handler = LogBufferHandler(_log_buffer)
_handler.setFormatter(logging.Formatter("%(message)s"))
_handler.setLevel(logging.DEBUG)

# Attach to the root logger so every logger in the app feeds here
logging.getLogger().addHandler(_handler)

# Also capture uvicorn / pipecat
for _logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error", "pipecat"):
    logging.getLogger(_logger_name).addHandler(_handler)


# ── SSE generator ─────────────────────────────────────────────────────────────

async def _sse_log_stream(request: Request) -> AsyncGenerator[str, None]:
    """
    Yields SSE lines forever.
    First sends the current buffer snapshot so the client sees history,
    then tails new entries as they arrive.
    """
    # Send a heartbeat comment so the browser knows the connection is open
    yield ": connected\n\n"

    # Drain the existing buffer as a batch
    snapshot = list(_log_buffer)
    for entry in snapshot:
        yield f"data: {json.dumps(entry)}\n\n"

    last_count = len(snapshot)

    # Tail new entries
    while not await request.is_disconnected():
        current = list(_log_buffer)
        new_entries = current[last_count:]
        for entry in new_entries:
            yield f"data: {json.dumps(entry)}\n\n"
        last_count = len(current)

        # Heartbeat comment every 15 s to keep proxies alive
        yield ": heartbeat\n\n"
        await asyncio.sleep(1)


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get("/stream")
async def stream_system_logs(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Server-Sent Events endpoint. Streams live backend logs to the admin panel.
    Connect with EventSource('/api/admin/system-logs/stream').
    """
    return StreamingResponse(
        _sse_log_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable Nginx buffering
        },
    )


@router.get("/history")
async def get_log_history(current_user: dict = Depends(get_current_user)):
    """Returns the current in-memory log buffer as JSON (for initial page load)."""
    return {"data": list(_log_buffer)}
