-- ============================================================
-- SEMILLA B - la replica (entradas nuevas, mismo veredicto esperado)
-- 2 instituciones, 5 estudiantes con PIN de 6 digitos. El *legacy* aqui es
-- un teacher (pin en claro, pin_hash NULL). Cambian UUID, nombres y respuestas.
-- Se aplica a mano con psql tras `db reset --no-seed`.
--
-- GUARDA identica: aborta si hay documento_id sin prefijo synth_.
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

-- ---- Instituciones ----
insert into public.institutions (id, name, subscription_plan)
values
  ('b0000000-0000-4000-8000-000000000001', 'synth Institucion B1', 'BASIC'),
  ('b0000000-0000-4000-8000-000000000002', 'synth Institucion B2', 'PREMIUM')
on conflict (id) do nothing;

-- ---- Grupos ----
insert into public.groups (group_code, institution_id, max_capacity)
values
  ('SYNTH-B1', 'b0000000-0000-4000-8000-000000000001', 40),
  ('SYNTH-B2', 'b0000000-0000-4000-8000-000000000002', 20)
on conflict (group_code) do nothing;

-- ---- Perfiles (PIN de 6 digitos) ----
insert into public.profiles (id, documento_id, pin, nombre_completo, rol, grupo, monedas, institution_id)
values
  ('b1000000-0000-4000-8000-000000000001', 'synth_super_b',   '100001', 'synth Super B',   'super_admin', null,       0,   'b0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000002', 'synth_admin_b',   '100002', 'synth Admin B',   'admin',       null,       0,   'b0000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000003', 'synth_teach_b',   '100003', 'synth Teacher B', 'teacher',     'SYNTH-B1', 0,   'b0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000004', 'synth_stu_b1',    '100004', 'synth Estu B1',   'student',     'SYNTH-B1', 15,  'b0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000005', 'synth_stu_b2',    '100005', 'synth Estu B2',   'student',     'SYNTH-B1', 275, 'b0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000006', 'synth_stu_b3',    '100006', 'synth Estu B3',   'student',     'SYNTH-B2', 88,  'b0000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000007', 'synth_stu_b4',    '100007', 'synth Estu B4',   'student',     'SYNTH-B2', 410, 'b0000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000008', 'synth_stu_b5',    '100008', 'synth Estu B5',   'student',     'SYNTH-B2', 33,  'b0000000-0000-4000-8000-000000000002')
on conflict (documento_id) do nothing;

-- ---- Legacy = un teacher: pin_hash NULL sin tocar la columna pin ----
update public.profiles
set pin_hash = null
where documento_id = 'synth_teach_b';

-- ---- Reto + preguntas (respuestas distintas a la semilla A) ----
insert into public.english_challenges (id, title, question_text, correct_answer, is_active, status)
values ('b2000000-0000-4000-8000-000000000001', 'synth Reto B', 'Choose the correct farewell', 'See you', true, 'active')
on conflict (id) do nothing;

insert into public.challenge_questions (id, challenge_id, question_type, question_text, options_json, correct_answer, order_index)
values
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'multiple_choice', 'Pick the farewell', '["See you","Welcome"]'::jsonb, 'See you', 0),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'multiple_choice', 'Pick the question word', '["Where","Table"]'::jsonb, 'Where', 1)
on conflict (id) do nothing;
