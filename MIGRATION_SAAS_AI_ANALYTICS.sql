-- ============================================================
-- MIGRATION: SaaS Feature Gating + AI Limits + Analytics + Plans
-- Lingo-Coins v2 — Run in Supabase SQL Editor
-- Execution order: institutions → question_bank → student_analytics → improvement_plans
-- All RLS uses USING (true) — custom auth, zero auth.uid()
-- ============================================================

-- ============================================================
-- STEP 1: INSTITUTIONS — SaaS levels and AI generation limits
-- ============================================================

-- Create base table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Default Institution',
    subscription_plan TEXT DEFAULT 'BASIC',
    ai_generations_used INT DEFAULT 0,
    ai_generation_limit INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column additions (safe if table already existed)
ALTER TABLE public.institutions 
ADD COLUMN IF NOT EXISTS ai_generations_used INT DEFAULT 0;

ALTER TABLE public.institutions 
ADD COLUMN IF NOT EXISTS ai_generation_limit INT DEFAULT 10;

-- Replace subscription_plan CHECK constraint
ALTER TABLE public.institutions DROP CONSTRAINT IF EXISTS institutions_subscription_plan_check;
ALTER TABLE public.institutions ADD CONSTRAINT institutions_subscription_plan_check 
CHECK (subscription_plan IN ('BASIC', 'PRO', 'PREMIUM', 'ENTERPRISE'));

-- Seed defaults by plan tier
UPDATE public.institutions SET ai_generation_limit = 10   WHERE subscription_plan = 'BASIC';
UPDATE public.institutions SET ai_generation_limit = 50   WHERE subscription_plan = 'PRO';
UPDATE public.institutions SET ai_generation_limit = 200  WHERE subscription_plan = 'PREMIUM';
UPDATE public.institutions SET ai_generation_limit = 9999 WHERE subscription_plan = 'ENTERPRISE';

-- RLS for institutions
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read institutions" ON public.institutions;
DROP POLICY IF EXISTS "Anyone can insert institutions" ON public.institutions;
DROP POLICY IF EXISTS "Anyone can update institutions" ON public.institutions;
DROP POLICY IF EXISTS "Anyone can delete institutions" ON public.institutions;
CREATE POLICY "Anyone can read institutions" ON public.institutions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert institutions" ON public.institutions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update institutions" ON public.institutions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete institutions" ON public.institutions FOR DELETE USING (true);

-- ============================================================
-- STEP 2: QUESTION_BANK — 3-pillar taxonomy
-- ============================================================

