#!/usr/bin/env node
// ============================================================
// armar_esquema.js
// Copia byte a byte la base inferida y las 10 MIGRATION_*.sql a
// supabase/migrations/ (carpeta ignorada en git), con nombres numerados
// para forzar el orden, y verifica el SHA-256 de cada copia contra su
// original. Si un hash no coincide, aborta: la migracion no es fiel.
//
// Uso:  node tools/armar_esquema.js
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const raiz = path.resolve(__dirname, '..');
const dirMigr = path.join(raiz, 'supabase', 'migrations');
const dirEsq = path.join(raiz, 'supabase', 'esquema');

// Orden. La ESPEC proponia una HIPOTESIS de orden que RESULTO REFUTADA:
// ponia SUPER_ADMIN_REDESIGN (crea audit_logs con columna `action`) ANTES de
// SAAS_HARDENING, y este ultimo hace CREATE INDEX ... (action_type) sobre una
// audit_logs que ya existe con otra forma -> ERROR 42703 (columna inexistente).
// Se adopta el orden que dictan los PROPIOS ENCABEZADOS de las migraciones:
// MIGRATION_GOD_MODE_RBAC.sql dice literalmente "Run ... AFTER
// MIGRATION_SAAS_HARDENING.sql". Por eso SAAS_HARDENING va antes que GOD_MODE
// y que SUPER_ADMIN (cuyo CREATE TABLE IF NOT EXISTS audit_logs queda saltado).
// Ningun byte de las migraciones se edita; solo cambia el ORDEN de aplicacion.
const ORDEN = [
  { src: path.join(dirEsq, '00_base_inferida_HIPOTESIS.sql'), nombre: 'base_inferida' },
  { src: path.join(raiz, 'MIGRATION_SAAS_AI_ANALYTICS.sql'), nombre: 'saas_ai_analytics' },
  { src: path.join(raiz, 'MIGRATION_FINAL_SAAS_ARCHITECTURE.sql'), nombre: 'final_saas_architecture' },
  { src: path.join(raiz, 'MIGRATION_SAAS_HARDENING.sql'), nombre: 'saas_hardening' },
  { src: path.join(raiz, 'MIGRATION_GOD_MODE_RBAC.sql'), nombre: 'god_mode_rbac' },
  { src: path.join(raiz, 'MIGRATION_SUPER_ADMIN_REDESIGN_FINAL.sql'), nombre: 'super_admin_redesign_final' },
  { src: path.join(raiz, 'MIGRATION_INDEXES_RBAC_MODULAR.sql'), nombre: 'indexes_rbac_modular' },
  { src: path.join(raiz, 'MIGRATION_COIN_WALLETS_LEDGER.sql'), nombre: 'coin_wallets_ledger' },
  { src: path.join(raiz, 'MIGRATION_SECURITY_PHASE1_LOCKDOWN.sql'), nombre: 'security_phase1_lockdown' },
  { src: path.join(raiz, 'MIGRATION_AUTH_PIN_HASH_VERIFY_LOGIN.sql'), nombre: 'auth_pin_hash_verify_login' },
  { src: path.join(raiz, 'MIGRATION_CHALLENGE_QUESTIONS_RICHFIELDS.sql'), nombre: 'challenge_questions_richfields' },
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
  // 1) Limpia solo los .sql que este mismo tool genera (prefijo 202501...).
  fs.mkdirSync(dirMigr, { recursive: true });
  for (const f of fs.readdirSync(dirMigr)) {
    if (/^202501\d{8}_.*\.sql$/.test(f)) fs.unlinkSync(path.join(dirMigr, f));
  }

  let i = 0;
  for (const paso of ORDEN) {
    i += 1;
    if (!fs.existsSync(paso.src)) {
      console.error('FALTA el original: ' + paso.src);
      process.exit(1);
    }
    // Version de 14 digitos: 20250101 + 6 digitos crecientes -> orden lexicografico.
    const version = '20250101' + String(i).padStart(6, '0');
    const destino = path.join(dirMigr, version + '_' + paso.nombre + '.sql');

    const original = fs.readFileSync(paso.src);
    fs.writeFileSync(destino, original);
    const copia = fs.readFileSync(destino);

    const hOrig = sha256(original);
    const hCopia = sha256(copia);
    if (hOrig !== hCopia) {
      console.error('SHA-256 NO COINCIDE en ' + paso.nombre);
      console.error('  original: ' + hOrig);
      console.error('  copia:    ' + hCopia);
      process.exit(1);
    }
    console.log(String(i).padStart(2, '0') + '  ' + path.basename(destino) +
      '  sha256=' + hOrig.slice(0, 12) + '  (' + original.length + ' bytes)');
  }
  console.log('\nOK: ' + ORDEN.length + ' migraciones copiadas y verificadas byte a byte.');
}

main();
