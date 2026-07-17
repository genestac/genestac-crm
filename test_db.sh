source backend/.env
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_URL/rest/v1/appointments?select=*,users!appointments_patient_id_fkey(id,name,email,phone)&limit=1"
