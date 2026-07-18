import re

with open("backend/api/doctor/patients.py", "r") as f:
    code = f.read()

new_code = code.replace(
    "comms_res = supabase.table('communications').select('id, created_at, content, type, sender_id, staffs!sender_id(full_name, roles!inner(name))').eq('lead_id', patient_id).order('created_at', desc=False).execute()",
    """comms_res = supabase.table('communications').select('id, created_at, content, type, sender_id').eq('lead_id', patient_id).order('created_at', desc=False).execute()
    comms_data = comms_res.data or []
    sender_ids = list(set([c['sender_id'] for c in comms_data if c.get('sender_id')]))
    staffs_dict = {}
    if sender_ids:
        staffs_res = supabase.table('staffs').select('id, full_name, roles!inner(name)').in_('id', sender_ids).execute()
        for s in (staffs_res.data or []):
            staffs_dict[s['id']] = s
    for c in comms_data:
        c['staffs'] = staffs_dict.get(c.get('sender_id'))"""
).replace(
    "return {'assessments': assessments_res.data or [], 'communications': comms_res.data or []}",
    "return {'assessments': assessments_res.data or [], 'communications': comms_data}"
)

with open("backend/api/doctor/patients.py", "w") as f:
    f.write(new_code)
