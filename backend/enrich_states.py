import asyncio
import httpx
import sys

async def main():
    try:
        from db.supabase import get_supabase_client
    except ImportError:
        import sys
        sys.path.append('.')
        from db.supabase import get_supabase_client

    sb = get_supabase_client()
    cache_res = sb.table('global_settings').select('settings_value').eq('settings_key', 'city_coordinates_cache').execute()
    if not cache_res.data:
        print("No cache found")
        return
    city_cache = cache_res.data[0].get('settings_value', {})
    
    needs_state = {k: v for k, v in city_cache.items() if 'lat' in v and 'state' not in v}
    if not needs_state:
        print("All cached")
        return
        
    print(f"Enriching {len(needs_state)} cities...")
    headers = {"User-Agent": "GenestacCRM/1.0"}
    
    async with httpx.AsyncClient(timeout=15) as client:
        count = 0
        for city_key, coords in needs_state.items():
            try:
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
                print(f"[{count+1}/{len(needs_state)}] {city_key} -> {state}")
                
                # Save every 10 items
                if (count + 1) % 10 == 0:
                    sb.table("global_settings").upsert(
                        {"settings_key": "city_coordinates_cache", "settings_value": city_cache}
                    ).execute()
                count += 1
            except Exception as e:
                print(f"Error on {city_key}: {e}")
            await asyncio.sleep(1)
            
        sb.table("global_settings").upsert(
            {"settings_key": "city_coordinates_cache", "settings_value": city_cache}
        ).execute()
        print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
