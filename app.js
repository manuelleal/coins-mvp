/* ========================================
   LINGO-COINS - APP.JS (PRODUCTION CLEAN)
   ======================================== */

// ========== CONFIG ==========
const CONFIG = {
    supabase: {
        url: 'https://uggkivypfugdchvjurlo.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZ2tpdnlwZnVnZGNodmp1cmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODkxMTMsImV4cCI6MjA4NjE2NTExM30.gCoe4SF3Ye7YcEWLfUpL1rnA5SwZ06FvJoqi0zpbxbE'
    },
    pages: {
        login: 'index.html',
        admin: 'admin.html',
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
        student_inventory: 'student_inventory'
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
    var normalizedCorrect = normalizeChallengeAnswerValue(challenge && challenge.correct_answer || '');
    var normalizedAnswer = normalizeChallengeAnswerValue(rawAnswer);

    if (challengeType === 'multiple_choice') {
        normalizedAnswer = normalizeToken(rawAnswer);
        normalizedCorrect = normalizeToken(payload.correct_answer || challenge.correct_answer || '');
        return { isCorrect: normalizedAnswer !== '' && normalizedAnswer === normalizedCorrect, storedAnswer: String(rawAnswer == null ? '' : rawAnswer) };
    }

    if (challengeType === 'multiple_select') {
        var givenMulti = parseAnswerList(rawAnswer);
        var expectedMulti = parseAnswerList(payload.correct_answers || challenge.correct_answer || []);
        return { isCorrect: givenMulti.length > 0 && compareNormalizedArrays(givenMulti, expectedMulti), storedAnswer: JSON.stringify(givenMulti) };
    }

    if (challengeType === 'true_false') {
        return { isCorrect: normalizedAnswer !== '' && normalizedAnswer === normalizedCorrect, storedAnswer: String(rawAnswer == null ? '' : rawAnswer) };
    }

    if (challengeType === 'matching') {
        var givenMap = safeJsonParse(rawAnswer);
        var expectedMap = payload.pairs || safeJsonParse(challenge.correct_answer) || {};
        if (!givenMap || typeof givenMap !== 'object' || Array.isArray(givenMap)) return { isCorrect: false, storedAnswer: storedAnswer };
        var expectedKeys = Object.keys(expectedMap || {});
        if (!expectedKeys.length) return { isCorrect: false, storedAnswer: storedAnswer };
        var ok = expectedKeys.every(function(k) {
            return normalizeToken(givenMap[k]) === normalizeToken(expectedMap[k]);
        });
        return { isCorrect: ok, storedAnswer: JSON.stringify(givenMap) };
    }

    if (challengeType === 'fill_blank') {
        var givenBlanks = parseAnswerList(rawAnswer);
        var expectedBlanks = parseAnswerList(payload.answers || challenge.correct_answer || []);
        return { isCorrect: givenBlanks.length > 0 && compareNormalizedArrays(givenBlanks, expectedBlanks), storedAnswer: JSON.stringify(givenBlanks) };
    }

    if (challengeType === 'open') {
        var acceptedOpen = parseAnswerList(payload.accepted_answers || challenge.correct_answer || []);
        var givenOpen = normalizeToken(rawAnswer);
        return { isCorrect: !!givenOpen && acceptedOpen.includes(givenOpen), storedAnswer: String(rawAnswer == null ? '' : rawAnswer) };
    }

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

        setLoginThrottleState({ count: 0, firstAttemptMs: Date.now() });
        
        localStorage.setItem('lingoCoins_user', JSON.stringify(data));
        
        const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
        if (data.rol === 'student' && redirectUrl && redirectUrl.indexOf('attendance.html') !== -1) {
            window.location.href = redirectUrl;
            return;
        }
        
        if (isAdminRole(data.rol)) {
            window.location.href = CONFIG.pages.admin;
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
            { table: CONFIG.tables.billing_claims, column: 'group_code' }
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
            .select('id, rol')
            .eq('id', profileId)
            .maybeSingle();
        if (pErr) throw pErr;
        if (!profile) return { ok: false, error: 'User not found' };
        if (profile.rol === 'super_admin') {
            return { ok: false, error: 'Cannot delete super_admin user' };
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
        if (msg.toLowerCase().includes('attendance')) {
            return { ok: false, error: 'Cannot delete user with attendance records. Keep user or archive manually.' };
        }
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
    var txt = String(value == null ? '' : value).trim().toLowerCase();
    if (!txt) return '';
    if (txt === 'verdadero' || txt === 'v' || txt === 'yes' || txt === 'y' || txt === '1') return 'true';
    if (txt === 'falso' || txt === 'f' || txt === 'no' || txt === 'n' || txt === '0') return 'false';
    return txt;
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

        // Compatibility: bidder_id may be documento_id (text) instead of profile UUID.
        if (Object.prototype.hasOwnProperty.call(insertPayload, 'bidder_id') && insertPayload.bidder_id === bidderProfileId) {
            insertPayload.bidder_id = documentoId;
            result = await supabaseClient.from(CONFIG.tables.auction_bids).insert([insertPayload]);
            if (!result.error) return { ok: true };
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
        if (closeResult.error) throw closeResult.error;
        
        if (winnerId) {
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
                var invResult = await supabaseClient
                    .from(CONFIG.tables.student_inventory)
                    .insert([{
                        student_id: candidate,
                        item_name: auction.item_name || 'Auction Prize',
                        item_source: 'auction',
                        source_id: auctionId,
                        status: 'unused'
                    }]);
                if (!invResult.error) {
                    inventoryErr = null;
                    break;
                }
                inventoryErr = invResult.error;
            }
            if (inventoryErr) {
                logStructuredError('AUCTION_INVENTORY_INSERT_ERROR', inventoryErr);
            }
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
                status: 'unused'
            }]);
        if (invErr) {
            // Compensation: refund coins and release reserved stock.
            await updateStudentCoins(profile.id, coins);
            await supabaseClient.from(CONFIG.tables.auctions).update({ stock_quantity: stock }).eq('id', auctionId).eq('stock_quantity', stock - 1);
            throw invErr;
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

async function createBillingClaim(inventoryId, studentId, studentName, groupCode, itemName) {
    try {
        const { error: invErr } = await supabaseClient
            .from(CONFIG.tables.student_inventory)
            .update({ status: 'activated' })
            .eq('id', inventoryId);
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
        if (claimErr) throw claimErr;
        
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

async function getPendingBillingClaims() {
    try {
        const { data, error } = await supabaseClient
            .from(CONFIG.tables.billing_claims)
            .select('*')
            .eq('status', 'pending')
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
        const { error: claimErr } = await supabaseClient
            .from(CONFIG.tables.billing_claims)
            .update({ status: 'delivered' })
            .eq('id', claimId);
        if (claimErr) throw claimErr;
        
        if (inventoryId) {
            const { error: invErr } = await supabaseClient
                .from(CONFIG.tables.student_inventory)
                .update({ status: 'delivered' })
                .eq('id', inventoryId);
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

        let retryCharged = 0;
        if (attempts.length === 1) {
            if (attempts[0].is_correct !== false) return { ok: false, error: 'Challenge already submitted' };
            const retryPay = await debitCoinsByDocumentoId(documentoId, 5);
            if (!retryPay.ok) return { ok: false, error: retryPay.error || 'Could not process retry payment' };
            retryCharged = 5;
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
                    return { ok: false, error: 'Challenge already reached max winners (10)' };
                }
            } else if (!slotClaim.ok) {
                return { ok: false, error: slotClaim.full ? 'Challenge already reached max winners (10)' : (slotClaim.error || 'Could not reserve winner slot') };
            } else {
                position = slotClaim.rank;
            }
        }

        let coinsAwarded = 0;
        if (isCorrect) {
            if (position <= 3) coinsAwarded = 20;
            else if (position <= 6) coinsAwarded = 10;
            else if (position <= 10) coinsAwarded = 5;
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
        if (subErr) throw subErr;
        
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

// ========== INIT (NO AUTO-REDIRECT) ==========
if (typeof document !== 'undefined' && document.getElementById('regGroup')) {
    loadGroups();
}
