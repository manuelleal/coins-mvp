'use strict';
// ============================================================
// tests/lib/supabase_local.js
// Lee API_URL, ANON_KEY y SERVICE_ROLE_KEY de `npx supabase status -o env`
// EN TIEMPO DE EJECUCION. Nunca los escribe a disco ni los imprime.
// ABORTA si la URL no es 127.0.0.1 o localhost (jamas contra remoto).
// Sin dependencias: solo node:child_process y fetch nativo.
// ============================================================

const { execSync } = require('node:child_process');

function leerEnv() {
  let salida;
  try {
    salida = execSync('npx --yes supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error('No pude leer `supabase status -o env`. La instancia local, esta corriendo? Detalle: ' + (e.stderr || e.message));
  }

  const env = {};
  for (const linea of salida.split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }

  // Aceptar tanto API_URL como SUPABASE_API_URL, etc.
  const apiUrl = env.API_URL || env.SUPABASE_API_URL || env.SUPABASE_URL;
  const anonKey = env.ANON_KEY || env.SUPABASE_ANON_KEY;
  const serviceKey = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiUrl || !anonKey || !serviceKey) {
    throw new Error('Faltan API_URL/ANON_KEY/SERVICE_ROLE_KEY en la salida de supabase status.');
  }

  // GUARDA: solo local.
  let host;
  try { host = new URL(apiUrl).hostname; } catch { host = ''; }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('ABORTA: API_URL no es local (' + host + '). El arnes solo corre contra 127.0.0.1/localhost.');
  }

  return { apiUrl, anonKey, serviceKey };
}

// Cache por proceso (una sola lectura).
let _creds = null;
function creds() {
  if (!_creds) _creds = leerEnv();
  return _creds;
}

function base() { return creds().apiUrl.replace(/\/$/, '') + '/rest/v1'; }

async function rest(pathQuery, { key, method = 'GET', body = null, prefer = null } = {}) {
  const c = creds();
  const apikey = key === 'service' ? c.serviceKey : c.anonKey;
  const headers = {
    apikey,
    Authorization: 'Bearer ' + apikey,
  };
  if (body != null) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(base() + pathQuery, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  if (text) { try { json = JSON.parse(text); } catch { json = text; } }
  return { status: res.status, ok: res.ok, json, text };
}

// Consulta con la SERVICE key (para elegir filas sin conocer la semilla).
function asService(pathQuery, opts = {}) { return rest(pathQuery, { ...opts, key: 'service' }); }
// Consulta con la ANON key (el atacante del navegador).
function asAnon(pathQuery, opts = {}) { return rest(pathQuery, { ...opts, key: 'anon' }); }

function versiones() {
  return { node: process.version, arnes: '1.0' };
}

module.exports = { creds, asService, asAnon, rest, versiones, apiUrl: () => creds().apiUrl };
