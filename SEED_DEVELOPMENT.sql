-- ============================================================
-- SEED: Development Data (Run AFTER all migrations)
-- Creates test institutions, users, and teacher-group assignments
-- Safe: uses INSERT ... ON CONFLICT DO NOTHING
-- Run in Supabase SQL Editor (local: npx supabase start / db reset, nunca producción)
-- ============================================================

-- Guarda (ESPEC_credenciales_fuera.md, entregable 4): si ya existe un documento_id que no
-- empieza por synth_, esta base no es un entorno de semillas limpio (posible producción con
-- estudiantes reales) y la semilla aborta en vez de mezclarse con datos reales.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE documento_id NOT LIKE 'synth\_%' ESCAPE '\') THEN
    RAISE EXCEPTION 'Guarda de semilla: hay documento_id que no es synth_*. No se corre aquí (posible producción). Ver ESPEC_credenciales_fuera.md.';
  END IF;
END $$;

-- 1. Institutions
INSERT INTO public.institutions (name, subscription_plan, ai_credits_used, ai_credit_pool, active_ai_provider)
VALUES ('UIS', 'PREMIUM', 0, 100, 'chatgpt')
ON CONFLICT DO NOTHING;

INSERT INTO public.institutions (name, subscription_plan, ai_credits_used, ai_credit_pool, active_ai_provider)
VALUES ('Colegio Test', 'BASIC', 0, 10, 'chatgpt')
ON CONFLICT DO NOTHING;

-- 2. Groups
INSERT INTO public.groups (group_code) VALUES ('UIS-A1') ON CONFLICT DO NOTHING;
INSERT INTO public.groups (group_code) VALUES ('UIS-B1') ON CONFLICT DO NOTHING;
INSERT INTO public.groups (group_code) VALUES ('TEST-101') ON CONFLICT DO NOTHING;

-- 3. Admin / Teacher Users (with existence check via ON CONFLICT)
-- super_admin for UIS
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, teacher_credits)
VALUES ('synth_admin_uis', '1111', 'Admin UIS', 'super_admin', 'UIS-A1', 0, 50)
ON CONFLICT (documento_id) DO NOTHING;

-- teacher for UIS
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, teacher_credits)
VALUES ('synth_teacher_uis', '2222', 'Teacher UIS', 'teacher', 'UIS-A1', 0, 20)
ON CONFLICT (documento_id) DO NOTHING;

-- admin for Colegio Test
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, teacher_credits)
VALUES ('synth_admin_test', '3333', 'Admin Test', 'admin', 'TEST-101', 0, 10)
ON CONFLICT (documento_id) DO NOTHING;

-- Christiam (super_admin, absolute control)
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, teacher_credits)
VALUES ('synth_christiam', '1234', 'Christiam', 'super_admin', 'UIS-A1', 0, 100)
ON CONFLICT (documento_id) DO NOTHING;

-- test student
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas)
VALUES ('synth_student_test', '4444', 'Student Test', 'student', 'TEST-101', 100)
ON CONFLICT (documento_id) DO NOTHING;

-- 4. Teacher-Group Assignments
INSERT INTO public.teacher_groups (teacher_id, group_code)
SELECT p.id, 'UIS-A1'
FROM public.profiles p
WHERE p.documento_id = 'synth_teacher_uis'
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_groups tg WHERE tg.teacher_id = p.id AND tg.group_code = 'UIS-A1'
  );

INSERT INTO public.teacher_groups (teacher_id, group_code)
SELECT p.id, 'UIS-B1'
FROM public.profiles p
WHERE p.documento_id = 'synth_teacher_uis'
  AND NOT EXISTS (
    SELECT 1 FROM public.teacher_groups tg WHERE tg.teacher_id = p.id AND tg.group_code = 'UIS-B1'
  );

-- 5. Initial credit allocation (transfer 10 credits to teacher_uis)
INSERT INTO public.credit_transactions (from_institution, to_teacher, amount, note)
SELECT i.id, p.id, 10, 'Seed: initial teacher credits'
FROM public.institutions i, public.profiles p
WHERE i.name = 'UIS' AND p.documento_id = 'synth_teacher_uis'
  AND NOT EXISTS (
    SELECT 1 FROM public.credit_transactions ct WHERE ct.to_teacher = p.id AND ct.note = 'Seed: initial teacher credits'
  );

-- ============================================================
-- VERIFY:
--   SELECT documento_id, rol, teacher_credits FROM profiles WHERE documento_id IN ('synth_admin_uis','synth_teacher_uis','synth_admin_test','synth_student_test');
--   SELECT * FROM teacher_groups;
--   SELECT name, subscription_plan, ai_credit_pool FROM institutions;
-- ============================================================
