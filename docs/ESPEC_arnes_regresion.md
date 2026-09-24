# ESPEC · Arnés local y tests de exploit (Fase 0)

H-12 (documenta H-2/3/4) · `seg/fase0` · Creador (Opus), 2026-09-24 · preregistro.

## Problema (dos líneas)
Sin tests ni esquema reproducible, ningún parche prueba que cerró un hueco sin romper nada.
Y 12 tablas que usa `app.js` no tienen migración.

## Qué cambia (una cosa)
Nace un arnés local: Supabase en Docker, el esquema reconstruido, semillas sintéticas y 4 exploits que **pasan mientras el hueco existe**. La app no cambia.

## Piezas
| Archivo | Qué hace |
|---|---|
| `supabase/config.toml` | Sale de `npx supabase init` (`project_id = "coins-mvp"`, API 54321, DB 54322). |
| `supabase/esquema/00_base_inferida_HIPOTESIS.sql` | Las 12 tablas sin migración. |
| `tools/armar_esquema.js` | Copia byte a byte la base y las 10 `MIGRATION_*.sql` a `supabase/migrations/` (ignorada en git), en el orden de abajo, y verifica el SHA-256 de cada copia contra su original. |
| `supabase/seeds/semilla_a.sql` · `semilla_b.sql` | Solo `synth_*`, con la guarda de `ESPEC_credenciales_fuera.md`. |
| `tests/lib/supabase_local.js` | Lee `API_URL`, `ANON_KEY` y `SERVICE_ROLE_KEY` de `npx supabase status -o env` al correr y nunca los escribe. **Aborta si la URL no es `127.0.0.1` o `localhost`.** |
| `tests/exploits/exploits.test.js` · `humo.js` · `supabase/tramposos/T1..T4.sql` | `node:test` + `fetch`, sin dependencias. |

## Tablas sin migración: HIPÓTESIS
`profiles`, `groups`, `english_challenges`, `auctions`, `auction_bids`, `announcements`, `attendance`, `attendance_sessions`, `completed_challenges`, `student_inventory`, `feedback_messages` y `billing_claims`.

La tabla de "submissions" es en realidad `completed_challenges` (`app.js:29`).

**Columnas** (cada una con `-- evidencia: archivo:línea`): claves de `.insert/.update`, listas de `.select('a,b')` y `.eq/.order/.in` en `app.js` y `modules/`; `attendance` sale de `SUPABASE_SETUP.md:14`. Lo que agrega un `ALTER … ADD COLUMN` no se repite.

**Tipos:** `id uuid default gen_random_uuid()`; `documento_id text UNIQUE` (el seed usa `ON CONFLICT (documento_id)`); `pin text`; `monedas integer default 0`; `completed_challenges.student_id text`, que guarda el documento (`app.js:2882`); fechas `timestamptz default now()`.

**Permisos:** RLS desactivada en las 12. Es lo mínimo que explica que la app funcione con la anon key haciendo `select('*')` y `update` sobre `profiles` (`app.js:1663-1676`, `1315-1328`). **No** prueba `pg_policies` de producción; eso va después, con el sí de Christiam.

## Orden de migraciones: HIPÓTESIS
8 de 10 entraron en el mismo commit (`e5e2634`); el `git log` no define el orden. Por dependencia:

1. base
2. `SAAS_AI_ANALYTICS` (crea `institutions`)
3. `FINAL_SAAS_ARCHITECTURE`
4. `GOD_MODE_RBAC`
5. `SUPER_ADMIN_REDESIGN_FINAL`
6. `SAAS_HARDENING`
7. `INDEXES_RBAC_MODULAR`
8. `COIN_WALLETS_LEDGER`
9. `SECURITY_PHASE1_LOCKDOWN`
10. `AUTH_PIN_HASH_VERIFY_LOGIN`
11. `CHALLENGE_QUESTIONS_RICHFIELDS`

Si una falla, **no se edita**: se anota y lo que falte va a la base, con evidencia.

## Semillas
- **A:** 1 institución, 2 grupos, un super_admin, un admin, un teacher y 3 estudiantes. Uno de los estudiantes es *legacy*: `pin_hash` queda en NULL por un `UPDATE` posterior, porque el trigger solo salta con `UPDATE OF pin`. Además, 1 reto con 2 `challenge_questions`.
- **B:** 2 instituciones y 5 estudiantes con PIN de 6 dígitos. El legacy es un teacher, y cambian los UUID, los nombres y las respuestas.

