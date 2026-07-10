from fastapi import APIRouter, Depends, HTTPException, Form, Body, Query
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List, Optional
import datetime

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /api/doctor/slots  — Available slots for a doctor on a date
# ---------------------------------------------------------------------------
@router.get('/slots')
async def get_available_slots(
    doctor_id: str = Query(..., description="UUID of the doctor"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Returns all time slots (available + booked) for a specific doctor on a date.
    Slots are generated from the doctor's schedule (start_time, end_time,
    slot_duration_minutes, buffer_minutes).
    """
    try:
        from services.slot_service import get_available_slots as _get_slots
        target_date = datetime.date.fromisoformat(date)
        slots = _get_slots(doctor_id, target_date, supabase)
        return {
            "date": date,
            "doctor_id": doctor_id,
            "slots": slots,
            "total": len(slots),
            "available_count": sum(1 for s in slots if s["available"]),
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# GET /api/doctor/appointments
# ---------------------------------------------------------------------------
@router.get('/appointments')
async def get_appointments(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    try:
        profile = supabase.table('staffs').select('roles(name)').eq('id', current_user['id']).single().execute()
        role_name = profile.data.get('roles', {}).get('name') if profile.data and profile.data.get('roles') else None
        is_admin = role_name in ['superadmin', 'master_admin', 'admin']

        query = supabase.table('appointments').select(
            '*, patients:users!patient_id(id, name, phone, email), '
            'sales:staffs!sales_rep_id(id, full_name)'
        )
        if not is_admin:
            query = query.eq('doctor_id', current_user['id'])
        response = query.order('scheduled_at', desc=False).execute()
        return response.data
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# GET /api/doctor/appointments/{id}
# ---------------------------------------------------------------------------
@router.get('/appointments/{id}')
async def get_appointment_by_id(
    id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    response = supabase.table('appointments').select(
        '*, patients:users!patient_id(id, name, phone, email), '
        'sales:staffs!sales_rep_id(id, full_name)'
    ).eq('id', id).single().execute()
    return response.data


# ---------------------------------------------------------------------------
# POST /api/doctor/appointments — Conflict-aware booking
# ---------------------------------------------------------------------------
@router.post('/appointments')
async def create_next_appointment(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Create a new appointment. Checks for scheduling conflicts before inserting.
    Returns 409 Conflict if the doctor already has an overlapping appointment.
    """
    from services.slot_service import check_conflict

    scheduled_at_str = data.get('scheduled_at')
    duration_minutes = data.get('duration', 10)
    doctor_id = current_user['id']

    if not scheduled_at_str:
        raise HTTPException(status_code=400, detail="scheduled_at is required")

    try:
        scheduled_at = datetime.datetime.fromisoformat(scheduled_at_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scheduled_at format. Use ISO 8601.")

    # --- Conflict check ---
    conflict = check_conflict(doctor_id, scheduled_at, duration_minutes, supabase)
    if conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "slot_conflict",
                "message": (
                    f"This time slot is already booked for "
                    f"{conflict['patient_name']} from "
                    f"{conflict['start'].strftime('%I:%M %p')} to "
                    f"{conflict['end'].strftime('%I:%M %p')}."
                ),
                "conflicting_appointment_id": conflict["appointment_id"],
                "conflict_start": conflict["start"].isoformat(),
                "conflict_end": conflict["end"].isoformat(),
            }
        )

    sales_rep_id = data.get('sales_rep_id')
    if not sales_rep_id:
        admin_res = supabase.table('staffs').select('id').eq('email', 'admin@example.com').single().execute()
        sales_rep_id = admin_res.data.get('id') if admin_res.data else current_user['id']

    payload = {
        'title': data.get('title'),
        'type': data.get('type'),
        'patient_id': data.get('patient_id'),
        'doctor_id': doctor_id,
        'sales_rep_id': sales_rep_id,
        'scheduled_at': scheduled_at_str,
        'duration_minutes': duration_minutes,
        'notes': data.get('description'),
        'location': data.get('location'),
        'meeting_link': data.get('link'),
        'status': 'pending',
    }
    supabase.table('appointments').insert(payload).execute()
    return {'success': True}


