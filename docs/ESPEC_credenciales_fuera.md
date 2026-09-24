# ESPEC · Credenciales fuera de los archivos versionados

H-9, H-10, H-11 parcial · rama `seg/fase0` · Creador (Opus), 2026-09-24 · preregistro.

## Problema (dos líneas)
El repo público trae pares documento+PIN que abren cuentas de producción (super_admin con cédula, QA, cuentas de rol) y copias de la anon key.
Borrarlas a mano no basta: vuelven con el próximo script de QA.

## Qué cambia (una cosa)
Ningún archivo versionado fuera de la app contiene credenciales ni claves. Los scripts las leen del entorno y un test lo vigila.

**Inventario** (valores citados solo por archivo:línea):

| Archivo | Qué trae |
|---|---|
| `qa_browser_test.js:57,213,279` · `qa_browser_test_v2.js:53,164,232` · `qa_local_run_gpt.js:24,49,81` | pares doc+PIN, incluido el super_admin real |
| `qa_full_e2e_execute.js:4-11` · `QA_CONTRACTUAL_FULL.ps1:8-9,20` | URL, anon key de producción y PIN |
| `SEED_DEVELOPMENT.sql:23-45` · `SQL_CREATE_ROLE_TEST_ACCOUNTS.sql:4-7` · `scripts/create_test_accounts.js:94-122` | 9 cuentas con PIN débil, 3 de ellas super_admin |
| `scripts/{assign_teacher_uis_groups,rbac_diag,rbac_diag_summary}.js` · `verify_migration.js` · `__tmp_*.js` (10) | URL y anon key |

Todo par se trata como **posiblemente vivo**: con Supabase pausado no se puede comprobar.

