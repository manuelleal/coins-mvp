-- ============================================================
-- MIGRATION: GOD MODE + RBAC + DUOLINGO CHALLENGES + ECONOMY
-- Run in Supabase SQL Editor AFTER MIGRATION_SAAS_HARDENING.sql
-- ============================================================

-- 1. Password power columns on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_locked BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 2. Challenge session tracking table
CREATE TABLE IF NOT EXISTS public.challenge_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    challenge_id UUID NOT NULL,
    student_id TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    current_question_index INTEGER DEFAULT 0,
    answers JSONB DEFAULT '[]',
    score_percent NUMERIC(5,2) DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    coins_earned INTEGER DEFAULT 0,
    streak_bonus INTEGER DEFAULT 0,
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
    weak_skills JSONB DEFAULT '[]',
    drako_feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.challenge_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'challenge_sessions' AND policyname = 'Open access challenge_sessions') THEN
        EXECUTE 'CREATE POLICY "Open access challenge_sessions" ON public.challenge_sessions FOR ALL USING (true)';
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_challenge_sessions_student ON public.challenge_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_challenge_sessions_challenge ON public.challenge_sessions(challenge_id);

-- 3. Student progress tracking table
CREATE TABLE IF NOT EXISTS public.student_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    cefr_level TEXT,
    total_attempts INTEGER DEFAULT 0,
    correct_attempts INTEGER DEFAULT 0,
    accuracy_percent NUMERIC(5,2) DEFAULT 0,
    xp_total INTEGER DEFAULT 0,
    last_practiced_at TIMESTAMPTZ DEFAULT NOW(),
    weak BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_progress' AND policyname = 'Open access student_progress') THEN
        EXECUTE 'CREATE POLICY "Open access student_progress" ON public.student_progress FOR ALL USING (true)';
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_progress_unique ON public.student_progress(student_id, skill);

-- 4. Teacher engagement rewards log
CREATE TABLE IF NOT EXISTS public.teacher_rewards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id UUID NOT NULL,
    reward_type TEXT NOT NULL,
    credits_awarded INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.teacher_rewards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'teacher_rewards' AND policyname = 'Open access teacher_rewards') THEN
        EXECUTE 'CREATE POLICY "Open access teacher_rewards" ON public.teacher_rewards FOR ALL USING (true)';
    END IF;
END $$;

-- 5. XP column on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;

-- 6. Challenge metadata columns (safe adds)
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS cefr_level TEXT;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS skill_type TEXT;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS xp_reward INTEGER DEFAULT 10;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS coins_reward INTEGER DEFAULT 5;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 2;

-- 7. Institution AI key routing columns
ALTER TABLE public.institutions
ADD COLUMN IF NOT EXISTS active_ai_provider TEXT DEFAULT 'anthropic',
ADD COLUMN IF NOT EXISTS active_ai_key TEXT;

-- ============================================================
-- VERIFY:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('force_password_reset','account_locked','is_active','xp','level','longest_streak');
--   SELECT * FROM information_schema.tables WHERE table_name IN ('challenge_sessions','student_progress','teacher_rewards');
-- ============================================================
