from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from typing import List, Dict, Any

from db.supabase import get_supabase_client
from api.deps import get_current_user
from app.services.admin_proforma_service import AdminProformaService

router = APIRouter()

def get_admin_proforma_service(supabase: Client = Depends(get_supabase_client)) -> AdminProformaService:
    return AdminProformaService(supabase)

def require_admin(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ["SUPER_ADMIN", "superadmin", "admin", "master_admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized as admin")
    return current_user

@router.get("/")
def get_all_proforma_invoices(
    service: AdminProformaService = Depends(get_admin_proforma_service),
    admin_user: dict = Depends(require_admin)
):
    """
    Get all proforma invoices across the entire system. 
    Restricted to Admins.
    """
    try:
        invoices = service.get_all_proformas()
        return {"success": True, "data": invoices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}")
def get_proforma_invoice(
    invoice_id: str,
    service: AdminProformaService = Depends(get_admin_proforma_service),
    admin_user: dict = Depends(require_admin)
):
    try:
        invoice = service.get_proforma_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return {"success": True, "data": invoice}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{invoice_id}")
def delete_proforma_invoice(
    invoice_id: str,
    service: AdminProformaService = Depends(get_admin_proforma_service),
    admin_user: dict = Depends(require_admin)
):
    """
    Delete a proforma invoice. Super admins only logic could be enforced here if needed, 
    but we will let require_admin handle it for now.
    """
    try:
        # Extra check: Only super admins can delete
        if admin_user.get("role") not in ["SUPER_ADMIN", "superadmin", "master_admin"]:
            raise HTTPException(status_code=403, detail="Only Super Admins can delete invoices")
            
        success = service.delete_proforma(invoice_id)
        return {"success": success, "message": "Invoice deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
