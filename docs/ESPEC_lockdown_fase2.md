# ESPEC · Fase 2: cierre de RLS y RPC `SECURITY DEFINER`

H-2/3/4/5 (límite H-7) · `seg/fase0` · Creador (Opus), 2026-09-24 · preregistro sobre el arnés `f5927b3`.

## Problema (dos líneas)
Con la anon key se leen `pin` y `correct_answer`, se escriben `monedas` y se fabrican entregas (E1-E4 en verde).
Cerrar sin otra puerta rompe la app; si la puerta es un RPC abierto, el hueco solo se muda.

## Qué cambia (una cosa)
El navegador deja de tocar **directamente** columnas y tablas sensibles; lo que la app necesita pasa a un RPC con la regla de negocio en el servidor.

- `MIGRATION_SECURITY_PHASE2_LOCKDOWN.sql`: idempotente (`DROP POLICY IF EXISTS`, `CREATE OR REPLACE`), una sección por lote.
- `ROLLBACK_PHASE2_LOCKDOWN.sql`, en orden inverso: restaura políticas y grants originales y borra los RPC nuevos. Lo enlaza `ROLLBACK_NOTES.md`.
- Va al final de `ORDEN` en `tools/armar_esquema.js`, probado con `db reset` (ERR-4).
- Todo RPC nuevo: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO anon`.

## Lotes (un lote = un commit)
Si cambia el cliente, dos commits: **a** = RPC y app, sin revocar (F verde, exploit verde); **b** = `REVOKE`/`DROP` (exploit rojo). Ningún commit deja la app rota.

| Lote | Qué | Rojo | Tramposo (revive su exploit) |
|---|---|---|---|
| L0 | Solo tests: F, G, E5-E7, R1-R4 y snapshot de `pg_policies` y `column_privileges` | — | — |
| L1 | Grupo A: `DROP`; `get_coin_ledger` para `admin.html:681`; `REVOKE EXECUTE` de `_coin_log_delta` y `coin_backfill_opening_balances`; `search_path` fijo en los definer | E6 | recrear `open` en `coin_ledger` |
| L2a/b | `get_challenge_questions`, `submit_challenge_answer` y columnas explícitas en los 6 `select('*')` de `english_challenges`; luego `REVOKE SELECT (correct_answer)` y `DROP` de la política abierta | E3 | re-`GRANT` y recrear la política |
| L3 | `REVOKE INSERT, UPDATE ON completed_challenges FROM anon` | E4 | `GRANT INSERT` |
| L4a/b | Columnas explícitas en los 4 `select('*')` de `profiles` (`app.js:1652,1667,4541`, `teacher.html:1453`); `institutions.js:151` usa `change_own_pin`; `teacher.html:1660` sin `pin`; luego `REVOKE SELECT (pin, pin_hash)`. **Requiere** el login con `verify_login` | E1 | `GRANT SELECT (pin)` |
| L5a/b | `move_coins` reemplaza las ~20 escrituras de `monedas` (`app.js`, `teacher.html`, `modules/`); luego `REVOKE UPDATE (monedas, coin_pocket, coin_budget)` | E2 | `GRANT UPDATE (monedas)` |
| L6a/b | `register_student`; luego `REVOKE INSERT ON profiles` | E5 | `GRANT INSERT` |
| L7a/b | `list_institutions_safe` (la app la llama en 4 sitios; no existe); luego `DROP` de `"Anyone can read institutions"` y `REVOKE SELECT (api_key, active_ai_key)`. **Espera D2** | E7 | recrear la política |

**Exploits nuevos:** E5, anon crea un profile `super_admin`; E6, anon lee `coin_wallets` o escribe `coin_ledger`; E7, anon lee `api_key`.

## Por tabla

**Grupo A: la app no las usa; anon queda sin acceso**

| Tabla | Se quita | Queda |
|---|---|---|
| `question_bank`, `student_analytics`, `coin_wallets`, `coin_backfill_runs` | `"Anyone can …"` y `open` | nada |
| `coin_ledger` | `open` | lectura por `get_coin_ledger(p_institution_id uuid, p_limit int default 20) returns table(created_at, amount, action, metadata)` |

**Grupo B: flujo del estudiante.** En las tres tablas base la RLS está apagada: la barrera son los `GRANT` por columna.

| Tabla | Se quita | Queda | RPC |
|---|---|---|---|
| `english_challenges`, `challenge_questions` | `SELECT (correct_answer)`; la política abierta de `challenge_questions` | `english_challenges`: el resto de columnas | `get_challenge_questions(p_challenge_id uuid) returns table(id, question_type, question_text, options_json, order_index)` |
| `completed_challenges` | `INSERT`, `UPDATE` | `SELECT` | `submit_challenge_answer(p_challenge_id uuid, p_student_doc text, p_answer jsonb) returns jsonb` (`is_correct`, `coins_awarded`, `position`, `correct_answers`). Replica en el servidor las reglas de `app.js:2790-2910`; la correcta llega **después** de responder |
| `profiles` | `SELECT (pin, pin_hash)`; `UPDATE (monedas, coin_pocket, coin_budget)`; `INSERT` | el resto de columnas | `verify_login` (ya existe); `change_own_pin(p_doc text, p_old_pin text, p_new_pin text) returns boolean`; `register_student(p_doc text, p_nombre text, p_pin text, p_grupo text, p_institution_id uuid) returns uuid` (fuerza `rol='student'` y `monedas=0`); `move_coins(p_from uuid, p_to uuid, p_amount int, p_reason text) returns jsonb` (`p_from` obligatorio y saldo suficiente: el navegador no crea monedas) |
| `institutions` | `"Anyone can read"`; `SELECT (api_key, active_ai_key)` | — | `list_institutions_safe() returns table(id uuid, name text, subscription_plan text, is_suspended boolean)` |

**Grupo C: escrituras de docente o admin; esta fase NO las cierra** (Límites, D1): `teacher_groups`, `institution_credit_history`, `improvement_plans`, `teacher_rewards`, `challenge_sessions`, `student_progress`; las escrituras de `institutions`, `challenge_questions` y `english_challenges`; `UPDATE (rol, pin, institution_id, teacher_credits)` en `profiles`. `attendance*` tampoco: sin migración, estado real desconocido.

## Criterio medible
1. `db reset` aplica las 12 migraciones sin error; aplicar la fase 2 dos veces deja el mismo snapshot.
2. **E1-E4 en rojo**, E5-E7 en rojo y **C0 sigue denegado** (401/403, `42501`).
3. **Un test F por RPC** (7), en verde: llama con la anon key y comprueba el efecto con la service key. F-questions exige además 0 filas con `correct_answer`.
4. **G (identidad):** `evaluateChallengeSubmission` (`app.js`) y `submit_challenge_answer` dan el mismo `is_correct` en el 100 % de un fixture con ≥2 casos por tipo de pregunta.
5. `pg_policies` da 0 filas con `qual='true'` o `with_check='true'` en el Grupo A y en `challenge_questions` (`institutions`, al cerrar el Grupo C).
6. `has_column_privilege('anon', …, 'SELECT')` = `false` en `pin`, `pin_hash`, los dos `correct_answer` y `api_key`.
7. Con el rollback, E1-E7 vuelven a verde y el snapshot es idéntico al de L0.
8. **R1-R4 siguen en verde y se reportan como tales.**

**Falló si:** un exploit sigue verde tras su lote b, cae un F o G, se abre C0, el rollback no reproduce el snapshot o un tramposo no revive su exploit.

## Humo
`node tests/fase2/humo.js`: un `submit_challenge_answer` correcto de un `synth_` escribe `resultados/fase2_humo.json` (`is_correct`, `coins_awarded`, filas nuevas del ledger, estado de E3). Sin él no hay corrida grande.

## Réplica
Semilla B, sin tocar código, con el mismo criterio; G usa las preguntas de B.

## Qué NO se toca
Las 10 `MIGRATION_*.sql` (SHA-256); `verify_login` y el login (su propia espec); Fase 1 y C0; Grupo C; la UI salvo lo declarado; producción (ni `link` ni `db push`).

## Límites (H-7): lo que la fase 2 NO puede arreglar
Con **una sola** anon key, un RPC no sabe **quién** llama. Siguen abiertos (tests R en verde):
- **R1:** anon responde `submit_challenge_answer` con el documento de otro estudiante y le gasta los intentos.
- **R2:** anon llama `move_coins` (o `coin_transfer`) del bolsillo de un docente al suyo: el total se conserva, el robo no se impide.
- **R3:** fuerza bruta sobre `verify_login`, sin límite de intentos en el servidor.
- **R4:** el Grupo C sigue escribible. Moverlo a un RPC sin identificar al actor no da **ninguna** seguridad.

**Sí se logra:** PIN, respuestas y `api_key` dejan de leerse; calificación y premio se deciden en el servidor; el navegador no crea monedas ni cuentas con rol elevado.

**Lo que rompe la app:**
- **L4:** el docente deja de ver el PIN de sus estudiantes (`teacher.html:1660`).
- **L5:** el ajuste manual de monedas del admin (`users.js:325`, `school.html:650`) crea monedas: sin D1, se cae.
- **L7:** la IA del docente lee `active_ai_key` en el navegador (`teacher.html:2857`): se cae (D2).
- **Sin verificar:** `transfer_credits_atomic` (invoker) escribe en `credit_transactions`, cerrada en la Fase 1: quizá ya está rota.

Cerrar R1-R4 exige identidad: el backend (decisión 002, fase B) o D1.

## Necesita el sí de Christiam
- **Aplicar en producción, siempre**, tras un respaldo probado al restaurar, una captura en solo lectura de `pg_policies` y grants reales (la base local es hipótesis) y la rotación de PIN (H-8/9/10).
- **D1:** ¿los RPC de docente y admin exigen el PIN del actor (`p_actor_doc`, `p_actor_pin`)? Sí: el Grupo C entra como fase 2b. No: espera al backend.
- **D2:** ¿cerrar `api_key` aunque la IA del docente quede apagada hasta tener un proxy?

## Candidatos a ERR
- La auditoría suponía que "DROP más RPC" cerraba H-5: sin identidad, falso.
- La app llama `list_institutions_safe` y `get_institution_ai_config_safe`, y ninguna migración las define.
- **Después:** las monedas al azar (1-15) chocan con la constitución de ENGRAMA; se replican por regresión.
