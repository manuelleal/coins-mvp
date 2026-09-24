# ESPEC · El login usa el RPC `verify_login`

H-1 · `seg/fase0` · Creador (Opus), 2026-09-24 · preregistro. Base del cambio: commit `c2d1e21`.

## Problema (dos líneas)
`handleLogin` trae la fila completa de `profiles` con `select('*')`, incluidos `pin` y `pin_hash`, y compara el PIN en el navegador (`app.js:900-902`, `1663-1676`). Cualquiera con la anon key lee todos los PIN.
El RPC seguro `verify_login` ya existe (`MIGRATION_AUTH_PIN_HASH_VERIFY_LOGIN.sql:46-117`) pero nadie lo llama.

## Qué cambia (una cosa)
En `handleLogin`, las líneas 900-902 se reemplazan por `supabaseClient.rpc('verify_login', { p_documento_id: doc, p_pin: pin })`:
- Si el RPC da error o no devuelve fila, lanza `Invalid credentials`.
- El error se loguea con `console.error` y su contexto, sin el PIN.
- Con la primera fila se arma `sessionUser` igual que hoy.
- No hay caída de respaldo a la comparación en claro.

**Cambios de conducta declarados** (la regresión los admite; nada más puede cambiar):
1. El documento se compara sin mayúsculas ni espacios de borde (`lower(btrim())` del RPC). Antes era exacto.
2. Un usuario legacy sin `pin_hash` queda con hash después de su primer login: lo hace el RPC, no el cliente.

## Tests
Van en `tests/login/login.test.js`, con `node:test` y el paquete `playwright` que ya está en `devDependencies` (sin dependencias nuevas).
- La app se sirve con `tools/servidor_estatico.js` (`node:http`).
- `page.route('**/config.js')` inyecta `window.SUPABASE_URL` y `window.SUPABASE_KEY` locales. `app.js:10-11` ya los prefiere, así que no hace falta tocarlo.
- `page.route('**/*.supabase.co/**')` aborta y registra: **cualquier intento hacia producción hace fallar el test**.

**Regresión = identidad.** Antes del cambio, con el `app.js` de `c2d1e21`, se congela `tests/login/snapshots/{A,B}.json`. El snapshot guarda, por cada caso: la URL de destino, el `localStorage.lingoCoins_user` (las 7 claves) y el texto de `#loginError`. Después del cambio debe salir idéntico, salvo lo declarado arriba.

| # | Caso | Esperado |
|---|---|---|
| L1 | Login válido de estudiante con hash | Va a `student.html` y la sesión es idéntica al snapshot |
| L2 | PIN incorrecto | Muestra `Invalid credentials`, se queda en `index.html` y el contador de intentos sube a 1 |
| L3 | Documento inexistente | Mismo mensaje que L2: no revela si el usuario existe |
| L4 | Legacy (`pin_hash` NULL) | Entra; la service key ve el `pin_hash` ya lleno; un segundo login también entra |
| L5 | super_admin, admin y teacher | Van a `admin.html`, `admin.html` y `teacher.html`, igual que el snapshot |
| L6 | Red durante el login (del clic en `#btnLogin` a la navegación) | 1 `POST /rest/v1/rpc/verify_login`; 0 `GET /rest/v1/profiles` con `select=*`; 0 respuestas de `/rest/v1/profiles` con las claves `pin` o `pin_hash` |
| L7 | Documento con mayúsculas o espacios | Entra (conducta 1, declarada) |

## Criterio medible
L1-L7 en verde con la semilla A y con la B, y los snapshots idénticos en lo no declarado.

## Cómo sabremos que falló
- L6 en rojo: el PIN volvió a viajar al cliente.
- L1-L5 en rojo: se rompió el login.
- Cualquier request a `*.supabase.co`.

## Tramposos (L6 debe ponerse rojo)
- **T1:** el propio `app.js` de `c2d1e21` (`git show c2d1e21:app.js`, servido con `page.route` desde `os.tmpdir()`). L6 debe dar rojo, y L1-L3 verde: eso prueba que L6 es lo que discrimina.
- **T2:** el `app.js` nuevo con un `select('*')` sobre `profiles` metido después del RPC, por reemplazo de texto en memoria. L6 debe dar rojo.

## Humo
`node tests/login/humo.js` hace un login válido con la semilla A y escribe `resultados/login_humo.json`:

```
{fecha, doc, destino, llamadas_rpc: 1, respuestas_con_pin: 0}
```

Si el archivo no aparece, no se corre la suite.

## Réplica
Con la semilla B cambian los documentos, los PIN son de 6 dígitos y el legacy es un teacher. Los mismos L1-L7 deben quedar verdes sin tocar el código.

## Comandos
Sobre el arnés ya levantado (`ESPEC_arnes_regresion.md`):

```
npx playwright install chromium          # si falta el navegador
npx supabase db reset --local
node tests/login/capturar_snapshot.js --base c2d1e21   # solo una vez, ANTES del cambio
node tests/login/humo.js
node --test "tests/login/*.test.js"
```

## Qué NO se toca
- `getProfileByDocumentoId`: la usan otros 9 llamadores.
- La actualización `last_login_at` (`app.js:907`).
- El throttle, las redirecciones y los textos.
- Los HTML y el RPC SQL.

**Límite honesto:** el PIN deja de viajar **en el login**, pero los tableros siguen pidiendo `select('*')` sobre `profiles`. `modules/institutions.js:151-153` también compara el PIN en el cliente. Las dos cosas van a "Después" (Fase 2: `REVOKE` por columna). H-1 no queda cerrado del todo hasta entonces.

## Veredicto por la letra
- **FUNCIONA:** L1-L7 en verde con A y con B, T1 y T2 en rojo y el humo escribe su archivo.
- **HAY ALGO MODESTO:** pasa con A pero falla un caso de B, o el snapshot difiere en algo menor que no estaba declarado (se registra un ERR y la espec se corrige antes de volver a correr).
- **NO:** L6 en verde con un tramposo, el legacy no entra, o hay tráfico a producción.

## Dependencias
- `ESPEC_arnes_regresion.md`: esquema, semillas A y B con el legacy, y el guardia local.
- **Antes de desplegar**, con el sí de Christiam: confirmar en producción que existen `verify_login` y `pin_hash`, y que el backfill quedó completo (consulta de solo lectura). Si el RPC no existe allá, este cambio deja sin login a los 97 estudiantes.

## Presupuesto
- Implementador (Sonnet): unos 150 mil tokens, medio día. El cambio es de unas 10 líneas; lo caro son el servidor, las rutas y los snapshots.
- Auditor: unos 30 mil tokens.
