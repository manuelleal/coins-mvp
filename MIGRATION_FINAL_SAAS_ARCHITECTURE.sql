-- ============================================================
-- MIGRATION: Final SaaS Architecture
-- Multi-Tenant, Multi-AI, Credit-based, Strict RBAC, CEFR, Drako
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Institutions: rename AI columns + add provider
ALTER TABLE public.institutions RENAME COLUMN ai_generations_used TO ai_credits_used;
ALTER TABLE public.institutions RENAME COLUMN ai_generation_limit TO ai_credit_pool;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS active_ai_provider TEXT DEFAULT 'chatgpt' CHECK (active_ai_provider IN ('chatgpt', 'gemini', 'claude'));

-- 2. Profiles: teacher credits
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS teacher_credits INT DEFAULT 0;

-- 3. Teacher-Group assignment (strict RBAC)
CREATE TABLE IF NOT EXISTS public.teacher_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_code TEXT NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(teacher_id, group_code)
);
ALTER TABLE public.teacher_groups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'teacher_groups' AND policyname = 'Open access teacher_groups') THEN
        EXECUTE 'CREATE POLICY "Open access teacher_groups" ON public.teacher_groups FOR ALL USING (true)';
    END IF;
END $$;

-- 4. Question Bank: CEFR levels
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS cefr_level TEXT DEFAULT 'B1' CHECK (cefr_level IN ('A1', 'A1+', 'A2', 'A2+', 'B1-', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C1+'));

-- 5. System Configs vault (API keys, super_admin only at app level)
CREATE TABLE IF NOT EXISTS public.system_configs (
    key_name TEXT PRIMARY KEY,
    key_value TEXT NOT NULL,
    provider TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_configs' AND policyname = 'Open access system_configs') THEN
        EXECUTE 'CREATE POLICY "Open access system_configs" ON public.system_configs FOR ALL USING (true)';
    END IF;
END $$;

-- ============================================================
-- DONE. Verify with:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'institutions';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'teacher_credits';
--   SELECT * FROM information_schema.tables WHERE table_name IN ('teacher_groups', 'system_configs');
-- ============================================================
