#!/usr/bin/env node
'use strict';

// Detector de credenciales versionadas para coins-mvp.
// Nace de docs/ESPEC_credenciales_fuera.md — implementa las reglas R1 a R5 descritas ahí.
// Sin dependencias externas. Node 24 (usa crypto.scryptSync, ya en core).
//
// Uso:
//   node tools/credscan.js                         escanea todo el repo versionado
//   node tools/credscan.js --rutas a.js,b.sql       escanea solo esas rutas (para tramposos/réplica)
//   node tools/credscan.js --json resultados/x.json escribe también el resultado en JSON (humo)
//   node tools/credscan.js --hash-desde-env VAR     imprime SOLO el hash scrypt de esa variable
//
// Principio de diseño (ver espec, sección "El test no se delata a sí mismo"): este archivo
// nunca imprime un valor real, solo enmascarado, y la lista NEGRA de R3 guarda hashes
// scrypt (de un solo sentido, costosos de romper), nunca el documento en claro.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { requireEnv } = require('./load_env_qa');

const REPO_ROOT = path.join(__dirname, '..');

// ---- R3: lista negra por hash scrypt --------------------------------------------------
// Parámetros elegidos en la espec: N=2^15, r=8, p=1. Cuestan ~100ms y 32MB por intento,
// a propósito: SHA-256 se rompe en segundos con GPU para 10^10 cédulas; esto no.
const SCRYPT_OPTS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_SALT = 'ingles-credscan-public-salt-v1'; // pública: no protege el hash, solo evita rainbow tables genéricas

function hashDoc(normalizado) {
  return crypto.scryptSync(normalizado, SCRYPT_SALT, 32, SCRYPT_OPTS).toString('hex');
}

// Hashes de los documentos ya filtrados en el inventario de la espec (H-9/H-10).
// Generados con: node tools/credscan.js --hash-desde-env <VAR_CON_EL_DOCUMENTO>
// El documento en claro NO vive aquí, solo su hash.
const BLACKLIST_HASHES = new Set([
  'df1ed508da76f154aa9638d2cc6b92f4f062bf1e58d7ab7ce6c85ec8174971bb' // super_admin real (H-9), ver ESPEC inventario
]);

// PIN usados a propósito como valor INVÁLIDO en pruebas de rechazo de login (no abren ninguna
// cuenta real; existen para que el test falle a propósito). Lista corta y explícita.
const PINES_INVALIDOS_A_PROPOSITO = new Set(['0000', '9999']);

// ---- Excepciones (archivo:línea:regla), cada una con su motivo ------------------------
const EXCEPTIONS = [
  {
    file: 'MIGRATION_AUTH_PIN_HASH_VERIFY_LOGIN.sql',
    line: 124,
    rule: 'R1',
    motivo: "Ejemplo comentado de uso de verify_login con un documento y un PIN de prueba; las MIGRATION_*.sql no se tocan (ESPEC, 'Qué NO se toca')."
  },
  {
    file: 'app.js',
    line: 3196,
    rule: 'R2',
    motivo: 'Falso positivo de R2: es la fecha de versión del header anthropic-version (formato AAAA-MM-DD), no un ' +
      'documento; sin guiones queda con forma de cédula (8 dígitos). app.js no se toca (ESPEC, "Qué NO se toca").'
  }
];

// __tmp_*.js pendientes de `git rm` con el sí de Christiam (REGLAS.md §2): ya se les quitó
// la URL/clave que traían, pero no se pueden borrar sin esa aprobación. Ver ERR candidato
// en la entrega de este encargo. Cualquier __tmp_* NUEVO que no esté en esta lista sí se reporta.
const TMP_PENDIENTES_DE_BORRADO = [
  '__tmp_audit_ping.js', '__tmp_audit_postfix.js', '__tmp_audit_star.js', '__tmp_dups.js',
  '__tmp_postfix_400_check.js', '__tmp_query_check.js', '__tmp_schema_check.js',
  '__tmp_schema_final_check.js', '__tmp_syscfg_check.js', '__tmp_verify_fix3.js'
];

const EXT_BINARIAS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.docx', '.xlsx', '.zip']);
const ARCHIVOS_EXCLUIDOS = new Set(['package-lock.json']);

