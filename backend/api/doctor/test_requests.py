# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List, Optional
import datetime

router = APIRouter()

DEFAULT_TEST_TYPES = [
    {"name": "Complete Blood Count (CBC)", "category": "Hematology", "description": "Measures red blood cells, white blood cells, hemoglobin, hematocrit, and platelets."},
    {"name": "Lipid Profile", "category": "Biochemistry", "description": "Measures Total Cholesterol, HDL, LDL, Triglycerides."},
    {"name": "HbA1c (Glycated Hemoglobin)", "category": "Endocrinology", "description": "Evaluates average blood sugar control over the past 2-3 months."},
    {"name": "Thyroid Profile (T3, T4, TSH)", "category": "Endocrinology", "description": "Evaluates thyroid gland function."},
    {"name": "Liver Function Test (LFT)", "category": "Biochemistry", "description": "Assesses liver enzymes, bilirubin, and proteins."},
    {"name": "Kidney Function Test (KFT / RFT)", "category": "Biochemistry", "description": "Measures Urea, Creatinine, Uric Acid, and Electrolytes."},
    {"name": "Vitamin D3 (25-OH)", "category": "Vitamins", "description": "Measures 25-hydroxyvitamin D level in blood."},
    {"name": "Vitamin B12", "category": "Vitamins", "description": "Measures serum Vitamin B12 levels."},
    {"name": "Urine Routine & Microscopy", "category": "Pathology", "description": "Screens for metabolic, kidney, and urinary tract disorders."},
    {"name": "Iron Profile", "category": "Hematology", "description": "Measures Serum Iron, Ferritin, TIBC, and Transferrin Saturation."}
]

# ---------------------------------------------------------------------------
# GET /api/doctor/test-types — Fetch active test types (with auto-seeding)
# ---------------------------------------------------------------------------
@router.get('/test-types')
async def get_test_types(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    try:
        res = supabase.table('test_types').select('*').eq('is_active', True).order('name').execute()
        types_data = res.data or []
        
        # If empty, auto-seed default test types for immediate usability
        if not types_data:
            try:
                seed_res = supabase.table('test_types').insert(DEFAULT_TEST_TYPES).execute()
                types_data = seed_res.data or []
            except Exception as seed_err:
                print(f"Auto-seed test_types notice: {seed_err}")
                
        return types_data
    except Exception as e:
        # If table doesn't exist yet or query fails, return standard list as fallback
        print(f"Error fetching test_types: {e}")
        return DEFAULT_TEST_TYPES

# ---------------------------------------------------------------------------
# POST /api/doctor/test-types — Add new test type
# ---------------------------------------------------------------------------
@router.post('/test-types')
async def create_test_type(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    name = payload.get('name')
    if not name:
        raise HTTPException(status_code=400, detail="Test name is required")
        
    category = payload.get('category', 'General')
    description = payload.get('description', '')
    
    try:
        res = supabase.table('test_types').insert({
            "name": name,
            "category": category,
            "description": description,
            "is_active": True
        }).execute()
        
        if res.data and len(res.data) > 0:
            return res.data[0]
        return {"name": name, "category": category, "description": description}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# GET /api/doctor/test-requests — Fetch test requests
# ---------------------------------------------------------------------------
@router.get('/test-requests')
async def get_test_requests(
    status: Optional[str] = Query(None, description="Filter by status: pending, reviewed, dismissed"),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    try:
        query = supabase.table('test_requests').select('*')
        if status:
            query = query.eq('status', status)
        
        res = query.order('created_at', desc=True).execute()
        requests_data = res.data or []
        
        # Enrich test requests with patient user details if available
        user_ids = list(set([r['user_id'] for r in requests_data if r.get('user_id')]))
        if user_ids:
            try:
                users_res = supabase.table('users').select('id, name, phone, email').in_('id', user_ids).execute()
                users_map = {u['id']: u for u in (users_res.data or []) if u.get('id')}
                for req in requests_data:
                    req['user'] = users_map.get(req.get('user_id'), None)
            except Exception as u_err:
                print(f"Notice: Failed to fetch user details for test requests: {u_err}")
                
        return requests_data
    except Exception as e:
        print(f"Error in get_test_requests: {e}")
        # Return empty list if table not yet created
        return []

# ---------------------------------------------------------------------------
# GET /api/doctor/test-requests/{request_id}
# ---------------------------------------------------------------------------
@router.get('/test-requests/{request_id}')
async def get_test_request_by_id(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    try:
        res = supabase.table('test_requests').select('*').eq('id', request_id).execute()
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=404, detail="Test request not found")
        
        req_data = res.data[0]
        if req_data.get('user_id'):
            try:
                user_res = supabase.table('users').select('id, name, phone, email').eq('id', req_data['user_id']).execute()
                if user_res.data and len(user_res.data) > 0:
                    req_data['user'] = user_res.data[0]
            except Exception:
                pass
                
        return req_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# PUT /api/doctor/test-requests/{request_id} — Update test request
# ---------------------------------------------------------------------------
@router.put('/test-requests/{request_id}')
async def update_test_request(
    request_id: str,
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    update_data = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    
    if 'status' in payload:
        if payload['status'] not in ['pending', 'reviewed', 'dismissed']:
            raise HTTPException(status_code=400, detail="Invalid status value")
        update_data['status'] = payload['status']
        
    if 'doctor_notes' in payload:
        update_data['doctor_notes'] = payload['doctor_notes']
        
    if 'suggested_tests' in payload:
        update_data['suggested_tests'] = payload['suggested_tests']
        
    try:
        res = supabase.table('test_requests').update(update_data).eq('id', request_id).execute()
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=404, detail="Test request not found or update failed")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# POST /api/doctor/test-requests — Create test request
# ---------------------------------------------------------------------------
@router.post('/test-requests')
async def create_test_request(
    payload: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    user_id = payload.get('user_id')
    condition_text = payload.get('condition_text')
    
    if not user_id or not condition_text:
        raise HTTPException(status_code=400, detail="user_id and condition_text are required")
        
    new_req = {
        "user_id": user_id,
        "condition_text": condition_text,
        "status": payload.get('status', 'pending'),
        "doctor_notes": payload.get('doctor_notes', None),
        "suggested_tests": payload.get('suggested_tests', []),
    }
    
    try:
        res = supabase.table('test_requests').insert(new_req).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return new_req
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
