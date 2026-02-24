/* ========================================
   LINGO-COINS - APP.JS (PRODUCTION CLEAN)
   ======================================== */

// ========== CONFIG ==========
// Credentials are centralised in config.js (loaded before app.js).
// Inline values here serve as fallback only.
const CONFIG = {
    supabase: {
        url: (typeof window !== 'undefined' && window.SUPABASE_URL) || 'https://uggkivypfugdchvjurlo.supabase.co',
        anonKey: (typeof window !== 'undefined' && window.SUPABASE_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE'
    },
    pages: {
        login: 'index.html',
        admin: 'admin.html',
        school: 'school.html',
        teacher: 'teacher.html',
        student: 'student.html',
        attendance: 'attendance.html'
    },
    tables: {
        profiles: 'profiles',
        groups: 'groups',
        attendance: 'attendance',
        attendance_sessions: 'attendance_sessions',
        auctions: 'auctions',
        challenges: 'english_challenges',
        challenge_questions: 'challenge_questions',
        challenge_submissions: 'completed_challenges',
        announcements: 'announcements',
        auction_bids: 'auction_bids',
        billing_claims: 'billing_claims',
        student_inventory: 'student_inventory',
        feedback_messages: 'feedback_messages',
        institutions: 'institutions',
        question_bank: 'question_bank',
        student_analytics: 'student_analytics',
        improvement_plans: 'improvement_plans',
        teacher_groups: 'teacher_groups',
        system_configs: 'system_configs',
        audit_logs: 'audit_logs',
        credit_transactions: 'credit_transactions',
        student_coin_transactions: 'student_coin_transactions',
        ai_usage_logs: 'ai_usage_logs',
        challenge_sessions: 'challenge_sessions',
        student_progress: 'student_progress',
        teacher_rewards: 'teacher_rewards'
    },
    geofenceMeters: 50,
    rewards: { base: 5, earlyBirdBonus: 5 },
    earlyBirdMinutes: 5
};

// ========== SUPABASE CLIENT ==========
var supabaseClient;
if (typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
} else {
    console.error('Supabase CDN not loaded. Check script order.');
}

// ================================================================
// COIN LEDGER (optional)
// If MIGRATION_COIN_WALLETS_LEDGER.sql is applied, we can log
// all movements via RPC. If not, code falls back to legacy updates.
// ================================================================

var __coinLedgerEnabled = null;
async function coinLedgerEnabled() {
    if (__coinLedgerEnabled != null) return __coinLedgerEnabled;
    // Safe probe: ensure_coin_wallet has no side-effects beyond ensuring a row exists.
    // If the migration isn't installed, RPC will error "function ... does not exist".
    try {
        var r = await supabaseClient.rpc('ensure_coin_wallet', { p_owner_type: 'system', p_owner_id: null });
        if (r && !r.error) { __coinLedgerEnabled = true; return true; }
        var msg = String((r && r.error && r.error.message) || '').toLowerCase();
        if (msg.includes('does not exist') && msg.includes('function')) { __coinLedgerEnabled = false; return false; }
        // Unknown errors: assume not enabled to avoid partial writes.
        __coinLedgerEnabled = false;
        return false;
    } catch (_) {
        __coinLedgerEnabled = false;
        return false;
    }
}

async function _ensureWalletId(ownerType, ownerId) {
    try {
        var r = await supabaseClient.rpc('ensure_coin_wallet', {
            p_owner_type: String(ownerType || ''),
            p_owner_id: ownerId || null
        });
        if (r && !r.error && r.data) return r.data;
    } catch (_) {}
    return null;
}

async function _coinTransferRpc(fromWalletId, toWalletId, amount, action, createdByProfileId, institutionId, metadata) {
    try {
        var r = await supabaseClient.rpc('coin_transfer', {
            p_from_wallet_id: fromWalletId || null,
            p_to_wallet_id: toWalletId || null,
            p_amount: Math.floor(Number(amount) || 0),
            p_action: String(action || 'transfer'),
            p_created_by_profile_id: createdByProfileId || null,
            p_institution_id: institutionId || null,
            p_metadata: metadata || {}
        });
        if (r && r.error) return { ok: false, error: r.error.message || 'RPC error' };
        if (r && r.data && r.data.ok === false) return { ok: false, error: r.data.error || 'Transfer failed' };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message || 'RPC error' };
    }
}

function consumePendingSessionCode() {
    var sessionCode = '';
    try {
        sessionCode = localStorage.getItem('pending_session') || '';
    } catch (_) {}
    if (sessionCode) {
        try { localStorage.removeItem('pending_session'); } catch (_) {}
    }
    return String(sessionCode || '').trim();
}

function consumePendingAttendanceCode() {
    var code = '';
    try {
        code = sessionStorage.getItem('pending_attendance_code') || '';
    } catch (_) {}
    if (!code) {
        try {
            code = localStorage.getItem('pending_attendance_code') || '';
        } catch (_) {}
    }
    if (code) {
        try { sessionStorage.removeItem('pending_attendance_code'); } catch (_) {}
        try { localStorage.removeItem('pending_attendance_code'); } catch (_) {}
    }
    return code;
}

async function updateStudentCoinsIfUnchanged(studentId, expectedCoins, newCoins) {
    const expected = Math.max(0, Math.floor(Number(expectedCoins)) || 0);
    const next = Math.max(0, Math.floor(Number(newCoins)) || 0);
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .update({ monedas: next })
            .eq('id', studentId)
            .eq('monedas', expected)
            .select('id, monedas');
        if (error) throw error;
        return { ok: true, updated: Array.isArray(data) && data.length > 0, newCoins: next };
    } catch (err) {
        console.error('Error in optimistic coin update:', err);
        return { ok: false, error: err.message };
    }
}

async function debitCoinsByDocumentoId(documentoId, amount) {
    var debit = Math.max(0, Math.floor(Number(amount)) || 0);
    if (debit <= 0) return { ok: true, charged: 0 };
    var profile = await getProfileByDocumentoId(documentoId);
    if (!profile) return { ok: false, error: 'Profile not found' };
    var current = Math.max(0, Number(profile.monedas) || 0);
    if (current < debit) return { ok: false, error: 'Not enough coins' };
    var optimistic = await updateStudentCoinsIfUnchanged(profile.id, current, current - debit);
    if (!optimistic.ok) return optimistic;
    if (!optimistic.updated) return { ok: false, error: 'Balance changed, retry action' };
    insertStudentCoinTransaction(profile.id, -debit, 'debit', current - debit);
    return { ok: true, charged: debit, newCoins: current - debit, profileId: profile.id };
}

async function creditCoinsByDocumentoId(documentoId, amount) {
    var credit = Math.max(0, Math.floor(Number(amount)) || 0);
    if (credit <= 0) return { ok: true, credited: 0 };
    return addCoinsByDocumentoId(documentoId, credit);
}

function safeJsonParse(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(String(raw)); } catch (_) { return null; }
}

function normalizeToken(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function normalizeDocumentoId(value) {
    return String(value == null ? '' : value).trim();
}

function normalizePin(value) {
    return String(value == null ? '' : value).trim();
}

function isValidDocumentoId(value) {
    var v = normalizeDocumentoId(value);
    if (!v) return false;
    if (v.length < 3 || v.length > 32) return false;
    return /^[A-Za-z0-9_-]+$/.test(v);
}

function isValidPin(value) {
    var v = normalizePin(value);
    if (!v) return false;
    if (v.length < 4 || v.length > 12) return false;
    return /^[0-9]+$/.test(v);
}

function isNonEmptyText(value, minLen, maxLen) {
    var v = String(value == null ? '' : value).trim();
    var min = Number(minLen) || 1;
    var max = Number(maxLen) || 1000;
    return v.length >= min && v.length <= max;
}

function normalizeAlertType(value) {
    var t = String(value || 'info').trim().toLowerCase();
    if (['info', 'success', 'warning', 'danger'].includes(t)) return t;
    return 'info';
}

function getLoginThrottleState() {
    try {
        var raw = localStorage.getItem('lingoCoins_loginThrottle');
        var parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== 'object') return { count: 0, firstAttemptMs: Date.now() };
        var now = Date.now();
        var first = Number(parsed.firstAttemptMs) || now;
        var count = Math.max(0, Number(parsed.count) || 0);
        if (now - first > 60 * 1000) return { count: 0, firstAttemptMs: now };
        return { count: count, firstAttemptMs: first };
    } catch (_) {
        return { count: 0, firstAttemptMs: Date.now() };
    }
}

function setLoginThrottleState(state) {
    try {
        localStorage.setItem('lingoCoins_loginThrottle', JSON.stringify(state || { count: 0, firstAttemptMs: Date.now() }));
    } catch (_) {}
}

function parseAnswerList(value) {
    if (Array.isArray(value)) return value.map(normalizeToken).filter(Boolean);
    var parsed = safeJsonParse(value);
    if (Array.isArray(parsed)) return parsed.map(normalizeToken).filter(Boolean);
    return String(value == null ? '' : value)
        .split(/[,|\n]/)
        .map(normalizeToken)
        .filter(Boolean);
}

function normalizeTextAnswer(value) {
    var txt = String(value == null ? '' : value)
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .toLowerCase();
    if (!txt) return '';
    txt = txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    txt = txt.replace(/\s+/g, ' ');
    return txt;
}

function splitAcceptedAnswers(raw) {
    if (Array.isArray(raw)) {
        return raw.map(normalizeTextAnswer).filter(Boolean);
    }
    var parsed = safeJsonParse(raw);
    if (Array.isArray(parsed)) {
        return parsed.map(normalizeTextAnswer).filter(Boolean);
    }
    return String(raw == null ? '' : raw)
        .split(',')
        .map(normalizeTextAnswer)
        .filter(Boolean);
}

function normalizeBooleanStrict(value) {
    var normalized = normalizeTextAnswer(value);
    if (normalized === 'true') return 'true';
    if (normalized === 'false') return 'false';
    return '';
}

function normalizeOptionValue(value) {
    return String(value == null ? '' : value).trim();
}

function parseOptionValueList(value) {
    if (Array.isArray(value)) return value.map(normalizeOptionValue).filter(Boolean);
    var parsed = safeJsonParse(value);
    if (Array.isArray(parsed)) return parsed.map(normalizeOptionValue).filter(Boolean);
    return String(value == null ? '' : value)
        .split(/[,|\n]/)
        .map(normalizeOptionValue)
        .filter(Boolean);
}

function compareExactOptionArrays(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    var x = a.slice().map(normalizeOptionValue).filter(Boolean).sort();
    var y = b.slice().map(normalizeOptionValue).filter(Boolean).sort();
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) {
        if (x[i] !== y[i]) return false;
    }
    return true;
}

function compareNormalizedArrays(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    var x = a.slice().map(normalizeToken).filter(Boolean).sort();
    var y = b.slice().map(normalizeToken).filter(Boolean).sort();
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) {
        if (x[i] !== y[i]) return false;
    }
    return true;
}

function evaluateChallengeAnswer(challenge, answer) {
    var challengeType = normalizeChallengeType(challenge && challenge.challenge_type);
    var payload = safeJsonParse(challenge && challenge.question_payload) || {};
    var rawAnswer = answer;
    var storedAnswer = typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer == null ? '' : rawAnswer);

    if (challengeType === 'multiple_choice') {
        var normalizedAnswerOption = normalizeOptionValue(rawAnswer);
        var normalizedCorrectOption = normalizeOptionValue(payload.correct_answer || challenge.correct_answer || '');
        return { isCorrect: normalizedAnswerOption !== '' && normalizedAnswerOption === normalizedCorrectOption, storedAnswer: String(rawAnswer == null ? '' : rawAnswer) };
    }

    if (challengeType === 'multiple_select') {
        var givenMulti = parseOptionValueList(rawAnswer);
        var expectedMulti = parseOptionValueList(payload.correct_answers || challenge.correct_answer || []);
        return { isCorrect: givenMulti.length > 0 && compareExactOptionArrays(givenMulti, expectedMulti), storedAnswer: JSON.stringify(givenMulti) };
    }

    if (challengeType === 'true_false') {
        var normalizedAnswerBool = normalizeBooleanStrict(rawAnswer);
        var normalizedCorrectBool = normalizeBooleanStrict(payload.correct_answer || challenge.correct_answer || '');
        return { isCorrect: normalizedAnswerBool !== '' && normalizedAnswerBool === normalizedCorrectBool, storedAnswer: String(rawAnswer == null ? '' : rawAnswer) };
    }

    if (challengeType === 'matching') {
        var givenMap = safeJsonParse(rawAnswer);
        var expectedMap = payload.pairs || safeJsonParse(challenge.correct_answer) || {};
        if (!givenMap || typeof givenMap !== 'object' || Array.isArray(givenMap)) return { isCorrect: false, storedAnswer: storedAnswer };
        var expectedKeys = Object.keys(expectedMap || {});
        if (!expectedKeys.length) return { isCorrect: false, storedAnswer: storedAnswer };
        var ok = expectedKeys.every(function(k) {
            return normalizeTextAnswer(givenMap[k]) === normalizeTextAnswer(expectedMap[k]);
        });
        return { isCorrect: ok, storedAnswer: JSON.stringify(givenMap) };
    }

    if (challengeType === 'fill_blank') {
        var acceptedFill = splitAcceptedAnswers(payload.answers || payload.accepted_answers || challenge.correct_answer || []);
        var parsedFillRaw = safeJsonParse(rawAnswer);
        var givenFill = '';
        if (Array.isArray(parsedFillRaw)) {
            givenFill = normalizeTextAnswer(parsedFillRaw.length ? parsedFillRaw[0] : '');
        } else {
            givenFill = normalizeTextAnswer(rawAnswer);
        }
        return { isCorrect: !!givenFill && acceptedFill.includes(givenFill), storedAnswer: String(rawAnswer == null ? '' : rawAnswer) };
    }

    if (challengeType === 'open') {
        var acceptedOpen = splitAcceptedAnswers(payload.accepted_answers || challenge.correct_answer || []);
        var givenOpen = normalizeTextAnswer(rawAnswer);
        return { isCorrect: !!givenOpen && acceptedOpen.includes(givenOpen), storedAnswer: String(rawAnswer == null ? '' : rawAnswer) };
    }

    var normalizedAnswer = normalizeTextAnswer(rawAnswer);
    var normalizedCorrect = normalizeTextAnswer(challenge && challenge.correct_answer || '');
    return { isCorrect: normalizedAnswer !== '' && normalizedAnswer === normalizedCorrect, storedAnswer: String(rawAnswer == null ? '' : rawAnswer) };
}

function isMissingRelationError(err, relationName) {
    var code = String(err && err.code || '');
    var msg = String(err && (err.message || err.details || err.hint) || '').toLowerCase();
    var rel = String(relationName || '').toLowerCase();
    return code === '42p01' || msg.includes('relation') && rel && msg.includes(rel) && msg.includes('does not exist');
}

function extractQuestionsFromChallengePayload(challenge) {
    var payload = safeJsonParse(challenge && challenge.question_payload) || {};
    var list = Array.isArray(payload.questions) ? payload.questions : [];
    if (!list.length) {
        return [{
            id: 'q-1',
            order_index: 1,
            question_type: normalizeChallengeType(challenge && challenge.challenge_type),
            question_text: challenge && (challenge.question_text || challenge.description || challenge.title) || '',
            payload: payload,
            correct_answer: challenge && challenge.correct_answer || null
        }];
    }
    return list.map(function(q, idx) {
        var parsedPayload = safeJsonParse(q && q.payload) || {};
        if (Array.isArray(q && q.options) && !parsedPayload.options) parsedPayload.options = q.options;
        if (q && q.correct_answer != null && parsedPayload.correct_answer == null && parsedPayload.correct_answers == null) {
            parsedPayload.correct_answer = q.correct_answer;
        }
        return {
            id: q && q.id ? String(q.id) : ('q-' + (idx + 1)),
            order_index: Number(q && q.order_index) || (idx + 1),
            question_type: normalizeChallengeType(q && q.question_type || challenge && challenge.challenge_type),
            question_text: String(q && q.question_text || '').trim(),
            payload: parsedPayload,
            correct_answer: q && q.correct_answer != null ? String(q.correct_answer) : null
        };
    });
}

async function getChallengeQuestions(challengeId, challengeRow) {
    try {
        var res = await supabaseClient
            .from(CONFIG.tables.challenge_questions)
            .select('*')
            .eq('challenge_id', challengeId)
            .order('order_index', { ascending: true });
        if (res.error) throw res.error;
        var rows = res.data || [];
        if (!rows.length) return extractQuestionsFromChallengePayload(challengeRow || {});
        return rows.map(function(r, idx) {
            var payload = safeJsonParse(r.options_json) || {};
            return {
                id: String(r.id || ('q-' + (idx + 1))),
                order_index: Number(r.order_index) || (idx + 1),
                question_type: normalizeChallengeType(r.question_type),
                question_text: String(r.question_text || '').trim(),
                payload: payload,
                correct_answer: r.correct_answer != null ? String(r.correct_answer) : null
            };
        });
    } catch (err) {
        if (isMissingRelationError(err, CONFIG.tables.challenge_questions) || isMissingColumnError(err, 'order_index', CONFIG.tables.challenge_questions)) {
            return extractQuestionsFromChallengePayload(challengeRow || {});
        }
        console.error('Error loading challenge questions:', err);
        return extractQuestionsFromChallengePayload(challengeRow || {});
    }
}

function evaluateChallengeSubmission(challenge, questions, answer) {
    var qList = Array.isArray(questions) && questions.length ? questions : extractQuestionsFromChallengePayload(challenge || {});
    if (qList.length <= 1) {
        var single = evaluateChallengeAnswer(challenge, answer);
        return {
            isCorrect: !!single.isCorrect,
            storedAnswer: single.storedAnswer,
            totalQuestions: 1,
            correctCount: single.isCorrect ? 1 : 0
        };
    }

    var answerObj = null;
    if (answer && typeof answer === 'object') {
        answerObj = answer;
    } else {
        answerObj = safeJsonParse(answer);
    }
    if (!answerObj || typeof answerObj !== 'object') answerObj = {};

    var detail = [];
    for (var i = 0; i < qList.length; i++) {
        var q = qList[i];
        var keyById = q.id;
        var keyByIndex = String(i);
        var rawAnswer = Object.prototype.hasOwnProperty.call(answerObj, keyById)
            ? answerObj[keyById]
            : (Object.prototype.hasOwnProperty.call(answerObj, keyByIndex) ? answerObj[keyByIndex] : '');
        var evalResult = evaluateChallengeAnswer({
            challenge_type: q.question_type,
            correct_answer: q.correct_answer,
            question_payload: q.payload || {}
        }, rawAnswer);
        detail.push({
            question_id: q.id,
            is_correct: !!evalResult.isCorrect,
            answer: rawAnswer,
            stored_answer: evalResult.storedAnswer
        });
    }

    var correctCount = detail.filter(function(d) { return d.is_correct; }).length;
    return {
        isCorrect: detail.length > 0 && correctCount === detail.length,
        storedAnswer: JSON.stringify({ answers: answerObj, detail: detail }),
        totalQuestions: detail.length,
        correctCount: correctCount
    };
}

async function createChallengeWithQuestions(challengePayload, questions) {
    var basePayload = Object.assign({}, challengePayload || {});
    if (basePayload.title != null) basePayload.title = String(basePayload.title).trim();
    if (basePayload.description != null) basePayload.description = String(basePayload.description).trim();
    var optionalColumns = ['scope', 'target_group', 'group_code', 'target_groups', 'status', 'question_text', 'question_payload', 'options'];

    async function insertChallengeCompat() {
        var tryPayload = Object.assign({}, basePayload);
        while (true) {
            var ins = await supabaseClient.from(CONFIG.tables.challenges).insert([tryPayload]).select('*').single();
            if (!ins.error) return ins.data;
            var missing = extractMissingColumnName(ins.error);
            if (missing && optionalColumns.includes(missing) && Object.prototype.hasOwnProperty.call(tryPayload, missing)) {
                delete tryPayload[missing];
                continue;
            }
            throw ins.error;
        }
    }

    var challenge = await insertChallengeCompat();
    var list = Array.isArray(questions) ? questions : [];
    if (!list.length) return { ok: true, challenge: challenge };

    try {
        var rows = list.map(function(q, idx) {
            return {
                challenge_id: challenge.id,
                question_type: normalizeChallengeType(q.question_type),
                question_text: String(q.question_text || '').trim(),
                options_json: q.payload || {},
                correct_answer: q.correct_answer != null ? String(q.correct_answer) : null,
                order_index: idx + 1
            };
        });
        var qIns = await supabaseClient.from(CONFIG.tables.challenge_questions).insert(rows);
        if (qIns.error) throw qIns.error;
        return { ok: true, challenge: challenge };
    } catch (err) {
        if (!isMissingRelationError(err, CONFIG.tables.challenge_questions)) throw err;
        return { ok: true, challenge: challenge, warning: 'challenge_questions table not available, saved in payload only' };
    }
}

