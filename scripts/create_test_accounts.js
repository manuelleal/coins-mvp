const SUPABASE_URL = 'https://uggkivypfugdchvjurlo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} :: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function getFirstInstitutionId() {
  const data = await sb('institutions?select=id&order=created_at.asc.nullslast,id.asc&limit=1');
  if (!Array.isArray(data) || !data.length) throw new Error('No institution found');
  return data[0].id;
}

async function getFirstGroupCode() {
  const data = await sb('groups?select=group_code&order=group_code.asc&limit=1');
  if (!Array.isArray(data) || !data.length) throw new Error('No group found');
  return data[0].group_code;
}

async function upsertProfile(profile) {
  return sb('profiles?on_conflict=documento_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=ignore-duplicates,return=representation'
    },
    body: JSON.stringify([profile])
  });
}

async function getProfileByDocumento(documentoId) {
  const rows = await sb(`profiles?select=id,documento_id,nombre_completo,rol&documento_id=eq.${encodeURIComponent(documentoId)}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getProfileByName(name) {
  const rows = await sb(`profiles?select=id,documento_id,nombre_completo,rol&nombre_completo=eq.${encodeURIComponent(name)}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function updateProfileById(id, patch) {
  return sb(`profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
}

async function ensureRequestedAccount(profile) {
  const byDoc = await getProfileByDocumento(profile.documento_id);
  if (byDoc) return { mode: 'exists_by_documento', profile: byDoc };

  try {
    const created = await upsertProfile(profile);
    if (Array.isArray(created) && created.length) {
      return { mode: 'created', profile: created[0] };
    }
  } catch (e) {
    if (!String(e.message || '').includes('unique_student_name')) {
      throw e;
    }
  }

  const byName = await getProfileByName(profile.nombre_completo);
  if (!byName) {
    throw new Error(`Failed to create account ${profile.nombre_completo} and no matching name row found for fallback`);
  }

  const updated = await updateProfileById(byName.id, profile);
  const row = Array.isArray(updated) && updated.length ? updated[0] : byName;
  return { mode: 'updated_existing_name', profile: row };
}

async function main() {
  const institutionId = await getFirstInstitutionId();
  const firstGroup = await getFirstGroupCode();

  const accounts = [
    {
      documento_id: '99999991',
      pin: '1111',
      nombre_completo: 'Super Admin Test',
      rol: 'super_admin',
      monedas: 0,
      institution_id: institutionId,
      grupo: null
    },
    {
      documento_id: '99999992',
      pin: '2222',
      nombre_completo: 'School Admin Test',
      rol: 'admin',
      monedas: 0,
      institution_id: institutionId,
      grupo: null
    },
    {
      documento_id: '99999993',
      pin: '3333',
      nombre_completo: 'Teacher Test',
      rol: 'teacher',
      monedas: 0,
      institution_id: institutionId,
      grupo: null
    },
    {
      documento_id: '99999994',
      pin: '4444',
      nombre_completo: 'Student Test',
      rol: 'student',
      monedas: 0,
      grupo: firstGroup
    }
  ];

  const outcomes = [];
  for (const account of accounts) {
    const out = await ensureRequestedAccount(account);
    outcomes.push({ documento_id: account.documento_id, nombre_completo: account.nombre_completo, mode: out.mode });
  }

  const verify = await sb('profiles?select=documento_id,nombre_completo,rol,grupo,institution_id&documento_id=in.(99999991,99999992,99999993,99999994)&order=documento_id.asc');
  console.log(JSON.stringify({ ok: true, institutionId, firstGroup, outcomes, accounts: verify }, null, 2));
}

main().catch((e) => {
  console.error('[CREATE_TEST_ACCOUNTS_ERROR]', e.message);
  process.exit(1);
});