Los tests eligen filas con la service key: no conocen la semilla.

## Exploits (verde = el hueco existe)
| # | Como anon… | Pasa si |
|---|---|---|
| E1 (H-1/H-2) | `GET profiles?select=pin,pin_hash&id=eq.<x>` | 200 y el `pin` coincide con el que ve la service key |
| E2 (H-3) | `PATCH profiles?id=eq.<x>` con `{monedas: 987654}` | la service key lee ese valor |
| E3 (H-4) | `GET` de `correct_answer` en `challenge_questions` y en `english_challenges` | llega un valor no nulo |
| E4 (H-4) | `POST completed_challenges` fabricado (`is_correct: true`, `coins_awarded: 500`) | 201 y la fila existe |
| C0 (control) | `POST audit_logs` | **denegado** por el lockdown de la Fase 1: prueba que el arnés no está todo abierto |

Tras la Fase 2, E1-E4 se invierten.

## Criterio medible
`db reset` aplica las 11 migraciones sin error, y E1-E4 y C0 dan **5/5** en verde, primero con la semilla A y luego con la B.

## Cómo sabremos que falló
- Un reset falla.
- Un exploit sale rojo sin parche: la hipótesis de esquema está mal.
- Un tramposo no pone en rojo su exploit.

## Tramposos
Cada `Ti.sql` cierra **solo** el hueco i:

| Tramposo | Qué cierra |
|---|---|
| T1 | `REVOKE SELECT` y luego `GRANT SELECT` de todas las columnas menos `pin` y `pin_hash` |
| T2 | `REVOKE UPDATE` |
| T3 | `REVOKE` de la columna `correct_answer` |
| T4 | `REVOKE INSERT` |

Con Ti aplicado, **exactamente** Ei se pone rojo. Un `db reset` restaura la base.

## Humo
`node tests/exploits/humo.js` corre E1 con la semilla A y escribe `resultados/arnes_humo.json` con `{fecha, semilla, api_url, versiones, E1}`. Sin él, no hay corrida grande.

## Comandos (PowerShell, con Docker ya corriendo)
```
npx supabase init                       # una sola vez
node tools/armar_esquema.js
npx supabase start
npx supabase db reset --local           # aplica la semilla A (db.seed.sql_paths)
node tests/exploits/humo.js
node --test "tests/exploits/*.test.js"
Get-Content supabase/tramposos/T1.sql -Raw | docker exec -i supabase_db_coins-mvp psql -U postgres -d postgres -v ON_ERROR_STOP=1
node --test "tests/exploits/*.test.js"  # espera: E1 rojo y el resto verde
npx supabase db reset --local
npx supabase db reset --local --no-seed  # réplica
Get-Content supabase/seeds/semilla_b.sql -Raw | docker exec -i supabase_db_coins-mvp psql -U postgres -d postgres -v ON_ERROR_STOP=1
$env:SEMILLA='B'; node --test "tests/exploits/*.test.js"
npx supabase stop
```

Resultados en `resultados/arnes_exploits_{A,B}.json`.

## Qué NO se toca
- `app.js`, los HTML, `modules/` y las `MIGRATION_*.sql`.
- Producción: nada de `link`, `db push` ni `--linked`.
- Los RPC sin migración (`list_institutions_safe`, `get_institution_ai_config_safe`): no se inventan y van a "Después".
- La suite visual de Playwright de REGLAS §3: es otro encargo.

## Veredicto por la letra
- **FUNCIONA:** 5/5 con A y con B, cada tramposo pone en rojo solo su exploit y el humo escribe su archivo.
- **HAY ALGO MODESTO:** hubo que completar la base (queda anotado) o un exploit se reproduce con una sola semilla.
- **NO:** el reset no llega a verde, o un exploit sigue en verde con su tramposo aplicado.

## Dependencias
- Docker corriendo (confirmado) e imágenes de Supabase.
- La convención `synth_*` de `ESPEC_credenciales_fuera.md`.

## Presupuesto
- Creador (Opus): unos 400 mil tokens, un día. Inferir la base es lo caro.
- Probador: unos 30 mil tokens.
