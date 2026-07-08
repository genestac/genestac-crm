from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from services.cloudinary_service import upload_file_to_cloudinary
from typing import Optional
router = APIRouter()
from fastapi import Query
from pydantic import BaseModel
import razorpay
import uuid
import os
from api.admin.crm_settings import get_global_settings_from_db
import json
from datetime import datetime
from fastapi.responses import Response
from api.pdf_generator import generate_invoice_pdf

class NoteCreate(BaseModel):
    content: str
    created_at: Optional[str] = None
def is_admin(user: dict, supabase: Client) -> bool:
    res = supabase.table('staffs').select('roles(name)').eq('id', user['id']).execute()
    if not res.data:
        return False
    role_name = res.data[0].get('roles', {}).get('name', '')
    return role_name in ('superadmin', 'master_admin', 'admin')

@router.get('/metadata')
async def get_metadata(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    sources = supabase.table('user_sources').select('*').execute()
    try:
        plans = supabase.table('plans').select('*').execute()
    except Exception:
        plans = type('obj', (object,), {'data': []})
    return {'sources': sources.data, 'plans': plans.data}
@router.get('/metrics')
async def get_metrics(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    user_id = current_user['id']
    import datetime
    today = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + datetime.timedelta(days=1)
    settings = get_global_settings_from_db(supabase)
    shared_pool_enabled = settings.get('shared_lead_pool', False)
    is_admin = current_user.get('role') in ['SUPER_ADMIN', 'superadmin', 'admin', 'master_admin']

    def fetch_and_combine(table1, table2, select_str, eq_filters=None, gte_filters=None, lt_filters=None, is_count=False):

        def build_query(t):
            q = supabase.table(t).select(select_str, count='exact' if is_count else None)
            has_assigned_filter = False
            assigned_val = None
            if eq_filters:
                for k, v in eq_filters.items():
                    if k == 'assigned_sales_rep_id':
                        has_assigned_filter = True
                        assigned_val = v
                    else:
                        q = q.eq(k, v)
            if has_assigned_filter:
                if is_admin:
                    pass
                elif shared_pool_enabled:
                    q = q.or_(f'assigned_sales_rep_id.eq.{assigned_val},assigned_sales_rep_id.is.null')
                else:
                    q = q.eq('assigned_sales_rep_id', assigned_val)
            if gte_filters:
                for k, v in gte_filters.items():
                    q = q.gte(k, v)
            if lt_filters:
                for k, v in lt_filters.items():
                    q = q.lt(k, v)
            return q
        res1 = build_query(table1).execute()
        count1 = res1.count or 0 if is_count else len(res1.data or [])
        data1 = res1.data or []
        for d in data1:
            d['record_type'] = 'USER'
        count2, data2 = (0, [])
        try:
            res2 = build_query(table2).execute()
            count2 = res2.count or 0 if is_count else len(res2.data or [])
            data2 = res2.data or []
            for d in data2:
                d['record_type'] = 'LEAD'
        except Exception:
            pass
        return (count1 + count2, data1 + data2)
    totalLeads, _ = fetch_and_combine('users', 'leads', 'id', eq_filters={'assigned_sales_rep_id': user_id}, is_count=True)
    newLeadsToday, _ = fetch_and_combine('users', 'leads', 'id', eq_filters={'assigned_sales_rep_id': user_id}, gte_filters={'created_at': today.isoformat()}, lt_filters={'created_at': tomorrow.isoformat()}, is_count=True)
    _, followUpsToday = fetch_and_combine('users', 'leads', 'id, name, phone, status, priority, followup_notes, next_followup_date', eq_filters={'assigned_sales_rep_id': user_id}, gte_filters={'next_followup_date': today.isoformat()}, lt_filters={'next_followup_date': tomorrow.isoformat()})
    followUpsDueCount = len(followUpsToday)
    if is_admin:
        appointments_res = supabase.table('appointments').select('id', count='exact').execute()
    else:
        appointments_res = supabase.table('appointments').select('id', count='exact').eq('sales_rep_id', user_id).execute()
    appointmentsBooked = appointments_res.count or 0
    convertedCount, _ = fetch_and_combine('users', 'leads', 'id', eq_filters={'assigned_sales_rep_id': user_id, 'status': 'CONVERTED'}, is_count=True)
    _, converted_leads_data = fetch_and_combine('users', 'leads', 'id, plans(price)', eq_filters={'assigned_sales_rep_id': user_id, 'status': 'CONVERTED'})
    revenueGenerated = sum((int(lead['plans']['price']) for lead in converted_leads_data if lead.get('plans') and lead['plans'].get('price')))
    monthlyTarget = 1000000
    achievementPercentage = round(revenueGenerated / monthlyTarget * 100, 1) if monthlyTarget > 0 else 0
    _, all_leads_data = fetch_and_combine('users', 'leads', 'id, status, source_id, user_sources(name)', eq_filters={'assigned_sales_rep_id': user_id})
    leadsSummary = {'New Lead': 0, 'Contacted': 0, 'Interested': 0, 'Consultation Scheduled': 0, 'Others': 0}
    status_mapping = {'NEW': 'New Lead', 'UNREAD': 'New Lead', 'CONTACT_ATTEMPTED': 'Contacted', 'CONTACTED': 'Contacted', 'QUALIFIED': 'Interested', 'CONSULTATION_SCHEDULED': 'Consultation Scheduled', 'CONSULTATION_COMPLETED': 'Others', 'ON_HOLD': 'Others', 'LOST': 'Others', 'CONVERTED': 'Others'}
    for lead in all_leads_data:
        st = lead.get('status')
        if st in status_mapping:
            leadsSummary[status_mapping[st]] += 1
        else:
            leadsSummary['Others'] += 1
    leadsSummaryArray = []
    colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#d1d5db']
    color_idx = 0
    for k, v in leadsSummary.items():
        if v > 0:
            percentage = round(v / totalLeads * 100) if totalLeads > 0 else 0
            leadsSummaryArray.append({'label': k, 'value': v, 'percentage': percentage, 'color': colors[color_idx % len(colors)]})
            color_idx += 1
    conic_segments = []
    current_pct = 0
    for item in leadsSummaryArray:
        next_pct = current_pct + item['percentage']
        conic_segments.append(f"{item['color']} {current_pct}% {next_pct}%")
        current_pct = next_pct
    if current_pct < 100 and conic_segments:
        conic_segments[-1] = conic_segments[-1].rsplit(' ', 1)[0] + ' 100%'
    conicGradient = 'conic-gradient(' + ', '.join(conic_segments) + ')' if conic_segments else ''
    sources_count = {}
    for lead in all_leads_data:
        src = lead.get('user_sources')
        src_name = src.get('name') if src else 'Others'
        sources_count[src_name] = sources_count.get(src_name, 0) + 1
    sorted_sources = sorted(sources_count.items(), key=lambda x: x[1], reverse=True)
    topLeadSources = []
    for k, v in sorted_sources[:5]:
        percentage = round(v / totalLeads * 100) if totalLeads > 0 else 0
        topLeadSources.append({'label': k, 'value': v, 'percentage': percentage})
    others_sum = sum((x[1] for x in sorted_sources[5:]))
    if others_sum > 0:
        percentage = round(others_sum / totalLeads * 100) if totalLeads > 0 else 0
        topLeadSources.append({'label': 'Others', 'value': others_sum, 'percentage': percentage})
    _, recent_leads_data = fetch_and_combine('users', 'leads', 'id, name, phone, status, next_followup_date, created_at, user_sources(name)', eq_filters={'assigned_sales_rep_id': user_id})
    recent_leads_data.sort(key=lambda x: x.get('created_at', '') or '', reverse=True)
    recentLeads = recent_leads_data[:5]
    timelineEvents = []
    for f in followUpsToday:
        if f.get('next_followup_date'):
            try:
                dt = datetime.datetime.fromisoformat(f['next_followup_date'])
                timelineEvents.append({'time': dt.strftime('%I:%M %p'), 'title': f"Follow-up: {f.get('name') or 'Lead'}", 'datetime': dt})
            except:
                pass
    today_appointments_q = supabase.table('appointments').select('*, patients:users!patient_id(name)').gte('scheduled_at', today.isoformat()).lt('scheduled_at', tomorrow.isoformat())
    if not is_admin:
        today_appointments_q = today_appointments_q.eq('sales_rep_id', user_id)
    today_appointments = today_appointments_q.execute()
    for a in today_appointments.data:
        if a.get('scheduled_at'):
            try:
                dt = datetime.datetime.fromisoformat(a['scheduled_at'])
                patient_name = a.get('patients', {}).get('name') or 'Patient'
                timelineEvents.append({'time': dt.strftime('%I:%M %p'), 'title': f'Appointment: {patient_name}', 'datetime': dt})
            except:
                pass
    timelineEvents.sort(key=lambda x: x['datetime'])
    for t in timelineEvents:
        del t['datetime']
    return {'untouchedCount': newLeadsToday, 'convertedCount': convertedCount, 'followUpsToday': followUpsToday, 'totalLeads': totalLeads, 'newLeadsToday': newLeadsToday, 'followUpsDueCount': followUpsDueCount, 'appointmentsBooked': appointmentsBooked, 'revenueGenerated': revenueGenerated, 'monthlyTarget': monthlyTarget, 'achievementPercentage': achievementPercentage, 'leadsSummaryArray': leadsSummaryArray, 'conicGradient': conicGradient, 'topLeadSources': topLeadSources, 'recentLeads': recentLeads, 'timelineEvents': timelineEvents}
@router.get('/test_carts')
async def test_carts(supabase: Client=Depends(get_supabase_client)):
    try:
        res = supabase.table('inventory').select('*').limit(1).execute()
        return {'success': True, 'data': res.data}
    except Exception as e:
        return {'success': False, 'error': str(e)}
