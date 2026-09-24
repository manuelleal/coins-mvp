-- TRAMPOSO T4 - cierra SOLO el hueco E4 (anon inserta filas fabricadas en
-- completed_challenges). REVOKE INSERT para anon. Tras aplicarlo, E4 rojo.
-- `supabase db reset` restaura la base.
revoke insert on public.completed_challenges from anon;