function mask(valor) {
  const v = String(valor);
  if (v.length <= 4) return '*'.repeat(v.length);
  return v.slice(0, 2) + '*'.repeat(Math.max(1, v.length - 4)) + v.slice(-2);
}

function listRepoFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: REPO_ROOT })
    .toString('utf8');
  return out.split(/\r?\n/).filter(Boolean).filter((f) => !ARCHIVOS_EXCLUIDOS.has(f));
}

function shouldSkip(relFile) {
  if (ARCHIVOS_EXCLUIDOS.has(relFile)) return true;
  const ext = path.extname(relFile).toLowerCase();
  return EXT_BINARIAS.has(ext);
}

function buildLineOffsets(content) {
  const offsets = [0];
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') offsets.push(i + 1);
  return offsets;
}

function lineNumberForIndex(lineOffsets, idx) {
  let lo = 0, hi = lineOffsets.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineOffsets[mid] <= idx) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans + 1;
}

// ---- R1: PIN literal en contexto de credencial -----------------------------------------
const R1_CONTEXTO = [
  /login\s*\(/i,
  /verify_login\s*\(/i,
  /\bp_pin\b/i,
  /\$PIN\b/,
  /loginPin/i,
  /\bpin\b\s*[:=]/i,
  /insert\s+into[\s\S]{0,200}\bprofiles\b[\s\S]{0,200}\bpin\b/i,
  /(#|--|\/\/)\s*.*\bpin\s*=/i
];

function ruleR1(file, content, lineOffsets) {
  const out = [];
  const re = /'(\d{4,12})'|"(\d{4,12})"|`(\d{4,12})`/g;
  let m;
  while ((m = re.exec(content))) {
    const valor = m[1] || m[2] || m[3];
    const idx = m.index;
    const ventana = content.slice(Math.max(0, idx - 200), Math.min(content.length, idx + m[0].length + 200));
    if (!R1_CONTEXTO.some((re2) => re2.test(ventana))) continue;
    const cercaSynth = content.slice(Math.max(0, idx - 300), Math.min(content.length, idx + 300)).includes('synth_');
    if (cercaSynth) continue;
    if (PINES_INVALIDOS_A_PROPOSITO.has(valor)) continue;
    out.push({ file, line: lineNumberForIndex(lineOffsets, idx), rule: 'R1', masked: mask(valor) });
  }
  return out;
}

// ---- R2: forma de cédula colombiana en un literal entre comillas -----------------------
function ruleR2(file, content, lineOffsets) {
  const out = [];
  const re = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let m;
  while ((m = re.exec(content))) {
    const raw = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
    if (!raw) continue;
    const stripped = raw.replace(/[.\s-]/g, '');
    if (!/^[1-9]\d{5,9}$/.test(stripped)) continue;
    out.push({ file, line: lineNumberForIndex(lineOffsets, m.index), rule: 'R2', masked: mask(stripped) });
  }
  return out;
}

// ---- R3: cualquier número de 6-10 dígitos, comparado por hash contra la lista negra ----
// Dos patrones: dígitos corridos y dígitos agrupados con separador de miles (puntos, espacios
// o guiones), normalizados antes de hashear ("con o sin comillas, normalizado" en la espec)
// — así se atrapa el documento suelto o con puntos. Sin ejemplos literales aquí a propósito.
const R3_PATRONES = [/\b\d{6,10}\b/g, /\b\d{1,3}(?:[.\s-]\d{3}){1,3}\b/g];

function ruleR3(file, content, lineOffsets) {
  const out = [];
  const vistos = new Set();
  for (const patron of R3_PATRONES) {
    const re = new RegExp(patron.source, 'g');
    let m;
    while ((m = re.exec(content))) {
      const normalizado = m[0].replace(/\D/g, '');
      if (normalizado.length < 6 || normalizado.length > 10) continue;
      const clave = `${m.index}:${normalizado}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      if (BLACKLIST_HASHES.has(hashDoc(normalizado))) {
        out.push({ file, line: lineNumberForIndex(lineOffsets, m.index), rule: 'R3', masked: mask(normalizado) });
      }
    }
  }
  return out;
}

// ---- R4: JWT (eyJ...) solo admitido en app.js; service_role, nunca ---------------------
function ruleR4(file, content, lineOffsets) {
  const out = [];
  const re = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
  let m;
  while ((m = re.exec(content))) {
    const partes = m[0].split('.');
    let rol = null;
    try {
      const json = Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      rol = JSON.parse(json).role || null;
    } catch (e) { /* payload no decodificable: se trata como JWT sin rol identificado */ }
    const line = lineNumberForIndex(lineOffsets, m.index);
    if (rol === 'service_role') {
      out.push({ file, line, rule: 'R4', masked: '***service_role***' });
    } else if (file !== 'app.js') {
      out.push({ file, line, rule: 'R4', masked: mask(m[0]) });
    }
  }
  return out;
}

// ---- R5: higiene general (no depende de un archivo puntual) ----------------------------
function ruleR5(archivosVersionados) {
  const out = [];

  try {
    execFileSync('git', ['check-ignore', '-q', '.env.qa'], { cwd: REPO_ROOT });
  } catch (e) {
    out.push({ file: '.gitignore', line: 0, rule: 'R5', masked: '.env.qa no está ignorado' });
  }

  const ejemplo = path.join(REPO_ROOT, '.env.qa.example');
  if (fs.existsSync(ejemplo)) {
    fs.readFileSync(ejemplo, 'utf8').split(/\r?\n/).forEach((l, i) => {
      const t = l.trim();
      if (!t || t.startsWith('#')) return;
      const eq = t.indexOf('=');
      if (eq === -1) return;
      if (t.slice(eq + 1).trim()) {
        out.push({ file: '.env.qa.example', line: i + 1, rule: 'R5', masked: 'trae un valor, debería quedar vacío' });
      }
    });
  }

  for (const f of archivosVersionados) {
    const base = path.basename(f);
    if (/^__tmp_/.test(base) && !TMP_PENDIENTES_DE_BORRADO.includes(base)) {
      out.push({ file: f, line: 0, rule: 'R5', masked: '__tmp_* nuevo, sin revisar' });
    }
  }
  return out;
}

function isExcepted(v) {
  return EXCEPTIONS.some((e) => e.file === v.file && e.line === v.line && e.rule === v.rule);
}

function scanFiles(archivos) {
  const violaciones = [];
  for (const relFile of archivos) {
    if (shouldSkip(relFile)) continue;
    const abs = path.isAbsolute(relFile) ? relFile : path.join(REPO_ROOT, relFile);
    let content;
    try { content = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
    if (content.includes('\u0000')) continue; // binario colado
    const lineOffsets = buildLineOffsets(content);
    const encontradas = [
      ...ruleR1(relFile, content, lineOffsets),
      ...ruleR2(relFile, content, lineOffsets),
      ...ruleR3(relFile, content, lineOffsets),
      ...ruleR4(relFile, content, lineOffsets)
    ];
    for (const v of encontradas) if (!isExcepted(v)) violaciones.push(v);
  }
  violaciones.push(...ruleR5(archivos));
  return violaciones;
}

function parseArgs(argv) {
  const args = { rutas: null, json: null, hashDesdeEnv: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rutas') args.rutas = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--json') args.json = argv[++i];
    else if (argv[i] === '--hash-desde-env') args.hashDesdeEnv = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.hashDesdeEnv) {
    const valor = requireEnv(args.hashDesdeEnv);
    console.log(hashDoc(valor.replace(/\D/g, '')));
    return;
  }

  const archivos = args.rutas || listRepoFiles();
  const violaciones = scanFiles(archivos);

  if (args.json) {
    const destino = path.isAbsolute(args.json) ? args.json : path.join(REPO_ROOT, args.json);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify({
      fecha: new Date().toISOString(),
      archivos_escaneados: archivos.length,
      violaciones: violaciones.map((v) => `${v.file}:${v.line}:${v.rule}`)
    }, null, 2));
  }

  if (violaciones.length) {
    for (const v of violaciones) console.log(`${v.file}:${v.line}:${v.rule} (${v.masked})`);
    console.error(`credscan: ${violaciones.length} violacion(es) en ${archivos.length} archivo(s).`);
    process.exitCode = 1;
  } else {
    console.log(`credscan: 0 violaciones en ${archivos.length} archivo(s).`);
    process.exitCode = 0;
  }
}

if (require.main === module) main();

module.exports = { scanFiles, listRepoFiles, hashDoc, mask, ruleR1, ruleR2, ruleR3, ruleR4, ruleR5, isExcepted };