-- Create base table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.question_bank (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_type TEXT DEFAULT 'GENERAL',
    question_text TEXT NOT NULL DEFAULT '',
    options_json JSONB DEFAULT '[]'::jsonb,
    correct_answer TEXT,
    difficulty TEXT DEFAULT 'MEDIUM',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column additions for 3-pillar taxonomy
ALTER TABLE public.question_bank
ADD COLUMN IF NOT EXISTS pillar_type TEXT DEFAULT 'EXAM_PREP';

ALTER TABLE public.question_bank
ADD COLUMN IF NOT EXISTS exam_format TEXT DEFAULT 'NONE';

ALTER TABLE public.question_bank
ADD COLUMN IF NOT EXISTS technical_domain TEXT DEFAULT 'NONE';

-- Add CHECK constraints (drop first for idempotency)
ALTER TABLE public.question_bank DROP CONSTRAINT IF EXISTS question_bank_pillar_type_check;
ALTER TABLE public.question_bank ADD CONSTRAINT question_bank_pillar_type_check
CHECK (pillar_type IN ('CONTEXTUAL', 'EXAM_PREP', 'TECHNICAL'));

ALTER TABLE public.question_bank DROP CONSTRAINT IF EXISTS question_bank_exam_format_check;
ALTER TABLE public.question_bank ADD CONSTRAINT question_bank_exam_format_check
CHECK (exam_format IN ('ICFES', 'IELTS', 'CAMBRIDGE_PET', 'TOEFL', 'NONE'));

ALTER TABLE public.question_bank DROP CONSTRAINT IF EXISTS question_bank_technical_domain_check;
ALTER TABLE public.question_bank ADD CONSTRAINT question_bank_technical_domain_check
CHECK (technical_domain IN ('SOFTWARE', 'MEDICINE', 'BUSINESS', 'NONE'));

-- Seed: tag existing rows with correct pillar
UPDATE public.question_bank SET pillar_type = 'EXAM_PREP' WHERE module_type IN ('IELTS', 'ICFES');
UPDATE public.question_bank SET exam_format = module_type  WHERE module_type IN ('IELTS', 'ICFES');

-- RLS for question_bank
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read questions" ON public.question_bank;
DROP POLICY IF EXISTS "Anyone can insert questions" ON public.question_bank;
DROP POLICY IF EXISTS "Anyone can update questions" ON public.question_bank;
DROP POLICY IF EXISTS "Anyone can delete questions" ON public.question_bank;
CREATE POLICY "Anyone can read questions"   ON public.question_bank FOR SELECT USING (true);
CREATE POLICY "Anyone can insert questions" ON public.question_bank FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update questions" ON public.question_bank FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete questions" ON public.question_bank FOR DELETE USING (true);

-- ============================================================
-- STEP 3: STUDENT_ANALYTICS — progress tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    time_spent_seconds INT DEFAULT 0,
    failed_attempts INT DEFAULT 0,
    success_rate DECIMAL DEFAULT 0.0,
    last_assessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_student_analytics_student ON public.student_analytics(student_id);
CREATE INDEX IF NOT EXISTS idx_student_analytics_topic   ON public.student_analytics(topic);

-- RLS for student_analytics
ALTER TABLE public.student_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own analytics"  ON public.student_analytics;
DROP POLICY IF EXISTS "Admins can manage analytics"   ON public.student_analytics;
DROP POLICY IF EXISTS "Anyone can read analytics"     ON public.student_analytics;
DROP POLICY IF EXISTS "Anyone can insert analytics"   ON public.student_analytics;
DROP POLICY IF EXISTS "Anyone can update analytics"   ON public.student_analytics;
DROP POLICY IF EXISTS "Anyone can delete analytics"   ON public.student_analytics;
CREATE POLICY "Anyone can read analytics"   ON public.student_analytics FOR SELECT USING (true);
CREATE POLICY "Anyone can insert analytics" ON public.student_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update analytics" ON public.student_analytics FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete analytics" ON public.student_analytics FOR DELETE USING (true);

-- ============================================================
-- STEP 4: IMPROVEMENT_PLANS — gamified paid plans
-- ============================================================

CREATE TABLE IF NOT EXISTS public.improvement_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.profiles(id),
    focus_topic TEXT NOT NULL,
    status TEXT DEFAULT 'ASSIGNED'
        CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED')),
    entry_cost_coins INT DEFAULT 5,
    reward_coins INT DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_improvement_plans_student ON public.improvement_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_improvement_plans_status  ON public.improvement_plans(status);

-- RLS for improvement_plans
ALTER TABLE public.improvement_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own plans" ON public.improvement_plans;
DROP POLICY IF EXISTS "Anyone can manage plans"    ON public.improvement_plans;
CREATE POLICY "Anyone can manage plans" ON public.improvement_plans FOR ALL USING (true);

-- ============================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'institutions' ORDER BY ordinal_position;
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'question_bank' ORDER BY ordinal_position;
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'student_analytics' ORDER BY ordinal_position;
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'improvement_plans' ORDER BY ordinal_position;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.institutions'::regclass;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.question_bank'::regclass;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.improvement_plans'::regclass;
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename IN ('institutions','question_bank','student_analytics','improvement_plans');
