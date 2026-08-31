from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from core.config import settings
from api import sales, auth, doctor
from api.admin import staffs, roles, crm_settings, logs, lead_assignment, coupons, metrics, ai_settings, blogs, doctors
from api.admin import notifications, lead_scoring
from api import public

from core.scheduler import start_scheduler

class ForceHTTPSMiddleware(BaseHTTPMiddleware):
    """Force HTTPS scheme in FastAPI for proper URL generation behind proxies."""
    async def dispatch(self, request, call_next):
        request.scope["scheme"] = "https"
        return await call_next(request)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    # Shutdown logic if needed

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# Trust proxy headers (e.g., from Nginx)
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])
# Force HTTPS context only in production
if settings.ENVIRONMENT == "production":
    app.add_middleware(ForceHTTPSMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sales.router, prefix="/api/sales", tags=["sales"])
app.include_router(doctor.router, prefix="/api/doctor", tags=["doctor"])
from api.admin import whatsapp
from api.admin import whatsapp_chat
app.include_router(whatsapp.router, prefix="/api/admin/whatsapp", tags=["admin-whatsapp"])
app.include_router(whatsapp_chat.router, prefix="/api/admin/whatsapp/chat", tags=["admin-whatsapp-chat"])
app.include_router(staffs.router, prefix="/api/admin/staffs", tags=["admin-staffs"])
app.include_router(roles.router, prefix="/api/admin/roles", tags=["admin-roles"])
app.include_router(crm_settings.router, prefix="/api/admin/crm-settings", tags=["admin-crm"])
app.include_router(logs.router, prefix="/api/admin/logs", tags=["admin-logs"])
app.include_router(lead_assignment.router, prefix="/api/admin/lead-assignment", tags=["admin-lead-assignment"])
app.include_router(coupons.router, prefix="/api/admin/coupons", tags=["admin-coupons"])
app.include_router(metrics.router, prefix="/api/admin/metrics", tags=["admin-metrics"])
app.include_router(ai_settings.router, prefix="/api/admin/ai-settings", tags=["admin-ai-settings"])
app.include_router(blogs.router, prefix="/api/admin/blogs", tags=["admin-blogs"])
app.include_router(doctors.router, prefix="/api/admin/doctors", tags=["admin-doctors"])
from api.admin import consultations
from api.admin import system_logs
app.include_router(system_logs.router, prefix="/api/admin/system-logs", tags=["admin-system-logs"])
from api.admin import subscriptions
app.include_router(subscriptions.router, prefix="/api/admin/subscriptions", tags=["admin-subscriptions"])
app.include_router(notifications.router, prefix="/api/admin/notifications", tags=["admin-notifications"])
app.include_router(lead_scoring.router, prefix="/api/admin/lead-scoring", tags=["admin-lead-scoring"])
from api.admin import inventory
app.include_router(inventory.router, prefix="/api/admin/inventory", tags=["admin-inventory"])
from api.admin import reviews
app.include_router(reviews.router, prefix="/api/admin/reviews", tags=["admin-reviews"])
from api.sales import scheduled_calls as scheduled_calls_router
app.include_router(scheduled_calls_router.router, prefix="/api/sales/scheduled-calls", tags=["sales-scheduled-calls"])
app.include_router(consultations.router, prefix="/api/admin/consultations", tags=["admin-consultations"])
from api.webhooks import voice_stream, conference, call_status
app.include_router(voice_stream.router, prefix="/api/webhooks/exotel", tags=["webhooks-exotel"])
app.include_router(conference.router, prefix="/api/webhooks/exotel", tags=["webhooks-exotel"])
app.include_router(call_status.router, prefix="/api/webhooks/exotel", tags=["webhooks-exotel"])

# ── Sarvam AI Managed Mode Webhooks ──────────────────────────────────────────
# Tool-call handlers + post-call transcript/scoring webhook
from api.webhooks import sarvam as sarvam_webhooks
app.include_router(sarvam_webhooks.router, prefix="/api/webhooks/sarvam", tags=["webhooks-sarvam"])

# ── Public Lead Ingestion Webhook (Google Sheets, external forms) ─────────────
from api.webhooks import leads as leads_webhook
app.include_router(leads_webhook.router, prefix="/api/webhooks", tags=["webhooks-leads"])

from api import templates, custom_fields
from app.routes import admin_proforma_routes, invoice_settings_routes

app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(custom_fields.router, prefix="/api/admin/custom-fields", tags=["admin-custom-fields"])
app.include_router(public.router, prefix="/api/public", tags=["public"])
app.include_router(admin_proforma_routes.router, prefix="/api/v2/admin/proforma-invoices", tags=["admin-proformas"])
app.include_router(invoice_settings_routes.router, prefix="/api/v2/admin/invoice-settings", tags=["admin-invoice-settings"])

# ── Mobile App — AI Health Coach Chat ─────────────────────────────────────────
from api.mobile import health_chat as mobile_health_chat
app.include_router(mobile_health_chat.router, prefix="/api/mobile/health-chat", tags=["mobile-health-chat"])

# ── Mobile App — Expo Push Token Registration ──────────────────────────────────
from api.mobile import push_tokens as mobile_push_tokens
app.include_router(mobile_push_tokens.router, prefix="/api/mobile/register-push-token", tags=["mobile-push-tokens"])

# ── Admin — Push Notifications ────────────────────────────────────────────────
from api.admin import push_notifications as admin_push_notifications
app.include_router(admin_push_notifications.router, prefix="/api/admin/push-notifications", tags=["admin-push-notifications"])

# ── Admin — Exercises & Yoga ───────────────────────────────────────────────────
from api.admin import exercises as admin_exercises
app.include_router(admin_exercises.router, prefix="/api/admin/exercises", tags=["admin-exercises"])

# Production deployment health check endpoint
@app.get("/")
def read_root():
    return {"message": "Welcome to Genestac API"}

