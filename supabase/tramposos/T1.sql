-- TRAMPOSO T1 - cierra SOLO el hueco E1 (lectura de pin/pin_hash por anon).
-- REVOKE SELECT en profiles y GRANT SELECT de todas las columnas MENOS
-- pin y pin_hash. Tras aplicarlo, EXACTAMENTE E1 debe ponerse rojo.
-- Un `supabase db reset` restaura la base (anon vuelve a tener SELECT total).
revoke select on public.profiles from anon;
grant select (
  id, documento_id, nombre_completo, rol, grupo, monedas,
  coin_pocket, coin_budget, current_streak, created_at,
  teacher_credits, force_password_reset, account_locked, is_active,
  last_login_at, xp, level, longest_streak, institution_id
) on public.profiles to anon;
