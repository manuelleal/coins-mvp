// Verify MIGRATION_SAAS_AI_ANALYTICS.sql was applied correctly
// Usage: node verify_migration.js

const SUPABASE_URL = 'https://uggkivypfugdchvjurlo.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE';

const H = { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY };
const HJ = { ...H, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

let pass = 0, fail = 0;

function ok(label) { pass++; console.log('  PASS: ' + label); }
function ko(label, detail) { fail++; console.log('  FAIL: ' + label + (detail ? ' — ' + detail : '')); }

async function get(path) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: H });
    return { status: res.status, data: res.status === 200 ? await res.json() : null, text: res.status !== 200 ? await res.text() : '' };
}

async function post(table, body) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, { method: 'POST', headers: HJ, body: JSON.stringify(body) });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { status: res.status, data, text };
}

async function del(table, filter) {
    return fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + filter, { method: 'DELETE', headers: H });
}

async function main() {
    console.log('=============================================');
    console.log(' MIGRATION VERIFICATION — SAAS_AI_ANALYTICS');
    console.log(' Target: ' + SUPABASE_URL);
    console.log('=============================================\n');

    // ---- STEP 1: institutions ----
    console.log('[STEP 1] institutions');
    const inst = await get('institutions?select=id,name,subscription_plan,ai_generations_used,ai_generation_limit&limit=0');
    if (inst.status === 200) ok('Table exists + all columns accessible');
    else { ko('Table or columns missing', inst.text.substring(0, 200)); }

    // CHECK constraint test
    const badPlan = await post('institutions', { name: '__CHECK_TEST__', subscription_plan: 'INVALID' });
    if (badPlan.status >= 400 && (badPlan.text.includes('check') || badPlan.text.includes('violat'))) ok('CHECK rejects invalid subscription_plan');
    else ko('CHECK constraint not working', 'status=' + badPlan.status);

    // Valid insert + defaults
    const goodInst = await post('institutions', { name: '__VERIFY_TEST__', subscription_plan: 'BASIC' });
    if (goodInst.status === 201 && goodInst.data && goodInst.data[0]) {
        const row = goodInst.data[0];
        ok('INSERT succeeds (RLS allows writes)');
        if (row.ai_generations_used === 0) ok('ai_generations_used defaults to 0');
        else ko('ai_generations_used default wrong', String(row.ai_generations_used));
        if (row.ai_generation_limit === 10) ok('ai_generation_limit defaults to 10');
        else ko('ai_generation_limit default wrong', String(row.ai_generation_limit));
        await del('institutions', 'id=eq.' + row.id);
    } else ko('INSERT failed', goodInst.text.substring(0, 200));

    // ---- STEP 2: question_bank ----
    console.log('\n[STEP 2] question_bank');
    const qb = await get('question_bank?select=id,module_type,pillar_type,exam_format,technical_domain&limit=0');
    if (qb.status === 200) ok('Table exists + taxonomy columns accessible');
    else ko('Table or columns missing', qb.text.substring(0, 200));

    // pillar_type CHECK
    const badPillar = await post('question_bank', { question_text: '__CHECK__', pillar_type: 'INVALID' });
    if (badPillar.status >= 400 && (badPillar.text.includes('check') || badPillar.text.includes('violat'))) ok('CHECK rejects invalid pillar_type');
    else ko('pillar_type CHECK not working', 'status=' + badPillar.status);

    // exam_format CHECK
    const badExam = await post('question_bank', { question_text: '__CHECK__', pillar_type: 'EXAM_PREP', exam_format: 'INVALID' });
    if (badExam.status >= 400 && (badExam.text.includes('check') || badExam.text.includes('violat'))) ok('CHECK rejects invalid exam_format');
    else ko('exam_format CHECK not working', 'status=' + badExam.status);

    // technical_domain CHECK
    const badTech = await post('question_bank', { question_text: '__CHECK__', pillar_type: 'TECHNICAL', technical_domain: 'INVALID' });
    if (badTech.status >= 400 && (badTech.text.includes('check') || badTech.text.includes('violat'))) ok('CHECK rejects invalid technical_domain');
    else ko('technical_domain CHECK not working', 'status=' + badTech.status);

    // Valid 3-pillar insert
    const goodQb = await post('question_bank', { question_text: '__VERIFY__', pillar_type: 'EXAM_PREP', exam_format: 'ICFES', technical_domain: 'NONE' });
    if (goodQb.status === 201) { ok('INSERT with EXAM_PREP/ICFES succeeds'); await del('question_bank', 'id=eq.' + goodQb.data[0].id); }
    else ko('Valid INSERT failed', goodQb.text.substring(0, 200));

    const goodCtx = await post('question_bank', { question_text: '__VERIFY__', pillar_type: 'CONTEXTUAL', exam_format: 'NONE', technical_domain: 'NONE' });
    if (goodCtx.status === 201) { ok('INSERT with CONTEXTUAL pillar succeeds'); await del('question_bank', 'id=eq.' + goodCtx.data[0].id); }
    else ko('CONTEXTUAL INSERT failed', goodCtx.text.substring(0, 200));

    const goodTech = await post('question_bank', { question_text: '__VERIFY__', pillar_type: 'TECHNICAL', exam_format: 'NONE', technical_domain: 'SOFTWARE' });
    if (goodTech.status === 201) { ok('INSERT with TECHNICAL/SOFTWARE succeeds'); await del('question_bank', 'id=eq.' + goodTech.data[0].id); }
    else ko('TECHNICAL INSERT failed', goodTech.text.substring(0, 200));

    // ---- STEP 3: student_analytics ----
    console.log('\n[STEP 3] student_analytics');
    const sa = await get('student_analytics?select=id,student_id,topic,time_spent_seconds,failed_attempts,success_rate&limit=0');
    if (sa.status === 200) ok('Table exists + all columns accessible');
    else ko('Table or columns missing', sa.text.substring(0, 200));

    // FK test with real profile
    const profiles = await get('profiles?select=id&limit=1');
    if (profiles.data && profiles.data.length > 0) {
        const pid = profiles.data[0].id;
        const goodSa = await post('student_analytics', { student_id: pid, topic: '__FK_TEST__', success_rate: 0.85 });
        if (goodSa.status === 201) { ok('INSERT with valid FK succeeds'); await del('student_analytics', 'id=eq.' + goodSa.data[0].id); }
        else ko('FK INSERT failed', goodSa.text.substring(0, 200));

        // Invalid FK
        const badFk = await post('student_analytics', { student_id: '00000000-0000-0000-0000-000000000000', topic: '__BAD_FK__' });
        if (badFk.status >= 400) ok('FK rejects invalid student_id');
        else ko('FK not enforced');
    } else { console.log('  SKIP: No profiles for FK test'); }

    // ---- STEP 4: improvement_plans ----
    console.log('\n[STEP 4] improvement_plans');
    const ip = await get('improvement_plans?select=id,student_id,teacher_id,focus_topic,status,entry_cost_coins,reward_coins&limit=0');
    if (ip.status === 200) ok('Table exists + all columns accessible');
    else ko('Table or columns missing', ip.text.substring(0, 200));

    // Status CHECK
    const badStatus = await post('improvement_plans', { focus_topic: '__CHECK__', status: 'INVALID' });
    if (badStatus.status >= 400 && (badStatus.text.includes('check') || badStatus.text.includes('violat'))) ok('CHECK rejects invalid status');
    else ko('status CHECK not working', 'status=' + badStatus.status);

    // Valid gamified insert
    const planBody = { focus_topic: '__GAMIFIED_TEST__', entry_cost_coins: 10, reward_coins: 100, status: 'ASSIGNED' };
    if (profiles.data && profiles.data.length > 0) planBody.student_id = profiles.data[0].id;
    const goodPlan = await post('improvement_plans', planBody);
    if (goodPlan.status === 201 && goodPlan.data && goodPlan.data[0]) {
        const row = goodPlan.data[0];
        ok('INSERT with gamified columns succeeds');
        if (row.entry_cost_coins === 10) ok('entry_cost_coins = 10');
        else ko('entry_cost_coins wrong', String(row.entry_cost_coins));
        if (row.reward_coins === 100) ok('reward_coins = 100');
        else ko('reward_coins wrong', String(row.reward_coins));
        if (row.status === 'ASSIGNED') ok('status = ASSIGNED');
        else ko('status wrong', row.status);
        await del('improvement_plans', 'id=eq.' + row.id);
    } else ko('Valid INSERT failed', goodPlan.text.substring(0, 200));

    // ---- SUMMARY ----
    console.log('\n=============================================');
    console.log(' PASS=' + pass + ' FAIL=' + fail);
    console.log(' Status: ' + (fail === 0 ? 'ALL PASS' : 'ISSUES FOUND'));
    console.log('=============================================');
    process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
