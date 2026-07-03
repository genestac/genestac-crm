from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from core.config import settings
from api import sales, auth, doctor
from api.admin import staffs, roles, crm_settings, logs, lead_assignment, coupons
from api import public

class ForceHTTPSMiddleware(BaseHTTPMiddleware):
    """Force HTTPS scheme in FastAPI for proper URL generation behind proxies."""
    async def dispatch(self, request, call_next):
        request.scope["scheme"] = "https"
        return await call_next(request)

app = FastAPI(title=settings.PROJECT_NAME)

# Trust proxy headers (e.g., from Nginx)
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])
# Force HTTPS context
app.add_middleware(ForceHTTPSMiddleware)
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(sales.router, prefix="/api/sales", tags=["sales"])
app.include_router(doctor.router, prefix="/api/doctor", tags=["doctor"])
app.include_router(staffs.router, prefix="/api/admin/staffs", tags=["admin-staffs"])
app.include_router(roles.router, prefix="/api/admin/roles", tags=["admin-roles"])
app.include_router(crm_settings.router, prefix="/api/admin/crm-settings", tags=["admin-crm"])
app.include_router(logs.router, prefix="/api/admin/logs", tags=["admin-logs"])
app.include_router(lead_assignment.router, prefix="/api/admin/lead-assignment", tags=["admin-lead-assignment"])
app.include_router(coupons.router, prefix="/api/admin/coupons", tags=["admin-coupons"])
from api import templates, custom_fields
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(custom_fields.router, prefix="/api/admin/custom-fields", tags=["admin-custom-fields"])
app.include_router(public.router, prefix="/api/public", tags=["public"])
# Production deployment health check endpoint
@app.get("/")
def read_root():
    return {"message": "Welcome to Genestac API"}
