# Supabase: tablas para Lingo-Coins v2

## Tu tabla ya está soportada

Si creaste `attendance` con **student_id** como `text` referenciando `profiles(documento_id)` (y `group_code` referenciando `groups(group_code)`), la app ya está adaptada a esa estructura. No necesitas cambiar nada en Supabase.

---

## Alternativa: tabla con student_id = UUID

Si prefieres usar el UUID del perfil en lugar de documento_id, puedes usar esta definición en el SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_code TEXT NOT NULL,
  attendance_date DATE NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read attendance" ON attendance FOR SELECT USING (true);
CREATE POLICY "Allow insert attendance" ON attendance FOR INSERT WITH CHECK (true);
```

(En ese caso habría que volver a usar `user.id` en lugar de `user.documento_id` en la app.)