**Entregables**
1. `tools/credscan.js` (máximo 400 líneas, sin dependencias) y `tests/credenciales.test.js` con `node:test` (Node 24). Script nuevo: `npm run test:credenciales`.
2. Los scripts de QA y de `scripts/` leen `QA_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `QA_<ROL>_DOC` y `QA_<ROL>_PIN` desde `.env.qa`. Lector propio, sin `dotenv`; si falta una variable, aborta sin caer a producción. El `.ps1` lee `$env:`.
3. Se versiona `.env.qa.example` con las claves vacías. `.env.qa` y `resultados/` entran a `.gitignore`.
4. Las semillas usan solo documentos `synth_*` y abren con una guarda: si existe algún `documento_id` que no empiece por `synth_`, abortan. Así no corren en producción.
5. `git rm` de los 10 `__tmp_*.js`.

## Diseño del detector (sin escribir las credenciales)

| Regla | Detecta | Por qué |
|---|---|---|
| R1 · estructura | Un PIN literal (4 a 12 dígitos entre comillas) en contexto de credencial: `login(`, `verify_login(`, claves `pin`/`p_pin`/`$PIN`, `fill('#loginPin'…)`, columna `pin` en un `INSERT` a `profiles`, o `pin=` en un comentario. Falla salvo que haya un documento `synth_*` a menos de 300 caracteres o que el PIN esté en la lista de inválidos a propósito. | Capa principal: atrapa cualquier par nuevo. |
| R2 · cédula | Un literal entre comillas con forma de cédula colombiana: empieza por 1-9 y tiene de 6 a 10 dígitos, después de quitar puntos, espacios y guiones. | Medido hoy: solo lo cumplen credenciales, con 0 falsos positivos. |
| R3 · lista negra | Todo número de 6 a 10 dígitos (con o sin comillas, normalizado) se compara contra hashes **scrypt** de los documentos ya filtrados, con `crypto.scryptSync`, N=2^15, r=8, p=1 y sal pública. | Atrapa el documento suelto o con puntos. **SHA-256 no sirve**: unas 10^10 cédulas se recorren en segundos con GPU; scrypt cuesta unos 100 ms y 32 MB por intento. Los PIN **nunca** se hashean: con 10^4 valores, su hash equivale a publicarlos. |
| R4 · JWT | `eyJ…` solo se admite en `app.js`. Si el payload es `service_role`, falla en cualquier archivo. | Cubre H-11 en parte. |
| R5 · higiene | `git check-ignore -q .env.qa` da 0, `.env.qa.example` no trae valores y no hay ningún `__tmp_*` versionado. | Cierra la puerta de regreso. |

- **Qué recorre:** `git ls-files --cached --others --exclude-standard` (incluye lo no commiteado), sin binarios ni `package-lock.json`.
- **Qué reporta:** `archivo:línea:regla` con el valor **enmascarado**. Ni el test ni sus logs lo imprimen.
- **Excepciones:** una lista en `credscan.js`, cada una con su motivo. La única prevista hoy es el ejemplo comentado en `MIGRATION_AUTH_PIN_HASH_VERIFY_LOGIN.sql:124`, porque las migraciones no se tocan.
- **Hash nuevo:** `node tools/credscan.js --hash-desde-env QA_SUPERADMIN_DOC` imprime solo el hash.
- **El test no se delata a sí mismo:** arma sus literales por concatenación en tiempo de ejecución.

## Criterio medible
`npm run test:credenciales` sale con 0 sobre el árbol limpio: 0 violaciones de R1 a R5 en los cerca de 115 archivos.

## Cómo sabremos que falló
Sale con 1 y lista `archivo:línea:regla`.

## Tramposos (deben poner el test en rojo)
- **T1:** un `.js` en `os.tmpdir()` con un login de documento y PIN no sintéticos, pasado con `--rutas`. Lo atrapan R1 y R2.
- **T2:** lee `QA_SUPERADMIN_DOC` de `.env.qa`, lo escribe **con puntos** en un `.md` temporal fuera del repo y lo pasa con `--rutas`. Lo atrapa R3. Si no hay `.env.qa`, se reporta `NO VERIFICADO`, nunca verde.
- **T3:** crea un archivo sin rastrear dentro del repo, con un PIN no sintético. El escaneo por defecto debe dar rojo, y un `finally` lo borra.

## Humo
`node tools/credscan.js --json resultados/credscan.json` escribe `{fecha, archivos_escaneados, violaciones: []}`.

## Réplica
Con el escáner congelado, el Probador genera en `os.tmpdir()` entradas nuevas.
- **Positivos:** JSON `documento_id`/`pin`, CSV, `.ps1` con `$PIN`, una tabla Markdown, una cédula con puntos y un template string.
- **Negativos:** timestamps de 13 dígitos, colores hex, UUID, constantes numéricas sin comillas y el placeholder de `teacher.html`.

## Qué NO se toca
- `app.js`, ni siquiera su anon key en `:10-11`.
- Los HTML, `modules/`, `config.js` y la lógica de negocio.
- Las `MIGRATION_*.sql` y los `qa_*report*.json`.
- La historia de git.
- Las credenciales de producción: rotarlas es la Fase 3 y le toca a Christiam.

## Veredicto por la letra
- **FUNCIONA:** árbol limpio, T1 a T3 en rojo y la réplica atrapa todos los positivos con 0 falsos positivos.
- **HAY ALGO MODESTO:** la réplica deja escapar un formato (queda documentado) o hace falta una excepción nueva.
- **NO:** queda una credencial versionada, un reporte o el test contienen un valor real, o se tocó `app.js` o algún HTML.

## Dependencias
- Ninguna técnica: **se puede hacer hoy, sin Docker**.
- El `git rm` de archivos con historia pide el sí de Christiam (REGLAS §2).
- Esto **no rota nada**: los valores siguen en la historia pública hasta la Fase 3.

## Presupuesto
- Implementador (Sonnet): unos 150 mil tokens, de 2 a 3 horas.
- Auditor: unos 30 mil tokens.