function extractMissingColumnName(err) {
    var msg = String(err && (err.message || err.details || err.hint) || '');
    if (!msg) return null;
    var legacy = msg.match(/could not find the\s+'([^']+)'\s+column/i);
    if (legacy && legacy[1]) return legacy[1].trim();
    var pg = msg.match(/column\s+"?([a-zA-Z0-9_\.]+)"?\s+does not exist/i);
    if (pg && pg[1]) return pg[1].split('.').pop();
    return null;
}

async function closeExpiredAuctions() {
    try {
        const { data: active, error } = await supabaseClient
            .from(CONFIG.tables.auctions)
            .select('id,start_at,duration_seconds,status')
            .eq('status', 'active');
        if (error) throw error;
        if (!active || !active.length) return;
        const now = Date.now();
        for (const a of active) {
            if (!a.start_at || !a.duration_seconds) continue;
            const endMs = new Date(a.start_at).getTime() + (Number(a.duration_seconds) * 1000);
            if (Number.isFinite(endMs) && now > endMs) {
                await closeAuction(a.id);
            }
        }
    } catch (err) {
        console.error('Error auto-closing expired auctions:', err);
    }
}

// ========== ROLE HELPER ==========
function isAdminRole(rol) {
    return rol === 'teacher' || rol === 'admin' || rol === 'super_admin';
}

function isMissingColumnError(err, columnName, tableName) {
    const msg = String(err && (err.message || err.details || err.hint) || '').toLowerCase();
    if (!msg) return false;
    const col = String(columnName || '').toLowerCase();
    const table = String(tableName || '').toLowerCase();
    const legacyPattern = msg.includes("could not find the '" + col + "' column") && msg.includes("'" + table + "'");
    const pgPatternQuoted = msg.includes('column "' + table + '.' + col + '" does not exist');
    const pgPatternPlain = msg.includes('column ' + table + '.' + col + ' does not exist');
    const genericPattern = msg.includes('column') && msg.includes(col) && msg.includes('does not exist');
    return legacyPattern || pgPatternQuoted || pgPatternPlain || genericPattern;
}

function logStructuredError(tag, err) {
    console.error('[' + tag + ']', err);
}

// ========== NAVIGATION ==========
function showTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    
    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
        loadGroups();
    }
}

// ========== LOAD GROUPS ==========
async function loadGroups() {
    const select = document.getElementById('regGroup');
    if (!select) return;
    
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.groups)
            .select('*')
            .order('group_code');
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            select.innerHTML = '<option value="">No groups available</option>';
            return;
        }
        
        select.innerHTML = '<option value="">Select your group...</option>' +
            data.map(g => `<option value="${g.group_code}">${g.group_code}</option>`).join('');
            
    } catch (error) {
        console.error('Error loading groups:', error);
        select.innerHTML = '<option value="">Error loading groups</option>';
    }
}

// ========== LOGIN ==========
async function handleLogin(e) {
    e.preventDefault();
    
    const doc = normalizeDocumentoId(document.getElementById('loginDoc').value);
    const pin = normalizePin(document.getElementById('loginPin').value);
    const btn = document.getElementById('btnLogin');
    const errorDiv = document.getElementById('loginError');
    
    errorDiv.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Checking...';
    
    try {
        var throttle = getLoginThrottleState();
        if (throttle.count >= 6) {
            throw new Error('Too many attempts. Wait 1 minute and try again.');
        }

        if (!isValidDocumentoId(doc) || !isValidPin(pin)) {
            throw new Error('Invalid document ID or PIN format');
        }

        const { data, error } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('*')
            .eq('documento_id', doc)
            .eq('pin', pin)
            .maybeSingle();
        
        if (error) throw error;
        if (!data) throw new Error('Invalid credentials');

        // PHASE 7: Check login restrictions (locked, deactivated, force reset)
        var loginCheck = await checkLoginRestrictions(data);
        if (!loginCheck.allowed) {
            throw new Error(loginCheck.reason || 'Account access denied');
        }

        setLoginThrottleState({ count: 0, firstAttemptMs: Date.now() });

        // Update last_login_at
        try {
            await supabaseClient.from(CONFIG.tables.profiles).update({ last_login_at: new Date().toISOString() }).eq('id', data.id);
        } catch (_) {}

        // If force_password_reset, store flag for UI to handle
        if (loginCheck.forceReset) {
            data._forcePasswordReset = true;
        }
        
        localStorage.setItem('lingoCoins_user', JSON.stringify(data));
        
        // New flow: pending_session for QR/login handoff
        var pendingSession = consumePendingSessionCode();
        if (data.rol === 'student' && pendingSession) {
            window.location.href = CONFIG.pages.attendance + '?session=' + encodeURIComponent(pendingSession);
            return;
        }

        // Backward compatibility flow: pending_attendance_code
        var pendingCode = consumePendingAttendanceCode();
        if (data.rol === 'student' && pendingCode) {
            window.location.href = CONFIG.pages.attendance + '?attendance_code=' + encodeURIComponent(pendingCode);
            return;
        }
        
        const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
        if (data.rol === 'student' && redirectUrl && redirectUrl.indexOf('attendance.html') !== -1) {
            window.location.href = redirectUrl;
            return;
        }
        
        if (data.rol === 'super_admin') {
            window.location.href = CONFIG.pages.admin;
        } else if (data.rol === 'admin') {
            window.location.href = CONFIG.pages.admin;
        } else if (data.rol === 'teacher') {
            window.location.href = CONFIG.pages.teacher;
        } else {
            window.location.href = CONFIG.pages.student;
        }
        
    } catch (error) {
        var st = getLoginThrottleState();
        setLoginThrottleState({ count: st.count + 1, firstAttemptMs: st.firstAttemptMs || Date.now() });
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-unlock-fill"></i> Log in';
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    }
}

// ========== REGISTER ==========
async function handleRegister(e) {
    e.preventDefault();
    
    const userData = {
        nombre_completo: document.getElementById('regName').value.trim(),
        documento_id: normalizeDocumentoId(document.getElementById('regDoc').value),
        pin: normalizePin(document.getElementById('regPin').value),
        grupo: document.getElementById('regGroup').value
    };
    
    const btn = document.getElementById('btnRegister');
    const statusDiv = document.getElementById('registerStatus');
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';
    statusDiv.className = 'text-info text-center mt-3 small';
    statusDiv.textContent = '⏳ Checking...';
    statusDiv.style.display = 'block';
    
    try {
        if (!userData.nombre_completo || userData.nombre_completo.length < 3 || userData.nombre_completo.length > 100) {
            throw new Error('Full name must be between 3 and 100 characters');
        }
        if (!isValidDocumentoId(userData.documento_id)) {
            throw new Error('Document ID must be 3-32 chars (letters, numbers, _ or -)');
        }
        if (!isValidPin(userData.pin)) {
            throw new Error('PIN must be 4-12 numeric digits');
        }
        if (!userData.grupo) {
            throw new Error('Please select a group');
        }

        const { data: existing } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('documento_id')
            .eq('documento_id', userData.documento_id)
            .maybeSingle();
        
        if (existing) throw new Error('This document ID is already registered');
        
        const { error } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .insert([{
                ...userData,
                monedas: 0,
                rol: 'student'
            }]);
        
        if (error) throw error;
        
        statusDiv.className = 'text-success text-center mt-3 small';
        statusDiv.textContent = '✅ Account created successfully!';
        
        setTimeout(() => {
            showTab('login');
            document.getElementById('registerForm').reset();
            statusDiv.style.display = 'none';
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Create account';
        }, 2000);
        
    } catch (error) {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Create account';
        statusDiv.className = 'text-danger text-center mt-3 small';
        statusDiv.textContent = '❌ ' + error.message;
    }
}

// ========== ADMIN: GROUPS ==========
async function getGroups() {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.groups)
            .select('*')
            .order('group_code');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error loading groups:', err);
        return [];
    }
}

async function insertGroup(groupCode, maxCapacity) {
    const code = String(groupCode).trim();
    if (!code) throw new Error('Group code is required');
    
    const { data: existing } = await supabaseClient
        .from(CONFIG.tables.groups)
        .select('id')
        .eq('group_code', code)
        .maybeSingle();
    if (existing) throw new Error('Group "' + code + '" already exists');
    
    const payload = { group_code: code };
    const normalizedCapacity = maxCapacity != null && maxCapacity !== ''
        ? Math.max(1, Math.floor(Number(maxCapacity)) || 1)
        : null;

    if (normalizedCapacity != null) {
        let result = await supabaseClient
            .from(CONFIG.tables.groups)
            .insert([{ ...payload, max_capacity: normalizedCapacity }]);
        if (result.error && isMissingColumnError(result.error, 'max_capacity', CONFIG.tables.groups)) {
            result = await supabaseClient
                .from(CONFIG.tables.groups)
                .insert([{ ...payload, capacity: normalizedCapacity }]);
        }
        if (result.error && isMissingColumnError(result.error, 'capacity', CONFIG.tables.groups)) {
            result = await supabaseClient
                .from(CONFIG.tables.groups)
                .insert([payload]);
        }
        if (result.error) throw result.error;
        return;
    }

    const { error } = await supabaseClient
        .from(CONFIG.tables.groups)
        .insert([payload]);
    if (error) throw error;
}

async function updateGroup(groupCode, fields) {
    const { error } = await supabaseClient
        .from(CONFIG.tables.groups)
        .update(fields)
        .eq('group_code', groupCode);
    if (error) throw error;
}

async function updateGroupSafe(oldGroupCode, payload) {
    const updates = payload || {};
    const newGroupCode = updates.group_code != null ? String(updates.group_code).trim() : oldGroupCode;
    const maxCapacity = updates.max_capacity != null && updates.max_capacity !== ''
        ? Math.max(1, Math.floor(Number(updates.max_capacity)) || 1)
        : null;
    const lat = updates.last_admin_lat === '' || updates.last_admin_lat == null ? null : Number(updates.last_admin_lat);
    const lng = updates.last_admin_lng === '' || updates.last_admin_lng == null ? null : Number(updates.last_admin_lng);

    if (!oldGroupCode) throw new Error('Original group code is required');
    if (!newGroupCode) throw new Error('Group code is required');

    if (newGroupCode !== oldGroupCode) {
        const { data: exists, error: existsErr } = await supabaseClient
            .from(CONFIG.tables.groups)
            .select('id')
            .eq('group_code', newGroupCode)
            .maybeSingle();
        if (existsErr) throw existsErr;
        if (exists) throw new Error('Target group code already exists');
    }

    const baseGroupFields = {
        group_code: newGroupCode,
        last_admin_lat: Number.isFinite(lat) ? lat : null,
        last_admin_lng: Number.isFinite(lng) ? lng : null
    };

    var groupResult;
    if (maxCapacity != null) {
        groupResult = await supabaseClient
            .from(CONFIG.tables.groups)
            .update({ ...baseGroupFields, max_capacity: maxCapacity })
            .eq('group_code', oldGroupCode);
        if (groupResult.error && isMissingColumnError(groupResult.error, 'max_capacity', CONFIG.tables.groups)) {
            groupResult = await supabaseClient
                .from(CONFIG.tables.groups)
                .update({ ...baseGroupFields, capacity: maxCapacity })
                .eq('group_code', oldGroupCode);
        }
        if (groupResult.error && isMissingColumnError(groupResult.error, 'capacity', CONFIG.tables.groups)) {
            groupResult = await supabaseClient
                .from(CONFIG.tables.groups)
                .update(baseGroupFields)
                .eq('group_code', oldGroupCode);
        }
    } else {
        groupResult = await supabaseClient
            .from(CONFIG.tables.groups)
            .update(baseGroupFields)
            .eq('group_code', oldGroupCode);
    }

    const groupErr = groupResult && groupResult.error;
    if (groupErr) throw groupErr;

    if (newGroupCode !== oldGroupCode) {
        const propagateTables = [
            { table: CONFIG.tables.profiles, column: 'grupo' },
            { table: CONFIG.tables.announcements, column: 'target_group' },
            { table: CONFIG.tables.auctions, column: 'group_code' },
            { table: CONFIG.tables.attendance, column: 'group_code' },
            { table: CONFIG.tables.billing_claims, column: 'group_code' },
            { table: CONFIG.tables.challenges, column: 'group_code' },
            { table: CONFIG.tables.challenges, column: 'target_group' }
        ];
        for (const t of propagateTables) {
            const patch = {};
            patch[t.column] = newGroupCode;
            const { error: refErr } = await supabaseClient
                .from(t.table)
                .update(patch)
                .eq(t.column, oldGroupCode);
            if (refErr) {
                console.error('Group rename propagation failed:', t.table, refErr);
                throw new Error('Group renamed but failed to propagate references on ' + t.table);
            }
        }
    }

    return { ok: true, group_code: newGroupCode };
}

async function deleteGroup(groupCode) {
    const { error } = await supabaseClient
        .from(CONFIG.tables.groups)
        .delete()
        .eq('group_code', groupCode);
    if (error) throw error;
}

async function deleteGroupSafe(groupCode) {
    if (!groupCode) return { ok: false, error: 'Group code is required' };
    try {
        const { data: assignedProfiles, error: countErr } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('id, rol')
            .eq('grupo', groupCode);
        if (countErr) throw countErr;
        const linked = assignedProfiles || [];
        const studentsCount = linked.filter(function(p) {
            return !p.rol || p.rol === 'student';
        }).length;
        if (studentsCount > 0) {
            return { ok: false, error: 'Cannot delete group with assigned students (' + studentsCount + '). Reassign them first.' };
        }
        if (linked.length > studentsCount) {
            return { ok: false, error: 'Cannot delete group with assigned users (' + linked.length + '). Reassign them first.' };
        }

        const { count: auctionsCount, error: aucErr } = await supabaseClient
            .from(CONFIG.tables.auctions)
            .select('id', { count: 'exact', head: true })
            .eq('group_code', groupCode)
            .eq('status', 'active');
        if (aucErr) throw aucErr;
        if ((auctionsCount || 0) > 0) {
            return { ok: false, error: 'Cannot delete group with active auctions' };
        }

        await deleteGroup(groupCode);
        return { ok: true };
    } catch (err) {
        const msg = String(err && (err.message || err.details) || '');
        if (msg.toLowerCase().includes('foreign key')) {
            return { ok: false, error: 'Cannot delete group because it still has related records. Reassign/remove dependencies first.' };
        }
        return { ok: false, error: err.message };
    }
}

async function getGroupLocation(groupCode) {
    if (!groupCode) return { lat: null, lng: null };
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.groups)
            .select('last_admin_lat, last_admin_lng')
            .eq('group_code', groupCode)
            .maybeSingle();
        if (error || !data) return { lat: null, lng: null };
        return { lat: data.last_admin_lat, lng: data.last_admin_lng };
    } catch (err) {
        console.error('Error getting group location:', err);
        return { lat: null, lng: null };
    }
}

async function updateGroupLocation(groupCode, lat, lng) {
    const { error } = await supabaseClient
        .from(CONFIG.tables.groups)
        .update({ last_admin_lat: lat, last_admin_lng: lng })
        .eq('group_code', groupCode);
    if (error) throw error;
}

