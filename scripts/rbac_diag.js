const URL = 'https://uggkivypfugdchvjurlo.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function q(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: HEADERS });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${path} :: ${res.status} ${res.statusText} :: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function loadInstitutionsResilient() {
  const queries = [
    'institutions?select=id,name,subscription_plan,ai_credit_pool,ai_generation_limit,active_ai_provider&order=name.asc',
    'institutions?select=id,name,subscription_plan,ai_credit_pool,active_ai_provider&order=name.asc',
    'institutions?select=id,name,subscription_plan,ai_credit_pool&order=name.asc',
    'institutions?select=id,name,subscription_plan&order=name.asc'
  ];
  let lastErr = null;
  for (const path of queries) {
    try {
      return await q(path);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Unable to load institutions');
}

(async function main() {
  const report = {};
  const uisId = 'fd138e39-9d18-4797-851e-1c038f512592';

  report.institutions = await loadInstitutionsResilient();
  report.profiles = await q('profiles?select=id,nombre_completo,documento_id,rol,institution_id,grupo&order=rol.asc,nombre_completo.asc');

  report.uisInstitution = report.institutions.find((x) => x.id === uisId) || null;

  const countsByRole = {};
  for (const p of report.profiles) countsByRole[p.rol] = (countsByRole[p.rol] || 0) + 1;
  report.countsByRole = countsByRole;

  report.uisUsers = report.profiles.filter((p) => p.institution_id === uisId);
  report.uisUsersByRole = report.uisUsers.reduce((acc, p) => {
    acc[p.rol] = (acc[p.rol] || 0) + 1;
    return acc;
  }, {});

  const norm = (s) => String(s || '').toLowerCase();
  report.namedUsers = {
    super_admin_target: report.profiles.filter((p) => norm(p.nombre_completo).includes('christiam manuel puentes leal')),
    admin_uis_target: report.profiles.filter((p) => norm(p.nombre_completo).includes('admin uis')),
    teacher_uis_target: report.profiles.filter((p) => norm(p.nombre_completo).includes('teacher uis'))
  };

  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error('[RBAC_DIAG_ERROR]', e.message);
  process.exit(1);
});
