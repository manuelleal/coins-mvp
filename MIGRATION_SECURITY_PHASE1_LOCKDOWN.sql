-- ============================================================
-- MIGRATION: SECURITY PHASE 1 LOCKDOWN
-- Purpose:
--   1) Remove permissive/open RLS policies from sensitive tables.
--   2) Keep RLS enabled so browser clients cannot read/write secrets and audit trails.
-- NOTE:
--   After this migration, only privileged server-side paths (service role / SECURITY DEFINER RPC)
--   should access these tables.
-- ============================================================

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS public.system_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.student_coin_transactions ENABLE ROW LEVEL SECURITY;

-- Drop permissive policies on system_configs
DROP POLICY IF EXISTS "Open access system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "Anyone can manage system_configs" ON public.system_configs;
DROP POLICY IF EXISTS "open" ON public.system_configs;

-- Drop permissive policies on audit_logs
DROP POLICY IF EXISTS "Open access audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Anyone can read audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Anyone can insert audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "open" ON public.audit_logs;

-- Drop permissive policies on ai_usage_logs
DROP POLICY IF EXISTS "Open access ai_usage_logs" ON public.ai_usage_logs;
DROP POLICY IF EXISTS "Anyone can read ai_usage_logs" ON public.ai_usage_logs;
DROP POLICY IF EXISTS "Anyone can insert ai_usage_logs" ON public.ai_usage_logs;
DROP POLICY IF EXISTS "open" ON public.ai_usage_logs;

-- Drop permissive policies on credit_transactions
DROP POLICY IF EXISTS "Open access credit_transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Anyone can read credit_transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Anyone can insert credit_transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "open" ON public.credit_transactions;

-- Drop permissive policies on student_coin_transactions
DROP POLICY IF EXISTS "Open access student_coin_transactions" ON public.student_coin_transactions;
DROP POLICY IF EXISTS "Anyone can read student_coin_transactions" ON public.student_coin_transactions;
DROP POLICY IF EXISTS "Anyone can insert student_coin_transactions" ON public.student_coin_transactions;
DROP POLICY IF EXISTS "open" ON public.student_coin_transactions;

-- No replacement policy here on purpose (deny-by-default for browser clients)
-- Add explicit least-privilege policies later per backend access pattern.

-- ============================================================
-- VERIFY
--   SELECT schemaname, tablename, policyname
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN (
--       'system_configs','audit_logs','ai_usage_logs','credit_transactions','student_coin_transactions'
--     )
--   ORDER BY tablename, policyname;
-- ============================================================
