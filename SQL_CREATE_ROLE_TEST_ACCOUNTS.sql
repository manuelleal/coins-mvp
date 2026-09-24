-- ============================================================
-- Create 4 role test accounts (idempotent)
-- Requirements:
-- 1) super_admin  doc=synth_99999991 pin=1111
-- 2) school_admin doc=synth_99999992 pin=2222 institution_id=(first institution)
-- 3) teacher      doc=synth_99999993 pin=3333 institution_id=(first institution)
-- 4) student      doc=synth_99999994 pin=4444 grupo=(first group)
-- ============================================================

-- Guarda (ESPEC_credenciales_fuera.md, entregable 4): si ya existe un documento_id que no
-- empieza por synth_, esta base no es un entorno de semillas limpio (posible producción con
-- estudiantes reales) y este script aborta en vez de mezclarse con datos reales.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE documento_id NOT LIKE 'synth\_%' ESCAPE '\') THEN
    RAISE EXCEPTION 'Guarda de semilla: hay documento_id que no es synth_*. No se corre aquí (posible producción). Ver ESPEC_credenciales_fuera.md.';
  END IF;
END $$;

WITH first_institution AS (
    SELECT id
    FROM public.institutions
    ORDER BY created_at NULLS LAST, id
    LIMIT 1
), first_group AS (
    SELECT group_code
    FROM public.groups
    ORDER BY group_code
    LIMIT 1
)
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, institution_id)
SELECT 'synth_99999991', '1111', 'Super Admin Test', 'super_admin', NULL, 0, (SELECT id FROM first_institution)
ON CONFLICT (documento_id) DO NOTHING;

WITH first_institution AS (
    SELECT id
    FROM public.institutions
    ORDER BY created_at NULLS LAST, id
    LIMIT 1
)
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, institution_id)
SELECT 'synth_99999992', '2222', 'School Admin Test', 'admin', NULL, 0, (SELECT id FROM first_institution)
ON CONFLICT (documento_id) DO NOTHING;

WITH first_institution AS (
    SELECT id
    FROM public.institutions
    ORDER BY created_at NULLS LAST, id
    LIMIT 1
)
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, institution_id)
SELECT 'synth_99999993', '3333', 'Teacher Test', 'teacher', NULL, 0, (SELECT id FROM first_institution)
ON CONFLICT (documento_id) DO NOTHING;

WITH first_group AS (
    SELECT group_code
    FROM public.groups
    ORDER BY group_code
    LIMIT 1
)
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas)
SELECT 'synth_99999994', '4444', 'Student Test', 'student', (SELECT group_code FROM first_group), 0
ON CONFLICT (documento_id) DO NOTHING;

-- Optional verification
-- SELECT documento_id, nombre_completo, rol, grupo, institution_id
-- FROM public.profiles
-- WHERE documento_id IN ('synth_99999991','synth_99999992','synth_99999993','synth_99999994')
-- ORDER BY documento_id;