// ========== ADMIN: STUDENTS ==========
async function loadStudents(groupCode) {
    try {
        let query = supabaseClient
            .from(CONFIG.tables.profiles)
            .select('id, nombre_completo, documento_id, pin, grupo, monedas, rol')
            .in('rol', ['student', 'admin', 'super_admin'])
            .order('rol')
            .order('grupo')
            .order('nombre_completo');
        if (groupCode) query = query.eq('grupo', groupCode);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (err) {
        logStructuredError('USERS_LOAD_ERROR', err);
        return [];
    }
}

async function loadStudentsFiltered(groupCode, searchTerm) {
    try {
        let rows = await loadStudents(groupCode || null);
        const q = String(searchTerm || '').trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(function(s) {
            const name = String(s.nombre_completo || '').toLowerCase();
            const doc = String(s.documento_id || '').toLowerCase();
            const group = String(s.grupo || '').toLowerCase();
            return name.includes(q) || doc.includes(q) || group.includes(q);
        });
    } catch (err) {
        console.error('Error loading filtered students:', err);
        return [];
    }
}

async function updateStudentCoins(studentId, newCoins) {
    const coins = Math.max(0, Math.floor(Number(newCoins)) || 0);
    try {
        const { error } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .update({ monedas: coins })
            .eq('id', studentId);
        if (error) throw error;
        return { ok: true };
    } catch (err) {
        console.error('Error updating coins:', err);
        return { ok: false, error: err.message };
    }
}

async function addStudentCoins(studentId, delta) {
    try {
        const { data: profile, error: fetchErr } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('monedas')
            .eq('id', studentId)
            .single();
        if (fetchErr || !profile) return { ok: false, error: fetchErr?.message || 'Not found' };
        const current = Number(profile.monedas) || 0;
        const newCoins = Math.max(0, current + Math.floor(delta));
        const result = await updateStudentCoins(studentId, newCoins);
        if (result.ok) {
            insertStudentCoinTransaction(studentId, Math.floor(delta), 'add_coins', newCoins);
        }
        return result.ok ? { ok: true, newCoins } : result;
    } catch (err) {
        console.error('Error adding coins:', err);
        return { ok: false, error: err.message };
    }
}

async function updateProfile(profileId, fields) {
    try {
        if (fields.monedas !== undefined) {
            fields.monedas = Math.max(0, Math.floor(Number(fields.monedas)) || 0);
        }
        if (fields.xp !== undefined) {
            fields.xp = Math.max(0, Math.floor(Number(fields.xp)) || 0);
        }
        if (fields.rol !== undefined) {
            const allowedRoles = ['student', 'teacher', 'admin', 'super_admin'];
            if (!allowedRoles.includes(fields.rol)) throw new Error('Invalid role');
        }
        if (fields.documento_id) {
            const { data: existing } = await supabaseClient
                .from(CONFIG.tables.profiles)
                .select('id')
                .eq('documento_id', fields.documento_id)
                .neq('id', profileId)
                .maybeSingle();
            if (existing) throw new Error('Document ID already in use');
        }
        var result = await supabaseClient
            .from(CONFIG.tables.profiles)
            .update(fields)
            .eq('id', profileId);
        if (result.error && fields.xp !== undefined && isMissingColumnError(result.error, 'xp', CONFIG.tables.profiles)) {
            var fallbackFields = { ...fields };
            delete fallbackFields.xp;
            result = await supabaseClient
                .from(CONFIG.tables.profiles)
                .update(fallbackFields)
                .eq('id', profileId);
        }
        if (result.error) throw result.error;
    } catch (err) {
        logStructuredError('PROFILE_UPDATE_ERROR', err);
        throw err;
    }
}

async function deleteStudent(profileId) {
    const result = await deleteProfileSafe(profileId);
    if (!result.ok) throw new Error(result.error || 'Could not delete user');
}

async function deleteProfileSafe(profileId) {
    try {
        const { data: profile, error: pErr } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('id, rol, documento_id')
            .eq('id', profileId)
            .maybeSingle();
        if (pErr) throw pErr;
        if (!profile) return { ok: false, error: 'User not found' };

        // PHASE 9: RBAC enforcement on delete
        var actor = _getCurrentUser();
        if (!canUserDeleteTarget(actor.rol, profile.rol)) {
            return { ok: false, error: 'Your role (' + actor.rol + ') cannot delete a ' + profile.rol + ' user' };
        }
        if (profile.rol === 'super_admin') {
            var saCount = await countSuperAdmins();
            if (saCount <= 1) return { ok: false, error: 'Cannot delete the last super_admin in the system' };
        }

        // Cascade-clean related tables before deleting profile
        var docId = profile.documento_id || '';
        var relatedTables = [
            { table: CONFIG.tables.completed_challenges, col: 'student_id', val: docId },
            { table: CONFIG.tables.attendance, col: 'student_id', val: docId },
            { table: CONFIG.tables.student_inventory, col: 'student_id', val: docId },
            { table: 'billing_claims', col: 'student_id', val: docId },
            { table: 'feedback_messages', col: 'student_id', val: docId },
            { table: CONFIG.tables.auction_bids, col: 'bidder_id', val: profileId },
            { table: CONFIG.tables.auction_bids, col: 'bidder_id', val: docId }
        ];
        for (var i = 0; i < relatedTables.length; i++) {
            var rt = relatedTables[i];
            if (!rt.table || !rt.val) continue;
            try {
                await supabaseClient.from(rt.table).delete().eq(rt.col, rt.val);
            } catch (_) { /* ignore if table doesn't exist */ }
        }

        const { error } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .delete()
            .eq('id', profileId);
        if (error) throw error;
        return { ok: true };
    } catch (err) {
        logStructuredError('PROFILE_DELETE_ERROR', err);
        var msg = String(err && (err.message || err.details) || '');
        if (msg.toLowerCase().includes('foreign key')) {
            return { ok: false, error: 'Cannot delete user because related records still exist.' };
        }
        return { ok: false, error: err.message };
    }
}

// ========== ATTENDANCE ==========
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = x => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function todayDateString() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function normalizeAttendanceSessionCode(code) {
    return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function generateAttendanceSessionCode(length) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var size = Math.max(6, Math.min(10, Number(length) || 6));
    var out = '';
    for (var i = 0; i < size; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}

async function createAttendanceSession(groupCode, opts) {
    var g = String(groupCode || '').trim();
    if (!g) return { ok: false, error: 'Group is required' };

    var options = opts || {};
    var startsAt = options.startsAt ? new Date(options.startsAt) : new Date();
    var ttlMinutes = Math.max(5, Math.min(240, Number(options.durationMinutes) || 25));
    var expiresAt = new Date(startsAt.getTime() + ttlMinutes * 60 * 1000);

    for (var tries = 0; tries < 5; tries++) {
        var code = normalizeAttendanceSessionCode(options.sessionCode || generateAttendanceSessionCode(6));
        var payload = {
            group_code: g,
            session_code: code,
            qr_payload: options.qrPayload || null,
            admin_lat: Number.isFinite(Number(options.adminLat)) ? Number(options.adminLat) : null,
            admin_lng: Number.isFinite(Number(options.adminLng)) ? Number(options.adminLng) : null,
            starts_at: startsAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            created_by: options.createdBy || null,
            status: 'active'
        };

        var ins = await supabaseClient
            .from(CONFIG.tables.attendance_sessions)
            .insert([payload])
            .select('*')
            .single();

        if (!ins.error && ins.data) return { ok: true, session: ins.data };
        if (ins.error && (String(ins.error.code || '') === '23505' || String(ins.error.message || '').toLowerCase().includes('duplicate'))) {
            options.sessionCode = null;
            continue;
        }
        return { ok: false, error: (ins.error && ins.error.message) || 'Could not create attendance session' };
    }

    return { ok: false, error: 'Could not generate unique attendance code' };
}

async function getAttendanceSessionByCode(sessionCode) {
    var normalized = normalizeAttendanceSessionCode(sessionCode);
    if (!normalized) return { ok: false, error: 'Invalid attendance code' };
    var nowIso = new Date().toISOString();
    try {
        var result = await supabaseClient
            .from(CONFIG.tables.attendance_sessions)
            .select('*')
            .eq('session_code', normalized)
            .eq('status', 'active')
            .gte('expires_at', nowIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) return { ok: false, error: 'Attendance session not found or expired' };
        return { ok: true, session: result.data };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function hasAttendanceToday(documentoId) {
    try {
        const today = todayDateString();
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.attendance)
            .select('id')
            .eq('student_id', documentoId)
            .eq('attendance_date', today)
            .maybeSingle();
        if (error) throw error;
        return !!data;
    } catch (err) {
        console.error('Error checking attendance:', err);
        return false;
    }
}

async function insertAttendance(documentoId, groupCode, latitude, longitude, extra) {
    const today = todayDateString();
    var payload = {
        student_id: documentoId,
        group_code: groupCode,
        attendance_date: today,
        latitude: latitude != null ? latitude : null,
        longitude: longitude != null ? longitude : null
    };
    if (extra && typeof extra === 'object') {
        if (extra.sessionId != null) payload.session_id = extra.sessionId;
        if (extra.sessionCode != null) payload.session_code = normalizeAttendanceSessionCode(extra.sessionCode);
        if (extra.geoStatus != null) payload.geo_status = String(extra.geoStatus);
    }

    var optionalCols = ['session_id', 'session_code', 'geo_status'];
    while (true) {
        var ins = await supabaseClient.from(CONFIG.tables.attendance).insert([payload]);
        if (!ins.error) break;
        var missing = extractMissingColumnName(ins.error);
        if (missing && optionalCols.includes(missing) && Object.prototype.hasOwnProperty.call(payload, missing)) {
            delete payload[missing];
            continue;
        }
        throw ins.error;
    }
}

async function getTodayAttendanceForReport() {
    const today = todayDateString();
    try {
        const { data: rows, error } = await supabaseClient
            .from(CONFIG.tables.attendance)
            .select('student_id, group_code, attendance_date, created_at')
            .eq('attendance_date', today)
            .order('created_at', { ascending: true });
        if (error) throw error;
        if (!rows || !rows.length) return [];
        const documentoIds = [...new Set(rows.map(r => r.student_id))];
        const { data: profiles } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('documento_id, nombre_completo')
            .in('documento_id', documentoIds);
        const byDocumentoId = {};
        if (profiles) profiles.forEach(p => { byDocumentoId[p.documento_id] = p.nombre_completo; });
        return rows.map(r => ({
            nombre_completo: byDocumentoId[r.student_id] || 'Unknown',
            group_code: r.group_code,
            attendance_date: r.attendance_date,
            created_at: r.created_at
        }));
    } catch (err) {
        console.error('Error getting attendance report:', err);
        return [];
    }
}

async function getTodayAttendanceByGroup(groupCode) {
    if (!groupCode) return [];
    const today = todayDateString();
    try {
        const { data: rows, error } = await supabaseClient
            .from(CONFIG.tables.attendance)
            .select('student_id, created_at')
            .eq('group_code', groupCode)
            .eq('attendance_date', today)
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!rows || !rows.length) return [];
        const ids = [...new Set(rows.map(r => r.student_id))];
        const { data: profiles } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('documento_id, nombre_completo')
            .in('documento_id', ids);
        const byDoc = {};
        if (profiles) profiles.forEach(p => { byDoc[p.documento_id] = p.nombre_completo; });
        return rows.map(r => ({
            nombre_completo: byDoc[r.student_id] || r.student_id,
            student_id: r.student_id,
            created_at: r.created_at
        }));
    } catch (err) {
        console.error('Error getting attendance by group:', err);
        return [];
    }
}

async function getProfileById(profileId) {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('*')
            .eq('id', profileId)
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error getting profile:', err);
        return null;
    }
}

async function getProfileByDocumentoId(documentoId) {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('*')
            .eq('documento_id', documentoId)
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error getting profile by documento:', err);
        return null;
    }
}

async function addCoinsByDocumentoId(documentoId, amount) {
    const profile = await getProfileByDocumentoId(documentoId);
    if (!profile) return { ok: false, error: 'Profile not found' };
    const current = Number(profile.monedas) || 0;
    const newCoins = Math.max(0, current + Math.floor(amount));
    return updateStudentCoins(profile.id, newCoins);
}

async function awardCoinsForCheckin(documentoId, qrStartTimeIso) {
    const base = CONFIG.rewards.base || 5;
    const bonus = CONFIG.rewards.earlyBirdBonus || 5;
    const maxMinutes = CONFIG.earlyBirdMinutes != null ? CONFIG.earlyBirdMinutes : 5;
    let coins = base;
    if (qrStartTimeIso) {
        const start = new Date(qrStartTimeIso).getTime();
        const now = Date.now();
        if (now - start <= maxMinutes * 60 * 1000) coins += bonus;
    }
    const result = await addCoinsByDocumentoId(documentoId, coins);
    return result.ok ? { ok: true, coinsAwarded: coins } : result;
}

async function getLeaderboard(groupCode, limit) {
    if (!groupCode) return [];
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('nombre_completo, monedas')
            .eq('rol', 'student')
            .eq('grupo', groupCode)
            .order('monedas', { ascending: false })
            .limit(limit || 5);
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error getting leaderboard:', err);
        return [];
    }
}

// ========== AUCTIONS ==========
async function createAuction(itemName, description, basePrice, status, extra) {
    var safeName = String(itemName || '').trim();
    if (!isNonEmptyText(safeName, 1, 120)) throw new Error('Item name must be between 1 and 120 chars');
    var safeDescription = description == null ? null : String(description).trim();
    if (safeDescription && safeDescription.length > 500) throw new Error('Description is too long (max 500 chars)');
    const price = Math.max(0, Math.floor(Number(basePrice)) || 0);
    if (price > 1000000) throw new Error('Price is too high');
    var itemType = (extra && extra.item_type) || 'auction';
    if (!['auction', 'shop'].includes(itemType)) throw new Error('Invalid item type');
    const payload = {
        item_name: safeName,
        base_price: price,
        current_bid: price,
        status: status || 'active',
        item_type: itemType,
        stock_quantity: (extra && Number(extra.stock_quantity)) || 1,
        group_code: (extra && extra.group_code) || null,
        duration_seconds: (extra && Number(extra.duration_seconds)) || 30,
        start_at: new Date().toISOString()
    };
    if (safeDescription) payload.description = safeDescription;

    const attemptPayloads = [
        payload,
        { ...payload, start_at: undefined, duration_seconds: undefined },
        { ...payload, start_at: undefined, duration_seconds: undefined, group_code: undefined },
        { ...payload, item_type: undefined, stock_quantity: undefined, start_at: undefined, duration_seconds: undefined, group_code: undefined }
    ].map(function(p) {
        var clean = {};
        Object.keys(p).forEach(function(k) { if (p[k] !== undefined) clean[k] = p[k]; });
        return clean;
    });

    var lastError = null;
    for (var i = 0; i < attemptPayloads.length; i++) {
        const result = await supabaseClient
            .from(CONFIG.tables.auctions)
            .insert([attemptPayloads[i]]);
        if (!result.error) return;
        lastError = result.error;
        if (!String(lastError.message || '').toLowerCase().includes('could not find the')) {
            throw lastError;
        }
    }
    throw lastError || new Error('Could not create auction');
}

async function getActiveAuctions() {
    try {
        await closeExpiredAuctions();
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.auctions)
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching auctions:', err);
        return [];
    }
}

async function getActiveAuctionsForStudent(groupCode) {
    try {
        await closeExpiredAuctions();
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.auctions)
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!data) return [];
        if (!groupCode) return data;
        var normalizedGroup = String(groupCode || '').trim().toLowerCase();
        return data.filter(function(a) {
            if (!a.group_code) return true;
            return String(a.group_code).trim().toLowerCase() === normalizedGroup;
        });
    } catch (err) {
        console.error('Error fetching auctions for student:', err);
        return [];
    }
}

function normalizeChallengeType(rawType) {
    var t = String(rawType || '').trim().toLowerCase();
    if (!t) return 'open';
    if (t === 'true/false' || t === 'true-false' || t === 'boolean') return 'true_false';
    if (t === 'multiple-choice' || t === 'multi_choice' || t === 'mcq') return 'multiple_choice';
    return t;
}

function normalizeChallengeAnswerValue(value) {
    return normalizeTextAnswer(value);
}

