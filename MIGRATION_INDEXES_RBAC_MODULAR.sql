CREATE INDEX IF NOT EXISTS idx_profiles_rol
  ON public.profiles(rol);

CREATE INDEX IF NOT EXISTS idx_profiles_grupo
  ON public.profiles(grupo);

CREATE INDEX IF NOT EXISTS idx_profiles_institution
  ON public.profiles(institution_id);

CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON public.profiles(is_active);

CREATE INDEX IF NOT EXISTS idx_teacher_groups_teacher
  ON public.teacher_groups(teacher_id);
