-- ============================================================
-- MIGRATION: challenge_questions table + rich fields on english_challenges
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add rich metadata columns to english_challenges (safe if they already exist)
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS cefr_level TEXT;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS skill TEXT;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS specific_instructions TEXT;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.english_challenges ADD COLUMN IF NOT EXISTS institution_id UUID;

-- 2. Ensure challenge_questions table exists
CREATE TABLE IF NOT EXISTS public.challenge_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID REFERENCES public.english_challenges(id) ON DELETE CASCADE,
  question_type VARCHAR NOT NULL,
  question_text TEXT NOT NULL,
  options_json JSONB,
  correct_answer TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_challenge_questions_challenge
  ON public.challenge_questions(challenge_id);

-- 4. RLS for challenge_questions
ALTER TABLE public.challenge_questions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'challenge_questions'
      AND policyname = 'Open access challenge_questions'
  ) THEN
    EXECUTE 'CREATE POLICY "Open access challenge_questions" ON public.challenge_questions FOR ALL USING (true)';
  END IF;
END $$;

-- ============================================================
-- VERIFY:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'english_challenges' ORDER BY ordinal_position;
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'challenge_questions' ORDER BY ordinal_position;
-- ============================================================
