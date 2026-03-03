-- ============================================================
-- MIGRATION: AUTH PIN HASH + VERIFY_LOGIN RPC
-- Purpose:
--   1) Add pin_hash to profiles.
--   2) Backfill pin_hash from legacy pin (plaintext) values.
--   3) Keep pin_hash synchronized when pin changes.
--   4) Expose RPC verify_login(documento_id, pin) for frontend login.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Backfill missing hashes from legacy plaintext PIN values.
UPDATE public.profiles
SET pin_hash = crypt(pin, gen_salt('bf', 10))
WHERE (pin_hash IS NULL OR pin_hash = '')
  AND pin IS NOT NULL
  AND btrim(pin) <> '';

CREATE OR REPLACE FUNCTION public.trg_profiles_sync_pin_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.pin IS DISTINCT FROM OLD.pin THEN
    IF NEW.pin IS NULL OR btrim(NEW.pin) = '' THEN
      NEW.pin_hash := NULL;
    ELSE
      NEW.pin_hash := crypt(NEW.pin, gen_salt('bf', 10));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_pin_hash ON public.profiles;
CREATE TRIGGER trg_profiles_sync_pin_hash
BEFORE INSERT OR UPDATE OF pin ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_profiles_sync_pin_hash();

-- RPC used by frontend. Returns a single profile row only when PIN is valid.
CREATE OR REPLACE FUNCTION public.verify_login(
  p_documento_id TEXT,
  p_pin TEXT
)
RETURNS TABLE (
  id UUID,
  rol TEXT,
  documento_id TEXT,
  nombre_completo TEXT,
  grupo TEXT,
  institution_id UUID,
  is_active BOOLEAN,
  account_locked BOOLEAN,
  force_password_reset BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_pin_hash TEXT;
  v_pin TEXT;
BEGIN
  IF p_documento_id IS NULL OR btrim(p_documento_id) = '' THEN
    RETURN;
  END IF;
  IF p_pin IS NULL OR btrim(p_pin) = '' THEN
    RETURN;
  END IF;

  SELECT p.id, p.pin_hash, p.pin
    INTO v_id, v_pin_hash, v_pin
  FROM public.profiles p
  WHERE lower(btrim(p.documento_id)) = lower(btrim(p_documento_id))
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  -- Preferred path: hashed verification
  IF v_pin_hash IS NOT NULL AND v_pin_hash <> '' THEN
    IF v_pin_hash = crypt(p_pin, v_pin_hash) THEN
      RETURN QUERY
      SELECT p.id, p.rol, p.documento_id, p.nombre_completo, p.grupo, p.institution_id, p.is_active, p.account_locked, p.force_password_reset
      FROM public.profiles p
      WHERE p.id = v_id
      LIMIT 1;
    END IF;
    RETURN;
  END IF;

  -- Legacy compatibility path (plaintext pin), with automatic one-time upgrade.
  IF v_pin IS NOT NULL AND v_pin = p_pin THEN
    UPDATE public.profiles
    SET pin_hash = crypt(p_pin, gen_salt('bf', 10))
    WHERE id = v_id
      AND (pin_hash IS NULL OR pin_hash = '');

    RETURN QUERY
    SELECT p.id, p.rol, p.documento_id, p.nombre_completo, p.grupo, p.institution_id, p.is_active, p.account_locked, p.force_password_reset
    FROM public.profiles p
    WHERE p.id = v_id
    LIMIT 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_login(TEXT, TEXT) TO authenticated;

-- ============================================================
-- VERIFY
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='profiles' AND column_name='pin_hash';
--
-- SELECT * FROM public.verify_login('test_doc', '1234');
-- ============================================================
