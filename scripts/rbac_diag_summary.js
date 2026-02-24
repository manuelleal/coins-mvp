const URL = 'https://uggkivypfugdchvjurlo.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function q(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function loadInstitutionsResilient() {
  const qs = [
    'institutions?select=id,name,subscription_plan,active_ai_provider,ai_credit_pool&order=name.asc',
    'institutions?select=id,name,subscription_plan,active_ai_provider&order=name.asc',
    'institutions?select=id,name,subscription_plan&order=name.asc'
  ];
  let lastErr = null;
  for (const qx of qs) {
    try { return await q(qx); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Cannot load institutions');
}

(async function main() {
  const uisId = 'fd138e39-9d18-4797-851e-1c038f512592';
  const institutions = await loadInstitutionsResilient();
  const profiles = await q('profiles?select=id,nombre_completo,documento_id,rol,institution_id,grupo');

  const countsByRole = {};
  for (const p of profiles) countsByRole[p.rol] = (countsByRole[p.rol] || 0) + 1;

  const uisUsers = profiles.filter((p) => p.institution_id === uisId);
  const uisUsersByRole = {};
  for (const p of uisUsers) uisUsersByRole[p.rol] = (uisUsersByRole[p.rol] || 0) + 1;

  function findByExactName(name) {
    const target = String(name || '').toLowerCase();
    return profiles.filter((p) => String(p.nombre_completo || '').toLowerCase() === target)
      .map((p) => ({ id: p.id, nombre: p.nombre_completo, documento_id: p.documento_id, rol: p.rol, institution_id: p.institution_id, grupo: p.grupo }));
  }

  const out = {
    institutions_count: institutions.length,
    uis_institution: institutions.find((i) => i.id === uisId) || null,
    counts_by_role: countsByRole,
    uis_users_count: uisUsers.length,
    uis_users_by_role: uisUsersByRole,
    target_users: {
      super_admin: findByExactName('christiam Manuel Puentes leal'),
      admin_uis: findByExactName('Admin UIS'),
      teacher_uis: findByExactName('Teacher UIS')
    }
  };

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error('[RBAC_DIAG_SUMMARY_ERROR]', e.message);
  process.exit(1);
});
