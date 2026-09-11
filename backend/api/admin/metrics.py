from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from datetime import datetime, timedelta
import asyncio
import httpx

router = APIRouter()

# ── City Geocoding (Nominatim / OpenStreetMap) ─────────────────────────────────

async def _geocode_city(city: str) -> dict | None:
    """Geocode a city name using Nominatim. Returns {lat, lng, state} or None."""
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": f"{city}, India",
            "format": "json",
            "addressdetails": 1,
            "limit": 1,
            "countrycodes": "in",
        }
        headers = {"User-Agent": "GenestacCRM/1.0 (contact@genestac.com)"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            results = resp.json()
            if results:
                r = results[0]
                addr = r.get("address", {})
                state = addr.get("state") or addr.get("state_district") or addr.get("county") or "Unknown"
                return {"lat": float(r["lat"]), "lng": float(r["lon"]), "state": state}
    except Exception as e:
        print(f"[geocode] Failed for '{city}': {e}")
    return None


async def geocode_missing_cities(supabase: Client):
    """
    Background task: fetch all unique cities from leads, geocode the ones
    not already in global_settings['city_coordinates_cache'], and update the cache.
    """
    try:
        # 1. Load existing cache
        cache_res = supabase.table("global_settings") \
            .select("settings_value") \
            .eq("settings_key", "city_coordinates_cache") \
            .execute()
        city_cache: dict = {}
        if cache_res.data:
            city_cache = cache_res.data[0].get("settings_value", {}) or {}

        # 2. Gather unique cities from leads
        leads_res = supabase.table("leads").select("city, metadata").execute()
        cities: set[str] = set()
        for lead in (leads_res.data or []):
            city = lead.get("city")
            if not city and isinstance(lead.get("metadata"), dict):
                city = lead["metadata"].get("city")
            if city and isinstance(city, str):
                cities.add(city.strip())

        # 3. Find uncached cities
        missing = [c for c in cities if c.lower() not in city_cache]
        if not missing:
            print(f"[geocode] All {len(cities)} cities already cached.")
            return

        print(f"[geocode] Geocoding {len(missing)} new cities: {missing[:10]}{'...' if len(missing)>10 else ''}")

        # 4. Geocode with polite 1-second delay (Nominatim ToS)
        updated = False
        for city in missing:
            coords = await _geocode_city(city)
            if coords:
                city_cache[city.lower()] = coords
                print(f"[geocode] ✓ {city} → {coords}")
                updated = True
            await asyncio.sleep(1)  # Rate limit: 1 req/sec per Nominatim ToS

        # 5. Persist updated cache
        if updated:
            supabase.table("global_settings").upsert(
                {"settings_key": "city_coordinates_cache", "settings_value": city_cache},
                on_conflict="settings_key"
            ).execute()
            print(f"[geocode] Cache updated. Total entries: {len(city_cache)}")

    except Exception as e:
        import traceback
        print(f"[geocode] Error during geocoding: {e}")
        traceback.print_exc()


async def enrich_cache_with_states(supabase: Client):
    """
    Backfill `state` for cache entries that only have {lat, lng}.
    Uses Nominatim reverse geocoding on existing coordinates.
    """
    try:
        cache_res = supabase.table("global_settings") \
            .select("settings_value") \
            .eq("settings_key", "city_coordinates_cache") \
            .execute()
        city_cache: dict = {}
        if cache_res.data:
            city_cache = cache_res.data[0].get("settings_value", {}) or {}

        needs_state = {k: v for k, v in city_cache.items() if "lat" in v and "state" not in v}
        if not needs_state:
            print(f"[geocode] All cache entries already have state info.")
            return

        print(f"[geocode] Enriching {len(needs_state)} cache entries with state via reverse geocoding...")
        updated = False
        headers = {"User-Agent": "GenestacCRM/1.0 (contact@genestac.com)"}

        for city_key, coords in needs_state.items():
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(
                        "https://nominatim.openstreetmap.org/reverse",
                        params={"lat": coords["lat"], "lon": coords["lng"], "format": "json", "addressdetails": 1},
                        headers=headers
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    addr = data.get("address", {})
                    state = addr.get("state") or addr.get("state_district") or addr.get("county") or "Unknown"
                    city_cache[city_key]["state"] = state
                    print(f"[geocode] ✓ {city_key} → {state}")
                    updated = True
            except Exception as e:
                print(f"[geocode] Reverse geocode failed for {city_key}: {e}")
            await asyncio.sleep(1)  # Nominatim ToS: 1 req/sec

        if updated:
            supabase.table("global_settings").upsert(
                {"settings_key": "city_coordinates_cache", "settings_value": city_cache},
                on_conflict="settings_key"
            ).execute()
            print(f"[geocode] Cache enriched with state data. Total entries: {len(city_cache)}")

    except Exception as e:
        import traceback
        print(f"[geocode] Error during state enrichment: {e}")
        traceback.print_exc()

def is_admin(user: dict, supabase: Client) -> bool:
    res = supabase.table("staffs").select("roles(name)").eq("id", user["id"]).execute()
    if not res.data:
        return False
    role_name = res.data[0].get("roles", {}).get("name", "")
    return role_name in ("superadmin", "master_admin", "admin")

@router.post("/geocode-cities")
async def trigger_geocode_cities(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Manually trigger geocoding of all uncached lead cities."""
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Not authorized.")
    asyncio.create_task(geocode_missing_cities(supabase))
    return {"success": True, "message": "Geocoding started in background."}


@router.get("")
async def get_admin_metrics(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Not authorized. Admin access required.")
    
    # Fire-and-forget: geocode any cities not yet in the cache
    background_tasks.add_task(geocode_missing_cities, supabase)
    background_tasks.add_task(enrich_cache_with_states, supabase)
        
    try:
        today_date = datetime.now()
        start_of_today_str = today_date.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        thirty_days_ago_str = (today_date - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        twelve_months_ago_str = (today_date - timedelta(days=365)).isoformat()
        
        # 1. Total Users
        total_users = 0
        try:
            users_res = supabase.table("users").select("id", count="exact").execute()
            total_users = users_res.count or 0
        except Exception as e:
            print(f"Error fetching users: {e}")
            
        # 2. Leads Processing (for graphs, funnels, todays conversions)
        total_leads = 0
        todays_leads = 0
        todays_conversions = 0
        total_conversions = 0
        
        # Graph Data Maps
        daily_leads_map = {}
        monthly_leads_map = {}
        
        # Funnel Data
        status_contacted = 0
        status_counts = {}
        source_counts = {}
        
        try:
            # Fetch all leads with created_at, status, and source
            leads_res = supabase.table("leads").select("id, created_at, status, source, city, metadata").execute()
            leads_data = leads_res.data or []
            total_leads = len(leads_data)
            
            for lead in leads_data:
                created_at_str = lead.get("created_at")
                status = lead.get("status") or "NEW"
                
                raw_source = str(lead.get("source") or "Unknown").strip().title()
                if not raw_source or raw_source.lower() == "none":
                    raw_source = "Unknown"
                source_counts[raw_source] = source_counts.get(raw_source, 0) + 1
                
                # Funnel logic
                status_counts[status] = status_counts.get(status, 0) + 1
                if status in ["CONTACTED", "QUALIFIED", "CONSULTATION_SCHEDULED", "CONVERTED"]:
                    status_contacted += 1
                
                if status == "CONVERTED":
                    total_conversions += 1
                
                if not created_at_str:
                    continue
                    
                # Time logic
                try:
                    lead_date = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                    date_str = lead_date.strftime("%Y-%m-%d")
                    month_str = lead_date.strftime("%b %Y")
                    
                    if created_at_str >= start_of_today_str:
                        todays_leads += 1
                        if status == "CONVERTED":
                            todays_conversions += 1
                            
                    if created_at_str >= thirty_days_ago_str:
                        daily_leads_map[date_str] = daily_leads_map.get(date_str, 0) + 1
                        
                    if created_at_str >= twelve_months_ago_str:
                        monthly_leads_map[month_str] = monthly_leads_map.get(month_str, 0) + 1
                except Exception:
                    pass
                    
        except Exception as e:
            print(f"Error fetching leads: {e}")
            
        # Format Graph Arrays
        daily_leads_graph = [{"date": k, "leads": v} for k, v in sorted(daily_leads_map.items())]
        
        # Sort monthly graph by actual month order
        def sort_month(m_str):
            try:
                return datetime.strptime(m_str, "%b %Y")
            except:
                return datetime.now()
        monthly_leads_graph = [{"month": k, "leads": v} for k, v in sorted(monthly_leads_map.items(), key=lambda x: sort_month(x[0]))]
        
        # Funnel Graph
        funnel_graph = [{"stage": "Total Leads", "value": total_leads}]
        for k, v in sorted(status_counts.items(), key=lambda x: x[1], reverse=True):
            funnel_graph.append({"stage": k.replace("_", " ").title(), "value": v})
        
        # Dynamic Status Breakdown Pie
        # Keep variable name contacted_graph for frontend compatibility
        contacted_graph = [{"name": k.replace("_", " ").title(), "value": v} for k, v in status_counts.items() if v > 0]
        
        # Source Breakdown Pie
        source_graph = [{"name": k, "value": v} for k, v in sorted(source_counts.items(), key=lambda x: x[1], reverse=True)]
            
        # 3. Active Staff
        total_staff = 0
        try:
            staffs_res = supabase.table("staffs").select("id", count="exact").eq("is_active", True).execute()
            total_staff = staffs_res.count or 0
        except Exception:
            try:
                staffs_res = supabase.table("staffs").select("id", count="exact").execute()
                total_staff = staffs_res.count or 0
            except Exception as e:
                print(f"Error fetching staffs: {e}")
        
        # 3.5 Locations GeoJSON for Heatmap + State Stats
        locations_geojson = {"type": "FeatureCollection", "features": []}
        state_stats = []  # [{state, total, contacted, interested, consultation, converted}]
        try:
            cache_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "city_coordinates_cache").execute()
            if cache_res.data:
                city_cache = cache_res.data[0].get("settings_value", {})
                
                # Accumulate per-state counts
                _state_map = {}  # state -> {total, contacted, interested, consultation, qualified}

                for lead in leads_data:
                    raw_city = lead.get("city")
                    if not raw_city and isinstance(lead.get("metadata"), dict):
                        raw_city = lead["metadata"].get("city")
                        
                    if raw_city and isinstance(raw_city, str):
                        city_key = raw_city.strip().lower()
                        coords = city_cache.get(city_key)
                        if coords and "lat" in coords and "lng" in coords:
                            state = coords.get("state", "Unknown")
                            status = lead.get("status", "NEW")

                            locations_geojson["features"].append({
                                "type": "Feature",
                                "geometry": {
                                    "type": "Point",
                                    "coordinates": [coords["lng"], coords["lat"]]
                                },
                                "properties": {
                                    "city": raw_city.title(),
                                    "state": state,
                                    "status": status
                                }
                            })

                            # Accumulate state stats
                            if state not in _state_map:
                                _state_map[state] = {"total": 0, "contacted": 0, "interested": 0, "consultation": 0, "qualified": 0}
                            _state_map[state]["total"] += 1
                            if status in ("CONTACTED", "CONTACT_ATTEMPTED", "CALLBACK_SCHEDULED"):
                                _state_map[state]["contacted"] += 1
                            if status in ("QUALIFIED",):
                                _state_map[state]["interested"] += 1
                                _state_map[state]["contacted"] += 1
                            if status in ("CONSULTATION_SCHEDULED",):
                                _state_map[state]["consultation"] += 1
                                _state_map[state]["interested"] += 1
                                _state_map[state]["contacted"] += 1

                # Sort states by total leads descending
                state_stats = sorted(
                    [
                        {
                            "state": s,
                            "total": v["total"],
                            "contacted": v["contacted"],
                            "interested": v["interested"],
                            "consultation": v["consultation"],
                            "qualified": v["qualified"],
                        }
                        for s, v in _state_map.items()
                    ],
                    key=lambda x: x["total"],
                    reverse=True
                )
        except Exception as e:
            print(f"Error building locations geojson: {e}")
        
        # 4. Orders Processing (Total Revenue & Today's Orders)
        total_revenue = 0
        todays_orders_count = 0
        todays_orders_revenue = 0
        try:
            orders_res = supabase.table("orders").select("grand_total, created_at, payment_status").execute()
            orders_data = orders_res.data or []
            for o in orders_data:
                # ONLY COUNT PAID ORDERS
                status = str(o.get("payment_status", "")).lower()
                if status not in ["paid", "successful", "completed", "success"]:
                    continue
                    
                amt = float(o.get("grand_total") or 0)
                total_revenue += amt
                
                created_at_str = o.get("created_at")
                if created_at_str and created_at_str >= start_of_today_str:
                    todays_orders_count += 1
                    todays_orders_revenue += amt
        except Exception as e:
            print(f"Error fetching orders: {e}")
        
        # 5. Recent Activity
        activities = []
        try:
            recent_res = supabase.table("proforma_invoices").select("id, invoice_number, status, total_amount, created_at").order("created_at", desc=True).limit(5).execute()
            recent_activity = recent_res.data or []
            for inv in recent_activity:
                activities.append({
                    "id": inv["id"],
                    "title": f"Invoice {inv.get('invoice_number', '')} created",
                    "description": f"Amount: {inv.get('total_amount', 0)} ({inv.get('status', 'PENDING')})",
                    "timestamp": inv.get("created_at")
                })
        except Exception as e:
            print(f"Error fetching invoices: {e}")

        return {
            "success": True,
            "data": {
                "total_users": total_users,
                "total_leads": total_leads,
                "total_staff": total_staff,
                "total_revenue": total_revenue,
                
                "todays_orders_count": todays_orders_count,
                "todays_orders_revenue": todays_orders_revenue,
                "todays_conversions": todays_conversions,
                
                "daily_leads_graph": daily_leads_graph,
                "monthly_leads_graph": monthly_leads_graph,
                "funnel_graph": funnel_graph,
                "contacted_graph": contacted_graph,
                "source_graph": source_graph,
                
                "recent_activity": activities,
                "locations_geojson": locations_geojson,
                "state_stats": state_stats
            }
        }
        
    except Exception as e:
        import traceback
        print(f"Error fetching admin metrics: {e}")
        traceback.print_exc()
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"detail": "Failed to fetch admin metrics", "error": str(e)})

from pydantic import BaseModel
from typing import List

class WhatsappConfig(BaseModel):
    numbers: List[str]
    time: str

@router.get("/whatsapp-config")
async def get_whatsapp_config(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Not authorized.")
    
    num_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "whatsapp_report_numbers").execute()
    time_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "whatsapp_report_time").execute()
    
    numbers = []
    time_val = "21:00"
    
    if num_res.data and "numbers" in num_res.data[0].get("settings_value", {}):
        numbers = num_res.data[0]["settings_value"]["numbers"]
        
    if time_res.data and "time" in time_res.data[0].get("settings_value", {}):
        time_val = time_res.data[0]["settings_value"]["time"]
        
    return {"numbers": numbers, "time": time_val}

@router.post("/whatsapp-config")
async def save_whatsapp_config(
    config: WhatsappConfig,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Not authorized.")
        
    supabase.table("global_settings").upsert({
        "settings_key": "whatsapp_report_numbers",
        "settings_value": {"numbers": config.numbers}
    }, on_conflict="settings_key").execute()
    
    supabase.table("global_settings").upsert({
        "settings_key": "whatsapp_report_time",
        "settings_value": {"time": config.time}
    }, on_conflict="settings_key").execute()
    
    return {"success": True}

class OrderSettingsConfig(BaseModel):
    order_review_notifications_enabled: bool

@router.get("/order-settings")
async def get_order_settings(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Not authorized.")
    
    res = supabase.table("global_settings").select("settings_value").eq("settings_key", "order_settings").execute()
    
    enabled = True # default true
    if res.data and "order_review_notifications_enabled" in res.data[0].get("settings_value", {}):
        enabled = res.data[0]["settings_value"]["order_review_notifications_enabled"]
        
    return {"order_review_notifications_enabled": enabled}

@router.post("/order-settings")
async def save_order_settings(
    config: OrderSettingsConfig,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Not authorized.")
        
    supabase.table("global_settings").upsert({
        "settings_key": "order_settings",
        "settings_value": {"order_review_notifications_enabled": config.order_review_notifications_enabled}
    }, on_conflict="settings_key").execute()
    
    return {"success": True}


@router.post("/send-whatsapp-report")
async def trigger_whatsapp_report(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Not authorized.")

    try:
        from core.scheduler import _send_daily_whatsapp_report_logic
        await _send_daily_whatsapp_report_logic()
        return {"success": True, "message": "Report sent successfully."}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Report failed: {str(e)}")