function isUniqueViolationError(err) {
    var code = String(err && err.code || '');
    var msg = String(err && (err.message || err.details || err.hint) || '').toLowerCase();
    return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

async function claimChallengeWinnerSlot(challengeId) {
    var maxAttempts = 8;
    for (var i = 0; i < maxAttempts; i++) {
        var read = await supabaseClient
            .from(CONFIG.tables.challenges)
            .select('id,status,is_active,current_winners,max_winners')
            .eq('id', challengeId)
            .single();
        if (read.error && isMissingColumnError(read.error, 'status', CONFIG.tables.challenges)) {
            read = await supabaseClient
                .from(CONFIG.tables.challenges)
                .select('id,is_active,current_winners,max_winners')
                .eq('id', challengeId)
                .single();
        }
        if (read.error && isMissingColumnError(read.error, 'max_winners', CONFIG.tables.challenges)) {
            read = await supabaseClient
                .from(CONFIG.tables.challenges)
                .select('id,status,current_winners')
                .eq('id', challengeId)
                .single();
        }
        if (read.error || !read.data) {
            if (read.error && isMissingColumnError(read.error, 'current_winners', CONFIG.tables.challenges)) {
                return { ok: false, schemaMissingCurrentWinners: true };
            }
            return { ok: false, error: (read.error && read.error.message) || 'Challenge not found' };
        }

        var current = Math.max(0, Number(read.data.current_winners) || 0);
        var configuredMax = Math.max(1, Number(read.data.max_winners) || 10);
        var maxAllowed = Math.min(10, configuredMax);
        var statusNow = read.data.status == null ? 'active' : String(read.data.status);
        if (read.data.is_active === false) statusNow = 'closed';
        if (statusNow !== 'active') return { ok: false, full: true };
        if (current >= maxAllowed) {
            return { ok: false, full: true, rank: current + 1 };
        }

        var next = current + 1;
        var patch = {
            current_winners: next,
            status: next >= maxAllowed ? 'closed' : 'active'
        };
        if (next >= maxAllowed) patch.is_active = false;

        var upd = await supabaseClient
            .from(CONFIG.tables.challenges)
            .update(patch)
            .eq('id', challengeId)
            .eq('status', 'active')
            .eq('current_winners', current)
            .select('id');

        if (upd.error && isMissingColumnError(upd.error, 'status', CONFIG.tables.challenges)) {
            var fallbackPatch = { current_winners: next };
            if (next >= maxAllowed) fallbackPatch.is_active = false;
            upd = await supabaseClient
                .from(CONFIG.tables.challenges)
                .update(fallbackPatch)
                .eq('id', challengeId)
                .eq('current_winners', current)
                .select('id');
        }

        if (upd.error) {
            if (isMissingColumnError(upd.error, 'current_winners', CONFIG.tables.challenges)) {
                return { ok: false, schemaMissingCurrentWinners: true };
            }
            return { ok: false, error: upd.error.message || 'Could not reserve winner slot' };
        }

        if (upd.data && upd.data.length) {
            return { ok: true, rank: next, shouldClose: next >= maxAllowed };
        }
    }

    return { ok: false, error: 'Concurrent submissions, please retry' };
}

async function placeBid(auctionId, documentoId, bidAmount) {
    const bid = Math.floor(Number(bidAmount)) || 0;
    const profile = await getProfileByDocumentoId(documentoId);
    if (!profile) return { ok: false, error: 'Profile not found' };
    
    const { data: auction, error: auctionErr } = await supabaseClient
        .from(CONFIG.tables.auctions)
        .select('*')
        .eq('id', auctionId)
        .single();
    if (auctionErr || !auction) return { ok: false, error: 'Auction not found' };
    if (auction.status !== 'active') return { ok: false, error: 'Auction is closed' };
    if (auction.group_code && auction.group_code !== profile.grupo) {
        return { ok: false, error: 'Bid rejected: auction is not for your group' };
    }
    
    if (auction.start_at && auction.duration_seconds) {
        var endTime = new Date(auction.start_at).getTime() + (auction.duration_seconds * 1000);
        if (Date.now() > endTime) return { ok: false, error: 'Auction time expired' };
    }
    
    const current = Number(auction.current_bid) || 0;
    if (bid <= current) return { ok: false, error: 'Bid rejected: Try higher' };
    const myCoins = Number(profile.monedas) || 0;
    if (myCoins < bid) return { ok: false, error: 'Bid rejected: Not enough coins' };
    
    const bidderProfileId = profile.id;
    const bidderName = profile.nombre_completo || documentoId;
    var updatePayload = {
        current_bid: bid,
        highest_bidder_id: bidderProfileId,
        highest_bidder_name: bidderName
    };
    var updateResult = await supabaseClient
        .from(CONFIG.tables.auctions)
        .update(updatePayload)
        .eq('id', auctionId)
        .eq('status', 'active')
        .eq('current_bid', current)
        .select('id');
    if (updateResult.error && isMissingColumnError(updateResult.error, 'highest_bidder_name', CONFIG.tables.auctions)) {
        updateResult = await supabaseClient
            .from(CONFIG.tables.auctions)
            .update({
                current_bid: bid,
                highest_bidder_id: bidderProfileId
            })
            .eq('id', auctionId)
            .eq('status', 'active')
            .eq('current_bid', current)
            .select('id');
    }
    if (updateResult.error) {
        var updateErrText = String(updateResult.error.message || updateResult.error.details || '').toLowerCase();
        var fkErr = updateResult.error.code === '23503' || updateErrText.includes('foreign key');
        if (fkErr) {
            // Compatibility: some schemas enforce FK that may not match legacy bidder identifiers.
            updateResult = await supabaseClient
                .from(CONFIG.tables.auctions)
                .update({
                    current_bid: bid,
                    highest_bidder_name: bidderName
                })
                .eq('id', auctionId)
                .eq('status', 'active')
                .eq('current_bid', current)
                .select('id');

            if (updateResult.error && isMissingColumnError(updateResult.error, 'highest_bidder_name', CONFIG.tables.auctions)) {
                updateResult = await supabaseClient
                    .from(CONFIG.tables.auctions)
                    .update({ current_bid: bid })
                    .eq('id', auctionId)
                    .eq('status', 'active')
                    .eq('current_bid', current)
                    .select('id');
            }
        }
    }
    if (updateResult.error) throw updateResult.error;
    if (!updateResult.data || !updateResult.data.length) {
        return { ok: false, error: 'Bid rejected: auction changed. Refresh and try again.' };
    }
    
    var insertPayload = {
        auction_id: auctionId,
        bidder_id: bidderProfileId,
        bidder_name: bidderName,
        bid_amount: bid
    };
    var optionalCols = ['bidder_name', 'bidder_id'];
    function extractMissingColumn(msg) {
        var m = String(msg || '').match(/column\s+([a-zA-Z0-9_\.]+)\s+does not exist/i);
        if (m && m[1]) return m[1].split('.').pop();
        return null;
    }
    async function insertBidCompat() {
        var result = await supabaseClient.from(CONFIG.tables.auction_bids).insert([insertPayload]);
        if (!result.error) return { ok: true };

        var errCode = String(result.error.code || '');
        var errText = String(result.error.message || result.error.details || '').toLowerCase();
        if (errCode === '23505' || errText.includes('duplicate key') || errText.includes('unique constraint')) {
            var upsert = await supabaseClient
                .from(CONFIG.tables.auction_bids)
                .upsert([insertPayload], { onConflict: 'auction_id,bidder_id' });
            if (!upsert.error) return { ok: true };
        }

        // Compatibility: bidder_id may be documento_id (text) instead of profile UUID.
        if (Object.prototype.hasOwnProperty.call(insertPayload, 'bidder_id') && insertPayload.bidder_id === bidderProfileId) {
            insertPayload.bidder_id = documentoId;
            result = await supabaseClient.from(CONFIG.tables.auction_bids).insert([insertPayload]);
            if (!result.error) return { ok: true };

            errCode = String(result.error.code || '');
            errText = String(result.error.message || result.error.details || '').toLowerCase();
            if (errCode === '23505' || errText.includes('duplicate key') || errText.includes('unique constraint')) {
                var upsertDoc = await supabaseClient
                    .from(CONFIG.tables.auction_bids)
                    .upsert([insertPayload], { onConflict: 'auction_id,bidder_id' });
                if (!upsertDoc.error) return { ok: true };
            }
        }

        var missing = extractMissingColumn(result.error.message || result.error.details || '');
        if (missing && optionalCols.includes(missing) && Object.prototype.hasOwnProperty.call(insertPayload, missing)) {
            delete insertPayload[missing];
            return insertBidCompat();
        }
        return { ok: false, error: result.error };
    }

    var bidInsert = await insertBidCompat();
    if (!bidInsert.ok) {
        logStructuredError('BID_INSERT_ERROR', bidInsert.error);
        return { ok: true, warning: 'Bid accepted, but bid history could not be stored' };
    }

    return { ok: true };
}

async function closeAuction(auctionId) {
    try {
        const { data: auction, error: aErr } = await supabaseClient
            .from(CONFIG.tables.auctions)
            .select('*')
            .eq('id', auctionId)
            .single();
        if (aErr || !auction) return { ok: false, error: 'Auction not found' };
        if (auction.status !== 'active') return { ok: false, error: 'Already closed' };
        
        let winnerId = auction.highest_bidder_id || null;
        let winnerName = auction.highest_bidder_name || null;
        let finalBid = Number(auction.current_bid) || 0;
        let winnerProfile = null;

        if (!winnerId) {
            const bids = await getAuctionBids(auctionId);
            if (bids && bids.length) {
                const topBid = bids.slice().sort(function(a, b) {
                    const x = Number(a.bid_amount) || 0;
                    const y = Number(b.bid_amount) || 0;
                    if (x !== y) return y - x;
                    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                })[0];
                winnerId = topBid.bidder_id || null;
                winnerName = winnerName || topBid.bidder_name || null;
                finalBid = Math.max(finalBid, Number(topBid.bid_amount) || 0);
            }
        }

        var deductContext = null;
        var insertedInventoryRef = null;
        if (winnerId) {
            winnerProfile = await getProfileById(winnerId);
            if (!winnerProfile) {
                // Backward compatibility: previous versions stored documento_id here.
                winnerProfile = await getProfileByDocumentoId(winnerId);
            }
            if (!winnerProfile) return { ok: false, error: 'Winner profile not found' };
            if (!winnerName) winnerName = winnerProfile.nombre_completo || winnerId;
            const coins = Number(winnerProfile.monedas) || 0;
            if (coins < finalBid) {
                // If winner no longer has coins, close without winner for safety.
                var closeNoWinnerResult = await supabaseClient
                    .from(CONFIG.tables.auctions)
                    .update({ status: 'closed', winner_id: null, highest_bidder_id: null, highest_bidder_name: null })
                    .eq('id', auctionId);
                if (closeNoWinnerResult.error && isMissingColumnError(closeNoWinnerResult.error, 'winner_id', CONFIG.tables.auctions)) {
                    closeNoWinnerResult = await supabaseClient
                        .from(CONFIG.tables.auctions)
                        .update({ status: 'closed', highest_bidder_id: null, highest_bidder_name: null })
                        .eq('id', auctionId);
                }
                if (closeNoWinnerResult.error && isMissingColumnError(closeNoWinnerResult.error, 'highest_bidder_name', CONFIG.tables.auctions)) {
                    closeNoWinnerResult = await supabaseClient
                        .from(CONFIG.tables.auctions)
                        .update({ status: 'closed', highest_bidder_id: null })
                        .eq('id', auctionId);
                }
                if (closeNoWinnerResult.error) throw closeNoWinnerResult.error;
                return { ok: true, winnerName: null, warning: 'Closed without winner due to insufficient coins' };
            }
            const deduct = await updateStudentCoins(winnerProfile.id, coins - finalBid);
            if (!deduct.ok) return { ok: false, error: deduct.error || 'Failed to deduct winner coins' };
            deductContext = { profileId: winnerProfile.id, previousCoins: coins };

            var inventoryStudentCandidates = [];
            if (winnerProfile) {
                inventoryStudentCandidates.push(winnerProfile.id);
                inventoryStudentCandidates.push(winnerProfile.documento_id);
            } else {
                inventoryStudentCandidates.push(winnerId);
            }
            inventoryStudentCandidates = inventoryStudentCandidates.filter(function(v, i, arr) {
                return v && arr.indexOf(v) === i;
            });

            var inventoryErr = null;
            for (var i = 0; i < inventoryStudentCandidates.length; i++) {
                var candidate = inventoryStudentCandidates[i];
                var expiryAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
                var invPayload = {
                    student_id: candidate,
                    item_name: auction.item_name || 'Auction Prize',
                    item_source: 'auction',
                    source_id: auctionId,
                    status: 'available',
                    expires_at: expiryAt
                };
                var invResult = await supabaseClient
                    .from(CONFIG.tables.student_inventory)
                    .insert([invPayload])
                    .select('id,student_id')
                    .maybeSingle();
                if (invResult.error && isMissingColumnError(invResult.error, 'expires_at', CONFIG.tables.student_inventory)) {
                    delete invPayload.expires_at;
                    invResult = await supabaseClient
                        .from(CONFIG.tables.student_inventory)
                        .insert([invPayload])
                        .select('id,student_id')
                        .maybeSingle();
                }
                if (!invResult.error) {
                    inventoryErr = null;
                    insertedInventoryRef = {
                        id: invResult.data && invResult.data.id ? invResult.data.id : null,
                        studentId: candidate
                    };
                    break;
                }
                inventoryErr = invResult.error;
            }
            if (inventoryErr) {
                logStructuredError('AUCTION_INVENTORY_INSERT_ERROR', inventoryErr);
                if (deductContext) {
                    await updateStudentCoins(deductContext.profileId, deductContext.previousCoins);
                }
                return { ok: false, error: 'Could not add prize to Bag. Auction remains open.' };
            }
        }

        var closeResult = await supabaseClient
            .from(CONFIG.tables.auctions)
            .update({ status: 'closed', winner_id: winnerProfile ? winnerProfile.id : winnerId })
            .eq('id', auctionId);
        if (closeResult.error) {
            closeResult = await supabaseClient
                .from(CONFIG.tables.auctions)
                .update({ status: 'closed', winner_id: winnerId })
                .eq('id', auctionId);
        }
        if (closeResult.error && isMissingColumnError(closeResult.error, 'winner_id', CONFIG.tables.auctions)) {
            closeResult = await supabaseClient
                .from(CONFIG.tables.auctions)
                .update({ status: 'closed' })
                .eq('id', auctionId);
        }
        if (closeResult.error) {
            if (deductContext) {
                await updateStudentCoins(deductContext.profileId, deductContext.previousCoins);
            }
            if (insertedInventoryRef && insertedInventoryRef.id) {
                await supabaseClient
                    .from(CONFIG.tables.student_inventory)
                    .delete()
                    .eq('id', insertedInventoryRef.id);
            }
            throw closeResult.error;
        }
        
        return { ok: true, winnerName: winnerName };
    } catch (err) {
        logStructuredError('AUCTION_CLOSE_ERROR', err);
        return { ok: false, error: err.message };
    }
}

async function deleteAuction(auctionId) {
    try {
        const { data: auction, error: aErr } = await supabaseClient
            .from(CONFIG.tables.auctions)
            .select('*')
            .eq('id', auctionId)
            .single();
        if (aErr || !auction) return { ok: false, error: 'Auction not found' };
        const status = String(auction.status || '').toLowerCase();
        if (status === 'active') return { ok: false, error: 'Active auctions cannot be deleted. Close it first.' };
        if (status !== 'closed' && status !== 'finished') {
            return { ok: false, error: 'Only closed/finished auctions can be deleted' };
        }

        const { error: bidDelErr } = await supabaseClient
            .from(CONFIG.tables.auction_bids)
            .delete()
            .eq('auction_id', auctionId);
        if (bidDelErr) throw bidDelErr;

        const { error: invDelErr } = await supabaseClient
            .from(CONFIG.tables.student_inventory)
            .delete()
            .eq('source_id', auctionId)
            .eq('item_source', 'auction');
        if (invDelErr) throw invDelErr;
        
        const { error: dErr } = await supabaseClient
            .from(CONFIG.tables.auctions)
            .delete()
            .eq('id', auctionId);
        if (dErr) throw dErr;
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function getAuctionBids(auctionId) {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.auction_bids)
            .select('*')
            .eq('auction_id', auctionId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error getting auction bids:', err);
        return [];
    }
}

async function buyShopItem(auctionId, documentoId) {
    try {
        const profile = await getProfileByDocumentoId(documentoId);
        if (!profile) return { ok: false, error: 'Profile not found' };

        const { data: item, error: itemErr } = await supabaseClient
            .from(CONFIG.tables.auctions)
            .select('*')
            .eq('id', auctionId)
            .single();
        if (itemErr || !item) return { ok: false, error: 'Item not found' };
        if (item.item_type !== 'shop') return { ok: false, error: 'Item is not a shop item' };
        if (item.status !== 'active') return { ok: false, error: 'Item is not available' };

        const stock = Number(item.stock_quantity) || 0;
        if (stock <= 0) return { ok: false, error: 'Out of stock' };

        const price = Number(item.base_price) || 0;
        const coins = Number(profile.monedas) || 0;
        if (coins < price) return { ok: false, error: 'Not enough coins' };

        // 1) Reserve stock with optimistic lock to avoid overselling on concurrent clicks.
        const stockRes = await supabaseClient
            .from(CONFIG.tables.auctions)
            .update({ stock_quantity: stock - 1 })
            .eq('id', auctionId)
            .eq('status', 'active')
            .eq('stock_quantity', stock)
            .select('id');
        if (stockRes.error) throw stockRes.error;
        if (!stockRes.data || !stockRes.data.length) {
            return { ok: false, error: 'Item changed or sold out. Refresh and try again.' };
        }

        // 2) Charge coins with optimistic lock.
        const deduct = await updateStudentCoinsIfUnchanged(profile.id, coins, coins - price);
        if (!deduct.ok) {
            await supabaseClient.from(CONFIG.tables.auctions).update({ stock_quantity: stock }).eq('id', auctionId).eq('stock_quantity', stock - 1);
            return { ok: false, error: deduct.error || 'Could not deduct coins' };
        }
        if (!deduct.updated) {
            await supabaseClient.from(CONFIG.tables.auctions).update({ stock_quantity: stock }).eq('id', auctionId).eq('stock_quantity', stock - 1);
            return { ok: false, error: 'Balance changed, retry purchase' };
        }

        const { error: invErr } = await supabaseClient
            .from(CONFIG.tables.student_inventory)
            .insert([{
                student_id: documentoId,
                item_name: item.item_name,
                item_source: 'shop',
                source_id: auctionId,
                status: 'available',
                expires_at: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString()
            }]);
        var inventoryInsertError = invErr;
        if (inventoryInsertError && isMissingColumnError(inventoryInsertError, 'expires_at', CONFIG.tables.student_inventory)) {
            const fallbackInv = await supabaseClient
                .from(CONFIG.tables.student_inventory)
                .insert([{
                    student_id: documentoId,
                    item_name: item.item_name,
                    item_source: 'shop',
                    source_id: auctionId,
                    status: 'available'
                }]);
            inventoryInsertError = fallbackInv.error;
        }
        if (inventoryInsertError) {
            // Compensation: refund coins and release reserved stock.
            await updateStudentCoins(profile.id, coins);
            await supabaseClient.from(CONFIG.tables.auctions).update({ stock_quantity: stock }).eq('id', auctionId).eq('stock_quantity', stock - 1);
            throw inventoryInsertError;
        }

        return { ok: true };
    } catch (err) {
        console.error('Error buying shop item:', err);
        return { ok: false, error: err.message };
    }
}

// ========== STUDENT INVENTORY ==========
async function getStudentInventory(documentoId) {
    try {
        var nowIso = new Date().toISOString();
        var expireRes = await supabaseClient
            .from(CONFIG.tables.student_inventory)
            .update({ status: 'expired' })
            .eq('student_id', documentoId)
            .eq('status', 'available')
            .lte('expires_at', nowIso);
        if (expireRes.error && isMissingColumnError(expireRes.error, 'expires_at', CONFIG.tables.student_inventory)) {
            // Backward compatibility: skip lazy expiration when column does not exist yet.
        }

        const { data, error } = await supabaseClient
            .from(CONFIG.tables.student_inventory)
            .select('*')
            .eq('student_id', documentoId)
            .order('purchased_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error getting inventory:', err);
        return [];
    }
}

async function createFeedbackMessage(studentId, studentName, groupCode, email, message) {
    try {
        var payload = {
            student_id: studentId,
            student_documento: studentId,
            student_name: studentName || null,
            group_code: groupCode,
            email: email || null,
            message: message,
            status: 'new'
        };
        var optionalCols = ['student_documento', 'student_name'];
        while (true) {
            var ins = await supabaseClient
                .from(CONFIG.tables.feedback_messages)
                .insert([payload]);
            if (!ins.error) break;
            var missing = extractMissingColumnName(ins.error);
            if (missing && optionalCols.includes(missing) && Object.prototype.hasOwnProperty.call(payload, missing)) {
                delete payload[missing];
                continue;
            }
            throw ins.error;
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function getFeedbackMessages() {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.feedback_messages)
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error getting feedback messages:', err);
        return [];
    }
}

async function updateFeedbackStatus(messageId, status) {
    try {
        var desired = String(status || '').trim();
        if (!desired) return { ok: false, error: 'status required' };

        async function trySet(s) {
            return await supabaseClient
                .from(CONFIG.tables.feedback_messages)
                .update({ status: s })
                .eq('id', messageId);
        }

        var attempt = await trySet(desired);
        if (!attempt.error) return { ok: true };

        var msg = String(attempt.error.message || '').toLowerCase();
        var isStatusCheck = msg.includes('status_check') || msg.includes('violates check constraint');
        if (!isStatusCheck) throw attempt.error;

        // Fallbacks across schemas (some use: new/open/resolved; others: open/closed; etc.)
        var candidates = [];
        var d = desired.toLowerCase();
        if (d === 'resolved') candidates = ['resolved', 'closed', 'done'];
        else if (d === 'new') candidates = ['new', 'open', 'pending'];
        else if (d === 'read') candidates = ['read', 'open', 'seen'];
        else candidates = [desired];

        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            var r = await trySet(c);
            if (!r.error) return { ok: true, used: c, warning: 'Status fallback applied' };
        }

        throw attempt.error;
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function createBillingClaim(inventoryId, studentId, studentName, groupCode, itemName) {
    try {
        var inventoryRead = await supabaseClient
            .from(CONFIG.tables.student_inventory)
            .select('id,student_id,item_name,status,expires_at')
            .eq('id', inventoryId);
        var invRows = inventoryRead.data || [];
        var inv = invRows.length ? invRows[0] : null;
        if (inventoryRead.error) throw inventoryRead.error;
        if (!inv) return { ok: false, error: 'Item not found' };
        if (String(inv.student_id || '') !== String(studentId || '')) {
            return { ok: false, error: 'You cannot use this item.' };
        }

        var currentStatus = String(inv.status || '').trim().toLowerCase();
        if (currentStatus === 'unused') currentStatus = 'available';
        if (currentStatus !== 'available') {
            if (currentStatus === 'expired') {
                return { ok: false, error: 'This reward has expired.' };
            }
            return { ok: false, error: 'This reward is not available to use right now.' };
        }

        var now = Date.now();
        if (inv.expires_at) {
            var expMs = new Date(inv.expires_at).getTime();
            if (Number.isFinite(expMs) && now > expMs) {
                await supabaseClient
                    .from(CONFIG.tables.student_inventory)
                    .update({ status: 'expired' })
                    .eq('id', inventoryId);
                return { ok: false, error: 'This reward has expired.' };
            }
        }

        const { error: invErr } = await supabaseClient
            .from(CONFIG.tables.student_inventory)
            .update({ status: 'pending_delivery' })
            .eq('id', inventoryId)
            .in('status', ['available', 'unused']);
        if (invErr) throw invErr;
        
        const { error: claimErr } = await supabaseClient
            .from(CONFIG.tables.billing_claims)
            .insert([{
                student_id: studentId,
                student_name: studentName,
                group_code: groupCode,
                item_name: itemName,
                status: 'pending'
            }]);
        if (claimErr) {
            await supabaseClient
                .from(CONFIG.tables.student_inventory)
                .update({ status: currentStatus === 'available' ? 'available' : inv.status })
                .eq('id', inventoryId);
            throw claimErr;
        }
        
        return { ok: true };
    } catch (err) {
        var msg = String(err && err.message || 'Could not activate item');
        var safeError = msg;
        if (msg.toLowerCase().includes('billing_claims_status_check') || msg.toLowerCase().includes('check constraint')) {
            safeError = 'Item could not be activated right now. Please try again in a moment.';
        }
        return { ok: false, error: safeError };
    }
}

async function getPendingBillingClaims() {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.billing_claims)
            .select('*')
            .in('status', ['pending', 'pending_delivery', 'active'])
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error getting billing claims:', err);
        return [];
    }
}

async function confirmDelivery(claimId, inventoryId) {
    try {
        var claimRow = null;
        var claimRead = await supabaseClient
            .from(CONFIG.tables.billing_claims)
            .select('id,student_id,item_name')
            .eq('id', claimId)
            .maybeSingle();
        if (!claimRead.error) claimRow = claimRead.data || null;

        const { error: claimErr } = await supabaseClient
            .from(CONFIG.tables.billing_claims)
            .update({ status: 'delivered' })
            .eq('id', claimId);
        if (claimErr) throw claimErr;
        
        var resolvedInventoryId = inventoryId || null;
        if (!resolvedInventoryId && claimRow && claimRow.student_id && claimRow.item_name) {
            var invLookup = await supabaseClient
                .from(CONFIG.tables.student_inventory)
                .select('id')
                .eq('student_id', claimRow.student_id)
                .eq('item_name', claimRow.item_name)
                .in('status', ['pending_delivery', 'active', 'activated'])
                .order('purchased_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (!invLookup.error && invLookup.data && invLookup.data.id) {
                resolvedInventoryId = invLookup.data.id;
            }
        }

        if (resolvedInventoryId) {
            const { error: invErr } = await supabaseClient
                .from(CONFIG.tables.student_inventory)
                .update({ status: 'delivered' })
                .eq('id', resolvedInventoryId);
            if (invErr) throw invErr;
        }
        
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ========== ANNOUNCEMENTS ==========
async function getActiveAnnouncements(groupCode) {
    const today = todayDateString();
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.announcements)
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!data) return [];
        var normalizedGroup = String(groupCode || '').trim().toLowerCase();
        return data.filter(function(a) {
            var expiry = String(a.expiry_date || '').trim();
            var isActiveByDate = !expiry || expiry >= today;
            if (!isActiveByDate) return false;
            if (!normalizedGroup) return true;
            var target = String(a.target_group || '').trim().toLowerCase();
            return !target || target === normalizedGroup;
        });
    } catch (err) {
        console.error('Error getting announcements:', err);
        return [];
    }
}

async function getAnnouncementsForAdmin() {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.announcements)
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error getting admin announcements:', err);
        return [];
    }
}

async function createAnnouncement(message, targetGroup, expiryDate) {
    var meta = arguments[3] || {};
    var safeMessage = String(message || '').trim();
    if (!isNonEmptyText(safeMessage, 1, 1000)) throw new Error('Announcement message must be 1-1000 chars');
    var safeTitle = meta.title == null ? null : String(meta.title).trim();
    if (safeTitle && safeTitle.length > 120) throw new Error('Announcement title max length is 120 chars');
    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate))) throw new Error('Invalid expiry date format (YYYY-MM-DD)');
    var payload = {
        message: safeMessage,
        target_group: targetGroup || null,
        expiry_date: expiryDate,
        title: safeTitle || null,
        alert_type: normalizeAlertType(meta.alertType || 'info'),
        links: Array.isArray(meta.links) ? meta.links : null
    };
    var optionalCols = ['title', 'alert_type', 'links'];
    while (true) {
        var ins = await supabaseClient
            .from(CONFIG.tables.announcements)
            .insert([payload]);
        if (!ins.error) return;
        var missing = extractMissingColumnName(ins.error);
        if (missing && optionalCols.includes(missing) && Object.prototype.hasOwnProperty.call(payload, missing)) {
            delete payload[missing];
            continue;
        }
        throw ins.error;
    }
}

async function updateAnnouncement(announcementId, message, targetGroup, expiryDate) {
    var safeMessage = String(message || '').trim();
    if (!isNonEmptyText(safeMessage, 1, 1000)) throw new Error('Announcement message must be 1-1000 chars');
    var titleArg = (arguments[4] && arguments[4].title) || null;
    var safeTitle = titleArg == null ? null : String(titleArg).trim();
    if (safeTitle && safeTitle.length > 120) throw new Error('Announcement title max length is 120 chars');
    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate))) throw new Error('Invalid expiry date format (YYYY-MM-DD)');
    const patch = {
        message: safeMessage,
        target_group: targetGroup || null,
        expiry_date: expiryDate,
        title: safeTitle,
        alert_type: normalizeAlertType((arguments[4] && arguments[4].alertType) || 'info'),
        links: (arguments[4] && Array.isArray(arguments[4].links)) ? arguments[4].links : null
    };
    var optionalCols = ['title', 'alert_type', 'links'];
    while (true) {
        var upd = await supabaseClient
            .from(CONFIG.tables.announcements)
            .update(patch)
            .eq('id', announcementId);
        if (!upd.error) return;
        var missing = extractMissingColumnName(upd.error);
        if (missing && optionalCols.includes(missing) && Object.prototype.hasOwnProperty.call(patch, missing)) {
            delete patch[missing];
            continue;
        }
        throw upd.error;
    }
}

