# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Form, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List
import datetime
router = APIRouter()


@router.get('/patients/onboarded')
async def get_onboarded_patients(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    try:
        response = supabase.table('users').select('*').order('created_at', desc=True).execute()
        users = response.data or []
        user_ids = [u['id'] for u in users if u.get('id')]
        
        if user_ids:
            try:
                plans_res = supabase.table('user_plans').select('user_id, diet_plan, exercise_plan, doctor_review').in_('user_id', user_ids).execute()
                plans_map = {p['user_id']: p for p in (plans_res.data or []) if p.get('user_id')}
                for u in users:
                    u['user_plans'] = plans_map.get(u['id'])
            except Exception as plan_err:
                print(f"Failed to fetch user_plans: {plan_err}")
                
        return users
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/patients/{user_id}/user-plans')
async def get_patient_user_plans(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    res = supabase.table('user_plans').select('*').eq('user_id', user_id).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]
    return {"user_id": user_id, "diet_plan": {}, "exercise_plan": {}}


@router.get('/patients/exercise-library')
async def get_exercise_library_for_doctor(
    category: str = None,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Return active exercises from the library for the doctor to build plans."""
    q = supabase.table('exercises').select(
        'id, title, category, type, difficulty, description, instructions, benefits, video_url, thumbnail_url'
    ).eq('is_active', True).order('category').order('title')
    if category and category != 'all':
        q = q.eq('category', category)
    res = q.execute()
    return res.data or []

@router.post('/patients/{user_id}/generate-plans')
async def generate_patient_plans(
    user_id: str,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    # pyrefly: ignore [missing-import]
    import os, json, openai
    target = payload.get("target", "both")
    health_goals = payload.get("health_goals", "")
    patient_name = payload.get("patient_name", "Patient")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is missing in server environment variables")

    oai_client = openai.OpenAI(api_key=api_key)

    existing_res = supabase.table('user_plans').select('*').eq('user_id', user_id).execute()
    existing_row = existing_res.data[0] if (existing_res.data and len(existing_res.data) > 0) else None

    diet_plan = (existing_row.get('diet_plan') if existing_row else {}) or {}
    exercise_plan = (existing_row.get('exercise_plan') if existing_row else {}) or {}

    system_prompt = (
        "You are an expert clinical nutritionist and fitness coach. "
        "Your task is to generate realistic 7-day Weekly Diet and Exercise plans in valid JSON format ONLY."
    )

    if target in ("diet", "both"):
        diet_user_prompt = f"""
Generate a complete, healthy 7-day Indian & continental Diet Plan for patient '{patient_name}' (Health Goals: '{health_goals}').
Return a single JSON object with exact keys for each day: "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday".

Each day must contain 4 sub-objects: "breakfast", "lunch", "snacks", "dinner".
Each meal sub-object must contain:
- "meal": string description of food and portion size
- "image": a valid image URL for the meal. Select appropriate Pexels food image URLs like:
  - Breakfast/Poha/Upma/Toast/Eggs: "https://images.pexels.com/photos/30769669/pexels-photo-30769669.jpeg?auto=compress&cs=tinysrgb&w=800"
  - Dal/Roti/Rice/Sabzi/Pulao: "https://images.pexels.com/photos/36478888/pexels-photo-36478888.jpeg?auto=compress&cs=tinysrgb&w=800"
  - Paneer/Salad/Soup: "https://images.pexels.com/photos/33430559/pexels-photo-33430559.jpeg?auto=compress&cs=tinysrgb&w=800"
  - Snacks/Tea/Nuts/Sprouts: "https://images.pexels.com/photos/13220344/pexels-photo-13220344.jpeg?auto=compress&cs=tinysrgb&w=800"
  - Dinner/Light Khichdi/Soup: "https://images.pexels.com/photos/35008222/pexels-photo-35008222.jpeg?auto=compress&cs=tinysrgb&w=800"

Example output structure:
{{
  "monday": {{
    "breakfast": {{ "meal": "1 bowl of Poha with peanuts and tea", "image": "https://images.pexels.com/photos/30769669/pexels-photo-30769669.jpeg?auto=compress&cs=tinysrgb&w=800" }},
    "lunch": {{ "meal": "2 Roti, 1 bowl of yellow Dal, 1 portion of Sabzi and salad", "image": "https://images.pexels.com/photos/36478888/pexels-photo-36478888.jpeg?auto=compress&cs=tinysrgb&w=800" }},
    "snacks": {{ "meal": "1 small bowl of roasted Makhana or Chana", "image": "https://images.pexels.com/photos/13220344/pexels-photo-13220344.jpeg?auto=compress&cs=tinysrgb&w=800" }},
    "dinner": {{ "meal": "1 bowl of light Khichdi with curd", "image": "https://images.pexels.com/photos/35008222/pexels-photo-35008222.jpeg?auto=compress&cs=tinysrgb&w=800" }}
  }},
  ... (include all 7 days: monday, tuesday, wednesday, thursday, friday, saturday, sunday)
}}
"""
        try:
            res = oai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": diet_user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            diet_plan = json.loads(res.choices[0].message.content or "{}")
        except Exception as e:
            print(f"OpenAI Diet Generation error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate diet plan: {str(e)}")

    if target in ("exercise", "both"):
        # Fetch exercise library titles to inject into the prompt
        lib_res = supabase.table('exercises').select('title, category, difficulty').eq('is_active', True).order('category').order('title').execute()
        lib_items = lib_res.data or []
        lib_names_text = "\n".join([f"- {ex['title']} ({ex.get('category', 'general')}, {ex.get('difficulty', 'beginner')})" for ex in lib_items]) if lib_items else "- Bodyweight Squats\n- Walking Lunges\n- Plank Hold\n- Jumping Jacks\n- High Knees"

        exercise_user_prompt = f"""
Generate a balanced 7-day Exercise Plan for patient '{patient_name}' (Health Goals: '{health_goals}').
Return a single JSON object with exact keys for each day: "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday".

IMPORTANT: You MUST use exercise names EXACTLY as listed below (copy-paste the name). These come from our exercise library and must match exactly for the patient's video player to work:

{lib_names_text}

Each day must contain:
- "type": string summary of workout (e.g. "Full Body Warm-up & Cardio", "Lower Body & Core", "Rest Day")
- "duration_minutes": number (e.g. 30, 45, 0)
- "exercises": array of objects, each containing:
  - "name": string exercise name — MUST be EXACTLY one of the names from the list above
  - "sets": number
  - "reps": string or number (optional)
  - "duration": string (optional)
  - "notes": string (optional)

Sunday must always be a rest day with empty exercises array.

Example output structure:
{{
  "monday": {{
    "type": "Full Body Warm-up & Cardio",
    "duration_minutes": 30,
    "exercises": [
      {{ "name": "Jumping Jacks", "sets": 3, "reps": 15 }},
      {{ "name": "Bodyweight Squats", "sets": 3, "reps": 15 }}
    ]
  }},
  ... (include all 7 days: monday, tuesday, wednesday, thursday, friday, saturday, sunday)
}}
"""
        try:
            res = oai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": exercise_user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            exercise_plan = json.loads(res.choices[0].message.content or "{}")
        except Exception as e:
            print(f"OpenAI Exercise Generation error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate exercise plan: {str(e)}")

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if existing_row:
        up_res = supabase.table('user_plans').update({
            'diet_plan': diet_plan,
            'exercise_plan': exercise_plan,
            'updated_at': now_iso
        }).eq('id', existing_row['id']).execute()
        saved_plan = up_res.data[0] if up_res.data else {**existing_row, 'diet_plan': diet_plan, 'exercise_plan': exercise_plan}
    else:
        up_res = supabase.table('user_plans').insert({
            'user_id': user_id,
            'diet_plan': diet_plan,
            'exercise_plan': exercise_plan,
            'created_at': now_iso,
            'updated_at': now_iso
        }).execute()
        saved_plan = up_res.data[0] if up_res.data else {'user_id': user_id, 'diet_plan': diet_plan, 'exercise_plan': exercise_plan}

    return {"success": True, "data": saved_plan}

@router.put('/patients/{user_id}/user-plans')
async def update_patient_user_plans(
    user_id: str,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    diet_plan = payload.get('diet_plan')
    exercise_plan = payload.get('exercise_plan')
    doctor_review = payload.get('doctor_review')

    existing_res = supabase.table('user_plans').select('*').eq('user_id', user_id).execute()
    existing_row = existing_res.data[0] if (existing_res.data and len(existing_res.data) > 0) else None

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    update_data = {'updated_at': now_iso}
    if diet_plan is not None:
        update_data['diet_plan'] = diet_plan
    if exercise_plan is not None:
        update_data['exercise_plan'] = exercise_plan
    if doctor_review is not None:
        update_data['doctor_review'] = doctor_review

    if existing_row:
        up_res = supabase.table('user_plans').update(update_data).eq('id', existing_row['id']).execute()
        saved_plan = up_res.data[0] if up_res.data else {**existing_row, **update_data}
    else:
        insert_data = {
            'user_id': user_id,
            'diet_plan': diet_plan or {},
            'exercise_plan': exercise_plan or {},
            'doctor_review': doctor_review if doctor_review is not None else False,
            'created_at': now_iso,
            'updated_at': now_iso
        }
        up_res = supabase.table('user_plans').insert(insert_data).execute()
        saved_plan = up_res.data[0] if up_res.data else insert_data

    return {"success": True, "data": saved_plan}

@router.get('/patients/{patient_id}/history')
async def get_patient_history(patient_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    if patient_id == 'null' or patient_id == 'None' or not patient_id:
        return []
    response = supabase.table('clinical_assessments').select('*').eq('patient_id', patient_id).order('created_at', desc=False).execute()
    return response.data
@router.post('/patients/{patient_id}/adverse-events')
async def log_adverse_event(patient_id: str, eventDetails: str=Body(embed=True), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    payload = {'patient_id': patient_id, 'recorded_by': current_user['id'], 'conditions': {'adverse_event': True, 'details': eventDetails}, 'doctor_timeline_notes': f'[ADVERSE EVENT LOGGED]: {eventDetails}'}
    supabase.table('clinical_assessments').insert(payload).execute()
    return {'success': True}
@router.get('/patients/{patient_id}/timeline')
async def fetch_patient_timeline(patient_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    if patient_id == 'null' or patient_id == 'None' or not patient_id:
        return {'assessments': [], 'communications': []}
    assessments_res = supabase.table('clinical_assessments').select('id, created_at, doctor_timeline_notes, conditions, recorded_by, staffs!recorded_by(full_name, roles!inner(name))').eq('patient_id', patient_id).order('created_at', desc=False).execute()
    try:
        comms_res = supabase.table('communications').select('id, created_at, sales_rep_id, lead_id').eq('lead_id', patient_id).order('created_at', desc=False).execute()
        comms_data = comms_res.data or []
        sender_ids = list(set([c.get('sales_rep_id') for c in comms_data if c.get('sales_rep_id')]))
        staffs_dict = {}
        if sender_ids:
            staffs_res = supabase.table('staffs').select('id, full_name, roles!inner(name)').in_('id', sender_ids).execute()
            for s in (staffs_res.data or []):
                staffs_dict[s['id']] = s
        for c in comms_data:
            c['staffs'] = staffs_dict.get(c.get('sales_rep_id'))
    except Exception:
        comms_data = []
    return {'assessments': assessments_res.data or [], 'communications': comms_data}


@router.post('/patients/{patient_id}/timeline')
async def add_timeline_entry(patient_id: str, type: str=Body(embed=True), content: str=Body(embed=True), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    if patient_id == 'null' or patient_id == 'None' or not patient_id:
        raise HTTPException(status_code=400, detail="Cannot add notes to an appointment without a registered patient profile.")
        
    if type == 'clinical':
        supabase.table('clinical_assessments').insert({'patient_id': patient_id, 'recorded_by': current_user['id'], 'doctor_timeline_notes': content}).execute()
    else:
        supabase.table('communications').insert({'lead_id': patient_id, 'sender_id': current_user['id'], 'content': content, 'type': 'note'}).execute()
    return {'success': True}
@router.post('/patients/{patient_id}/reports')
async def upload_patient_report(patient_id: str, appointmentId: str=Body(embed=True), fileData: dict=Body(embed=True), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    supabase.table('patient_reports').insert({'patient_id': patient_id, 'appointment_id': appointmentId, 'uploaded_by': current_user['id'], 'title': fileData.get('title'), 'file_url': fileData.get('url'), 'file_type': fileData.get('type')}).execute()
    return {'success': True}
