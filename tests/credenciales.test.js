'use strict';

// tests/credenciales.test.js — arnés de tools/credscan.js (ESPEC_credenciales_fuera.md).
// `npm run test:credenciales` corre esto con node:test (Node 24, sin dependencias nuevas).
//
// "El test no se delata a sí mismo": los PIN/documentos de prueba de este archivo se arman
// por concatenación en tiempo de ejecución, nunca como un literal completo entre comillas,
// para que credscan.js no se detecte a sí mismo al escanear este archivo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CREDSCAN_BIN = path.join(ROOT, 'tools', 'credscan.js');
const { scanFiles, listRepoFiles } = require('../tools/credscan');
const { loadEnvQa } = require('../tools/load_env_qa');

// Este encargo (ESPEC_credenciales_fuera.md) es UN frente entre varios que corren en paralelo
// sobre el mismo árbol (METODO.md, "máximo 2 frentes"). `supabase/`, `tests/lib/`,
// `tests/exploits/` y `tools/armar_esquema.js` son del arnés de regresión (otro encargo,
// ESPEC_arnes_regresion.md) que no se toca aquí — puede estar a medio terminar mientras este
// test corre. El árbol "limpio" que este encargo puede prometer es el suyo, no el ajeno.
const FUERA_DE_ALCANCE = [
  'supabase/', 'tests/lib/', 'tests/exploits/', 'tools/armar_esquema.js',
  'docs/ESPEC_arnes_regresion.md', 'docs/ESPEC_login_verify_rpc.md'
];
function dentroDeAlcance(archivo) {
  return !FUERA_DE_ALCANCE.some((p) => archivo === p || archivo.startsWith(p));
}

test('arbol limpio: credscan no reporta violaciones de credenciales en el inventario de este encargo (R1-R5)', () => {
  const archivos = listRepoFiles().filter(dentroDeAlcance);
  const violaciones = scanFiles(archivos);
  if (violaciones.length) {
    console.error('Violaciones encontradas:');
    for (const v of violaciones) console.error(`  ${v.file}:${v.line}:${v.rule} (${v.masked})`);
  }
  assert.equal(violaciones.length, 0, `credscan encontró ${violaciones.length} violacion(es); ver detalle arriba.`);
});

test('T1 tramposo: PIN y documento no sintéticos en login() -> ROJO (R1 y R2)', () => {
  const doc = '10' + '52' + '49' + '9999'; // forma de cédula, no es un documento real
  const pin = '2' + '9' + '9' + '3'; // PIN de 4 dígitos, no real
  const rutaTmp = path.join(os.tmpdir(), `credscan_t1_${Date.now()}.js`);
  fs.writeFileSync(rutaTmp, `login(page, '${doc}', '${pin}');\n`);
  try {
    const violaciones = scanFiles([rutaTmp]);
    assert.ok(violaciones.length > 0, 'el tramposo T1 debía ponerse ROJO y no lo hizo');
    assert.ok(violaciones.some((v) => v.rule === 'R1'), 'T1 debía atraparlo R1 (PIN en contexto de login)');
    assert.ok(violaciones.some((v) => v.rule === 'R2'), 'T1 debía atraparlo R2 (documento con forma de cédula)');
  } finally {
    fs.unlinkSync(rutaTmp);
  }
});

test('T2 tramposo: cédula con puntos, fuera del repo -> ROJO (R3, lista negra por hash)', (t) => {
  loadEnvQa();
  const doc = process.env.QA_SUPERADMIN_DOC;
  if (!doc) {
    t.skip('NO VERIFICADO: falta .env.qa con QA_SUPERADMIN_DOC (copia .env.qa.example). Nunca se marca verde sin esto.');
    return;
  }
  // Agrupa el documento de a 3 dígitos desde la derecha (separador de miles), como el
  // "con puntos" que R3 normaliza. Sin ejemplo literal aquí: este archivo no se delata a sí mismo.
  const conPuntos = doc.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rutaTmp = path.join(os.tmpdir(), `credscan_t2_${Date.now()}.md`);
  fs.writeFileSync(rutaTmp, `Documento filtrado (con puntos): ${conPuntos}\n`);
  try {
    const violaciones = scanFiles([rutaTmp]);
    assert.ok(violaciones.some((v) => v.rule === 'R3'), 'T2 debía atraparlo R3 (documento normalizado contra la lista negra)');
  } finally {
    fs.unlinkSync(rutaTmp);
  }
});

test('T3 tramposo: archivo sin rastrear dentro del repo con PIN no sintético -> ROJO (escaneo por defecto)', () => {
  const pin = '6' + '6' + '6' + '6';
  const doc = 'temp_' + 'real_' + 'account';
  const nombre = `__tmp_credscan_tramposo_${Date.now()}.js`;
  const rutaAbs = path.join(ROOT, nombre);
  fs.writeFileSync(rutaAbs, `login(page, '${doc}', '${pin}');\n`);
  try {
    const archivos = listRepoFiles(); // git ls-files --cached --others --exclude-standard: incluye lo no rastreado
    assert.ok(archivos.includes(nombre), 'el archivo de prueba debía aparecer en git ls-files (no está en .gitignore)');
    const violaciones = scanFiles(archivos);
    const propias = violaciones.filter((v) => v.file === nombre);
    assert.ok(propias.length > 0, 'el tramposo T3 debía ponerse ROJO y no lo hizo');
  } finally {
    fs.unlinkSync(rutaAbs);
  }
});

test('humo: node tools/credscan.js --json escribe {fecha, archivos_escaneados, violaciones}', () => {
  // No se exige exit 0 aquí: el humo solo prueba que el archivo real se escribe con la forma
  // correcta (el árbol puede tener violaciones fuera de este encargo, ver FUERA_DE_ALCANCE arriba).
  const destino = path.join(ROOT, 'resultados', `credscan_humo_${Date.now()}.json`);
  spawnSync(process.execPath, [CREDSCAN_BIN, '--json', destino], { cwd: ROOT });
  assert.ok(fs.existsSync(destino), 'el humo debía escribir el archivo real');
  const payload = JSON.parse(fs.readFileSync(destino, 'utf8'));
  assert.ok(typeof payload.fecha === 'string' && payload.fecha.length > 0);
  assert.ok(typeof payload.archivos_escaneados === 'number' && payload.archivos_escaneados > 0);
  assert.ok(Array.isArray(payload.violaciones));
  fs.unlinkSync(destino);
});
