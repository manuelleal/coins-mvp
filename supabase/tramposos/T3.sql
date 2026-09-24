-- TRAMPOSO T3 - cierra SOLO el hueco E3 (anon lee correct_answer).
-- REVOKE de la columna correct_answer en las dos tablas que la exponen:
-- challenge_questions y english_challenges. Tras aplicarlo, EXACTAMENTE E3 rojo.
-- `supabase db reset` restaura la base.

-- challenge_questions: dejar todo menos correct_answer
revoke select on public.challenge_questions from anon;
grant select (
  id, challenge_id, question_type, question_text, options_json,
  order_index, created_at
) on public.challenge_questions to anon;

-- english_challenges: dejar todo menos correct_answer
revoke select on public.english_challenges from anon;
grant select (
  id, title, question_text, options_json, group_code, is_active, status,
  current_winners, max_winners, created_by, created_at,
  cefr_level, skill, skill_type, topic, specific_instructions,
  xp_reward, coins_reward, max_attempts, institution_id
) on public.english_challenges to anon;
