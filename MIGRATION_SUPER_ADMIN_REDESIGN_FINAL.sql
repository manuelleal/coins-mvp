-- ============================================================
-- MIGRATION: Super Admin Redesign Final
-- Safe schema additions for admin.html + modules/institutions.js/users.js/groups.js
-- Run in Supabase SQL Editor
-- ============================================================

-- 1) Institutions compatibility columns
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS coin_pool INTEGER DEFAULT 0;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS active_ai_provider TEXT DEFAULT 'chatgpt';
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS ai_credit_pool INTEGER DEFAULT 0;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS ai_used_credits INTEGER DEFAULT 0;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS api_key TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institutions'
      AND column_name = 'ai_credits_used'
  ) THEN
    EXECUTE '
      UPDATE public.institutions
      SET ai_used_credits = COALESCE(ai_used_credits, ai_credits_used, 0)
    ';
  END IF;
END $$;

-- 5) Default policy configuration entries (compatible with key_name/key_value table shape)
INSERT INTO public.system_configs (key_name, key_value, provider, updated_at)
VALUES
(
  'data_policies',
  '{"attendance_retention_days":365,"challenge_retention_days":365,"feedback_retention_days":90,"audit_retention_days":180,"coin_transaction_retention_days":730}',
  'system',
  NOW()
),
(
  'privacy_settings',
  '{"students_see_own_history":true,"students_see_leaderboard":true,"students_see_others_coins":false,"teachers_see_login_timestamps":true,"teachers_can_export_personal_data":false,"admins_can_export_attendance":true,"system_sends_daily_digest":true}',
  'system',
  NOW()
)
ON CONFLICT (key_name) DO NOTHING;

-- 4) Audit logs for super_admin policy and security actions
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id),
  user_name TEXT,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND policyname = 'Open access audit_logs'
  ) THEN
    EXECUTE 'CREATE POLICY "Open access audit_logs" ON public.audit_logs FOR ALL USING (true)';
  END IF;
END $$;

-- Keep provider values constrained (idempotent pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'institutions_active_ai_provider_check'
  ) THEN
    ALTER TABLE public.institutions
      ADD CONSTRAINT institutions_active_ai_provider_check
      CHECK (active_ai_provider IN ('chatgpt', 'gemini', 'claude'));
  END IF;
END $$;

-- 2) Credit operation history for institution pool changes
CREATE TABLE IF NOT EXISTS public.institution_credit_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  previous_pool INTEGER NOT NULL DEFAULT 0,
  new_pool INTEGER NOT NULL DEFAULT 0,
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inst_credit_history_inst ON public.institution_credit_history(institution_id);
CREATE INDEX IF NOT EXISTS idx_inst_credit_history_created ON public.institution_credit_history(created_at DESC);

ALTER TABLE public.institution_credit_history ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'institution_credit_history'
      AND policyname = 'Open access institution_credit_history'
  ) THEN
    EXECUTE 'CREATE POLICY "Open access institution_credit_history" ON public.institution_credit_history FOR ALL USING (true)';
  END IF;
END $$;

-- 3) System configs table shape expected by app.js + modules/institutions.js
CREATE TABLE IF NOT EXISTS public.system_configs (
  key_name TEXT PRIMARY KEY,
  key_value TEXT NOT NULL,
  provider TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_configs'
      AND policyname = 'Open access system_configs'
  ) THEN
    EXECUTE 'CREATE POLICY "Open access system_configs" ON public.system_configs FOR ALL USING (true)';
  END IF;
END $$;

-- ============================================================
-- VERIFY QUICKLY
-- SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='institutions' AND column_name IN ('coin_pool','is_suspended','active_ai_provider','ai_credit_pool','ai_used_credits','api_key');
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('institution_credit_history','system_configs');
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('audit_logs');
-- ============================================================
