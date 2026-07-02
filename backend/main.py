from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings

from api import sales, auth, doctor
from api.admin import staffs, roles, crm_settings, logs, lead_assignment, coupons
from api import public

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
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
@app.get("/")
def read_root():
    return {"message": "Welcome to Genestac API"}
