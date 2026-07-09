"""
Doctor Transfer webhook — served to Exotel when the customer's call is
redirected to a doctor.

Route: GET /api/webhooks/exotel/dial-doctor?phone=<doctor_phone>&caller_id=<exotel_number>

Exotel executes this ExoML on the customer's live call:
  1. Customer hears the doctor's phone ring
  2. When doctor picks up, they're bridged to the customer directly
  3. No conference room, no complex setup required
"""

import os
from fastapi import APIRouter, Query
from fastapi.responses import Response

router = APIRouter()


@router.api_route("/dial-doctor", methods=["GET", "POST"])
async def dial_doctor(
    phone: str = Query(..., description="Doctor's phone number to dial"),
    caller_id: str = Query("", description="Exotel caller ID / virtual number"),
):
    """
    Returns Exotel ExoML that directly dials the doctor from the customer's call.
    Exotel bridges both parties when the doctor picks up.
    """
    # Fallback to env var if caller_id not passed
    if not caller_id:
        caller_id = os.environ.get("EXOTEL_NUMBER", "")

    caller_attr = f' callerId="{caller_id}"' if caller_id else ""

    exoml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial{caller_attr} action="" timeout="30" record="true">
        <Number>{phone}</Number>
    </Dial>
</Response>"""
    return Response(content=exoml, media_type="application/xml")


# Keep the old conference-exoml endpoint for backward compatibility
# (in case Exotel has already cached a URL from a previous call)
@router.api_route("/conference-exoml", methods=["GET", "POST"])
async def conference_exoml(
    room: str = Query("", description="Conference room name (legacy, unused)"),
    phone: str = Query("", description="Doctor phone to dial"),
    caller_id: str = Query("", description="Exotel caller ID"),
):
    """Legacy endpoint — redirects to dial-doctor behavior."""
    if not caller_id:
        caller_id = os.environ.get("EXOTEL_NUMBER", "")

    caller_attr = f' callerId="{caller_id}"' if caller_id else ""
    doctor_phone = phone or "+917048995281"  # fallback to known doctor

    exoml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial{caller_attr} timeout="30" record="true">
        <Number>{doctor_phone}</Number>
    </Dial>
</Response>"""
    return Response(content=exoml, media_type="application/xml")