# ---------------------------------------------------------------------------
# PUT /api/doctor/appointments/{id}/status
# ---------------------------------------------------------------------------
@router.put('/appointments/{id}/status')
async def update_appointment_status(
    id: str,
    status: str = Body(embed=True),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    supabase.table('appointments').update({'status': status}).eq('id', id).execute()
    return {'success': True}


# ---------------------------------------------------------------------------
# PUT /api/doctor/appointments/{id}/details — Conflict-aware update
# ---------------------------------------------------------------------------
@router.put('/appointments/{id}/details')
async def update_appointment_details(
    id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Update appointment details. If duration_minutes or scheduled_at changes,
    runs a conflict check excluding this appointment itself.
    """
    from services.slot_service import check_conflict

    # Fetch the current appointment to get doctor_id and existing times
    existing_res = supabase.table('appointments').select('doctor_id, scheduled_at, duration_minutes').eq('id', id).single().execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail="Appointment not found")

    existing = existing_res.data
    doctor_id = existing['doctor_id']

    new_scheduled_at_str = data.get('scheduled_at', existing['scheduled_at'])
    new_duration = data.get('duration', existing['duration_minutes']) or 10

    try:
        new_scheduled_at = datetime.datetime.fromisoformat(new_scheduled_at_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid scheduled_at format")

    # Check for conflicts, excluding this appointment itself
    conflict = check_conflict(doctor_id, new_scheduled_at, new_duration, supabase, exclude_appointment_id=id)
    if conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "slot_conflict",
                "message": (
                    f"Cannot move to this slot — it conflicts with "
                    f"{conflict['patient_name']}'s appointment "
                    f"({conflict['start'].strftime('%I:%M %p')} – {conflict['end'].strftime('%I:%M %p')})."
                ),
                "conflicting_appointment_id": conflict["appointment_id"],
            }
        )

    supabase.table('appointments').update({
        'title': data.get('title'),
        'type': data.get('type'),
        'related_to': data.get('related_to'),
        'location': data.get('location'),
        'meeting_link': data.get('link'),
        'notes': data.get('description'),
        'duration_minutes': new_duration,
        'scheduled_at': new_scheduled_at_str,
    }).eq('id', id).execute()
    return {'success': True}


# ---------------------------------------------------------------------------
# PUT /api/doctor/appointments/{id}/extend — Doctor stretches a slot
# ---------------------------------------------------------------------------
@router.put('/appointments/{id}/extend')
async def extend_appointment(
    id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Dedicated endpoint for a doctor to extend the duration of a running
    or upcoming appointment. Conflict-aware — will reject if the extension
    would overlap the next patient's slot.

    Body: { "duration_minutes": 60 }
    """
    from services.slot_service import check_extend_conflict

    new_duration = data.get('duration_minutes')
    if not new_duration or not isinstance(new_duration, int) or new_duration < 5:
        raise HTTPException(status_code=400, detail="duration_minutes must be an integer >= 5")

    # Fetch current appointment
    res = supabase.table('appointments').select(
        'id, doctor_id, scheduled_at, duration_minutes, status'
    ).eq('id', id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Appointment not found")

    appt = res.data

    # Only the assigned doctor (or admin) can extend
    profile = supabase.table('staffs').select('roles(name)').eq('id', current_user['id']).single().execute()
    role_name = profile.data.get('roles', {}).get('name') if profile.data and profile.data.get('roles') else None
    is_admin = role_name in ['superadmin', 'master_admin', 'admin']
    if not is_admin and appt['doctor_id'] != current_user['id']:
        raise HTTPException(status_code=403, detail="You can only extend your own appointments")

    if appt['status'] in ('cancelled', 'rejected', 'completed'):
        raise HTTPException(status_code=400, detail=f"Cannot extend a {appt['status']} appointment")

    scheduled_at = datetime.datetime.fromisoformat(appt['scheduled_at'])
    old_duration = appt['duration_minutes'] or 30

    if new_duration <= old_duration:
        raise HTTPException(
            status_code=400,
            detail=f"New duration ({new_duration} min) must be greater than current ({old_duration} min)"
        )

    # Conflict check — excludes this appointment itself
    conflict = check_extend_conflict(
        appointment_id=id,
        doctor_id=appt['doctor_id'],
        scheduled_at=scheduled_at,
        new_duration_minutes=new_duration,
        supabase=supabase,
    )
    if conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "extend_conflict",
                "message": (
                    f"Cannot extend to {new_duration} minutes — it would overlap "
                    f"{conflict['patient_name']}'s appointment starting at "
                    f"{conflict['start'].strftime('%I:%M %p')}."
                ),
                "next_appointment_id": conflict["appointment_id"],
                "next_appointment_start": conflict["start"].isoformat(),
                "max_safe_duration_minutes": int(
                    (conflict["start"] - scheduled_at).total_seconds() / 60
                ),
            }
        )

    # All clear — extend
    supabase.table('appointments').update({'duration_minutes': new_duration}).eq('id', id).execute()
    end_time = (scheduled_at + __import__('datetime').timedelta(minutes=new_duration)).strftime('%I:%M %p')
    return {
        'success': True,
        'message': f'Appointment extended to {new_duration} minutes (ends at {end_time})',
        'duration_minutes': new_duration,
    }


# ---------------------------------------------------------------------------
# POST /api/doctor/appointments/{id}/payment-link
# ---------------------------------------------------------------------------
@router.post('/appointments/{id}/payment-link')
async def generate_payment_link(
    id: str,
    planData: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    import random, string
    mock_link = 'https://rzp.io/i/' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    supabase.table('appointments').update({
        'plan_details': {
            'products': planData.get('products'),
            'discount': planData.get('discount'),
            'total': planData.get('total'),
            'payment_link': mock_link,
            'generated_at': datetime.datetime.now().isoformat(),
        },
        'plan_id': planData.get('plan_id'),
    }).eq('id', id).execute()
    return {'success': True, 'payment_link': mock_link}


# ---------------------------------------------------------------------------
# POST /api/doctor/appointments/{id}/call — Doctor manually triggers call
# ---------------------------------------------------------------------------
@router.post('/appointments/{id}/call')
async def trigger_appointment_call(
    id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Manually triggers the Exotel bridge call between the doctor and the patient
    for this appointment. Useful if the call was missed or dropped.
    """
    # 1. Fetch appointment details
    res = supabase.table('appointments').select(
        'doctor_id, patients:users!patient_id(phone), notes'
    ).eq('id', id).single().execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Appointment not found")
        
    appt = res.data
    
    # 2. Get doctor exotel number
    doc_res = supabase.table('doctor_schedules').select('exotel_number').eq('staff_id', appt['doctor_id']).single().execute()
    doctor_exotel = doc_res.data.get('exotel_number') if doc_res.data else None
    
    if not doctor_exotel:
        raise HTTPException(status_code=400, detail="Doctor does not have an Exotel number configured.")
        
    # 3. Get patient phone (try patients relation first, fallback to notes)
    patient_phone = (appt.get('patients') or {}).get('phone', "")
    if not patient_phone and appt.get('notes') and "[PHONE:" in appt["notes"]:
        import re
        m = re.search(r"\[PHONE:\s*([^\]]+)\]", appt["notes"])
        if m:
            patient_phone = m.group(1).strip()
            
    if not patient_phone:
        raise HTTPException(status_code=400, detail="Patient phone number is missing from the appointment.")
        
    if not patient_phone.startswith('+'):
        patient_phone = '+91' + patient_phone.lstrip('0')
        
    # 4. Trigger bridge call
    from services.exotel_service import bridge_doctor_and_customer
    success = bridge_doctor_and_customer(
        doctor_phone=doctor_exotel,
        customer_phone=patient_phone,
    )
    
    if success:
        return {"success": True, "message": "Call initiated successfully. Doctor's phone will ring first."}
    else:
        raise HTTPException(status_code=500, detail="Failed to initiate call via Exotel.")


# ---------------------------------------------------------------------------
# GET /api/doctor/  — List all doctors
# ---------------------------------------------------------------------------
@router.get('/')
async def get_all_doctors(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    response = supabase.table('staffs').select('id, full_name, roles!inner(name)').eq('roles.name', 'doctor').execute()
    return {'data': response.data}

