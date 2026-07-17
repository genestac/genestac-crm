from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from core.config import settings
from api import sales, auth, doctor
from api.admin import staffs, roles, crm_settings, logs, lead_assignment, coupons, metrics, ai_settings, blogs, doctors
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
app.include_router(consultations.router, prefix="/api/admin/consultations", tags=["admin-consultations"])
from api.webhooks import voice_stream, conference, call_status
app.include_router(voice_stream.router, prefix="/api/webhooks/exotel", tags=["webhooks-exotel"])
app.include_router(conference.router, prefix="/api/webhooks/exotel", tags=["webhooks-exotel"])
app.include_router(call_status.router, prefix="/api/webhooks/exotel", tags=["webhooks-exotel"])

from api import templates, custom_fields
from app.routes import admin_proforma_routes, invoice_settings_routes

app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(custom_fields.router, prefix="/api/admin/custom-fields", tags=["admin-custom-fields"])
app.include_router(public.router, prefix="/api/public", tags=["public"])
app.include_router(admin_proforma_routes.router, prefix="/api/v2/admin/proforma-invoices", tags=["admin-proformas"])
app.include_router(invoice_settings_routes.router, prefix="/api/v2/admin/invoice-settings", tags=["admin-invoice-settings"])
# Production deployment health check endpoint
@app.get("/")
def read_root():
    return {"message": "Welcome to Genestac API"}