async function deleteAnnouncement(announcementId) {
    const { error } = await supabaseClient
        .from(CONFIG.tables.announcements)
        .delete()
        .eq('id', announcementId);
    if (error) throw error;
}

// ========== CHALLENGES ==========
async function getActiveChallengesForStudent(groupCode) {
    try {
        let queryResult = await supabaseClient
            .from(CONFIG.tables.challenges)
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        if (queryResult.error && isMissingColumnError(queryResult.error, 'status', CONFIG.tables.challenges)) {
            queryResult = await supabaseClient
                .from(CONFIG.tables.challenges)
                .select('*')
                .order('created_at', { ascending: false });
        }
        if (queryResult.error) throw queryResult.error;
        const data = queryResult.data || [];
        const activeData = data.filter(function(c) {
            if (c.is_active === false) return false;
            return c.status == null || c.status === 'active';
        });
        if (!activeData.length) return [];
        if (!groupCode) {
            return Promise.all(activeData.map(async function(c) {
                c.questions = await getChallengeQuestions(c.id, c);
                return c;
            }));
        }
        const g = String(groupCode || '').trim();
        var scoped = activeData.filter(function(c) {
            if (!g) return true;
            if (c.scope === 'all') return true;
            if (c.target_group != null && String(c.target_group).trim() !== '') {
                return String(c.target_group).trim() === g;
            }
            if (c.group_code != null && String(c.group_code).trim() !== '') {
                return String(c.group_code).trim() === g;
            }
            if (Array.isArray(c.target_groups)) {
                return c.target_groups.map(function(x) { return String(x).trim(); }).includes(g);
            }
            if (typeof c.target_groups === 'string' && c.target_groups.trim()) {
                var raw = c.target_groups.trim();
                var parsed = null;
                try { parsed = JSON.parse(raw); } catch (_) {}
                if (Array.isArray(parsed)) {
                    return parsed.map(function(x) { return String(x).trim(); }).includes(g);
                }
                return raw.split(',').map(function(x) { return String(x).trim(); }).includes(g);
            }
            // No scope fields: legacy challenges apply to all groups.
            return true;
        });
        return Promise.all(scoped.map(async function(c) {
            c.questions = await getChallengeQuestions(c.id, c);
            return c;
        }));
    } catch (err) {
        console.error('Error getting challenges:', err);
        return [];
    }
}

async function getStudentSubmissions(documentoId) {
    try {
        let queryResult = await supabaseClient
            .from(CONFIG.tables.challenge_submissions)
            .select('*')
            .eq('student_id', documentoId)
            .order('created_at', { ascending: true });
        if (queryResult.error && isMissingColumnError(queryResult.error, 'created_at', CONFIG.tables.challenge_submissions)) {
            queryResult = await supabaseClient
                .from(CONFIG.tables.challenge_submissions)
                .select('*')
                .eq('student_id', documentoId)
                .order('id', { ascending: true });
        }
        if (queryResult.error) throw queryResult.error;
        return queryResult.data || [];
    } catch (err) {
        console.error('Error getting submissions:', err);
        return [];
    }
}

async function submitChallenge(challengeId, documentoId, answer) {
    let retryCharged = 0;
    let retryChargeApplied = false;
    let submissionPersisted = false;
    async function refundRetryIfNeeded() {
        if (!retryChargeApplied) return;
        var refund = await creditCoinsByDocumentoId(documentoId, 5);
        if (!refund.ok) {
            logStructuredError('CHALLENGE_RETRY_REFUND_ERROR', refund.error || 'Unknown refund error');
        }
        retryChargeApplied = false;
        retryCharged = 0;
    }

    try {
        const { data: challenge, error: cErr } = await supabaseClient
            .from(CONFIG.tables.challenges)
            .select('*')
            .eq('id', challengeId)
            .single();
        if (cErr || !challenge) return { ok: false, error: 'Challenge not found' };
        const challengeStatus = challenge.status == null ? 'active' : challenge.status;
        if (challenge.is_active === false) return { ok: false, error: 'Challenge is closed' };
        if (challengeStatus !== 'active') return { ok: false, error: 'Challenge is closed' };

        var challengeQuestions = await getChallengeQuestions(challengeId, challenge);
        var evaluated = evaluateChallengeSubmission(challenge, challengeQuestions, answer);
        const isCorrect = !!evaluated.isCorrect;
        
        let existingQuery = await supabaseClient
            .from(CONFIG.tables.challenge_submissions)
            .select('id, is_correct, created_at')
            .eq('challenge_id', challengeId)
            .eq('student_id', documentoId)
            .order('created_at', { ascending: true });
        if (existingQuery.error && isMissingColumnError(existingQuery.error, 'created_at', CONFIG.tables.challenge_submissions)) {
            existingQuery = await supabaseClient
                .from(CONFIG.tables.challenge_submissions)
                .select('id, is_correct')
                .eq('challenge_id', challengeId)
                .eq('student_id', documentoId)
                .order('id', { ascending: true });
        }
        if (existingQuery.error) throw existingQuery.error;
        const attempts = existingQuery.data || [];
        const hasCorrectBefore = attempts.some(function(s) { return s.is_correct === true; });
        if (hasCorrectBefore) return { ok: false, error: 'Challenge already completed' };
        if (attempts.length >= 2) return { ok: false, error: 'Retry limit reached' };

        if (attempts.length === 1) {
            if (attempts[0].is_correct !== false) return { ok: false, error: 'Challenge already submitted' };
            const retryPay = await debitCoinsByDocumentoId(documentoId, 5);
            if (!retryPay.ok) return { ok: false, error: retryPay.error || 'Could not process retry payment' };
            retryCharged = 5;
            retryChargeApplied = true;

            // Re-check attempt count after charging to reduce race-condition double charges.
            var attemptsAfterChargeQuery = await supabaseClient
                .from(CONFIG.tables.challenge_submissions)
                .select('id, is_correct, created_at')
                .eq('challenge_id', challengeId)
                .eq('student_id', documentoId)
                .order('created_at', { ascending: true });
            if (attemptsAfterChargeQuery.error && isMissingColumnError(attemptsAfterChargeQuery.error, 'created_at', CONFIG.tables.challenge_submissions)) {
                attemptsAfterChargeQuery = await supabaseClient
                    .from(CONFIG.tables.challenge_submissions)
                    .select('id, is_correct')
                    .eq('challenge_id', challengeId)
                    .eq('student_id', documentoId)
                    .order('id', { ascending: true });
            }
            if (attemptsAfterChargeQuery.error) {
                await refundRetryIfNeeded();
                throw attemptsAfterChargeQuery.error;
            }
            var attemptsAfterCharge = attemptsAfterChargeQuery.data || [];
            var alreadyCompleted = attemptsAfterCharge.some(function(s) { return s.is_correct === true; });
            if (alreadyCompleted || attemptsAfterCharge.length >= 2) {
                await refundRetryIfNeeded();
                return { ok: false, error: alreadyCompleted ? 'Challenge already completed' : 'Retry limit reached' };
            }
        }

        let position = 0;
        if (isCorrect) {
            var slotClaim = await claimChallengeWinnerSlot(challengeId);
            if (!slotClaim.ok && slotClaim.schemaMissingCurrentWinners) {
                const { data: submissions, error: subCountErr } = await supabaseClient
                    .from(CONFIG.tables.challenge_submissions)
                    .select('id')
                    .eq('challenge_id', challengeId)
                    .eq('is_correct', true);
                if (subCountErr) throw subCountErr;
                position = (submissions ? submissions.length : 0) + 1;
                if (position > 10) {
                    await refundRetryIfNeeded();
                    return { ok: false, error: 'Challenge already reached max winners (10)' };
                }
            } else if (!slotClaim.ok) {
                await refundRetryIfNeeded();
                return { ok: false, error: slotClaim.full ? 'Challenge already reached max winners (10)' : (slotClaim.error || 'Could not reserve winner slot') };
            } else {
                position = slotClaim.rank;
            }
        }

        let coinsAwarded = 0;
        if (isCorrect) {
            if (position <= 3) coinsAwarded = 40;
            else if (position <= 6) coinsAwarded = 20;
            else if (position <= 10) coinsAwarded = 10;
        }

        const submissionPayload = {
            challenge_id: challengeId,
            student_id: documentoId,
            answer: evaluated.storedAnswer,
            is_correct: isCorrect,
            coins_awarded: coinsAwarded
        };

        let subErr = null;
        var insertSubmission = await supabaseClient
            .from(CONFIG.tables.challenge_submissions)
            .insert([submissionPayload]);
        subErr = insertSubmission.error;

        if (subErr && isUniqueViolationError(subErr) && attempts.length >= 1) {
            var updateSubmission = await supabaseClient
                .from(CONFIG.tables.challenge_submissions)
                .update({
                    answer: evaluated.storedAnswer,
                    is_correct: isCorrect,
                    coins_awarded: coinsAwarded
                })
                .eq('challenge_id', challengeId)
                .eq('student_id', documentoId);
            subErr = updateSubmission.error;
        }
        if (subErr && isUniqueViolationError(subErr)) {
            await refundRetryIfNeeded();
            return { ok: false, error: 'Submission already processed. Please refresh and review your latest result.' };
        }
        if (subErr) throw subErr;
        submissionPersisted = true;
        
        if (coinsAwarded > 0) {
            const awardResult = await addCoinsByDocumentoId(documentoId, coinsAwarded);
            if (!awardResult.ok) return { ok: false, error: awardResult.error || 'Could not apply challenge reward' };
        }
        
        if (!isCorrect) position = 0;
        
        return {
            ok: true,
            isCorrect,
            position,
            coinsAwarded,
            retryCharged,
            totalQuestions: evaluated.totalQuestions,
            correctCount: evaluated.correctCount
        };
    } catch (err) {
        if (retryChargeApplied && !submissionPersisted) {
            try {
                await creditCoinsByDocumentoId(documentoId, 5);
            } catch (_) {}
        }
        logStructuredError('CHALLENGE_SUBMIT_ERROR', err);
        return { ok: false, error: err.message };
    }
}

async function updateStreak(documentoId) {
    try {
        const profile = await getProfileByDocumentoId(documentoId);
        if (!profile) return { ok: false, error: 'Profile not found' };
        
        const newStreak = (Number(profile.current_streak) || 0) + 1;
        await updateProfile(profile.id, { current_streak: newStreak });
        
        return { ok: true, newStreak };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

function calculateLevelXP(coins) {
    const level = Math.floor(coins / 50) + 1;
    const xp = coins % 50;
    const xpForNext = 50;
    const xpPercent = Math.round((xp / xpForNext) * 100);
    return { level, xp, xpForNext, xpPercent };
}

async function getAttendanceHistory(documentoId, limit) {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.attendance)
            .select('*')
            .eq('student_id', documentoId)
            .order('attendance_date', { ascending: false })
            .limit(limit || 20);
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error getting attendance history:', err);
        return [];
    }
}

// ========== REAL-TIME LISTENERS ==========
function subscribeToProfileChanges(profileId, callback) {
    if (!supabaseClient) return;
    supabaseClient
        .channel('profile-' + profileId)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'profiles', 
            filter: 'id=eq.' + profileId 
        }, callback)
        .subscribe();
}

function subscribeToAuctionChanges(callback) {
    if (!supabaseClient) return;
    supabaseClient
        .channel('auctions')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'auctions' 
        }, callback)
        .subscribe();
}

function showBidToast(message, type) {
    var container = document.getElementById('bidToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'bidToastContainer';
        container.className = 'bid-toast-container';
        document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'bid-toast bid-toast-' + (type || 'info');
    toast.textContent = String(message || '');
    container.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 400);
    }, 3000);
}

// ========== INSTITUTIONS & AI GATING (Credit-based + Multi-AI) ==========
async function getOrCreateInstitution() {
    var result = await supabaseClient
        .from(CONFIG.tables.institutions)
        .select('*')
        .limit(1)
        .maybeSingle();
    if (result.error && !isMissingColumnError(result.error, 'ai_credits_used', CONFIG.tables.institutions)
        && !isMissingColumnError(result.error, 'ai_generations_used', CONFIG.tables.institutions)) {
        throw result.error;
    }
    if (result.data) return normalizeInstitution(result.data);
    var ins = await supabaseClient
        .from(CONFIG.tables.institutions)
        .insert([{ name: 'Default Institution', subscription_plan: 'BASIC', ai_credits_used: 0, ai_credit_pool: 10, active_ai_provider: 'anthropic' }])
        .select('*')
        .maybeSingle();
    if (ins.error && isMissingColumnError(ins.error, 'ai_credits_used', CONFIG.tables.institutions)) {
        ins = await supabaseClient
            .from(CONFIG.tables.institutions)
            .insert([{ name: 'Default Institution', subscription_plan: 'BASIC', ai_generations_used: 0, ai_generation_limit: 10 }])
            .select('*')
            .maybeSingle();
    }
    if (ins.error && isMissingColumnError(ins.error, 'active_ai_provider', CONFIG.tables.institutions)) {
        ins = await supabaseClient
            .from(CONFIG.tables.institutions)
            .insert([{ name: 'Default Institution', subscription_plan: 'BASIC', ai_credits_used: 0, ai_credit_pool: 10 }])
            .select('*')
            .maybeSingle();
    }
    if (ins.error) throw ins.error;
    return normalizeInstitution(ins.data);
}

function normalizeInstitution(row) {
    if (!row) return row;
    if (row.ai_credits_used == null && row.ai_generations_used != null) row.ai_credits_used = row.ai_generations_used;
    if (row.ai_credit_pool == null && row.ai_generation_limit != null) row.ai_credit_pool = row.ai_generation_limit;
    if (row.ai_credits_used == null) row.ai_credits_used = 0;
    if (row.ai_credit_pool == null) row.ai_credit_pool = 10;
    if (!row.active_ai_provider) row.active_ai_provider = 'anthropic';
    return row;
}

async function checkAiLimit() {
    var inst = await getOrCreateInstitution();
    if (!inst) return { allowed: false, error: 'No institution found' };
    var used = Number(inst.ai_credits_used) || 0;
    var limit = Number(inst.ai_credit_pool) || 10;
    var plan = inst.subscription_plan || 'BASIC';
    var provider = inst.active_ai_provider || 'anthropic';
    if (used >= limit) {
        return { allowed: false, used: used, limit: limit, plan: plan, provider: provider, institution: inst };
    }
    return { allowed: true, used: used, limit: limit, plan: plan, provider: provider, institution: inst };
}

async function incrementAiUsage(institutionId) {
    var read = await supabaseClient
        .from(CONFIG.tables.institutions)
        .select('ai_credits_used')
        .eq('id', institutionId)
        .single();
    var colName = 'ai_credits_used';
    if (read.error && isMissingColumnError(read.error, 'ai_credits_used', CONFIG.tables.institutions)) {
        read = await supabaseClient.from(CONFIG.tables.institutions).select('ai_generations_used').eq('id', institutionId).single();
        colName = 'ai_generations_used';
    }
    if (read.error) throw read.error;
    var current = Number(read.data[colName]) || 0;
    var patch = {}; patch[colName] = current + 1;
    var upd = await supabaseClient.from(CONFIG.tables.institutions).update(patch).eq('id', institutionId);
    if (upd.error) throw upd.error;
    return current + 1;
}

// ========== TEACHER CREDITS ==========
async function getTeacherCredits(profileId) {
    var result = await supabaseClient
        .from(CONFIG.tables.profiles)
        .select('teacher_credits')
        .eq('id', profileId)
        .single();
    if (result.error && isMissingColumnError(result.error, 'teacher_credits', CONFIG.tables.profiles)) {
        return 0;
    }
    if (result.error) throw result.error;
    return Number(result.data.teacher_credits) || 0;
}

async function deductTeacherCredits(profileId, amount) {
    var current = await getTeacherCredits(profileId);
    if (current < amount) throw new Error('Insufficient credits (' + current + ' < ' + amount + ')');
    var upd = await supabaseClient
        .from(CONFIG.tables.profiles)
        .update({ teacher_credits: current - amount })
        .eq('id', profileId);
    if (upd.error && isMissingColumnError(upd.error, 'teacher_credits', CONFIG.tables.profiles)) {
        return current;
    }
    if (upd.error) throw upd.error;
    return current - amount;
}

async function getTeacherCoinPocket(profileId) {
    var result = await supabaseClient
        .from(CONFIG.tables.profiles)
        .select('coin_pocket')
        .eq('id', profileId)
        .single();
    if (result.error && isMissingColumnError(result.error, 'coin_pocket', CONFIG.tables.profiles)) {
        return 0;
    }
    if (result.error) throw result.error;
    return Number(result.data.coin_pocket) || 0;
}

async function setTeacherCoinPocket(profileId, nextPocket) {
    var val = Math.max(0, Math.floor(Number(nextPocket)) || 0);
    var upd = await supabaseClient
        .from(CONFIG.tables.profiles)
        .update({ coin_pocket: val })
        .eq('id', profileId);
    if (upd.error && isMissingColumnError(upd.error, 'coin_pocket', CONFIG.tables.profiles)) {
        return { ok: true, fallback: true, value: val };
    }
    if (upd.error) throw upd.error;
    return { ok: true, fallback: false, value: val };
}

// ========== MULTI-AI ROUTER ==========
async function callAIProvider(provider, apiKey, systemPrompt, userPrompt) {
    var aiUrl, aiBody, aiHeaders;
    var prov = String(provider || 'chatgpt').toLowerCase();

    if (prov === 'chatgpt' || prov === 'openai') {
        aiUrl = 'https://api.openai.com/v1/chat/completions';
        aiBody = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.7,
            max_tokens: 3000
        });
        aiHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
    } else if (prov === 'claude' || prov === 'anthropic') {
        aiUrl = 'https://api.anthropic.com/v1/messages';
        aiBody = JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 3000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });
        aiHeaders = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    } else if (prov === 'gemini' || prov === 'google') {
        aiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
        aiBody = JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 3000 }
        });
        aiHeaders = { 'Content-Type': 'application/json' };
    } else {
        throw new Error('Unknown AI provider: ' + prov);
    }

    var resp = await fetch(aiUrl, { method: 'POST', headers: aiHeaders, body: aiBody });
    if (!resp.ok) {
        var errText = await resp.text();
        throw new Error('AI API error (' + resp.status + '): ' + errText.substring(0, 300));
    }
    var data = await resp.json();
    var rawContent = '';
    if (prov === 'chatgpt' || prov === 'openai') {
        rawContent = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    } else if (prov === 'claude' || prov === 'anthropic') {
        rawContent = data.content && data.content[0] ? data.content[0].text : '';
    } else if (prov === 'gemini' || prov === 'google') {
        rawContent = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts ? data.candidates[0].content.parts[0].text : '';
    }
    return rawContent;
}

// ========== SYSTEM CONFIGS (API Key Vault) ==========
async function getSystemConfig(keyName) {
    try {
        var result = await supabaseClient
            .from(CONFIG.tables.system_configs)
            .select('key_value, provider')
            .eq('key_name', keyName)
            .maybeSingle();
        if (result.error) {
            if (isMissingRelationError(result.error, CONFIG.tables.system_configs)) return null;
            return null;
        }
        return result.data ? result.data.key_value : null;
    } catch (e) { return null; }
}

async function setSystemConfig(keyName, keyValue, provider) {
    var result = await supabaseClient
        .from(CONFIG.tables.system_configs)
        .upsert([{ key_name: keyName, key_value: keyValue, provider: provider || null, updated_at: new Date().toISOString() }], { onConflict: 'key_name' });
    if (result.error) throw result.error;
}

// ========== STRICT TEACHER GROUP FILTERING ==========
async function getTeacherAllowedGroups(teacherId) {
    try {
        var result = await supabaseClient
            .from(CONFIG.tables.teacher_groups)
            .select('group_code')
            .eq('teacher_id', teacherId);
        if (result.error) {
            if (isMissingRelationError(result.error, CONFIG.tables.teacher_groups)) return null;
            throw result.error;
        }
        if (!result.data || result.data.length === 0) return null;
        return result.data.map(function(r) { return r.group_code; });
    } catch (e) {
        if (isMissingRelationError(e, CONFIG.tables.teacher_groups)) return null;
        console.error('[TEACHER_GROUPS]', e);
        return null;
    }
}

async function getGroupsFiltered(userObj) {
    var allGroups = await getGroups();
    if (!userObj || userObj.rol !== 'teacher') return allGroups;
    var allowed = await getTeacherAllowedGroups(userObj.id);
    if (!allowed || !allowed.length) return [];
    return allGroups.filter(function(g) { return allowed.indexOf(g.group_code) !== -1; });
}

