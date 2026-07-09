"""
Conference ExoML webhook — served to Exotel when a doctor or user leg needs to join
a named conference room.

Route: GET /api/webhooks/exotel/conference-exoml?room=<conference_name>
"""

from fastapi import APIRouter, Query
from fastapi.responses import Response

router = APIRouter()


@router.get("/conference-exoml")
async def conference_exoml(room: str = Query(..., description="Conference room name")):
    """
    Returns Exotel ExoML that places the caller into a named conference room.
    Called by Exotel for both the user leg (redirect) and doctor leg (outbound call).
    """
    exoml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial>
        <Conference waitUrl="" startConferenceOnEnter="true" endConferenceOnExit="false">
            {room}
        </Conference>
    </Dial>
</Response>"""
    return Response(content=exoml, media_type="application/xml")
