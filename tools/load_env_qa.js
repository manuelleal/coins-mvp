'use strict';

// Lector propio de variables de entorno para los scripts de QA de coins-mvp.
// Nace de docs/ESPEC_credenciales_fuera.md (entregable 2): sin dependencias (nada de `dotenv`),
// lee `.env.qa` en la raíz del proyecto y, si falta una variable pedida, ABORTA con un error
// claro en vez de caer a un valor por defecto que podría apuntar a producción.
//
// Uso típico en un script de QA:
//   const { requireEnv } = require('./tools/load_env_qa');
//   const SUPABASE_URL = requireEnv('SUPABASE_URL');
//   const SUPABASE_ANON_KEY = requireEnv('SUPABASE_ANON_KEY');

const fs = require('fs');
const path = require('path');

const ENV_QA_PATH = path.join(__dirname, '..', '.env.qa');

let cargado = false;

// Parser mínimo de archivo `.env`: KEY=VALUE por línea, comentarios con `#`, comillas opcionales.
// No interpreta `export`, ni interpolación, ni multilínea: es a propósito lo más simple posible.
function parseEnvFile(contenido) {
  const salida = {};
  const lineas = contenido.split(/\r?\n/);
  for (const cruda of lineas) {
    const linea = cruda.trim();
    if (!linea || linea.startsWith('#')) continue;
    const igual = linea.indexOf('=');
    if (igual === -1) continue;
    const clave = linea.slice(0, igual).trim();
    let valor = linea.slice(igual + 1).trim();
    const envuelta =
      (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) ||
      (valor.startsWith("'") && valor.endsWith("'") && valor.length >= 2);
    if (envuelta) valor = valor.slice(1, -1);
    salida[clave] = valor;
  }
  return salida;
}

// Carga `.env.qa` una sola vez en `process.env`, sin pisar variables ya definidas
// en el entorno real (así una variable exportada en la shell siempre gana).
function loadEnvQa(rutaPersonalizada) {
  const ruta = rutaPersonalizada || ENV_QA_PATH;
  if (cargado && !rutaPersonalizada) return;
  if (!fs.existsSync(ruta)) {
    cargado = true;
    return;
  }
  const parsed = parseEnvFile(fs.readFileSync(ruta, 'utf8'));
  for (const [clave, valor] of Object.entries(parsed)) {
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
  cargado = true;
}

// Devuelve la variable pedida o aborta. Nunca devuelve un valor por defecto hardcodeado:
// si falta, es preferible romper el script a arriesgarse a pegarle a producción.
function requireEnv(nombre) {
  loadEnvQa();
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `[QA_ENV] Falta la variable ${nombre}. Copia .env.qa.example a .env.qa y complétala, ` +
      `o expórtala en la shell. No hay valor por defecto: así no se cae a producción por accidente.`
    );
  }
  return valor;
}

// Variante que sí admite un valor por defecto explícito, para datos que NO son credenciales
// (por ejemplo la URL base de la app en localhost). Documentado aparte para que quede claro
// que solo se usa con valores que ya son seguros (no apuntan a producción).
function optionalEnv(nombre, porDefecto) {
  loadEnvQa();
  const valor = process.env[nombre];
  return valor === undefined || valor === '' ? porDefecto : valor;
}

module.exports = { loadEnvQa, requireEnv, optionalEnv, parseEnvFile, ENV_QA_PATH };
