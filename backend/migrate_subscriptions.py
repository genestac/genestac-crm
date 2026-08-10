import os
import sys

# Setup for importing backend modules
sys.path.append('/app')

from db.supabase import get_supabase_client

def run_migration():
    sb = get_supabase_client()
    
    # 1. Fetch all plans and variants
    print("Fetching plans and variants...")
    plans_res = sb.table('plans').select('*').execute()
    variants_res = sb.table('plan_variants').select('*').execute()
    
    plans = {p['name'].lower().strip(): p for p in plans_res.data}
    variants_by_plan = {}
    for v in variants_res.data:
        variants_by_plan.setdefault(v['plan_id'], []).append(v)

    # 2. Assign specific Starter 1 Month to Shilpa and Mandirjeet
    print("\n--- Phase 1: Assigning Shilpa & Mandirjeet ---")
    users_res = sb.table('users').select('id, name, phone').in_('phone', ['+918601802711', '+919876888000', '8601802711', '9876888000']).execute()
    
    starter_plan = next((p for p in plans.values() if 'starter' in p['name'].lower()), None)
    if starter_plan:
        starter_variants = variants_by_plan.get(starter_plan['id'], [])
        variant_1m = next((v for v in starter_variants if '1 month' in (v.get('duration_label') or '').lower()), None)
        
        if variant_1m:
            for user in users_res.data:
                sub_data = {
                    'user_id': user['id'],
                    'plan_id': starter_plan['id'],
                    'variant_id': variant_1m['id'],
                    'plan_type': 'Weight Loss Plan',
                    'quantity': 1,
                    'status': 'active'
                }
                try:
                    sb.table('subscriptions').insert(sub_data).execute()
                    print(f"✅ Assigned Starter 1M to {user['name']} ({user['phone']})")
                except Exception as e:
                    print(f"Failed to assign Starter 1M to {user['name']}: {e}")

    # 3. Migrate past paid orders
    print("\n--- Phase 2: Migrating past paid orders ---")
    orders_res = sb.table('orders').select('id, user_id, created_at, payment_status').eq('payment_status', 'paid').execute()
    paid_orders = {o['id']: o for o in orders_res.data}
    
    if not paid_orders:
        print("No paid orders found.")
        return

    order_items_res = sb.table('order_items').select('*').in_('order_id', list(paid_orders.keys())).eq('item_type', 'plan').execute()
    
    migrated_count = 0
    for item in order_items_res.data:
        order = paid_orders.get(item['order_id'])
        if not order:
            continue
            
        plan_name = item.get('item_name', '').lower().strip()
        matched_plan = None
        for p in plans.values():
            if p['name'].lower() in plan_name:
                matched_plan = p
                break
        
        if not matched_plan:
            print(f"⚠️ Could not match plan name: {plan_name}")
            continue
            
        plan_id = matched_plan['id']
        variants = variants_by_plan.get(plan_id, [])
        
        # Try to match variant by price, otherwise fallback to first variant
        unit_price = float(item.get('unit_price') or 0)
        matched_variant = None
        for v in variants:
            if float(v.get('base_price') or 0) == unit_price or float(v.get('discounted_price') or 0) == unit_price:
                matched_variant = v
                break
        
        if not matched_variant and variants:
            matched_variant = variants[0]
            
        variant_id = matched_variant['id'] if matched_variant else None
        
        sub_data = {
            'user_id': order['user_id'],
            'plan_id': plan_id,
            'variant_id': variant_id,
            'plan_type': 'Weight Loss Plan',
            'quantity': item.get('quantity') or 1,
            'status': 'active',
            'start_date': order['created_at']
        }
        
        try:
            # Check if this exact subscription already exists to avoid duplicates
            existing = sb.table('subscriptions').select('id').eq('user_id', order['user_id']).eq('plan_id', plan_id).execute()
            if existing.data:
                print(f"Skipping (already exists) User {order['user_id']} -> Plan {plan_name}")
                continue
                
            sb.table('subscriptions').insert(sub_data).execute()
            print(f"✅ Migrated past order for User {order['user_id'][:8]} -> {plan_name}")
            migrated_count += 1
        except Exception as e:
            print(f"Failed to migrate order item {item['id']}: {e}")
            
    print(f"\nMigration complete! Migrated {migrated_count} past orders.")

if __name__ == '__main__':
    run_migration()
