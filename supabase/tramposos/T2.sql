-- TRAMPOSO T2 - cierra SOLO el hueco E2 (anon hace PATCH de monedas en profiles).
-- REVOKE UPDATE en profiles para anon. Tras aplicarlo, EXACTAMENTE E2 rojo.
-- `supabase db reset` restaura la base.
revoke update on public.profiles from anon;