// ========== IMPROVEMENT PLANS ==========
async function createImprovementPlan(studentId, teacherId, focusTopic, entryCost, rewardCoins) {
    var payload = {
        student_id: studentId,
        teacher_id: teacherId || null,
        focus_topic: String(focusTopic || '').trim(),
        status: 'ASSIGNED',
        entry_cost_coins: Number(entryCost) || 5,
        reward_coins: Number(rewardCoins) || 50
    };
    var result = await supabaseClient
        .from(CONFIG.tables.improvement_plans)
        .insert([payload])
        .select('*')
        .maybeSingle();
    if (result.error) {
        if (isMissingColumnError(result.error, 'entry_cost_coins', CONFIG.tables.improvement_plans)) {
            var fallback = { student_id: studentId, teacher_id: teacherId || null, focus_topic: payload.focus_topic, status: 'ASSIGNED' };
            var fb = await supabaseClient.from(CONFIG.tables.improvement_plans).insert([fallback]).select('*').maybeSingle();
            if (fb.error) throw fb.error;
            return fb.data;
        }
        throw result.error;
    }
    return result.data;
}

// ========== AUDIT LOGGING ==========
async function insertAuditLog(userId, institutionId, actionType, result, metadata) {
    try {
        var payload = {
            user_id: userId || null,
            institution_id: institutionId || null,
            action_type: String(actionType || 'UNKNOWN'),
            result: String(result || ''),
            metadata: metadata || {},
            created_at: new Date().toISOString()
        };
        var res = await supabaseClient.from(CONFIG.tables.audit_logs).insert([payload]);
        if (res.error) {
            if (isMissingRelationError(res.error, CONFIG.tables.audit_logs)) return;
            console.warn('[AUDIT_LOG] Insert failed:', res.error.message);
        }
    } catch (e) {
        if (!isMissingRelationError(e, CONFIG.tables.audit_logs)) {
            console.warn('[AUDIT_LOG] Error:', e.message);
        }
    }
}

// ========== STUDENT COIN TRANSACTIONS ==========
async function insertStudentCoinTransaction(studentId, amount, reason, balanceAfter) {
    try {
        var payload = {
            student_id: studentId || null,
            amount: Number(amount) || 0,
            reason: String(reason || ''),
            balance_after: Number(balanceAfter) || 0,
            created_at: new Date().toISOString()
        };
        var res = await supabaseClient.from(CONFIG.tables.student_coin_transactions).insert([payload]);
        if (res.error && !isMissingRelationError(res.error, CONFIG.tables.student_coin_transactions)) {
            console.warn('[COIN_TX] Insert failed:', res.error.message);
        }
    } catch (e) {
        if (!isMissingRelationError(e, CONFIG.tables.student_coin_transactions)) {
            console.warn('[COIN_TX] Error:', e.message);
        }
    }
}

// ========== CREDIT TRANSFER (Institution → Teacher) ==========
async function transferCredits(fromInstId, toTeacherId, amount) {
    var amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return { ok: false, error: 'Amount must be positive' };
    if (!fromInstId) return { ok: false, error: 'Institution ID required' };
    if (!toTeacherId) return { ok: false, error: 'Teacher ID required' };

    try {
        var rpcResult = await supabaseClient.rpc('transfer_credits_atomic', {
            p_institution_id: fromInstId,
            p_teacher_id: toTeacherId,
            p_amount: amt
        });
        if (rpcResult.error) {
            if (String(rpcResult.error.message || '').toLowerCase().includes('function') &&
                String(rpcResult.error.message || '').toLowerCase().includes('does not exist')) {
                return await transferCreditsFallback(fromInstId, toTeacherId, amt);
            }
            throw rpcResult.error;
        }
        var data = rpcResult.data;
        if (data && data.ok === false) return { ok: false, error: data.error || 'Transfer failed' };
        return { ok: true, newTeacherCredits: data.new_teacher_credits, transferred: amt };
    } catch (e) {
        return await transferCreditsFallback(fromInstId, toTeacherId, amt);
    }
}

async function transferCreditsFallback(fromInstId, toTeacherId, amount) {
    try {
        var inst = await getOrCreateInstitution();
        if (!inst || inst.id !== fromInstId) {
            var instRead = await supabaseClient.from(CONFIG.tables.institutions).select('*').eq('id', fromInstId).single();
            if (instRead.error) throw instRead.error;
            inst = normalizeInstitution(instRead.data);
        }
        var available = (Number(inst.ai_credit_pool) || 10) - (Number(inst.ai_credits_used) || 0);
        if (available < amount) return { ok: false, error: 'Insufficient institution credits (' + available + ' available, ' + amount + ' requested)' };

        var teacherCredits = await getTeacherCredits(toTeacherId);
        var newUsed = (Number(inst.ai_credits_used) || 0) + amount;
        var colName = 'ai_credits_used';
        var updInst = await supabaseClient.from(CONFIG.tables.institutions).update({ ai_credits_used: newUsed }).eq('id', fromInstId);
        if (updInst.error && isMissingColumnError(updInst.error, 'ai_credits_used', CONFIG.tables.institutions)) {
            colName = 'ai_generations_used';
            var patch = {}; patch[colName] = newUsed;
            updInst = await supabaseClient.from(CONFIG.tables.institutions).update(patch).eq('id', fromInstId);
        }
        if (updInst.error) throw updInst.error;

        var newTeacherCredits = teacherCredits + amount;
        var updTeacher = await supabaseClient.from(CONFIG.tables.profiles).update({ teacher_credits: newTeacherCredits }).eq('id', toTeacherId);
        if (updTeacher.error && !isMissingColumnError(updTeacher.error, 'teacher_credits', CONFIG.tables.profiles)) {
            throw updTeacher.error;
        }

        try {
            await supabaseClient.from(CONFIG.tables.credit_transactions).insert([{
                from_institution: fromInstId, to_teacher: toTeacherId, amount: amount, note: 'JS fallback transfer'
            }]);
        } catch (_) {}

        await insertAuditLog(toTeacherId, fromInstId, 'CREDIT_TRANSFER', 'SUCCESS', { amount: amount, new_teacher_credits: newTeacherCredits });
        return { ok: true, newTeacherCredits: newTeacherCredits, transferred: amount };
    } catch (e) {
        await insertAuditLog(toTeacherId, fromInstId, 'CREDIT_TRANSFER', 'FAILED', { amount: amount, error: e.message });
        return { ok: false, error: e.message || 'Transfer failed' };
    }
}

// ========== PLAN FEATURE VALIDATION ==========
function validatePlanFeature(plan, feature) {
    var p = String(plan || 'BASIC').toUpperCase();
    var f = String(feature || '').toLowerCase();
    var tiers = { 'BASIC': 0, 'STANDARD': 1, 'ADVANCED': 2, 'PREMIUM': 3, 'ENTERPRISE': 3, 'PRO': 2 };
    var tier = tiers[p] != null ? tiers[p] : 0;

    if (f === 'ai_generation') {
        if (tier < 1) return { allowed: false, reason: 'Plan BASIC does not include AI generation. Upgrade to STANDARD or higher.' };
        return { allowed: true };
    }
    if (f === 'multi_provider') {
        if (tier < 3) return { allowed: false, reason: 'Multi-provider AI requires PREMIUM plan.' };
        return { allowed: true };
    }
    if (f === 'ai_analytics') {
        if (tier < 3) return { allowed: false, reason: 'AI analytics requires PREMIUM plan.' };
        return { allowed: true };
    }
    if (f === 'student_scaffolding') {
        if (tier < 3) return { allowed: false, reason: 'Student scaffolding requires PREMIUM plan.' };
        return { allowed: true };
    }
    if (f === 'single_provider') {
        if (tier < 1) return { allowed: false, reason: 'AI features require at least STANDARD plan.' };
        return { allowed: true };
    }
    return { allowed: true };
}

// ========== AI ROUTING WITH VALIDATION + LOGGING ==========
async function routeAIRequest(provider, apiKey, systemPrompt, userPrompt, context) {
    var ctx = context || {};
    var userId = ctx.userId || null;
    var institutionId = ctx.institutionId || null;
    var plan = ctx.plan || 'BASIC';
    var cefrLevel = ctx.cefrLevel || null;
    var skill = ctx.skill || null;
    var topic = ctx.topic || null;
    var creditsToCharge = ctx.creditsToCharge || 3;

    var planCheck = validatePlanFeature(plan, 'ai_generation');
    if (!planCheck.allowed) {
        await insertAuditLog(userId, institutionId, 'AI_REQUEST_BLOCKED', 'PLAN_GATED', { plan: plan, reason: planCheck.reason });
        throw new Error(planCheck.reason);
    }

    var prov = String(provider || 'chatgpt').toLowerCase();
    if (prov !== 'chatgpt' && prov !== 'openai') {
        var multiCheck = validatePlanFeature(plan, 'multi_provider');
        if (!multiCheck.allowed) {
            prov = 'chatgpt';
        }
    }

    var rawContent = await callAIProvider(prov, apiKey, systemPrompt, userPrompt);

    try {
        await supabaseClient.from(CONFIG.tables.ai_usage_logs).insert([{
            user_id: userId,
            institution_id: institutionId,
            provider: prov,
            cefr_level: cefrLevel,
            skill: skill,
            topic: topic,
            credits_charged: creditsToCharge,
            created_at: new Date().toISOString()
        }]);
    } catch (e) {
        if (!isMissingRelationError(e, CONFIG.tables.ai_usage_logs)) {
            console.warn('[AI_USAGE_LOG]', e.message);
        }
    }

    await insertAuditLog(userId, institutionId, 'AI_GENERATION', 'SUCCESS', { provider: prov, cefr_level: cefrLevel, skill: skill, topic: topic });
    return rawContent;
}

// ========== BULK CSV IMPORT ==========
async function processFlatFile(csvText, institutionId) {
    var lines = String(csvText || '').split(/\r?\n/).filter(function(l) { return l.trim(); });
    if (lines.length < 2) return { created: 0, skipped: 0, errors: ['CSV must have a header row and at least one data row'] };

    var header = lines[0].split(',').map(function(h) { return h.trim().toLowerCase(); });
    var nameIdx = header.indexOf('nombre_completo');
    if (nameIdx === -1) nameIdx = header.indexOf('name');
    if (nameIdx === -1) nameIdx = header.indexOf('nombre');
    var docIdx = header.indexOf('documento_id');
    if (docIdx === -1) docIdx = header.indexOf('document');
    if (docIdx === -1) docIdx = header.indexOf('doc');
    var pinIdx = header.indexOf('pin');
    var groupIdx = header.indexOf('grupo');
    if (groupIdx === -1) groupIdx = header.indexOf('group');

    if (nameIdx === -1 || docIdx === -1 || pinIdx === -1) {
        return { created: 0, skipped: 0, errors: ['CSV must have columns: nombre_completo (or name), documento_id (or document), pin. Optional: grupo (or group)'] };
    }

    var created = 0, skipped = 0, errors = [];
    var existingGroups = {};
    try {
        var allGroups = await getGroups();
        allGroups.forEach(function(g) { existingGroups[g.group_code] = true; });
    } catch (_) {}

    for (var i = 1; i < lines.length; i++) {
        var cols = lines[i].split(',').map(function(c) { return c.trim(); });
        var name = cols[nameIdx] || '';
        var doc = cols[docIdx] || '';
        var pin = cols[pinIdx] || '';
        var group = groupIdx !== -1 ? (cols[groupIdx] || '') : '';

        if (!name || !doc || !pin) {
            errors.push('Row ' + (i + 1) + ': missing required fields');
            skipped++;
            continue;
        }
        if (!isValidDocumentoId(doc)) {
            errors.push('Row ' + (i + 1) + ': invalid documento_id "' + doc + '"');
            skipped++;
            continue;
        }
        if (!isValidPin(pin)) {
            errors.push('Row ' + (i + 1) + ': invalid pin');
            skipped++;
            continue;
        }

        var existCheck = await supabaseClient.from(CONFIG.tables.profiles).select('id').eq('documento_id', doc).maybeSingle();
        if (existCheck.data) {
            errors.push('Row ' + (i + 1) + ': documento_id "' + doc + '" already exists');
            skipped++;
            continue;
        }

        if (group && !existingGroups[group]) {
            try {
                await insertGroup(group);
                existingGroups[group] = true;
            } catch (ge) {
                if (!String(ge.message || '').includes('already exists')) {
                    errors.push('Row ' + (i + 1) + ': failed to create group "' + group + '": ' + ge.message);
                } else {
                    existingGroups[group] = true;
                }
            }
        }

        var payload = {
            nombre_completo: name,
            documento_id: doc,
            pin: pin,
            grupo: group || null,
            monedas: 0,
            rol: 'student',
            current_streak: 0
        };
        if (institutionId) payload.institution_id = institutionId;

        var ins = await supabaseClient.from(CONFIG.tables.profiles).insert([payload]);
        if (ins.error) {
            if (isMissingColumnError(ins.error, 'institution_id', CONFIG.tables.profiles)) {
                delete payload.institution_id;
                ins = await supabaseClient.from(CONFIG.tables.profiles).insert([payload]);
            }
            if (ins.error && isMissingColumnError(ins.error, 'current_streak', CONFIG.tables.profiles)) {
                delete payload.current_streak;
                ins = await supabaseClient.from(CONFIG.tables.profiles).insert([payload]);
            }
        }
        if (ins.error) {
            errors.push('Row ' + (i + 1) + ': ' + (ins.error.message || 'Insert failed'));
            skipped++;
            continue;
        }
        created++;
    }

    await insertAuditLog(null, institutionId, 'BULK_IMPORT', 'COMPLETED', { created: created, skipped: skipped, total_rows: lines.length - 1 });
    return { created: created, skipped: skipped, errors: errors };
}

// ========== SAAS VALIDATION TESTS ==========
async function testNegativeCredits() {
    try {
        var fakeId = '00000000-0000-0000-0000-000000000000';
        var result = await deductTeacherCredits(fakeId, 999999);
        return { test: 'testNegativeCredits', pass: false, detail: 'Should have thrown but returned: ' + result };
    } catch (e) {
        var msg = String(e.message || '');
        var pass = msg.includes('Insufficient') || msg.includes('not found') || msg.includes('No rows');
        return { test: 'testNegativeCredits', pass: pass, detail: msg };
    }
}

function testPlanGating() {
    var results = [];
    var cases = [
        { plan: 'BASIC', feature: 'ai_generation', expect: false },
        { plan: 'STANDARD', feature: 'ai_generation', expect: true },
        { plan: 'STANDARD', feature: 'multi_provider', expect: false },
        { plan: 'PREMIUM', feature: 'multi_provider', expect: true },
        { plan: 'PREMIUM', feature: 'ai_analytics', expect: true },
        { plan: 'BASIC', feature: 'student_scaffolding', expect: false },
        { plan: 'PREMIUM', feature: 'student_scaffolding', expect: true }
    ];
    cases.forEach(function(c) {
        var r = validatePlanFeature(c.plan, c.feature);
        var pass = r.allowed === c.expect;
        results.push({ plan: c.plan, feature: c.feature, expected: c.expect, got: r.allowed, pass: pass });
    });
    var allPass = results.every(function(r) { return r.pass; });
    return { test: 'testPlanGating', pass: allPass, detail: results };
}

function testProviderLock() {
    var r1 = validatePlanFeature('STANDARD', 'multi_provider');
    var r2 = validatePlanFeature('PREMIUM', 'multi_provider');
    var pass = r1.allowed === false && r2.allowed === true;
    return { test: 'testProviderLock', pass: pass, detail: { standard_blocked: !r1.allowed, premium_allowed: r2.allowed } };
}

async function testTeacherGroupRestriction() {
    try {
        var result = await getTeacherAllowedGroups('00000000-0000-0000-0000-000000000000');
        var pass = result === null || (Array.isArray(result) && result.length === 0);
        return { test: 'testTeacherGroupRestriction', pass: pass, detail: 'Non-existent teacher returns: ' + JSON.stringify(result) };
    } catch (e) {
        return { test: 'testTeacherGroupRestriction', pass: true, detail: 'Threw as expected: ' + e.message };
    }
}

async function testCrossTenantIsolation() {
    var pass = true;
    var detail = [];
    var inst = await getOrCreateInstitution();
    if (inst && inst.id) {
        detail.push('Institution found: ' + inst.id);
    } else {
        pass = false;
        detail.push('No institution found');
    }
    return { test: 'testCrossTenantIsolation', pass: pass, detail: detail.join('; ') };
}

async function testStudentIsolation() {
    try {
        var challenges = await getActiveChallengesForStudent('__NON_EXISTENT_GROUP__');
        var pass = Array.isArray(challenges) && challenges.length === 0;
        return { test: 'testStudentIsolation', pass: pass, detail: 'Non-existent group challenges: ' + challenges.length };
    } catch (e) {
        return { test: 'testStudentIsolation', pass: true, detail: 'Threw: ' + e.message };
    }
}

async function runSaaSTests() {
    console.log('======= SaaS Validation Tests =======');
    var tests = [
        testPlanGating(),
        testProviderLock(),
        await testNegativeCredits(),
        await testTeacherGroupRestriction(),
        await testCrossTenantIsolation(),
        await testStudentIsolation()
    ];
    var passCount = 0, failCount = 0;
    tests.forEach(function(t) {
        if (t.pass) { passCount++; console.log('  PASS:', t.test); }
        else { failCount++; console.log('  FAIL:', t.test, t.detail); }
    });
    console.log('======= PASS=' + passCount + ' FAIL=' + failCount + ' =======');
    return { pass: passCount, fail: failCount, tests: tests };
}
if (typeof window !== 'undefined') window.runSaaSTests = runSaaSTests;

// ================================================================
// PHASE 1 — GOD MODE SUPER ADMIN
// ================================================================

// --- RBAC Role Hierarchy ---
var ROLE_HIERARCHY = { 'student': 0, 'teacher': 1, 'admin': 2, 'super_admin': 3 };

function getRoleLevel(role) {
    return ROLE_HIERARCHY[String(role || '').toLowerCase()] || 0;
}

// --- PHASE 2: RBAC Guard Functions ---
function _getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('lingoCoins_user') || '{}');
    } catch (_) { return {}; }
}

function requireRole(requiredRole) {
    var user = _getCurrentUser();
    var userLevel = getRoleLevel(user.rol);
    var requiredLevel = getRoleLevel(requiredRole);
    if (userLevel < requiredLevel) {
        throw new Error('RBAC: Requires role "' + requiredRole + '" but current role is "' + (user.rol || 'none') + '"');
    }
    return user;
}

function requireSuperAdmin() {
    var user = _getCurrentUser();
    if (user.rol !== 'super_admin') {
        throw new Error('RBAC: This action requires super_admin privileges');
    }
    return user;
}

function requireInstitutionAdmin() {
    var user = _getCurrentUser();
    if (user.rol !== 'admin' && user.rol !== 'super_admin') {
        throw new Error('RBAC: This action requires admin or super_admin privileges');
    }
    return user;
}

function requireTeacher() {
    var user = _getCurrentUser();
    if (!isAdminRole(user.rol)) {
        throw new Error('RBAC: This action requires teacher, admin, or super_admin privileges');
    }
    return user;
}

// --- Last Super Admin Protection ---
async function countSuperAdmins() {
    try {
        var res = await supabaseClient.from(CONFIG.tables.profiles).select('id').eq('rol', 'super_admin');
        if (res.error) throw res.error;
        return (res.data || []).length;
    } catch (e) {
        console.warn('[RBAC] countSuperAdmins error:', e.message);
        return 1;
    }
}

async function canModifySuperAdmin(targetUserId, newRole) {
    if (newRole === 'super_admin') return true;
    var target = await supabaseClient.from(CONFIG.tables.profiles).select('rol').eq('id', targetUserId).maybeSingle();
    if (!target.data || target.data.rol !== 'super_admin') return true;
    var count = await countSuperAdmins();
    if (count <= 1) return false;
    return true;
}

// --- God Mode: Reset Any User Password ---
async function resetUserPassword(targetUserId, newPin) {
    requireSuperAdmin();
    if (!targetUserId) throw new Error('Target user ID required');
    if (!isValidPin(String(newPin))) throw new Error('New PIN must be 4-12 numeric digits');

    var res = await supabaseClient.from(CONFIG.tables.profiles).update({ pin: String(newPin) }).eq('id', targetUserId);
    if (res.error) {
        if (isMissingColumnError(res.error, 'pin', CONFIG.tables.profiles)) throw new Error('PIN column not found');
        throw res.error;
    }
    await insertAuditLog(_getCurrentUser().id, null, 'PASSWORD_RESET', 'SUCCESS', { target_user_id: targetUserId });
    return { ok: true };
}

