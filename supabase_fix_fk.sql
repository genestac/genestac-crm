-- Run this script in your Supabase SQL Editor to fix the foreign key error

-- Drop the foreign key constraint from user_id because lead_id can come from either 'users' or 'leads' table
ALTER TABLE public.proforma_invoices 
DROP CONSTRAINT IF EXISTS proforma_invoices_user_id_fkey;

-- Also drop for user_notes for the same reason
ALTER TABLE public.user_notes 
DROP CONSTRAINT IF EXISTS user_notes_user_id_fkey;
