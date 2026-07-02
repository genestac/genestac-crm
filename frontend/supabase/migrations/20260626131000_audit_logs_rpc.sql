CREATE OR REPLACE FUNCTION public.get_audit_logs_with_users()
RETURNS TABLE (
    id UUID,
    actor_id UUID,
    actor_email TEXT,
    action TEXT,
    entity_table TEXT,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM auth.users 
        WHERE auth.users.id = auth.uid() 
        AND (raw_user_meta_data->>'role' IN ('admin', 'master_admin') OR raw_user_meta_data->>'is_admin' = 'true')
    ) THEN
        RAISE EXCEPTION 'Access Denied: Admins only';
    END IF;

    RETURN QUERY
    SELECT 
        al.id,
        al.actor_id,
        au.email::text AS actor_email,
        al.action,
        al.entity_table,
        al.entity_id,
        al.old_data,
        al.new_data,
        al.created_at
    FROM public.audit_logs al
    LEFT JOIN auth.users au ON au.id = al.actor_id
    ORDER BY al.created_at DESC
    LIMIT 1000;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
