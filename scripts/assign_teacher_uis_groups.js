const URL = 'https://uggkivypfugdchvjurlo.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function req(path, opt = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: opt.method || 'GET',
    headers: { ...HEADERS, ...(opt.headers || {}) },
    body: opt.body
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${path} :: ${res.status} ${res.statusText} :: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

(async function main() {
  const wanted = ['ENGLISH 1 PB1', 'ENGLISH 1pb2', 'ENGLISH 2 C1', 'FOREIGN LANGUAJE 40556'];

  const teacherRows = await req('profiles?select=id,nombre_completo,documento_id&nombre_completo=eq.Teacher%20UIS&limit=1');
  const teacher = Array.isArray(teacherRows) && teacherRows.length ? teacherRows[0] : null;
  if (!teacher) throw new Error('Teacher UIS not found');

  // teacher_groups schema probe
  const schemaProbe = await req('teacher_groups?select=*&limit=1');

  const groups = await req('groups?select=group_code');
  const available = new Set((groups || []).map((g) => g.group_code));
  const candidate = wanted.filter((g) => available.has(g));

  const existing = await req(`teacher_groups?select=teacher_id,group_code&teacher_id=eq.${teacher.id}`);
  const existingSet = new Set((existing || []).map((r) => r.group_code));

  const inserted = [];
  const skipped = [];
  for (const gc of candidate) {
    if (existingSet.has(gc)) {
      skipped.push(gc);
      continue;
    }
    await req('teacher_groups', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ teacher_id: teacher.id, group_code: gc }])
    });
    inserted.push(gc);
  }

  const toRemove = (existing || []).map((r) => r.group_code).filter((gc) => !wanted.includes(gc));
  for (const gc of toRemove) {
    await req(`teacher_groups?teacher_id=eq.${teacher.id}&group_code=eq.${encodeURIComponent(gc)}`, {
      method: 'DELETE'
    });
  }

  const after = await req(`teacher_groups?select=teacher_id,group_code&teacher_id=eq.${teacher.id}&order=group_code.asc`);

  console.log(JSON.stringify({
    teacher,
    schema_probe_rows: Array.isArray(schemaProbe) ? schemaProbe.length : 0,
    requested_groups: wanted,
    available_requested_groups: candidate,
    inserted,
    skipped,
    removed: toRemove,
    final_assigned_groups: (after || []).map((x) => x.group_code)
  }, null, 2));
})().catch((e) => {
  console.error('[ASSIGN_TEACHER_UIS_GROUPS_ERROR]', e.message);
  process.exit(1);
});
