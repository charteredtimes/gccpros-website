-- =====================================================================
-- GCC Industry @ 2030 — add address type + delivery preference
-- Run in Supabase SQL Editor (safe to run more than once).
-- =====================================================================
ALTER TABLE public.book_orders ADD COLUMN IF NOT EXISTS address_type   text;   -- Home | Office | Other
ALTER TABLE public.book_orders ADD COLUMN IF NOT EXISTS delivery_days  text;   -- Any Day | Monday to Friday | Monday to Saturday
ALTER TABLE public.book_orders ADD COLUMN IF NOT EXISTS delivery_time  text;   -- 9 AM to 9 PM | 11 AM to 6 PM
