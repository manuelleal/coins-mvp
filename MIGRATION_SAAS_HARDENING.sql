-- ============================================================
-- MIGRATION: SaaS Hardening (11-Point Architecture)
-- Audit Logs, Credit Transactions, Student Coin Transactions,
-- AI Usage Logs, Unique Index, institution_id, Atomic Transfer
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    institution_id UUID,
    action_type TEXT NOT NULL,
    result TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Open access audit_logs') THEN
        EXECUTE 'CREATE POLICY "Open access audit_logs" ON public.audit_logs FOR ALL USING (true)';
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- 2. Credit Transactions (Institution → Teacher)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_institution UUID,
    to_teacher UUID,
    amount INTEGER NOT NULL CHECK (amount > 0),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'credit_transactions' AND policyname = 'Open access credit_transactions') THEN
        EXECUTE 'CREATE POLICY "Open access credit_transactions" ON public.credit_transactions FOR ALL USING (true)';
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_credit_tx_teacher ON public.credit_transactions(to_teacher);
CREATE INDEX IF NOT EXISTS idx_credit_tx_inst ON public.credit_transactions(from_institution);

-- 3. Student Coin Transactions (Ledger)
CREATE TABLE IF NOT EXISTS public.student_coin_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID,
    amount INTEGER NOT NULL,
    reason TEXT,
    balance_after INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.student_coin_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_coin_transactions' AND policyname = 'Open access student_coin_transactions') THEN
        EXECUTE 'CREATE POLICY "Open access student_coin_transactions" ON public.student_coin_transactions FOR ALL USING (true)';
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_coin_tx_student ON public.student_coin_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_coin_tx_created ON public.student_coin_transactions(created_at DESC);

-- 4. AI Usage Logs
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    institution_id UUID,
    provider TEXT,
    model TEXT,
    tokens_used INTEGER DEFAULT 0,
    cefr_level TEXT,
    skill TEXT,
    topic TEXT,
    credits_charged INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage_logs' AND policyname = 'Open access ai_usage_logs') THEN
        EXECUTE 'CREATE POLICY "Open access ai_usage_logs" ON public.ai_usage_logs FOR ALL USING (true)';
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_inst ON public.ai_usage_logs(institution_id);

-- 5. Unique index on documento_id (prevent duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_documento ON public.profiles(documento_id);

-- 6. Add institution_id to profiles (nullable, forward-compatible)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS institution_id UUID;

-- 7. Atomic credit transfer function
CREATE OR REPLACE FUNCTION transfer_credits_atomic(
    p_institution_id UUID,
    p_teacher_id UUID,
    p_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_pool INTEGER;
    v_used INTEGER;
    v_teacher_credits INTEGER;
    v_new_pool_used INTEGER;
    v_new_teacher_credits INTEGER;
BEGIN
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Amount must be positive');
    END IF;

    -- Lock institution row
    SELECT COALESCE(ai_credits_used, 0), COALESCE(ai_credit_pool, 10)
    INTO v_used, v_pool
    FROM public.institutions
    WHERE id = p_institution_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Institution not found');
    END IF;

    IF (v_pool - v_used) < p_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Insufficient institution credits',
            'available', v_pool - v_used, 'requested', p_amount);
    END IF;

    -- Lock teacher row
    SELECT COALESCE(teacher_credits, 0)
    INTO v_teacher_credits
    FROM public.profiles
    WHERE id = p_teacher_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Teacher not found');
    END IF;

    v_new_pool_used := v_used + p_amount;
    v_new_teacher_credits := v_teacher_credits + p_amount;

    -- Deduct from institution
    UPDATE public.institutions
    SET ai_credits_used = v_new_pool_used
    WHERE id = p_institution_id;

    -- Add to teacher
    UPDATE public.profiles
    SET teacher_credits = v_new_teacher_credits
    WHERE id = p_teacher_id;

    -- Record transaction
    INSERT INTO public.credit_transactions (from_institution, to_teacher, amount, note)
    VALUES (p_institution_id, p_teacher_id, p_amount, 'Atomic transfer via transfer_credits_atomic');

    -- Audit
    INSERT INTO public.audit_logs (user_id, institution_id, action_type, result, metadata)
    VALUES (p_teacher_id, p_institution_id, 'CREDIT_TRANSFER', 'SUCCESS',
        jsonb_build_object('amount', p_amount, 'new_teacher_credits', v_new_teacher_credits,
            'new_pool_used', v_new_pool_used));

    RETURN jsonb_build_object('ok', true, 'new_teacher_credits', v_new_teacher_credits,
        'new_pool_used', v_new_pool_used, 'transferred', p_amount);
END;
$$;

-- ============================================================
-- VERIFY:
--   SELECT * FROM information_schema.tables WHERE table_name IN ('audit_logs','credit_transactions','student_coin_transactions','ai_usage_logs');
--   SELECT indexname FROM pg_indexes WHERE tablename = 'profiles' AND indexname = 'idx_unique_documento';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'institution_id';
--   SELECT proname FROM pg_proc WHERE proname = 'transfer_credits_atomic';
-- ============================================================
