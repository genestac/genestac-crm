-- ============================================================
-- 09_slot_system.sql
-- Adds per-doctor slot configuration and a server-side
-- conflict-check function to prevent double bookings.
-- Run this in your Supabase SQL editor.
-- ============================================================

-- 1. Add slot configuration columns to doctor_schedules
ALTER TABLE public.doctor_schedules
  ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS buffer_minutes         INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.doctor_schedules.slot_duration_minutes IS
  'Default length of each appointment slot in minutes (e.g. 30, 45, 60).';
COMMENT ON COLUMN public.doctor_schedules.buffer_minutes IS
  'Gap to leave between back-to-back slots (e.g. 5 = 5-minute breather).';

-- ============================================================
-- 2. Postgres function: check if a time slot conflicts with
--    any existing non-cancelled appointment for that doctor.
--
--    Returns TRUE  → conflict exists (slot is taken)
--    Returns FALSE → slot is free
--
--    p_exclude_id: pass the appointment's own UUID when updating
--    so it doesn't conflict with itself.
-- ============================================================
CREATE OR REPLACE FUNCTION check_appointment_conflict(
  p_doctor_id       UUID,
  p_scheduled_at    TIMESTAMPTZ,
  p_duration_minutes INT,
  p_exclude_id      UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   appointments
    WHERE  doctor_id = p_doctor_id
      AND  status NOT IN ('cancelled', 'rejected')
      AND  (p_exclude_id IS NULL OR id != p_exclude_id)
      -- Interval overlap: [new_start, new_end) overlaps [existing_start, existing_end)
      AND  scheduled_at < (p_scheduled_at + (p_duration_minutes * INTERVAL '1 minute'))
      AND  (scheduled_at + (duration_minutes * INTERVAL '1 minute')) > p_scheduled_at
  );
$$;

-- 3. Helper RPC: get all booked intervals for a doctor on a date
--    (used by the slot engine to mark occupied slots)
CREATE OR REPLACE FUNCTION get_booked_intervals(
  p_doctor_id UUID,
  p_date      DATE
)
RETURNS TABLE (
  appointment_id UUID,
  start_at       TIMESTAMPTZ,
  end_at         TIMESTAMPTZ,
  status         TEXT,
  patient_name   TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    a.id,
    a.scheduled_at,
    a.scheduled_at + (a.duration_minutes * INTERVAL '1 minute'),
    a.status,
    u.name
  FROM appointments a
  LEFT JOIN users u ON u.id = a.patient_id
  WHERE a.doctor_id   = p_doctor_id
    AND a.status NOT IN ('cancelled', 'rejected')
    AND DATE(a.scheduled_at AT TIME ZONE 'Asia/Kolkata') = p_date
  ORDER BY a.scheduled_at;
$$;