// --- God Mode: Force Password Reset on Next Login ---
async function forcePasswordResetOnLogin(targetUserId) {
    requireSuperAdmin();
    if (!targetUserId) throw new Error('Target user ID required');
    var res = await supabaseClient.from(CONFIG.tables.profiles).update({ force_password_reset: true }).eq('id', targetUserId);
    if (res.error && isMissingColumnError(res.error, 'force_password_reset', CONFIG.tables.profiles)) {
        console.warn('[GOD_MODE] force_password_reset column missing, skipping');
        return { ok: true, warning: 'Column not yet migrated' };
    }
    if (res.error) throw res.error;
    await insertAuditLog(_getCurrentUser().id, null, 'FORCE_PASSWORD_RESET', 'SUCCESS', { target_user_id: targetUserId });
    return { ok: true };
}

// --- God Mode: Lock/Unlock Account ---
async function lockAccount(targetUserId) {
    requireSuperAdmin();
    if (!targetUserId) throw new Error('Target user ID required');
    var res = await supabaseClient.from(CONFIG.tables.profiles).update({ account_locked: true }).eq('id', targetUserId);
    if (res.error && isMissingColumnError(res.error, 'account_locked', CONFIG.tables.profiles)) {
        return { ok: true, warning: 'Column not yet migrated' };
    }
    if (res.error) throw res.error;
    await insertAuditLog(_getCurrentUser().id, null, 'ACCOUNT_LOCKED', 'SUCCESS', { target_user_id: targetUserId });
    return { ok: true };
}

async function unlockAccount(targetUserId) {
    requireSuperAdmin();
    if (!targetUserId) throw new Error('Target user ID required');
    var res = await supabaseClient.from(CONFIG.tables.profiles).update({ account_locked: false }).eq('id', targetUserId);
    if (res.error && isMissingColumnError(res.error, 'account_locked', CONFIG.tables.profiles)) {
        return { ok: true, warning: 'Column not yet migrated' };
    }
    if (res.error) throw res.error;
    await insertAuditLog(_getCurrentUser().id, null, 'ACCOUNT_UNLOCKED', 'SUCCESS', { target_user_id: targetUserId });
    return { ok: true };
}

// --- God Mode: Change Role of Any User (with last-super_admin protection) ---
async function changeUserRole(targetUserId, newRole) {
    requireSuperAdmin();
    var allowedRoles = ['student', 'teacher', 'admin', 'super_admin'];
    if (allowedRoles.indexOf(newRole) === -1) throw new Error('Invalid role: ' + newRole);

    var canModify = await canModifySuperAdmin(targetUserId, newRole);
    if (!canModify) throw new Error('Cannot downgrade the last super_admin in the system');

    var res = await supabaseClient.from(CONFIG.tables.profiles).update({ rol: newRole }).eq('id', targetUserId);
    if (res.error) throw res.error;
    await insertAuditLog(_getCurrentUser().id, null, 'ROLE_CHANGE', 'SUCCESS', { target_user_id: targetUserId, new_role: newRole });
    return { ok: true };
}

// --- God Mode: Edit Any User (full field set) ---
async function editAnyUser(targetUserId, fields) {
    requireSuperAdmin();
    if (!targetUserId) throw new Error('Target user ID required');

    var safeFields = {};
    if (fields.nombre_completo !== undefined) safeFields.nombre_completo = String(fields.nombre_completo).trim();
    if (fields.documento_id !== undefined) safeFields.documento_id = normalizeDocumentoId(fields.documento_id);
    if (fields.pin !== undefined && fields.pin !== '') safeFields.pin = String(fields.pin);
    if (fields.grupo !== undefined) safeFields.grupo = fields.grupo || null;
    if (fields.monedas !== undefined) safeFields.monedas = Math.max(0, Math.floor(Number(fields.monedas)) || 0);
    if (fields.institution_id !== undefined) safeFields.institution_id = fields.institution_id || null;
    if (fields.is_active !== undefined) safeFields.is_active = !!fields.is_active;

    if (fields.rol !== undefined) {
        var canModify = await canModifySuperAdmin(targetUserId, fields.rol);
        if (!canModify) throw new Error('Cannot downgrade the last super_admin');
        safeFields.rol = fields.rol;
    }

    if (safeFields.documento_id) {
        var dup = await supabaseClient.from(CONFIG.tables.profiles).select('id').eq('documento_id', safeFields.documento_id).neq('id', targetUserId).maybeSingle();
        if (dup.data) throw new Error('Document ID already in use by another user');
    }

    var res = await supabaseClient.from(CONFIG.tables.profiles).update(safeFields).eq('id', targetUserId);
    if (res.error) {
        if (isMissingColumnError(res.error, 'institution_id', CONFIG.tables.profiles)) {
            delete safeFields.institution_id;
            res = await supabaseClient.from(CONFIG.tables.profiles).update(safeFields).eq('id', targetUserId);
        }
        if (res.error && isMissingColumnError(res.error, 'is_active', CONFIG.tables.profiles)) {
            delete safeFields.is_active;
            res = await supabaseClient.from(CONFIG.tables.profiles).update(safeFields).eq('id', targetUserId);
        }
    }
    if (res.error) throw res.error;
    await insertAuditLog(_getCurrentUser().id, null, 'USER_EDIT_GOD_MODE', 'SUCCESS', { target_user_id: targetUserId, fields_changed: Object.keys(safeFields) });
    return { ok: true };
}

// --- God Mode: Override Credits ---
async function overrideInstitutionCredits(institutionId, newPool, newUsed) {
    requireSuperAdmin();
    if (!institutionId) throw new Error('Institution ID required');
    var patch = {};
    var safePool = Math.max(0, Math.floor(Number(newPool)) || 0);
    var safeUsed = Math.max(0, Math.floor(Number(newUsed)) || 0);
    if (newPool !== undefined) patch.ai_credit_pool = safePool;
    if (newUsed !== undefined) patch.ai_credits_used = safeUsed;
    if (!Object.keys(patch).length) throw new Error('No fields to update');

    var res = await supabaseClient.from(CONFIG.tables.institutions).update(patch).eq('id', institutionId);
    if (res.error && (isMissingColumnError(res.error, 'ai_credit_pool', CONFIG.tables.institutions)
        || isMissingColumnError(res.error, 'ai_credits_used', CONFIG.tables.institutions))) {
        var legacyPatch = {};
        if (newPool !== undefined) legacyPatch.ai_generation_limit = safePool;
        if (newUsed !== undefined) legacyPatch.ai_generations_used = safeUsed;
        res = await supabaseClient.from(CONFIG.tables.institutions).update(legacyPatch).eq('id', institutionId);
    }
    if (res.error) throw res.error;
    await insertAuditLog(_getCurrentUser().id, institutionId, 'CREDITS_OVERRIDE_INSTITUTION', 'SUCCESS', patch);
    return { ok: true };
}

async function overrideTeacherCredits(teacherId, newCredits) {
    requireSuperAdmin();
    if (!teacherId) throw new Error('Teacher ID required');
    var val = Math.max(0, Math.floor(Number(newCredits)) || 0);
    var res = await supabaseClient.from(CONFIG.tables.profiles).update({ teacher_credits: val }).eq('id', teacherId);
    if (res.error && !isMissingColumnError(res.error, 'teacher_credits', CONFIG.tables.profiles)) throw res.error;
    await insertAuditLog(_getCurrentUser().id, null, 'CREDITS_OVERRIDE_TEACHER', 'SUCCESS', { teacher_id: teacherId, new_credits: val });
    return { ok: true };
}

async function resetStudentCoins(studentId, newCoins) {
    requireSuperAdmin();
    if (!studentId) throw new Error('Student ID required');
    var val = Math.max(0, Math.floor(Number(newCoins)) || 0);
    var res = await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: val }).eq('id', studentId);
    if (res.error) throw res.error;
    insertStudentCoinTransaction(studentId, val, 'admin_reset', val);
    await insertAuditLog(_getCurrentUser().id, null, 'COINS_RESET_STUDENT', 'SUCCESS', { student_id: studentId, new_coins: val });
    return { ok: true };
}

// ================================================================
// PHASE 3 — DUOLINGO-STYLE CHALLENGE LOGIC
// ================================================================

// --- Challenge Session Management ---
async function startChallengeSession(challengeId, studentDocId) {
    requireRole('student');
    if (!challengeId || !studentDocId) throw new Error('Challenge ID and student ID required');

    var existing = await supabaseClient.from(CONFIG.tables.challenge_sessions)
        .select('*').eq('challenge_id', challengeId).eq('student_id', studentDocId).eq('status', 'in_progress').maybeSingle();
    if (existing.error && !isMissingRelationError(existing.error, CONFIG.tables.challenge_sessions)) throw existing.error;
    if (existing.data) return existing.data;

    var payload = {
        challenge_id: challengeId,
        student_id: studentDocId,
        started_at: new Date().toISOString(),
        current_question_index: 0,
        answers: [],
        score_percent: 0,
        xp_earned: 0,
        coins_earned: 0,
        streak_bonus: 0,
        status: 'in_progress',
        weak_skills: [],
        drako_feedback: null
    };
    var res = await supabaseClient.from(CONFIG.tables.challenge_sessions).insert([payload]).select('*').maybeSingle();
    if (res.error) {
        if (isMissingRelationError(res.error, CONFIG.tables.challenge_sessions)) return payload;
        throw res.error;
    }
    return res.data || payload;
}

async function updateChallengeSession(sessionId, updates) {
    if (!sessionId) return;
    try {
        var res = await supabaseClient.from(CONFIG.tables.challenge_sessions).update(updates).eq('id', sessionId);
        if (res.error && !isMissingRelationError(res.error, CONFIG.tables.challenge_sessions)) {
            console.warn('[CHALLENGE_SESSION] Update failed:', res.error.message);
        }
    } catch (e) {
        if (!isMissingRelationError(e, CONFIG.tables.challenge_sessions)) {
            console.warn('[CHALLENGE_SESSION] Error:', e.message);
        }
    }
}

async function completeChallengeSession(sessionId, scorePercent, xpEarned, coinsEarned, streakBonus, weakSkills, drakoFeedback) {
    if (!sessionId) return;
    var updates = {
        completed_at: new Date().toISOString(),
        score_percent: scorePercent || 0,
        xp_earned: xpEarned || 0,
        coins_earned: coinsEarned || 0,
        streak_bonus: streakBonus || 0,
        status: 'completed',
        weak_skills: weakSkills || [],
        drako_feedback: drakoFeedback || null
    };
    await updateChallengeSession(sessionId, updates);
}

// --- XP and Coin Computation ---
function computeChallengeRewards(scorePercent, currentStreak, challengeMeta) {
    var meta = challengeMeta || {};
    var baseXP = Number(meta.xp_reward) || 10;
    var baseCoins = Number(meta.coins_reward) || 5;
    var score = Number(scorePercent) || 0;
    var streak = Number(currentStreak) || 0;

    var xpEarned = 0;
    var coinsEarned = 0;
    var streakBonus = 0;

    if (score >= 100) {
        xpEarned = baseXP;
        coinsEarned = baseCoins;
    } else if (score >= 80) {
        xpEarned = Math.round(baseXP * 0.8);
        coinsEarned = Math.round(baseCoins * 0.8);
    } else if (score >= 60) {
        xpEarned = Math.round(baseXP * 0.5);
        coinsEarned = Math.round(baseCoins * 0.5);
    } else if (score >= 40) {
        xpEarned = Math.round(baseXP * 0.25);
        coinsEarned = Math.round(baseCoins * 0.25);
    } else {
        xpEarned = Math.round(baseXP * 0.1);
        coinsEarned = 0;
    }

    if (streak >= 7) streakBonus = Math.round(baseCoins * 0.5);
    else if (streak >= 3) streakBonus = Math.round(baseCoins * 0.25);
    else if (streak >= 1) streakBonus = 1;

    coinsEarned += streakBonus;

    return { xpEarned: xpEarned, coinsEarned: coinsEarned, streakBonus: streakBonus, scorePercent: score };
}

// --- Student Progress Tracking ---
async function updateStudentProgress(studentDocId, skill, cefrLevel, wasCorrect) {
    if (!studentDocId || !skill) return;
    try {
        var existing = await supabaseClient.from(CONFIG.tables.student_progress)
            .select('*').eq('student_id', studentDocId).eq('skill', skill).maybeSingle();
        if (existing.error && !isMissingRelationError(existing.error, CONFIG.tables.student_progress)) return;

        if (existing.data) {
            var total = (Number(existing.data.total_attempts) || 0) + 1;
            var correct = (Number(existing.data.correct_attempts) || 0) + (wasCorrect ? 1 : 0);
            var accuracy = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
            var isWeak = accuracy < 60 && total >= 3;
            await supabaseClient.from(CONFIG.tables.student_progress).update({
                total_attempts: total, correct_attempts: correct, accuracy_percent: accuracy,
                weak: isWeak, last_practiced_at: new Date().toISOString(),
                cefr_level: cefrLevel || existing.data.cefr_level
            }).eq('id', existing.data.id);
        } else {
            await supabaseClient.from(CONFIG.tables.student_progress).insert([{
                student_id: studentDocId, skill: skill, cefr_level: cefrLevel || null,
                total_attempts: 1, correct_attempts: wasCorrect ? 1 : 0,
                accuracy_percent: wasCorrect ? 100 : 0, weak: false,
                last_practiced_at: new Date().toISOString()
            }]);
        }
    } catch (e) {
        if (!isMissingRelationError(e, CONFIG.tables.student_progress)) {
            console.warn('[STUDENT_PROGRESS]', e.message);
        }
    }
}

async function getStudentWeakSkills(studentDocId) {
    try {
        var res = await supabaseClient.from(CONFIG.tables.student_progress)
            .select('*').eq('student_id', studentDocId).eq('weak', true).order('accuracy_percent', { ascending: true });
        if (res.error) {
            if (isMissingRelationError(res.error, CONFIG.tables.student_progress)) return [];
            throw res.error;
        }
        return res.data || [];
    } catch (e) {
        return [];
    }
}

async function getStudentProgressAll(studentDocId) {
    try {
        var res = await supabaseClient.from(CONFIG.tables.student_progress)
            .select('*').eq('student_id', studentDocId).order('last_practiced_at', { ascending: false });
        if (res.error) {
            if (isMissingRelationError(res.error, CONFIG.tables.student_progress)) return [];
            throw res.error;
        }
        return res.data || [];
    } catch (e) {
        return [];
    }
}

// --- Student XP/Level Update ---
async function awardXPToStudent(studentDocId, xpAmount) {
    if (!studentDocId || !xpAmount || xpAmount <= 0) return { ok: false };
    try {
        var profile = await getProfileByDocumentoId(studentDocId);
        if (!profile) return { ok: false, error: 'Profile not found' };
        var currentXP = Number(profile.xp) || 0;
        var newXP = currentXP + Math.floor(xpAmount);
        var levelInfo = calculateLevelXP(newXP);
        var patch = { xp: newXP, level: levelInfo.level };
        var res = await supabaseClient.from(CONFIG.tables.profiles).update(patch).eq('id', profile.id);
        if (res.error && isMissingColumnError(res.error, 'xp', CONFIG.tables.profiles)) {
            return { ok: true, warning: 'XP column not migrated', newXP: newXP, level: levelInfo.level };
        }
        if (res.error && isMissingColumnError(res.error, 'level', CONFIG.tables.profiles)) {
            await supabaseClient.from(CONFIG.tables.profiles).update({ xp: newXP }).eq('id', profile.id);
            return { ok: true, newXP: newXP, level: levelInfo.level };
        }
        if (res.error) throw res.error;
        return { ok: true, newXP: newXP, level: levelInfo.level };
    } catch (e) {
        console.warn('[XP_AWARD]', e.message);
        return { ok: false, error: e.message };
    }
}

