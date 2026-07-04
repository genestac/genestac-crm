from supabase import Client
from typing import List, Dict, Any

class AdminProformaService:
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def get_all_proformas(self) -> List[Dict[str, Any]]:
        """
        Fetch all proforma invoices across the system, resolving relations manually.
        """
        # 1. Fetch all invoices
        invoices_res = self.supabase.table("proforma_invoices").select("*").order("created_at", desc=True).execute()
        invoices = invoices_res.data if invoices_res.data else []
        if not invoices:
            return []

        # 2. Extract unique user/lead IDs and creator IDs
        user_ids = list(set(inv["user_id"] for inv in invoices if inv.get("user_id")))
        creator_ids = list(set(inv["created_by"] for inv in invoices if inv.get("created_by")))
        
        # Fallback to sales_rep_id if created_by is missing
        if not creator_ids:
            creator_ids = list(set(inv["sales_rep_id"] for inv in invoices if inv.get("sales_rep_id")))

        # 3. Fetch related users & leads in bulk
        users_map = {}
        if user_ids:
            # Query users table
            users_res = self.supabase.table("users").select("id, name, email, phone").in_("id", user_ids).execute()
            for u in (users_res.data or []):
                users_map[u["id"]] = u
                
            # Query leads table for any IDs not found in users
            missing_ids = [uid for uid in user_ids if uid not in users_map]
            if missing_ids:
                leads_res = self.supabase.table("leads").select("id, name, email, phone_number").in_("id", missing_ids).execute()
                for l in (leads_res.data or []):
                    users_map[l["id"]] = {
                        "id": l["id"],
                        "name": l["name"],
                        "email": l["email"],
                        "phone": l.get("phone_number")
                    }

        # 4. Fetch related staffs in bulk
        staffs_map = {}
        if creator_ids:
            staffs_res = self.supabase.table("staffs").select("id, full_name, email").in_("id", creator_ids).execute()
            for s in (staffs_res.data or []):
                staffs_map[s["id"]] = {
                    "id": s["id"],
                    "name": s["full_name"], # Map full_name to name for frontend compatibility
                    "email": s["email"]
                }

        # 5. Map relations in memory
        for inv in invoices:
            uid = inv.get("user_id")
            cid = inv.get("created_by") or inv.get("sales_rep_id")
            inv["users"] = users_map.get(uid)
            inv["staffs"] = staffs_map.get(cid)

        return invoices

    def get_proforma_by_id(self, invoice_id: str) -> Dict[str, Any]:
        """
        Fetch single proforma invoice details.
        """
        inv_res = self.supabase.table("proforma_invoices").select("*").eq("id", invoice_id).execute()
        if not inv_res.data:
            return None
        invoice = inv_res.data[0]

        # Fetch user
        uid = invoice.get("user_id")
        if uid:
            user_res = self.supabase.table("users").select("*").eq("id", uid).execute()
            if user_res.data:
                invoice["users"] = user_res.data[0]
            else:
                leads_res = self.supabase.table("leads").select("*").eq("id", uid).execute()
                if leads_res.data:
                    l = leads_res.data[0]
                    invoice["users"] = {
                        "id": l["id"],
                        "name": l["name"],
                        "email": l["email"],
                        "phone": l.get("phone_number")
                    }

        # Fetch staff creator
        cid = invoice.get("created_by") or invoice.get("sales_rep_id")
        if cid:
            staffs_res = self.supabase.table("staffs").select("full_name, email").eq("id", cid).execute()
            if staffs_res.data:
                s = staffs_res.data[0]
                invoice["staffs"] = {
                    "name": s["full_name"], # Map full_name to name for frontend compatibility
                    "email": s["email"]
                }

        return invoice

    def delete_proforma(self, invoice_id: str) -> bool:
        self.supabase.table("proforma_invoices").delete().eq("id", invoice_id).execute()
        return True
