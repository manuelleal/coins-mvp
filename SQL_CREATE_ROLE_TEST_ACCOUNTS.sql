-- ============================================================
-- Create 4 role test accounts (idempotent)
-- Requirements:
-- 1) super_admin  doc=99999991 pin=1111
-- 2) school_admin doc=99999992 pin=2222 institution_id=(first institution)
-- 3) teacher      doc=99999993 pin=3333 institution_id=(first institution)
-- 4) student      doc=99999994 pin=4444 grupo=(first group)
-- ============================================================

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
SELECT '99999991', '1111', 'Super Admin Test', 'super_admin', NULL, 0, (SELECT id FROM first_institution)
ON CONFLICT (documento_id) DO NOTHING;

WITH first_institution AS (
    SELECT id
    FROM public.institutions
    ORDER BY created_at NULLS LAST, id
    LIMIT 1
)
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, institution_id)
SELECT '99999992', '2222', 'School Admin Test', 'admin', NULL, 0, (SELECT id FROM first_institution)
ON CONFLICT (documento_id) DO NOTHING;

WITH first_institution AS (
    SELECT id
    FROM public.institutions
    ORDER BY created_at NULLS LAST, id
    LIMIT 1
)
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas, institution_id)
SELECT '99999993', '3333', 'Teacher Test', 'teacher', NULL, 0, (SELECT id FROM first_institution)
ON CONFLICT (documento_id) DO NOTHING;

WITH first_group AS (
    SELECT group_code
    FROM public.groups
    ORDER BY group_code
    LIMIT 1
)
INSERT INTO public.profiles (documento_id, pin, nombre_completo, rol, grupo, monedas)
SELECT '99999994', '4444', 'Student Test', 'student', (SELECT group_code FROM first_group), 0
ON CONFLICT (documento_id) DO NOTHING;

-- Optional verification
-- SELECT documento_id, nombre_completo, rol, grupo, institution_id
-- FROM public.profiles
-- WHERE documento_id IN ('99999991','99999992','99999993','99999994')
-- ORDER BY documento_id;
