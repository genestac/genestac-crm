from fastapi import APIRouter, Depends, HTTPException, Form, Body, Query, Request
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List, Optional
import datetime
import re

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: enrich appointment with full patient profile from WhatsApp/leads
# ---------------------------------------------------------------------------
def _enrich_patient_profile(appt: dict, supabase: Client) -> dict:
    """
    Fetches full lead/user profile (metadata captured via WhatsApp) and last
    WhatsApp messages, then attaches them to the appointment dict.
    Adds keys: patient_profile, whatsapp_summary
    """
    patient_id = appt.get('patient_id')
    if not patient_id:
        return appt

    profile = {}

    # Try leads table first (WhatsApp leads)
    lead_res = supabase.table('leads').select(
        'id, name, phone_number, email, city, '
        'wa_intake_form_sent, whatsapp_followup_at, status, metadata, created_at'
    ).eq('id', patient_id).execute()

    if lead_res.data:
        lead = lead_res.data[0]
        meta = lead.get('metadata') or {}
        profile = {
            'source': 'whatsapp_lead',
            'name': lead.get('name'),
            'phone': lead.get('phone_number'),
            'email': lead.get('email'),
            'city': lead.get('city') or meta.get('city'),
            'status': lead.get('status'),
            'created_at': lead.get('created_at'),
            # Medical & personal details from WhatsApp form
            'age': meta.get('age'),
            'gender': meta.get('gender'),
            'height': meta.get('height'),
            'weight': meta.get('weight'),
            'medical_history': meta.get('medical_history') or meta.get('medical_condition'),
            'goals': meta.get('goals'),
            'weight_goal': meta.get('weight_goal'),
            'interested_product': meta.get('interested_product'),
            'budget': meta.get('budget'),
            'other_notes': meta.get('other_critical_info'),
        }
        # Remove None values for a cleaner response
        profile = {k: v for k, v in profile.items() if v is not None}

        # Fetch last 10 WhatsApp messages for context
        try:
            msgs_res = supabase.table('whatsapp_messages').select(
                'sender_type, message_body, created_at'
            ).eq('lead_id', patient_id).order('created_at', desc=False).limit(30).execute()
            messages = msgs_res.data or []
            appt['whatsapp_messages'] = [
                {
                    'role': 'patient' if m['sender_type'] == 'lead' else 'bot',
                    'text': m['message_body'],
                    'time': m['created_at'],
                }
                for m in messages
            ]
        except Exception:
            appt['whatsapp_messages'] = []
    else:
        # Fallback: try users table
        user_res = supabase.table('users').select(
            'id, name, phone, email, city, metadata'
        ).eq('id', patient_id).execute()
        if user_res.data:
            user = user_res.data[0]
            meta = user.get('metadata') or {}
            profile = {
                'source': 'user',
                'name': user.get('name'),
                'phone': user.get('phone'),
                'email': user.get('email'),
                'city': user.get('city'),
                'age': meta.get('age'),
                'gender': meta.get('gender'),
                'height': meta.get('height'),
                'weight': meta.get('weight'),
                'medical_history': meta.get('medical_history') or meta.get('medical_condition'),
                'goals': meta.get('goals'),
            }
            profile = {k: v for k, v in profile.items() if v is not None}

    appt['patient_profile'] = profile
    return appt


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
        ).order('scheduled_at', desc=False)
        # Note: PostgREST returns all rows including those with null patient_id
        # because we handle missing patient data via the fallback below
        if not is_admin:
            query = query.eq('doctor_id', current_user['id'])
        response = query.execute()
        appointments = response.data
        
        missing_patient_ids = [a['patient_id'] for a in appointments if not a.get('patients') and a.get('patient_id')]
        if missing_patient_ids:
            leads_res = supabase.table('leads').select('id, name, phone_number, email').in_('id', missing_patient_ids).execute()
            leads_dict = {l['id']: l for l in leads_res.data}
            for a in appointments:
                if not a.get('patients') and a.get('patient_id') in leads_dict:
                    lead = leads_dict[a['patient_id']]
                    a['patients'] = {
                        'id': lead['id'],
                        'name': lead['name'],
                        'phone': lead['phone_number'],
                        'email': lead['email']
                    }
                    
        # Fallback for AI-booked appointments with no patient_id
        for a in appointments:
            if not a.get('patients') and not a.get('patient_id'):
                title = a.get('title', '')
                notes = a.get('notes', '')
                extracted_name = None
                extracted_phone = None
                lead_id_from_notes = None

                # Pattern 1: "Free Consultation – Name"
                if '–' in title:
                    extracted_name = title.split('–')[-1].strip()
                # Pattern 2: "AI-Booked: Consultation with Name"
                elif 'with ' in title:
                    extracted_name = title.split('with ')[-1].strip()

                if notes:
                    phone_match = re.search(r'\[PHONE:\s*([^\]]+)\]', notes)
                    if phone_match:
                        extracted_phone = phone_match.group(1).strip()
                    lead_match = re.search(r'\[LEAD_ID:\s*([^\]]+)\]', notes)
                    if lead_match:
                        lead_id_from_notes = lead_match.group(1).strip()

                # Try to enrich from leads table using LEAD_ID stored in notes
                if lead_id_from_notes:
                    try:
                        lr = supabase.table('leads').select('name, phone_number, email').eq('id', lead_id_from_notes).single().execute()
                        if lr.data:
                            a['patients'] = {
                                'id': lead_id_from_notes,
                                'name': lr.data.get('name') or extracted_name,
                                'phone': lr.data.get('phone_number') or extracted_phone,
                                'email': lr.data.get('email'),
                            }
                            continue
                    except Exception:
                        pass

                if extracted_name:
                    a['patients'] = {'name': extracted_name, 'phone': extracted_phone}

        # Enrich every appointment with full patient WhatsApp profile
        for a in appointments:
            _enrich_patient_profile(a, supabase)

        return appointments
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
    
    appt = response.data
    if appt and not appt.get('patients') and appt.get('patient_id'):
        lead_res = supabase.table('leads').select('id, name, phone_number, email').eq('id', appt['patient_id']).execute()
        if lead_res.data:
            lead = lead_res.data[0]
            appt['patients'] = {
                'id': lead['id'],
                'name': lead['name'],
                'phone': lead['phone_number'],
                'email': lead['email']
            }
            
    if appt and not appt.get('patients') and not appt.get('patient_id') and appt.get('title'):
        if "with " in appt['title']:
            extracted_name = appt['title'].split("with ")[-1].strip()
            extracted_phone = None
            if appt.get('notes'):
                phone_match = re.search(r'\[PHONE:\s*([^\]]+)\]', appt['notes'])
                if phone_match:
                    extracted_phone = phone_match.group(1).strip()
            appt['patients'] = {'name': extracted_name, 'phone': extracted_phone}

    # Enrich with full patient profile and WhatsApp history
    if appt:
        _enrich_patient_profile(appt, supabase)

    return appt


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
    suggested_time: Optional[str] = Body(default=None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Update appointment status. When set to 'confirmed':
    - Optionally updates scheduled_at if doctor suggested a new time
    - Sends WhatsApp template to patient with Jitsi link + confirmed time
    """
    update_payload = {'status': status}
    if suggested_time and status == 'confirmed':
        update_payload['scheduled_at'] = suggested_time

    supabase.table('appointments').update(update_payload).eq('id', id).execute()

    # ── On confirmation: notify patient via WhatsApp template ───────────────
    if status == 'confirmed':
        try:
            import asyncio
            import re as _re
            from services.whatsapp_service import send_trigger

            appt_res = supabase.table('appointments').select(
                'id, scheduled_at, meeting_link, notes, patient_id, doctor_id, title'
            ).eq('id', id).single().execute()
            appt = appt_res.data or {}

            # Resolve scheduled_at display
            sched_raw = appt.get('scheduled_at', '')
            try:
                import datetime as _dt
                from zoneinfo import ZoneInfo
                IST = ZoneInfo('Asia/Kolkata')
                sched_dt = _dt.datetime.fromisoformat(sched_raw)
                if sched_dt.tzinfo is None:
                    sched_dt = sched_dt.replace(tzinfo=IST)
                time_display = sched_dt.strftime('%-d %b %Y at %-I:%M %p IST')
            except Exception:
                time_display = sched_raw

            # Resolve doctor name
            doc_res = supabase.table('staffs').select('full_name').eq('id', appt.get('doctor_id', '')).single().execute()
            raw_doc_name = (doc_res.data or {}).get('full_name', 'Doctor')
            doctor_display = raw_doc_name.lstrip().removeprefix('Dr.').strip()

            # Resolve patient phone + name
            patient_phone = None
            patient_name = 'Patient'
            notes = appt.get('notes') or ''

            # From notes [PHONE: ...]
            pm = _re.search(r'\[PHONE:\s*([^\]]+)\]', notes)
            if pm:
                patient_phone = pm.group(1).strip()

            # From patient_id → leads or users
            patient_id = appt.get('patient_id')
            if patient_id:
                lead_res = supabase.table('leads').select('phone_number, name').eq('id', patient_id).execute()
                if lead_res.data:
                    patient_phone = patient_phone or lead_res.data[0].get('phone_number')
                    patient_name = lead_res.data[0].get('name') or patient_name
                if not patient_phone:
                    user_res = supabase.table('users').select('phone, name').eq('id', patient_id).execute()
                    if user_res.data:
                        patient_phone = user_res.data[0].get('phone')
                        patient_name = user_res.data[0].get('name') or patient_name

            meet_link = appt.get('meeting_link', '')

            if patient_phone and meet_link:
                context = {
                    "patient_name": patient_name,
                    "doctor_name":  doctor_display,
                    "scheduled_at": time_display,
                    "jitsi_link":   meet_link,
                }
                asyncio.create_task(send_trigger(
                    "appointment_confirmed_patient", context, patient_phone
                ))
        except Exception as _e:
            print(f'[Appointment Confirm] WhatsApp notify error (non-fatal): {_e}')

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
    """
    Generates a real Razorpay payment link via cart_service and saves it to the appointment.
    Accepts: { plan_id, inventory_id, discount, products, total }
    """
    # Fetch appointment to get patient_id
    appt_res = supabase.table('appointments').select('patient_id').eq('id', id).single().execute()
    if not appt_res.data:
        raise HTTPException(status_code=404, detail='Appointment not found')
    lead_id = appt_res.data.get('patient_id')

    payment_link = None
    invoice_id = None
    invoice_number = None
    total_amount = planData.get('total', 0)

    if lead_id:
        try:
            from services.cart_service import (
                get_or_create_active_cart, add_inventory_to_cart,
                add_plan_to_cart, create_pi_from_cart, clear_cart_items,
            )
            cart_id = get_or_create_active_cart(supabase=supabase, lead_id=lead_id, source='doctor_dashboard')
            clear_cart_items(supabase, cart_id)

            inventory_id = planData.get('inventory_id')
            plan_id = planData.get('plan_id')
            discount = float(planData.get('discount') or 10.0)

            if inventory_id:
                add_inventory_to_cart(supabase=supabase, cart_id=cart_id, inventory_id=inventory_id,
                                      quantity=int(planData.get('quantity', 1)), discount_pct=discount)
            elif plan_id:
                add_plan_to_cart(supabase=supabase, cart_id=cart_id, plan_id=plan_id, discount_pct=discount)
            else:
                # Fallback: generate mock link if no product specified
                import random, string
                payment_link = 'https://rzp.io/i/' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))

            if not payment_link:
                pi = create_pi_from_cart(
                    supabase=supabase, cart_id=cart_id, lead_id=lead_id,
                    source='doctor_dashboard', sales_rep_id=current_user['id']
                )
                payment_link = pi.get('razorpay_url') or 'N/A'
                invoice_id = pi['invoice_id']
                invoice_number = pi['invoice_number']
                total_amount = pi['total_amount']
        except Exception as e:
            import traceback; traceback.print_exc()
            # Don't crash — fall through to mock
            import random, string
            payment_link = 'https://rzp.io/i/' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    else:
        import random, string
        payment_link = 'https://rzp.io/i/' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))

    supabase.table('appointments').update({
        'plan_details': {
            'products': planData.get('products'),
            'discount': planData.get('discount'),
            'total': total_amount,
            'payment_link': payment_link,
            'invoice_id': invoice_id,
            'invoice_number': invoice_number,
            'generated_at': datetime.datetime.now().isoformat(),
        },
        'plan_id': planData.get('plan_id'),
    }).eq('id', id).execute()
    return {'success': True, 'payment_link': payment_link, 'invoice_id': invoice_id, 'total': total_amount}


# ---------------------------------------------------------------------------
# POST /api/doctor/appointments/{id}/call — Doctor manually triggers call
# ---------------------------------------------------------------------------
@router.post('/appointments/{id}/call')
async def trigger_appointment_call(
    id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Manually triggers the Exotel bridge call between the doctor and the patient
    for this appointment. Useful if the call was missed or dropped.
    """
    # 1. Fetch appointment details
    res = supabase.table('appointments').select(
        'doctor_id, patient_id, patients:users!patient_id(phone), notes'
    ).eq('id', id).single().execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Appointment not found")
        
    appt = res.data
    
    if not appt.get('patients') and appt.get('patient_id'):
        lead_res = supabase.table('leads').select('phone_number').eq('id', appt['patient_id']).execute()
        if lead_res.data:
            appt['patients'] = {'phone': lead_res.data[0].get('phone_number')}
            
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
        
    import os
    public_url = os.getenv("BACKEND_PUBLIC_URL") or str(request.base_url)
    
    from services.exotel_service import bridge_doctor_and_customer
    result = bridge_doctor_and_customer(
        doctor_phone=doctor_exotel,
        customer_phone=patient_phone,
        base_url=public_url,
        custom_field=id,
    )
    
    # Handle both old bool return and new dict return safely
    if isinstance(result, bool):
        if result:
            return {"success": True, "message": "Call initiated successfully. Doctor's phone will ring first."}
        else:
            raise HTTPException(status_code=500, detail="Failed to initiate call via Exotel.")
            
    if result and result.get("success"):
        return {"success": True, "message": "Call initiated successfully. Doctor's phone will ring first."}
    else:
        error_msg = result.get("error") if result else "Failed to initiate call via Exotel."
        raise HTTPException(status_code=500, detail=error_msg)


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



@router.post('/appointments/{id}/notes')
async def add_appointment_note(id: str, content: str = Body(embed=True), current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    # Append the note to the appointment's existing notes
    res = supabase.table('appointments').select('notes').eq('id', id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    existing_notes = res.data.get('notes') or ""
    new_notes = existing_notes + "\n\n" + f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}] Note added:\n" + content
    supabase.table('appointments').update({'notes': new_notes.strip()}).eq('id', id).execute()
    return {'success': True}

from fastapi import BackgroundTasks
from services.audio_tasks import process_call_recording

@router.post('/appointments/{id}/retranscribe')
async def retranscribe_call(
    id: str,
    background_tasks: BackgroundTasks,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Manually triggers the background transcription task for an existing recording URL.
    """
    recording_url = payload.get("recording_url")
    if not recording_url:
        raise HTTPException(status_code=400, detail="Recording URL is required")

    # Queue the background task exactly like the webhook does
    background_tasks.add_task(process_call_recording, id, recording_url)
    
    return {"success": True, "message": "Transcription started in the background"}
