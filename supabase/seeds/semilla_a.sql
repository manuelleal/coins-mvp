-- ============================================================
-- SEMILLA A - solo datos sinteticos (synth_*)
-- 1 institucion, 2 grupos, super_admin, admin, teacher y 3 estudiantes.
-- Uno de los estudiantes es *legacy*: tiene pin en claro pero pin_hash NULL,
-- porque un UPDATE de una columna que NO es pin no dispara el trigger
-- trg_profiles_sync_pin_hash (BEFORE UPDATE OF pin). Ademas 1 reto con 2
-- challenge_questions.
--
-- GUARDA: si existe algun documento_id que no empiece por 'synth_', aborta.
-- Asi la semilla NUNCA corre sobre datos reales (produccion).
-- ============================================================

do $$
begin
  if exists (
    select 1 from public.profiles
    where documento_id is null or documento_id not like 'synth\_%'
  ) then
    raise exception 'GUARDA: hay profiles no sinteticos (documento_id sin prefijo synth_). Semilla abortada.';
  end if;
end $$;

-- ---- Institucion ----
insert into public.institutions (id, name, subscription_plan)
values ('a0000000-0000-4000-8000-000000000001', 'synth Institucion A', 'PRO')
on conflict (id) do nothing;

-- ---- Grupos ----
insert into public.groups (group_code, institution_id, max_capacity)
values
  ('SYNTH-A1', 'a0000000-0000-4000-8000-000000000001', 30),
  ('SYNTH-A2', 'a0000000-0000-4000-8000-000000000001', 25)
on conflict (group_code) do nothing;

-- ---- Perfiles (el trigger de INSERT calcula pin_hash desde pin) ----
insert into public.profiles (id, documento_id, pin, nombre_completo, rol, grupo, monedas, institution_id)
values
  ('a1000000-0000-4000-8000-000000000001', 'synth_super_a',   '1111', 'synth Super A',   'super_admin', null,       0,   'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002', 'synth_admin_a',   '2222', 'synth Admin A',   'admin',       null,       0,   'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000003', 'synth_teacher_a', '3333', 'synth Teacher A', 'teacher',     'SYNTH-A1', 0,   'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000004', 'synth_stu_a1',    '4444', 'synth Estu A1',   'student',     'SYNTH-A1', 120, 'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000005', 'synth_stu_a2',    '5555', 'synth Estu A2',   'student',     'SYNTH-A2', 340, 'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000006', 'synth_legacy_a',  '6666', 'synth Legacy A',  'student',     'SYNTH-A1', 50,  'a0000000-0000-4000-8000-000000000001')
on conflict (documento_id) do nothing;

-- ---- Legacy: dejar pin_hash en NULL sin tocar la columna pin ----
-- (este UPDATE no es de la columna pin, asi que el trigger no salta)
update public.profiles
set pin_hash = null
where documento_id = 'synth_legacy_a';

-- ---- Reto + preguntas ----
insert into public.english_challenges (id, title, question_text, correct_answer, is_active, status)
values ('a2000000-0000-4000-8000-000000000001', 'synth Reto A', 'Choose the correct greeting', 'Hello', true, 'active')
on conflict (id) do nothing;

insert into public.challenge_questions (id, challenge_id, question_type, question_text, options_json, correct_answer, order_index)
values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'multiple_choice', 'Pick the greeting', '["Hello","Bye"]'::jsonb, 'Hello', 0),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'multiple_choice', 'Pick the farewell', '["Hello","Goodbye"]'::jsonb, 'Goodbye', 1)
on conflict (id) do nothing;