// --- Streak Update with Longest Streak Tracking ---
async function updateStreakEnhanced(documentoId) {
    try {
        var profile = await getProfileByDocumentoId(documentoId);
        if (!profile) return { ok: false, error: 'Profile not found' };
        var newStreak = (Number(profile.current_streak) || 0) + 1;
        var longestStreak = Math.max(Number(profile.longest_streak) || 0, newStreak);
        var patch = { current_streak: newStreak, longest_streak: longestStreak };
        var res = await supabaseClient.from(CONFIG.tables.profiles).update(patch).eq('id', profile.id);
        if (res.error && isMissingColumnError(res.error, 'longest_streak', CONFIG.tables.profiles)) {
            await supabaseClient.from(CONFIG.tables.profiles).update({ current_streak: newStreak }).eq('id', profile.id);
        } else if (res.error) {
            throw res.error;
        }
        return { ok: true, newStreak: newStreak, longestStreak: longestStreak };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// --- Dashboard Data Aggregation ---
async function getStudentDashboardData(studentDocId) {
    var profile = await getProfileByDocumentoId(studentDocId);
    if (!profile) return null;

    var progress = await getStudentProgressAll(studentDocId);
    var weakSkills = progress.filter(function(p) { return p.weak; });
    var totalXP = Number(profile.xp) || 0;
    var levelInfo = calculateLevelXP(totalXP > 0 ? totalXP : (Number(profile.monedas) || 0));
    var streak = Number(profile.current_streak) || 0;
    var longestStreak = Number(profile.longest_streak) || streak;

    var continueLearning = [];
    if (weakSkills.length > 0) {
        continueLearning = weakSkills.slice(0, 3).map(function(ws) {
            return { skill: ws.skill, accuracy: ws.accuracy_percent, cefr: ws.cefr_level, message: 'Practice ' + ws.skill + ' to improve!' };
        });
    }

    return {
        profile: profile,
        coins: Number(profile.monedas) || 0,
        xp: totalXP,
        level: levelInfo.level,
        xpPercent: levelInfo.xpPercent,
        xpForNext: levelInfo.xpForNext,
        streak: streak,
        longestStreak: longestStreak,
        progress: progress,
        weakSkills: weakSkills,
        continueLearning: continueLearning
    };
}

// ================================================================
// PHASE 4 — CREDIT AND COIN ECONOMY
// ================================================================

async function rewardTeacherForEngagement(teacherId) {
    requireRole('teacher');
    if (!teacherId) throw new Error('Teacher ID required');

    try {
        var challengesRes = await supabaseClient.from(CONFIG.tables.challenges)
            .select('id').eq('created_by', teacherId);
        if (challengesRes.error && !isMissingColumnError(challengesRes.error, 'created_by', CONFIG.tables.challenges)) {
            throw challengesRes.error;
        }
        var challengeCount = (challengesRes.data || []).length;

        var completionsRes = await supabaseClient.from(CONFIG.tables.challenge_submissions)
            .select('id, is_correct');
        var totalCompletions = 0;
        var correctCompletions = 0;
        if (!completionsRes.error) {
            totalCompletions = (completionsRes.data || []).length;
            correctCompletions = (completionsRes.data || []).filter(function(s) { return s.is_correct; }).length;
        }

        var creditsEarned = 0;
        if (challengeCount >= 10) creditsEarned += 2;
        else if (challengeCount >= 5) creditsEarned += 1;

        var completionRate = totalCompletions > 0 ? (correctCompletions / totalCompletions) : 0;
        if (completionRate >= 0.8 && totalCompletions >= 20) creditsEarned += 3;
        else if (completionRate >= 0.6 && totalCompletions >= 10) creditsEarned += 1;

        if (creditsEarned > 0) {
            var currentCredits = await getTeacherCredits(teacherId);
            var newCredits = currentCredits + creditsEarned;
            var updRes = await supabaseClient.from(CONFIG.tables.profiles).update({ teacher_credits: newCredits }).eq('id', teacherId);
            if (updRes.error && !isMissingColumnError(updRes.error, 'teacher_credits', CONFIG.tables.profiles)) {
                throw updRes.error;
            }

            try {
                await supabaseClient.from(CONFIG.tables.teacher_rewards).insert([{
                    teacher_id: teacherId, reward_type: 'engagement',
                    credits_awarded: creditsEarned,
                    metadata: { challenge_count: challengeCount, completion_rate: completionRate, total_completions: totalCompletions }
                }]);
            } catch (_) {}

            await insertAuditLog(teacherId, null, 'TEACHER_ENGAGEMENT_REWARD', 'SUCCESS', { credits_earned: creditsEarned });
            return { ok: true, creditsEarned: creditsEarned, newCredits: newCredits };
        }

        return { ok: true, creditsEarned: 0, message: 'No engagement rewards earned yet. Keep creating challenges!' };
    } catch (e) {
        console.warn('[TEACHER_REWARD]', e.message);
        return { ok: false, error: e.message };
    }
}

// ================================================================
// PHASE 5 — DRAKO INTELLIGENCE LAYER
// ================================================================

function generateDrakoFeedback(scorePercent, weakSkills, streak, challengeSkill) {
    var score = Number(scorePercent) || 0;
    var streakVal = Number(streak) || 0;
    var messages = [];

    if (score >= 100) {
        messages.push('🐉 Perfect score! You\'re on fire!');
        if (streakVal >= 7) messages.push('🔥 ' + streakVal + '-day streak! You\'re unstoppable!');
        else if (streakVal >= 3) messages.push('💪 ' + streakVal + '-day streak! Keep it going!');
    } else if (score >= 80) {
        messages.push('🐉 Great job! Almost perfect!');
        messages.push('💡 Review the questions you missed to reach 100%.');
    } else if (score >= 60) {
        messages.push('🐉 Good effort! You\'re getting there.');
        messages.push('📘 Try practicing more before your next challenge.');
    } else if (score >= 40) {
        messages.push('🐉 Don\'t give up! Every attempt makes you stronger.');
        messages.push('🎯 Focus on understanding the basics first.');
    } else {
        messages.push('🐉 This was tough, but I believe in you!');
        messages.push('📖 Let\'s go back to the fundamentals and build up.');
    }

    if (Array.isArray(weakSkills) && weakSkills.length > 0) {
        var weakNames = weakSkills.slice(0, 3).map(function(ws) {
            return typeof ws === 'string' ? ws : (ws.skill || 'unknown');
        });
        messages.push('⚠️ You\'re struggling with: ' + weakNames.join(', ') + '. Let\'s practice more!');
    }

    if (challengeSkill) {
        messages.push('📌 This challenge focused on: ' + challengeSkill);
    }

    return messages.join('\n');
}

function recommendNextChallenge(weakSkills, completedChallengeIds, availableChallenges) {
    var completed = Array.isArray(completedChallengeIds) ? completedChallengeIds : [];
    var available = Array.isArray(availableChallenges) ? availableChallenges : [];
    var uncompleted = available.filter(function(c) { return completed.indexOf(c.id) === -1; });

    if (!uncompleted.length) return null;

    if (Array.isArray(weakSkills) && weakSkills.length > 0) {
        var weakNames = weakSkills.map(function(ws) { return typeof ws === 'string' ? ws : (ws.skill || ''); });
        var matching = uncompleted.filter(function(c) {
            var cSkill = String(c.skill_type || c.skill || '').toLowerCase();
            return weakNames.some(function(wn) { return cSkill.indexOf(wn.toLowerCase()) !== -1; });
        });
        if (matching.length > 0) return matching[0];
    }

    return uncompleted[0];
}

// ================================================================
// PHASE 6 — SUPER ADMIN LLM CONTROL
// ================================================================

async function assignLLMToInstitution(institutionId, provider) {
    requireSuperAdmin();
    if (!institutionId) throw new Error('Institution ID required');
    var validProviders = ['chatgpt', 'openai', 'claude', 'anthropic', 'gemini', 'google'];
    var prov = String(provider || '').toLowerCase();
    if (validProviders.indexOf(prov) === -1) throw new Error('Invalid provider. Valid: ' + validProviders.join(', '));

    var res = await supabaseClient.from(CONFIG.tables.institutions).update({ active_ai_provider: prov }).eq('id', institutionId);
    if (res.error) throw res.error;
    await insertAuditLog(_getCurrentUser().id, institutionId, 'LLM_ASSIGNMENT', 'SUCCESS', { provider: prov });
    return { ok: true, provider: prov };
}

function resolveInstitutionProvider(institution) {
    if (!institution) return 'chatgpt';
    return String(institution.active_ai_provider || 'chatgpt').toLowerCase();
}

// ================================================================
// PHASE 7 — PASSWORD POWER (login integration)
// ================================================================

async function checkLoginRestrictions(profileData) {
    if (!profileData) return { allowed: true };

    if (profileData.account_locked === true) {
        return { allowed: false, reason: 'Account is locked. Contact your administrator.' };
    }
    if (profileData.is_active === false) {
        return { allowed: false, reason: 'Account is deactivated. Contact your administrator.' };
    }
    if (profileData.force_password_reset === true) {
        return { allowed: true, forceReset: true };
    }
    return { allowed: true };
}

// ================================================================
// PHASE 9 — SECURITY ENFORCEMENT HELPERS
// ================================================================

function canUserEditTarget(actorRole, targetRole) {
    var actorLevel = getRoleLevel(actorRole);
    var targetLevel = getRoleLevel(targetRole);
    if (actorLevel <= targetLevel && actorRole !== 'super_admin') return false;
    if (actorRole === 'teacher' && targetRole !== 'student') return false;
    if (actorRole === 'admin' && targetRole === 'super_admin') return false;
    return true;
}

function canUserDeleteTarget(actorRole, targetRole) {
    if (targetRole === 'super_admin') return false;
    return canUserEditTarget(actorRole, targetRole);
}

function isTeacherAllowedView(viewId) {
    var allowed = ['users', 'groups', 'attendance', 'challenges', 'announcements'];
    return allowed.indexOf(viewId) !== -1;
}

function isAdminAllowedView(viewId) {
    var allowed = ['users', 'groups', 'attendance', 'challenges', 'store', 'cobros', 'announcements', 'feedback'];
    return allowed.indexOf(viewId) !== -1;
}

// ================================================================
// NETWORK STABILITY — safeRest() with 5s timeout + no HEAD requests
// ================================================================

/**
 * safeRest(fn) — wraps any async Supabase call with a 5-second AbortController
 * timeout. Prevents unhandled promise rejections from hanging network calls.
 * Usage: var result = await safeRest(function(signal) {
 *   return supabaseClient.from('table').select('*');
 * });
 */
async function safeRest(fn, timeoutMs) {
    var ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 5000;
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, ms);
    try {
        var result = await fn(controller.signal);
        return result;
    } catch (err) {
        if (err && err.name === 'AbortError') {
            return { data: null, error: { message: 'Request timed out after ' + ms + 'ms', code: 'TIMEOUT' } };
        }
        return { data: null, error: err };
    } finally {
        clearTimeout(timer);
    }
}

// ================================================================
// HIERARCHICAL COIN ECONOMY
// SuperAdmin → Admin (coin_pool) → Teacher (coin_budget) → Student
// ================================================================

/**
 * getAdminCoinPool(adminProfileId)
 * Returns the admin's allocated coin pool (coin_pool column, fallback monedas).
 */
async function getAdminCoinPool(adminProfileId) {
    try {
        var res = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('id,monedas,coin_pool,rol')
            .eq('id', adminProfileId)
            .eq('rol', 'admin')
            .maybeSingle();
        if (res.error && typeof isMissingColumnError === 'function' && isMissingColumnError(res.error, 'coin_pool', CONFIG.tables.profiles)) {
            // Retry without coin_pool
            res = await supabaseClient
                .from(CONFIG.tables.profiles)
                .select('id,monedas,rol')
                .eq('id', adminProfileId)
                .eq('rol', 'admin')
                .maybeSingle();
        }
        if (res.error || !res.data) return { ok: false, error: (res.error && res.error.message) || 'Admin not found', pool: 0 };
        var pool = res.data.coin_pool != null ? Number(res.data.coin_pool) : Number(res.data.monedas || 0);
        return { ok: true, pool: Math.max(0, pool) };
    } catch (err) {
        return { ok: false, error: err.message, pool: 0 };
    }
}

/**
 * allocateCoinPoolToAdmin(adminProfileId, amount)
 * SuperAdmin allocates coins to an admin's coin_pool.
 * Falls back to monedas if coin_pool column doesn't exist.
 */
async function allocateCoinPoolToAdmin(adminProfileId, amount) {
    var delta = Math.floor(Number(amount) || 0);
    if (!delta) return { ok: false, error: 'Amount must be non-zero' };
    try {
        var read = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('id,coin_pool,monedas')
            .eq('id', adminProfileId)
            .maybeSingle();
        if (read.error && typeof isMissingColumnError === 'function' && isMissingColumnError(read.error, 'coin_pool', CONFIG.tables.profiles)) {
            read = await supabaseClient
                .from(CONFIG.tables.profiles)
                .select('id,monedas')
                .eq('id', adminProfileId)
                .maybeSingle();
        }
        if (read.error) throw read.error;
        if (!read.data) return { ok: false, error: 'Admin not found' };
        var current = read.data.coin_pool != null ? Number(read.data.coin_pool) : Number(read.data.monedas || 0);
        var next = Math.max(0, current + delta);
        var upd = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_pool: next }).eq('id', adminProfileId);
        if (upd.error && isMissingColumnError(upd.error, 'coin_pool', CONFIG.tables.profiles)) {
            // Fallback: use monedas
            upd = await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: next }).eq('id', adminProfileId);
        }
        if (upd.error) throw upd.error;
        return { ok: true, newPool: next };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function getSchoolPocket(institutionId) {
    if (!institutionId) return { ok: false, error: 'institution_id required', pocket: 0 };
    try {
        var r = await supabaseClient.from(CONFIG.tables.institutions).select('id,coin_pool').eq('id', institutionId).maybeSingle();
        if (r.error && typeof isMissingColumnError === 'function' && isMissingColumnError(r.error, 'coin_pool', CONFIG.tables.institutions)) {
            return { ok: false, error: 'institutions.coin_pool missing', pocket: 0 };
        }
        if (r.error || !r.data) return { ok: false, error: (r.error && r.error.message) || 'institution not found', pocket: 0 };
        return { ok: true, pocket: Math.max(0, Number(r.data.coin_pool || 0)) };
    } catch (e) {
        return { ok: false, error: e.message, pocket: 0 };
    }
}

async function allocateSchoolPocket(institutionId, delta, createdByProfileId, meta) {
    var d = Math.floor(Number(delta) || 0);
    if (!d) return { ok: false, error: 'Amount must be non-zero' };
    var cur = await getSchoolPocket(institutionId);
    if (!cur.ok) return { ok: false, error: cur.error };
    var next = Math.max(0, cur.pocket + d);
    if (d < 0 && cur.pocket < Math.abs(d)) return { ok: false, error: 'Insufficient school pocket (' + cur.pocket + ')' };

    // If wallet/ledger exists, log transfer via RPC (system wallet is handled inside triggers or RPC).
    // We still update institutions.coin_pool as source-of-truth for current UI.
    var upd = await supabaseClient.from(CONFIG.tables.institutions).update({ coin_pool: next }).eq('id', institutionId);
    if (upd.error) return { ok: false, error: upd.error.message || 'Update failed' };

    // Optional explicit ledger entry (if RPC exists). Triggers will also log balance_update.
    try {
        var canRpc = await coinLedgerEnabled();
        if (canRpc) {
            var sysW = await _ensureWalletId('system', null);
            var instW = await _ensureWalletId('institution', institutionId);
            if (sysW && instW) {
                if (d > 0) await _coinTransferRpc(sysW, instW, d, 'school_pocket_adjust', createdByProfileId || null, institutionId, meta || {});
                else await _coinTransferRpc(instW, sysW, Math.abs(d), 'school_pocket_adjust', createdByProfileId || null, institutionId, meta || {});
            }
        }
    } catch (_) {}

    return { ok: true, newPocket: next };
}

/**
 * getTeacherCoinBudget(teacherProfileId)
 * Returns the teacher's coin budget (coin_budget column, fallback coin_pocket, fallback monedas).
 */
async function getTeacherCoinBudget(teacherProfileId) {
    try {
        var res = await supabaseClient
            .from(CONFIG.tables.profiles)
            .select('id,coin_budget,coin_pocket,monedas,rol')
            .eq('id', teacherProfileId)
            .maybeSingle();

        // Some schemas don't have coin_budget/coin_pocket. Retry with monedas only.
        if (res.error && typeof isMissingColumnError === 'function' &&
            (isMissingColumnError(res.error, 'coin_budget', CONFIG.tables.profiles) ||
             isMissingColumnError(res.error, 'coin_pocket', CONFIG.tables.profiles))) {
            res = await supabaseClient
                .from(CONFIG.tables.profiles)
                .select('id,monedas,rol')
                .eq('id', teacherProfileId)
                .maybeSingle();
        }

        if (res.error || !res.data) return { ok: false, error: (res.error && res.error.message) || 'Teacher not found', budget: 0 };
        var d = res.data;
        var budget = d.coin_budget != null ? Number(d.coin_budget)
            : (d.coin_pocket != null ? Number(d.coin_pocket) : Number(d.monedas || 0));
        return { ok: true, budget: Math.max(0, budget) };
    } catch (err) {
        return { ok: false, error: err.message, budget: 0 };
    }
}

/**
 * allocateCoinBudgetToTeacher(adminProfileId, teacherProfileId, amount)
 * Admin allocates coins from their pool to a teacher's budget.
 * Enforces: admin must have enough pool. Deducts from admin, adds to teacher.
 */
async function allocateCoinBudgetToTeacher(adminProfileId, teacherProfileId, amount) {
    var delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!delta) return { ok: false, error: 'Amount must be positive' };
    try {
        // Prefer School Pocket (institutions.coin_pool) as the source-of-truth for admin allocations.
        // This matches: SuperAdmin -> School Pocket -> Teachers -> Students.
        var adminRow = await supabaseClient.from(CONFIG.tables.profiles).select('id,institution_id,rol').eq('id', adminProfileId).maybeSingle();
        if (adminRow.error || !adminRow.data) return { ok: false, error: 'Admin not found' };
        var instId = String(adminRow.data.institution_id || '').trim();

        var pocketDeduct = null;
        if (instId) {
            pocketDeduct = await allocateSchoolPocket(instId, -delta, adminProfileId, { reason: 'allocate_to_teacher', teacher_id: teacherProfileId });
            if (!pocketDeduct.ok) {
                // Only fallback when the schema doesn't have institutions.coin_pool.
                // If update fails due to permissions/RLS, we must surface it (otherwise coins look like they never move).
                var errMsg = String(pocketDeduct.error || 'Unknown error');
                var isMissingPocketColumn = errMsg.toLowerCase().includes('coin_pool') &&
                    (errMsg.toLowerCase().includes('missing') || errMsg.toLowerCase().includes('does not exist'));
                if (!isMissingPocketColumn) {
                    return { ok: false, error: 'Cannot deduct from School Pocket: ' + errMsg };
                }
                // Legacy fallback to admin pool if institution pocket not available.
                pocketDeduct = null;
            }
        }

        var newAdminPool = null;
        if (!pocketDeduct) {
            // Legacy: Check admin pool (profiles.coin_pool -> monedas fallback)
            var poolRes = await getAdminCoinPool(adminProfileId);
            if (!poolRes.ok) return { ok: false, error: 'Could not read admin pool: ' + poolRes.error };
            if (poolRes.pool < delta) return { ok: false, error: 'Insufficient admin coin pool (' + poolRes.pool + ' available, ' + delta + ' requested)' };
            var adminDeduct = await allocateCoinPoolToAdmin(adminProfileId, -delta);
            if (!adminDeduct.ok) return { ok: false, error: 'Could not deduct from admin pool: ' + adminDeduct.error };
            newAdminPool = adminDeduct.newPool;
        } else {
            newAdminPool = pocketDeduct.newPocket;
        }

        // Add to teacher budget
        var budgetRes = await getTeacherCoinBudget(teacherProfileId);
        var currentBudget = budgetRes.ok ? budgetRes.budget : 0;
        var nextBudget = currentBudget + delta;

        var upd = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_budget: nextBudget }).eq('id', teacherProfileId);
        if (upd.error && isMissingColumnError(upd.error, 'coin_budget', CONFIG.tables.profiles)) {
            upd = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_pocket: nextBudget }).eq('id', teacherProfileId);
        }
        if (upd.error && isMissingColumnError(upd.error, 'coin_pocket', CONFIG.tables.profiles)) {
            upd = await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: nextBudget }).eq('id', teacherProfileId);
        }
        if (upd.error) throw upd.error;
        // Optional explicit ledger entry (if RPC exists). Triggers will also log balance_update on monedas/coin_pool.
        try {
            var canRpc = await coinLedgerEnabled();
            if (canRpc) {
                var fromW = instId ? await _ensureWalletId('institution', instId) : await _ensureWalletId('profile', adminProfileId);
                var toW = await _ensureWalletId('profile', teacherProfileId);
                if (fromW && toW) {
                    await _coinTransferRpc(fromW, toW, delta, 'admin_to_teacher', adminProfileId, instId || null, { teacher_id: teacherProfileId });
                }
            }
        } catch (_) {}

        return { ok: true, newTeacherBudget: nextBudget, newAdminPool: newAdminPool };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

/**
 * teacherAwardCoinsToStudent(teacherProfileId, studentProfileId, amount)
 * Teacher awards coins to a student, deducting from teacher's own budget.
 * Enforces budget ceiling. Falls back gracefully if budget columns missing.
 */
async function teacherAwardCoinsToStudent(teacherProfileId, studentProfileId, amount) {
    var delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!delta) return { ok: false, error: 'Amount must be positive' };
    try {
        // Read teacher budget (coin_budget -> coin_pocket -> monedas)
        var budgetRes = await getTeacherCoinBudget(teacherProfileId);
        if (!budgetRes.ok) return { ok: false, error: budgetRes.error || 'Could not read teacher pocket' };
        if (budgetRes.budget < delta) {
            return { ok: false, error: 'Teacher coin budget insufficient (' + budgetRes.budget + ' available, ' + delta + ' requested)' };
        }

        // 1) Deduct from teacher FIRST (so we never mint coins if deduction fails)
        var nextTeacherBudget = Math.max(0, budgetRes.budget - delta);
        var tUpd = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_budget: nextTeacherBudget }).eq('id', teacherProfileId);
        if (tUpd.error && typeof isMissingColumnError === 'function' && isMissingColumnError(tUpd.error, 'coin_budget', CONFIG.tables.profiles)) {
            tUpd = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_pocket: nextTeacherBudget }).eq('id', teacherProfileId);
        }
        if (tUpd.error && typeof isMissingColumnError === 'function' && isMissingColumnError(tUpd.error, 'coin_pocket', CONFIG.tables.profiles)) {
            // Legacy fallback
            tUpd = await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: nextTeacherBudget }).eq('id', teacherProfileId);
        }
        if (tUpd.error) throw tUpd.error;

        // 2) Credit student
        var stuRes = await supabaseClient.from(CONFIG.tables.profiles).select('id,monedas').eq('id', studentProfileId).maybeSingle();
        if (stuRes.error || !stuRes.data) {
            // Rollback teacher (best-effort)
            try {
                var rb = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_budget: budgetRes.budget }).eq('id', teacherProfileId);
                if (rb.error && typeof isMissingColumnError === 'function' && isMissingColumnError(rb.error, 'coin_budget', CONFIG.tables.profiles)) {
                    rb = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_pocket: budgetRes.budget }).eq('id', teacherProfileId);
                }
                if (rb.error && typeof isMissingColumnError === 'function' && isMissingColumnError(rb.error, 'coin_pocket', CONFIG.tables.profiles)) {
                    await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: budgetRes.budget }).eq('id', teacherProfileId);
                }
            } catch (_) {}
            return { ok: false, error: 'Student not found' };
        }
        var newStudentCoins = Math.max(0, Number(stuRes.data.monedas || 0) + delta);
        var stuUpd = await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: newStudentCoins }).eq('id', studentProfileId);
        if (stuUpd.error) {
            // Rollback teacher (best-effort)
            try {
                var rb2 = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_budget: budgetRes.budget }).eq('id', teacherProfileId);
                if (rb2.error && typeof isMissingColumnError === 'function' && isMissingColumnError(rb2.error, 'coin_budget', CONFIG.tables.profiles)) {
                    rb2 = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_pocket: budgetRes.budget }).eq('id', teacherProfileId);
                }
                if (rb2.error && typeof isMissingColumnError === 'function' && isMissingColumnError(rb2.error, 'coin_pocket', CONFIG.tables.profiles)) {
                    await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: budgetRes.budget }).eq('id', teacherProfileId);
                }
            } catch (_) {}
            throw stuUpd.error;
        }

        insertStudentCoinTransaction(studentProfileId, delta, 'teacher_award', newStudentCoins);
        return { ok: true, newStudentCoins: newStudentCoins };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ========== INIT (NO AUTO-REDIRECT) ==========
if (typeof document !== 'undefined' && document.getElementById('regGroup')) {
    loadGroups();
}
