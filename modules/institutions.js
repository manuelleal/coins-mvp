(function() {
  var state = {
    user: null,
    schools: [],
    selectedSchoolId: null,
    initialized: false,
    aiPinFailures: 0,
    aiKeys: { openai: '', anthropic: '', google: '' }
  };
  var PROFILE_SELECT = 'id,nombre_completo,documento_id,pin,rol,grupo,monedas,is_active,account_locked,institution_id,last_login_at,teacher_credits,force_password_reset';

  function esc(v) {
    return window.UI && UI.escapeHtml ? UI.escapeHtml(v) : String(v == null ? '' : v);
  }

  function toggleKeyVisibility(provider) {
    var id = provider === 'openai' ? 'apiKeyOpenai' : (provider === 'anthropic' ? 'apiKeyAnthropic' : 'apiKeyGoogle');
    var input = document.getElementById(id);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  function apiKeyInputId(provider) {
    return provider === 'openai' ? 'apiKeyOpenai' : (provider === 'anthropic' ? 'apiKeyAnthropic' : 'apiKeyGoogle');
  }

  function testProviderKey(provider) {
    var id = apiKeyInputId(provider);
    var statusId = provider === 'openai' ? 'testOpenaiStatus' : (provider === 'anthropic' ? 'testAnthropicStatus' : 'testGoogleStatus');
    var el = document.getElementById(statusId);
    var rawInput = String((document.getElementById(id) || {}).value || '').trim();
    var current = String(state.aiKeys[provider] || '').trim();
    var value = rawInput && rawInput !== maskApiKey(current) ? rawInput : current;
    if (!el) return;
    if (!value) { el.innerHTML = '<span class="text-danger">❌ Invalid (empty key)</span>'; return; }
    if (provider === 'openai') el.innerHTML = value.indexOf('sk-') === 0 ? '<span class="text-success">✅ Valid format</span>' : '<span class="text-danger">❌ Invalid format</span>';
    if (provider === 'anthropic') el.innerHTML = value.indexOf('sk-ant-') === 0 ? '<span class="text-success">✅ Valid format</span>' : '<span class="text-danger">❌ Invalid format</span>';
    if (provider === 'google') el.innerHTML = value.indexOf('AIza') === 0 ? '<span class="text-success">✅ Valid format</span>' : '<span class="text-danger">❌ Invalid format</span>';
  }

  async function revealApiKey(provider) {
    var ok = await requestAiConfigAccess();
    if (!ok) return;
    var id = apiKeyInputId(provider);
    var input = document.getElementById(id);
    if (!input) return;
    input.value = String(state.aiKeys[provider] || '');
    input.type = 'text';
  }

  async function copyApiKey(provider) {
    var value = String(state.aiKeys[provider] || '');
    if (!value) return toast('No key configured', 'warning');
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        var ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast('API key copied', 'success');
    } catch (_) {
      toast('Copy failed', 'danger');
    }
  }

  function maskApiKey(raw) {
    var v = String(raw || '');
    if (!v) return '';
    var tail = v.slice(-4);
    var head = v.slice(0, Math.min(12, v.length));
    return head + '-••••••••••••••••••••[' + tail + ']';
  }

  async function logAudit(action, targetType, targetId, metadata) {
    var payloadNew = {
      user_id: state.user && state.user.id ? state.user.id : null,
      user_name: state.user && state.user.nombre_completo ? state.user.nombre_completo : null,
      action: action,
      target_type: targetType || null,
      target_id: targetId == null ? null : String(targetId),
      metadata: metadata || {},
      ip_address: 'client-ip-unknown'
    };
    var payloadLegacy = {
      user_id: state.user && state.user.id ? state.user.id : null,
      institution_id: (metadata && metadata.institution_id) || (state.user && state.user.institution_id) || null,
      action_type: action,
      result: 'SUCCESS',
      metadata: Object.assign({}, metadata || {}, { target_type: targetType || null, target_id: targetId == null ? null : String(targetId) }),
      ip_address: 'client-ip-unknown'
    };
    var ins = await supabaseClient.from('audit_logs').insert([payloadNew]);
    if (ins.error) {
      try { await supabaseClient.from('audit_logs').insert([payloadLegacy]); } catch (_) {}
    }
  }

  function ensureAiPinModal() {
    if (document.getElementById('aiConfigPinModal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal fade" id="aiConfigPinModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">🔐 AI Config requires authorization</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><input id="aiConfigPinInput" type="password" class="form-control" placeholder="Enter your admin PIN"><div id="aiConfigPinStatus" class="small mt-2 text-danger"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="btnVerifyAiConfigPin">Verify</button></div></div></div></div>';
    document.body.appendChild(wrap.firstChild);
  }

  function askPinModal() {
    ensureAiPinModal();
    var input = document.getElementById('aiConfigPinInput');
    var status = document.getElementById('aiConfigPinStatus');
    if (input) input.value = '';
    if (status) status.textContent = '';
    return new Promise(function(resolve) {
      var done = false;
      function settle(v) {
        if (done) return;
        done = true;
        var modalEl = document.getElementById('aiConfigPinModal');
        if (modalEl) modalEl.removeEventListener('hidden.bs.modal', onHide);
        resolve(v);
      }
      function onHide() { settle(null); }
      var modalEl = document.getElementById('aiConfigPinModal');
      if (modalEl) modalEl.addEventListener('hidden.bs.modal', onHide, { once: true });
      var btn = document.getElementById('btnVerifyAiConfigPin');
      if (btn) btn.onclick = function() {
        settle(String((document.getElementById('aiConfigPinInput') || {}).value || '').trim());
        if (window.UI && UI.hideModal) UI.hideModal('aiConfigPinModal');
      };
      if (window.UI && UI.showModal) UI.showModal('aiConfigPinModal');
    });
  }

  async function isPinValid(pinValue) {
    if (!state.user || !state.user.id || !pinValue) return false;
    var row = await supabaseClient.from(CONFIG.tables.profiles).select('id,pin').eq('id', state.user.id).single();
    if (row.error || !row.data) return false;
    return String(row.data.pin || '') === String(pinValue || '');
  }

  async function requestAiConfigAccess() {
    var pin = await askPinModal();
    if (pin == null) return false;
    var ok = await isPinValid(pin);
    if (!ok) {
      state.aiPinFailures = Number(state.aiPinFailures || 0) + 1;
      toast('Invalid PIN. Access denied.', 'danger');
      if (state.aiPinFailures >= 3) {
        toast('3 invalid attempts. Logging out...', 'warning');
        if (typeof window.logout === 'function') window.logout();
      }
      return false;
    }
    state.aiPinFailures = 0;
    await logAudit('ACCESS_AI_CONFIG', 'view', 'ai_config', { status: 'granted' });
    return true;
  }

  function normalizeSchoolRow(row) {
    var out = Object.assign({}, row || {});
    out.nombre = out.nombre || out.name || '';
    out.plan = out.plan || out.subscription_plan || 'BASIC';
    if (out.ai_used_credits == null) out.ai_used_credits = out.ai_credits_used == null ? 0 : out.ai_credits_used;
    out.ai_used_credits = Number(out.ai_used_credits || 0);
    out.ai_credit_pool = Number(out.ai_credit_pool || 0);
    out.coin_pool = Number(out.coin_pool || 0);
    return out;
  }

  async function updateCoinPool(id, mode, inputId) {
    var school = getSchoolById(id);
    var input = document.getElementById(inputId);
    if (!school || !input) return;
    var amount = Math.max(0, Number(input.value || 0));
    if (!amount) return toast('Enter amount', 'warning');
    var pool = Number(school.coin_pool || 0);
    var next = mode === 'add' ? (pool + amount) : Math.max(0, pool - amount);
    var r = await supabaseClient.from(CONFIG.tables.institutions).update({ coin_pool: next }).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    await loadEconomy();
  }

  async function updateAiPool(id, mode, inputId) {
    var school = getSchoolById(id);
    if (!school) return;
    var payload = {};
    if (mode === 'reset') {
      payload.ai_used_credits = 0;
    } else {
      var input = document.getElementById(inputId);
      if (!input) return;
      var amount = Math.max(0, Number(input.value || 0));
      if (!amount) return toast('Enter amount', 'warning');
      var pool = Number(school.ai_credit_pool || 0);
      payload.ai_credit_pool = mode === 'add' ? pool + amount : Math.max(0, pool - amount);
      try {
        await supabaseClient.from('institution_credit_history').insert([{ institution_id: id, operation: mode, amount: amount, previous_pool: pool, new_pool: payload.ai_credit_pool, performed_by: state.user && state.user.id ? state.user.id : null }]);
      } catch (_) {}
    }
    var r = await supabaseClient.from(CONFIG.tables.institutions).update(payload).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    await logAudit(mode === 'reset' ? 'RESET_CREDITS' : (mode === 'add' ? 'ADD_CREDITS' : 'REMOVE_CREDITS'), 'institution', id, payload);
    await loadEconomy();
    await loadList();
  }

  async function loadCreditHistory(schoolId) {
    var r = await supabaseClient.from('institution_credit_history').select('operation,amount,created_at').eq('institution_id', schoolId).order('created_at', { ascending: false }).limit(5);
    return r.error ? [] : (r.data || []);
  }

  async function loadEconomy() {
    var coin = document.getElementById('economyCoinTable');
    var ai = document.getElementById('economyAiTable');
    if (!coin || !ai) return;
    state.schools = await loadSchoolsResilient();

    var coinRows = '';
    for (var i = 0; i < state.schools.length; i += 1) {
      var s = state.schools[i];
      var circulation = await sumCoins(s.id);
      var pool = Number(s.coin_pool || 0);
      var available = Math.max(0, pool - circulation);
      var usedPct = pool > 0 ? Math.min(100, Math.round((circulation / pool) * 100)) : 0;
      coinRows += '<tr><td>' + esc(s.nombre || '-') + '</td><td>' + esc(s.plan || '-') + '</td><td>' + pool + '</td><td><span title="Sum of all student coin balances in this school">' + circulation + '</span><div class="progress mt-1" style="height:7px;"><div class="progress-bar bg-info" style="width:' + usedPct + '%"></div></div><div class="small text-muted">' + usedPct + '% used</div></td><td>' + available + '</td><td><div class="d-flex gap-1"><input id="coin_' + esc(s.id) + '" type="number" class="form-control form-control-sm" style="max-width:90px;"><button class="btn btn-sm btn-success" onclick="InstitutionsModule.coinAdd(\'' + esc(s.id) + '\',\'coin_' + esc(s.id) + '\')">Add</button><button class="btn btn-sm btn-danger" onclick="InstitutionsModule.coinRemove(\'' + esc(s.id) + '\',\'coin_' + esc(s.id) + '\')">Remove</button></div></td></tr>';
    }
    coin.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>School</th><th>Plan</th><th>Coin Pool</th><th>In Circulation</th><th>Available</th><th>Action</th></tr></thead><tbody>' + coinRows + '</tbody></table></div>';

    var aiRows = '';
    for (var j = 0; j < state.schools.length; j += 1) {
      var z = state.schools[j];
      var poolAi = Number(z.ai_credit_pool || 0);
      var usedAi = Number(z.ai_used_credits || 0);
      var availAi = Math.max(0, poolAi - usedAi);
      var pct = poolAi > 0 ? Math.round((usedAi / poolAi) * 100) : 0;
      var cls = pct > 80 ? 'bg-danger' : (pct >= 60 ? 'bg-warning' : 'bg-success');
      var badge = pct > 80 ? '<span class="badge text-bg-danger">High</span>' : (pct >= 60 ? '<span class="badge text-bg-warning">Medium</span>' : '<span class="badge text-bg-success">Low</span>');
      var hist = await loadCreditHistory(z.id);
      aiRows += '<tr><td>' + esc(z.nombre || '-') + '</td><td>' + poolAi + '</td><td>' + usedAi + '</td><td>' + availAi + '</td><td style="min-width:140px;"><div class="progress" style="height:7px;"><div class="progress-bar ' + cls + '" style="width:' + pct + '%"></div></div><div class="small">' + pct + '% ' + badge + '</div></td><td><div class="d-flex gap-1 flex-wrap"><input id="aic_' + esc(z.id) + '" type="number" class="form-control form-control-sm" style="max-width:90px;"><button class="btn btn-sm btn-success" onclick="InstitutionsModule.aiAdd(\'' + esc(z.id) + '\',\'aic_' + esc(z.id) + '\')">Add</button><button class="btn btn-sm btn-danger" onclick="InstitutionsModule.aiRemove(\'' + esc(z.id) + '\',\'aic_' + esc(z.id) + '\')">Remove</button><button class="btn btn-sm btn-outline-secondary" onclick="InstitutionsModule.aiReset(\'' + esc(z.id) + '\')">Reset Used</button></div><details class="mt-1"><summary class="small">History</summary>' + (hist.length ? hist.map(function(h) { return '<div class="small">' + esc(String(h.operation || '').toUpperCase()) + ' ' + Number(h.amount || 0) + ' <span class="text-muted">' + esc(h.created_at || '') + '</span></div>'; }).join('') : '<div class="small text-muted">No records</div>') + '</details></td></tr>';
    }
    ai.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>School</th><th>Pool</th><th>Used</th><th>Available</th><th>%</th><th>Action</th></tr></thead><tbody>' + aiRows + '</tbody></table></div>';
  }

  function parseMaybeJson(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(String(raw)); } catch (_) { return fallback; }
  }

  async function getSystemConfig(keyName, fallback) {
    var r = await supabaseClient.from(CONFIG.tables.system_configs).select('key_value').eq('key_name', keyName).maybeSingle();
    if (r.error || !r.data) return fallback;
    return parseMaybeJson(r.data.key_value, r.data.key_value || fallback);
  }

  async function setSystemConfig(keyName, value, provider) {
    var keyValue = typeof value === 'string' ? value : JSON.stringify(value);
    var payload = [{ key_name: keyName, key_value: keyValue, provider: provider || null, updated_at: new Date().toISOString() }];
    var r = await supabaseClient.from(CONFIG.tables.system_configs).upsert(payload, { onConflict: 'key_name' });
    if (r.error) throw r.error;
  }

  function buildModelRow(slot, label, usedIn, providers, modelsByProvider, cost, keys) {
    var row = document.createElement('div');
    row.className = 'glass-panel mb-3';
    row.style.padding = '1rem';
    row.innerHTML = '<div class="d-flex justify-content-between flex-wrap gap-2"><div><h6 class="mb-1">' + label + '</h6><div class="small text-muted">Used in: ' + esc(usedIn) + '</div><div class="small text-muted">Cost per challenge: ' + Number(cost) + ' credit(s)</div></div><span id="keyWarning_' + slot + '" class="small"></span></div>' +
      '<div class="row g-2 mt-1"><div class="col-md-4"><label class="form-label small">Provider</label><select id="modelProvider_' + slot + '" class="form-select">' + providers.map(function(p) { return '<option value="' + p + '">' + p + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-md-5"><label class="form-label small">Model</label><select id="modelName_' + slot + '" class="form-select"></select></div>' +
      '<div class="col-md-3"><label class="form-label small">Cost credits</label><input id="modelCost_' + slot + '" class="form-control" type="number" value="' + cost + '" readonly></div></div>';
    var pEl = row.querySelector('#modelProvider_' + slot);
    var mEl = row.querySelector('#modelName_' + slot);
    function fillModels(provider) {
      var list = modelsByProvider[provider] || [];
      mEl.innerHTML = list.map(function(m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
    }
    function updateKeyWarning() {
      var provider = pEl.value;
      var key = String((keys && keys[provider]) || '').trim();
      var warn = row.querySelector('#keyWarning_' + slot);
      if (!warn) return;
      warn.innerHTML = key ? '<span class="badge text-bg-success">API key configured</span>' : '<span class="badge text-bg-warning">No API key for ' + esc(provider) + ' - configure above</span>';
    }
    pEl.addEventListener('change', function() { fillModels(pEl.value); updateKeyWarning(); });
    fillModels(pEl.value);
    updateKeyWarning();
    return row;
  }

  async function loadAiConfig() {
    var models = await getSystemConfig('ai_models', {
      daily: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', cost_credits: 1 },
      exam: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', cost_credits: 3 },
      esp: { provider: 'openai', model: 'gpt-4o', cost_credits: 5 }
    });
    var limits = await getSystemConfig('daily_limits', {
      challenges_daily: 10,
      challenges_exam: 5,
      challenges_esp: 5,
      coins_per_day_challenges: 50,
      coins_per_day_attendance: 10
    });
    var keys = await getSystemConfig('api_keys', { openai: '', anthropic: '', google: '' });
    state.aiKeys = {
      openai: String(keys.openai || ''),
      anthropic: String(keys.anthropic || ''),
      google: String(keys.google || '')
    };

    var view = document.getElementById('viewAiConfig');
    if (view) {
      view.innerHTML = '<h5 class="mb-2 section-title">AI Config</h5>' +
        '<div class="glass-panel mb-3" style="padding:1rem;"><h6 class="mb-1">Provider Credentials</h6><div class="small text-muted mb-2">Enter the API key for each AI provider you want to use. Leave empty to disable.</div>' +
        '<div class="row g-2"><div class="col-md-4"><label class="form-label small">OpenAI API Key</label><div class="input-group"><input id="apiKeyOpenai" type="text" class="form-control" placeholder="sk-..."><button class="btn btn-outline-secondary" id="btnRevealOpenai" type="button">Reveal</button><button class="btn btn-outline-secondary" id="btnCopyOpenai" type="button">Copy</button><button class="btn btn-outline-primary" id="btnTestOpenai" type="button">Test</button></div><div class="small mt-1" id="testOpenaiStatus"></div></div>' +
        '<div class="col-md-4"><label class="form-label small">Anthropic API Key</label><div class="input-group"><input id="apiKeyAnthropic" type="text" class="form-control" placeholder="sk-ant-..."><button class="btn btn-outline-secondary" id="btnRevealAnthropic" type="button">Reveal</button><button class="btn btn-outline-secondary" id="btnCopyAnthropic" type="button">Copy</button><button class="btn btn-outline-primary" id="btnTestAnthropic" type="button">Test</button></div><div class="small mt-1" id="testAnthropicStatus"></div></div>' +
        '<div class="col-md-4"><label class="form-label small">Google API Key</label><div class="input-group"><input id="apiKeyGoogle" type="text" class="form-control" placeholder="AIza..."><button class="btn btn-outline-secondary" id="btnRevealGoogle" type="button">Reveal</button><button class="btn btn-outline-secondary" id="btnCopyGoogle" type="button">Copy</button><button class="btn btn-outline-primary" id="btnTestGoogle" type="button">Test</button></div><div class="small mt-1" id="testGoogleStatus"></div></div></div>' +
        '<button class="btn btn-primary btn-sm mt-2" id="btnSaveApiKeys">Save Keys</button></div>' +
        '<div class="mb-2"><h6 class="mb-1">Which AI runs each learning module</h6><div class="small text-muted">Students consume credits from their school\'s pool when using these modules.</div></div>' +
        '<div id="aiModelsForm"></div>' +
        '<button class="btn btn-primary btn-sm mb-3" id="btnSaveAiModels">Save Models</button>' +
        '<div class="glass-panel" style="padding:1rem;"><h6 class="mb-1">Daily Usage Limits per Student</h6><div class="small text-muted mb-2">Prevents credit inflation. Resets every day at midnight.</div><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Module</th><th>Max challenges/day</th><th>Max coins/day</th></tr></thead><tbody>' +
        '<tr><td>Daily Practice</td><td><input id="limitDaily" type="number" class="form-control"></td><td><input id="limitCoinsChallenges" type="number" class="form-control"></td></tr>' +
        '<tr><td>Exam Prep</td><td><input id="limitExam" type="number" class="form-control"></td><td><input id="limitCoinsExam" type="number" class="form-control" value="30"></td></tr>' +
        '<tr><td>ESP</td><td><input id="limitEsp" type="number" class="form-control"></td><td><input id="limitCoinsEsp" type="number" class="form-control" value="30"></td></tr>' +
        '<tr><td>Attendance</td><td><input id="limitAttendance" type="number" class="form-control" value="1"></td><td><input id="limitCoinsAttendance" type="number" class="form-control"></td></tr>' +
        '</tbody></table></div><button class="btn btn-primary btn-sm mt-2" id="btnSaveDailyLimits">Save Limits</button></div>';
    }
    document.getElementById('apiKeyOpenai').value = maskApiKey(state.aiKeys.openai);
    document.getElementById('apiKeyAnthropic').value = maskApiKey(state.aiKeys.anthropic);
    document.getElementById('apiKeyGoogle').value = maskApiKey(state.aiKeys.google);
    document.getElementById('limitDaily').value = Number(limits.challenges_daily || 10);
    document.getElementById('limitExam').value = Number(limits.challenges_exam || 5);
    document.getElementById('limitEsp').value = Number(limits.challenges_esp || 5);
    document.getElementById('limitCoinsChallenges').value = Number(limits.coins_per_day_challenges || 50);
    document.getElementById('limitCoinsAttendance').value = Number(limits.coins_per_day_attendance || 10);
    var limExamCoins = document.getElementById('limitCoinsExam'); if (limExamCoins) limExamCoins.value = Number(limits.coins_per_day_exam || 30);
    var limEspCoins = document.getElementById('limitCoinsEsp'); if (limEspCoins) limEspCoins.value = Number(limits.coins_per_day_esp || 30);
    var limAttendance = document.getElementById('limitAttendance'); if (limAttendance) limAttendance.value = Number(limits.attendance_daily || 1);

    var providerModels = {
      anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514', 'claude-opus-4-6'],
      openai: ['gpt-4o-mini', 'gpt-4o'],
      google: ['gemini-flash', 'gemini-pro', 'gemini-ultra']
    };
    var providers = ['anthropic', 'openai', 'google'];
    var form = document.getElementById('aiModelsForm');
    form.innerHTML = '';
    form.appendChild(buildModelRow('daily', 'Daily Practice', 'Reading, Listening, Writing', providers, providerModels, 1, keys));
    form.appendChild(buildModelRow('exam', 'Exam Preparation', 'IELTS, TOEFL, Cambridge prep', providers, providerModels, 3, keys));
    form.appendChild(buildModelRow('esp', 'ESP / International English', 'Business, Academic, Technical', providers, providerModels, 5, keys));

    ['daily', 'exam', 'esp'].forEach(function(slot) {
      var slotCfg = models[slot] || {};
      var p = document.getElementById('modelProvider_' + slot);
      var m = document.getElementById('modelName_' + slot);
      if (p && slotCfg.provider) p.value = slotCfg.provider;
      if (p) p.dispatchEvent(new Event('change'));
      if (m && slotCfg.model) m.value = slotCfg.model;
    });

    var btnApi = document.getElementById('btnSaveApiKeys');
    if (btnApi) btnApi.onclick = function() { saveApiKeys().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnModels = document.getElementById('btnSaveAiModels');
    if (btnModels) btnModels.onclick = function() { saveAiModels().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnLimits = document.getElementById('btnSaveDailyLimits');
    if (btnLimits) btnLimits.onclick = function() { saveDailyLimits().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnRevealOpenai = document.getElementById('btnRevealOpenai'); if (btnRevealOpenai) btnRevealOpenai.onclick = function() { revealApiKey('openai'); };
    var btnRevealAnthropic = document.getElementById('btnRevealAnthropic'); if (btnRevealAnthropic) btnRevealAnthropic.onclick = function() { revealApiKey('anthropic'); };
    var btnRevealGoogle = document.getElementById('btnRevealGoogle'); if (btnRevealGoogle) btnRevealGoogle.onclick = function() { revealApiKey('google'); };
    var btnCopyOpenai = document.getElementById('btnCopyOpenai'); if (btnCopyOpenai) btnCopyOpenai.onclick = function() { copyApiKey('openai'); };
    var btnCopyAnthropic = document.getElementById('btnCopyAnthropic'); if (btnCopyAnthropic) btnCopyAnthropic.onclick = function() { copyApiKey('anthropic'); };
    var btnCopyGoogle = document.getElementById('btnCopyGoogle'); if (btnCopyGoogle) btnCopyGoogle.onclick = function() { copyApiKey('google'); };
    var btnTestOpenai = document.getElementById('btnTestOpenai'); if (btnTestOpenai) btnTestOpenai.onclick = function() { testProviderKey('openai'); };
    var btnTestAnthropic = document.getElementById('btnTestAnthropic'); if (btnTestAnthropic) btnTestAnthropic.onclick = function() { testProviderKey('anthropic'); };
    var btnTestGoogle = document.getElementById('btnTestGoogle'); if (btnTestGoogle) btnTestGoogle.onclick = function() { testProviderKey('google'); };
  }

  async function saveApiKeys() {
    function normalizeProviderKey(provider, inputId) {
      var current = String(state.aiKeys[provider] || '');
      var raw = String((document.getElementById(inputId) || {}).value || '').trim();
      if (!raw) return '';
      if (raw === maskApiKey(current)) return current;
      return raw;
    }
    await setSystemConfig('api_keys', {
      openai: normalizeProviderKey('openai', 'apiKeyOpenai'),
      anthropic: normalizeProviderKey('anthropic', 'apiKeyAnthropic'),
      google: normalizeProviderKey('google', 'apiKeyGoogle')
    });
    await logAudit('SAVE_API_KEYS', 'system_config', 'api_keys', {});
    toast('API keys saved', 'success');
    loadAiConfig();
  }

  async function saveAiModels() {
    await setSystemConfig('ai_models', {
      daily: { provider: document.getElementById('modelProvider_daily').value, model: document.getElementById('modelName_daily').value, cost_credits: 1 },
      exam: { provider: document.getElementById('modelProvider_exam').value, model: document.getElementById('modelName_exam').value, cost_credits: 3 },
      esp: { provider: document.getElementById('modelProvider_esp').value, model: document.getElementById('modelName_esp').value, cost_credits: 5 }
    });
    await logAudit('SAVE_AI_CONFIG', 'system_config', 'ai_models', {});
    toast('AI models saved', 'success');
  }

  async function loadPolicies() {
    var dataPolicies = await getSystemConfig('data_policies', {
      attendance_retention_days: 365,
      challenge_retention_days: 365,
      feedback_retention_days: 90,
      audit_retention_days: 180,
      coin_transaction_retention_days: 730
    });
    var privacy = await getSystemConfig('privacy_settings', {
      students_see_own_history: true,
      students_see_leaderboard: true,
      students_see_others_coins: false,
      teachers_see_login_timestamps: true,
      teachers_can_export_personal_data: false,
      admins_can_export_attendance: true,
      system_sends_daily_digest: true
    });

    var setNum = function(id, val) { var el = document.getElementById(id); if (el) el.value = Number(val || 0); };
    var setBool = function(id, val) { var el = document.getElementById(id); if (el) el.checked = !!val; };
    setNum('policyAttendanceDays', dataPolicies.attendance_retention_days);
    setNum('policyChallengeDays', dataPolicies.challenge_retention_days);
    setNum('policyFeedbackDays', dataPolicies.feedback_retention_days);
    setNum('policyAuditDays', dataPolicies.audit_retention_days);
    setNum('policyCoinDays', dataPolicies.coin_transaction_retention_days);
    setBool('privacyOwnHistory', privacy.students_see_own_history);
    setBool('privacyLeaderboard', privacy.students_see_leaderboard);
    setBool('privacyOthersCoins', privacy.students_see_others_coins);
    setBool('privacyTeacherLogin', privacy.teachers_see_login_timestamps);
    setBool('privacyTeacherExport', privacy.teachers_can_export_personal_data);
    setBool('privacyAdminAttendance', privacy.admins_can_export_attendance);
    setBool('privacyDailyDigest', privacy.system_sends_daily_digest);

    var btnSaveData = document.getElementById('btnSaveDataPolicies');
    if (btnSaveData) btnSaveData.onclick = saveDataPolicies;
    var btnSavePrivacy = document.getElementById('btnSavePrivacyPolicies');
    if (btnSavePrivacy) btnSavePrivacy.onclick = savePrivacySettings;
    var btnRefresh = document.getElementById('btnRefreshAuditLog');
    if (btnRefresh) btnRefresh.onclick = loadAuditLog;
    var btnAuditCsv = document.getElementById('btnExportAuditCsv');
    if (btnAuditCsv) btnAuditCsv.onclick = exportAuditCsv;
    var btnAllStudents = document.getElementById('btnExportAllStudents');
    if (btnAllStudents) btnAllStudents.onclick = function() { exportAllData('students'); };
    var btnAllTx = document.getElementById('btnExportAllTransactions');
    if (btnAllTx) btnAllTx.onclick = function() { exportAllData('transactions'); };
    var btnAllAtt = document.getElementById('btnExportAllAttendance');
    if (btnAllAtt) btnAllAtt.onclick = function() { exportAllData('attendance'); };
    var btnAllAudit = document.getElementById('btnExportAllAudit');
    if (btnAllAudit) btnAllAudit.onclick = function() { exportAllData('audit'); };

    await loadAuditLog();
  }

  async function saveDataPolicies() {
    var payload = {
      attendance_retention_days: Number((document.getElementById('policyAttendanceDays') || {}).value || 365),
      challenge_retention_days: Number((document.getElementById('policyChallengeDays') || {}).value || 365),
      feedback_retention_days: Number((document.getElementById('policyFeedbackDays') || {}).value || 90),
      audit_retention_days: Number((document.getElementById('policyAuditDays') || {}).value || 180),
      coin_transaction_retention_days: Number((document.getElementById('policyCoinDays') || {}).value || 730)
    };
    await setSystemConfig('data_policies', payload);
    await logAudit('SAVE_DATA_POLICIES', 'system_config', 'data_policies', payload);
    toast('Data policies saved', 'success');
  }

  async function savePrivacySettings() {
    var payload = {
      students_see_own_history: !!(document.getElementById('privacyOwnHistory') || {}).checked,
      students_see_leaderboard: !!(document.getElementById('privacyLeaderboard') || {}).checked,
      students_see_others_coins: !!(document.getElementById('privacyOthersCoins') || {}).checked,
      teachers_see_login_timestamps: !!(document.getElementById('privacyTeacherLogin') || {}).checked,
      teachers_can_export_personal_data: !!(document.getElementById('privacyTeacherExport') || {}).checked,
      admins_can_export_attendance: !!(document.getElementById('privacyAdminAttendance') || {}).checked,
      system_sends_daily_digest: !!(document.getElementById('privacyDailyDigest') || {}).checked
    };
    await setSystemConfig('privacy_settings', payload);
    await logAudit('SAVE_PRIVACY_SETTINGS', 'system_config', 'privacy_settings', payload);
    toast('Privacy settings saved', 'success');
  }

  async function loadAuditLog() {
    var host = document.getElementById('policiesAuditTable');
    if (!host) return;
    var q = supabaseClient.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
    var u = String((document.getElementById('auditUserFilter') || {}).value || '').trim();
    var a = String((document.getElementById('auditActionFilter') || {}).value || '').trim();
    var d = String((document.getElementById('auditDateFilter') || {}).value || '').trim();
    var res = await q;
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    var rows = (res.data || []).filter(function(r) {
      var userVal = String(r.user_name || r.user_id || '').toLowerCase();
      var actionVal = String(r.action || r.action_type || '').toLowerCase();
      var dateVal = String(r.created_at || '');
      if (u && userVal.indexOf(u.toLowerCase()) === -1) return false;
      if (a && actionVal.indexOf(a.toLowerCase()) === -1) return false;
      if (d && dateVal.slice(0, 10) !== d) return false;
      return true;
    }).slice(0, 50);
    host.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Date</th><th>User</th><th>Action</th><th>Target</th><th>IP</th></tr></thead><tbody>' + rows.map(function(r) {
      var target = (r.target_type || (r.metadata && r.metadata.target_type) || '-') + ' ' + (r.target_id || (r.metadata && r.metadata.target_id) || r.institution_id || '');
      return '<tr><td>' + esc(r.created_at || '-') + '</td><td>' + esc(r.user_name || r.user_id || '-') + '</td><td>' + esc(r.action || r.action_type || '-') + '</td><td>' + esc(target) + '</td><td>' + esc(r.ip_address || '-') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function exportAuditCsv() {
    await loadAuditLog();
    var rows = document.querySelectorAll('#policiesAuditTable tbody tr');
    var lines = ['date,user,action,target,ip'];
    rows.forEach(function(r) {
      var t = r.querySelectorAll('td');
      lines.push('"' + String((t[0] && t[0].textContent) || '').replace(/"/g, '""') + '","' + String((t[1] && t[1].textContent) || '').replace(/"/g, '""') + '","' + String((t[2] && t[2].textContent) || '').replace(/"/g, '""') + '","' + String((t[3] && t[3].textContent) || '').replace(/"/g, '""') + '","' + String((t[4] && t[4].textContent) || '').replace(/"/g, '""') + '"');
    });
    var b = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(b);
    link.download = 'audit_log.csv';
    link.click();
    await logAudit('EXPORT_DATA', 'audit_logs', 'csv', { source: 'policies_audit' });
  }

  async function exportAllData(kind) {
    var map = {
      students: { table: CONFIG.tables.profiles, select: 'id,nombre_completo,documento_id,rol,grupo,monedas,institution_id,last_login_at', file: 'all_students.csv', filter: function(q) { return q.eq('rol', 'student'); } },
      transactions: { table: 'student_coin_transactions', select: '*', file: 'all_transactions.csv', filter: function(q) { return q; } },
      attendance: { table: CONFIG.tables.attendance, select: '*', file: 'all_attendance.csv', filter: function(q) { return q; } },
      audit: { table: 'audit_logs', select: '*', file: 'all_audit_log.csv', filter: function(q) { return q; } }
    };
    var cfg = map[kind];
    if (!cfg) return;
    var q = supabaseClient.from(cfg.table).select(cfg.select).limit(2000);
    q = cfg.filter(q);
    var res = await q;
    if (res.error) return toast(res.error.message, 'danger');
    var rows = res.data || [];
    if (!rows.length) return toast('No data to export', 'warning');
    var headers = Object.keys(rows[0]);
    var lines = [headers.join(',')].concat(rows.map(function(r) {
      return headers.map(function(h) { return '"' + String(r[h] == null ? '' : r[h]).replace(/"/g, '""') + '"'; }).join(',');
    }));
    var b = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(b);
    link.download = cfg.file;
    link.click();
    await logAudit('EXPORT_DATA', cfg.table, kind, { count: rows.length });
  }

  async function saveDailyLimits() {
    await setSystemConfig('daily_limits', {
      challenges_daily: Number(document.getElementById('limitDaily').value || 10),
      challenges_exam: Number(document.getElementById('limitExam').value || 5),
      challenges_esp: Number(document.getElementById('limitEsp').value || 5),
      attendance_daily: Number((document.getElementById('limitAttendance') || {}).value || 1),
      coins_per_day_challenges: Number(document.getElementById('limitCoinsChallenges').value || 50),
      coins_per_day_exam: Number((document.getElementById('limitCoinsExam') || {}).value || 30),
      coins_per_day_esp: Number((document.getElementById('limitCoinsEsp') || {}).value || 30),
      coins_per_day_attendance: Number(document.getElementById('limitCoinsAttendance').value || 10)
    });
    await logAudit('SAVE_AI_CONFIG', 'system_config', 'daily_limits', {});
    toast('Daily limits saved', 'success');
  }

  function toast(msg, type) {
    if (window.UI && UI.showToast) UI.showToast(msg, type || 'info');
  }

  async function loadSchoolsResilient() {
    var attempts = [
      { select: 'id,name,subscription_plan,active_ai_provider,ai_credit_pool,ai_used_credits,ai_credits_used,coin_pool,is_suspended,api_key', order: 'name' },
      { select: 'id,name,subscription_plan,active_ai_provider,ai_credit_pool,ai_used_credits,coin_pool,is_suspended,api_key', order: 'name' },
      { select: 'id,name,subscription_plan,active_ai_provider,ai_credit_pool,coin_pool,is_suspended,api_key', order: 'name' },
      { select: 'id,name,subscription_plan,active_ai_provider', order: 'name' },
      { select: 'id,name,subscription_plan', order: 'name' },
      { select: 'id,nombre,plan,active_ai_provider,ai_credit_pool,ai_used_credits,coin_pool,is_suspended,api_key', order: 'nombre' },
      { select: 'id,nombre,plan,active_ai_provider', order: 'nombre' },
      { select: 'id,nombre,plan', order: 'nombre' }
    ];
    for (var i = 0; i < attempts.length; i += 1) {
      var attempt = attempts[i];
      var res = await supabaseClient.from(CONFIG.tables.institutions).select(attempt.select).order(attempt.order);
      if (!res.error) return (res.data || []).map(normalizeSchoolRow);
    }
    return [];
  }

  async function countProfiles(role, schoolId) {
    var q = supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('is_active', true);
    if (role) q = q.eq('rol', role);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var r = await q;
    return r.error ? 0 : (r.count || 0);
  }

  async function sumCoins(schoolId) {
    var q = supabaseClient.from(CONFIG.tables.profiles).select('monedas').eq('rol', 'student').eq('is_active', true);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var r = await q;
    if (r.error) return 0;
    return (r.data || []).reduce(function(acc, x) { return acc + Number(x.monedas || 0); }, 0);
  }

  function getSchoolById(id) {
    return (state.schools || []).find(function(s) { return String(s.id) === String(id); }) || null;
  }

  var manageSchoolId = null;

  function ensureManagePanel() {
    if (document.getElementById('schoolManagePanel')) return;
    var div = document.createElement('div');
    div.id = 'schoolManagePanel';
    div.style.cssText = 'position:fixed;right:0;top:0;width:min(680px,100%);height:100%;background:#101318;z-index:1200;overflow:auto;padding:1rem;border-left:1px solid rgba(255,255,255,.15);display:none;';
    div.innerHTML = '' +
      '<div class="d-flex justify-content-between align-items-center mb-2">' +
      '  <h5 class="mb-0" id="manageSchoolTitle">Manage School</h5>' +
      '  <button class="btn btn-sm btn-outline-light" id="btnCloseManageSchool">Close</button>' +
      '</div>' +
      '<ul class="nav nav-tabs mb-2" id="manageSchoolTabs">' +
      '  <li class="nav-item"><a class="nav-link active" href="#" data-tab="overview">Overview</a></li>' +
      '  <li class="nav-item"><a class="nav-link" href="#" data-tab="admins">Admins</a></li>' +
      '  <li class="nav-item"><a class="nav-link" href="#" data-tab="teachers">Teachers</a></li>' +
      '  <li class="nav-item"><a class="nav-link" href="#" data-tab="groups">Groups</a></li>' +
      '</ul>' +
      '<div id="manageSchoolTabBody"></div>';
    document.body.appendChild(div);
    document.getElementById('btnCloseManageSchool').onclick = function() { div.style.display = 'none'; };
    document.getElementById('manageSchoolTabs').addEventListener('click', function(e) {
      var a = e.target.closest('a[data-tab]');
      if (!a) return;
      e.preventDefault();
      document.querySelectorAll('#manageSchoolTabs .nav-link').forEach(function(n) { n.classList.remove('active'); });
      a.classList.add('active');
      renderManageTab(a.getAttribute('data-tab'));
    });
  }

  async function manageSchool(schoolId) {
    ensureManagePanel();
    manageSchoolId = schoolId;
    var school = getSchoolById(schoolId);
    document.getElementById('manageSchoolTitle').textContent = 'Manage: ' + esc(school ? school.nombre : 'School');
    document.getElementById('schoolManagePanel').style.display = 'block';
    renderManageTab('overview');
  }

  async function renderManageTab(tab) {
    var school = getSchoolById(manageSchoolId);
    var body = document.getElementById('manageSchoolTabBody');
    if (!school || !body) return;
    if (tab === 'overview') {
      body.innerHTML = '' +
        '<div class="mb-2"><label class="form-label small">School name</label><input id="manageSchoolName" class="form-control" value="' + esc(school.nombre || '') + '"></div>' +
        '<div class="row g-2">' +
        '  <div class="col-md-4"><label class="form-label small">Plan</label><select id="manageSchoolPlan" class="form-select"><option>BASIC</option><option>STANDARD</option><option>ADVANCED</option><option>PREMIUM</option><option>ENTERPRISE</option></select></div>' +
        '  <div class="col-md-4"><label class="form-label small">AI Provider</label><select id="manageSchoolProvider" class="form-select"><option value="chatgpt">chatgpt</option><option value="claude">claude</option><option value="gemini">gemini</option></select></div>' +
        '  <div class="col-md-4"><label class="form-label small">AI Pool</label><input id="manageSchoolAiPool" type="number" min="0" class="form-control" value="' + Number(school.ai_credit_pool || 0) + '"></div>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm mt-2" id="btnSaveManageOverview">Save Overview</button>';
      document.getElementById('manageSchoolPlan').value = school.plan || 'BASIC';
      document.getElementById('manageSchoolProvider').value = school.active_ai_provider || 'claude';
      document.getElementById('btnSaveManageOverview').onclick = saveManageOverview;
      return;
    }

    if (tab === 'admins' || tab === 'teachers') {
      var role = tab === 'admins' ? 'admin' : 'teacher';
      var r = await supabaseClient.from(CONFIG.tables.profiles).select(PROFILE_SELECT).eq('institution_id', school.id).eq('rol', role).eq('is_active', true).order('nombre_completo');
      var rows = r.error ? [] : (r.data || []);
      body.innerHTML = '<div class="mb-2"><button class="btn btn-sm btn-primary" id="btnAddManageRole">Add ' + role + '</button></div>' +
        '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Name</th><th>Doc</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows.map(function(u) {
          return '<tr><td>' + esc(u.nombre_completo || '-') + '</td><td>' + esc(u.documento_id || '-') + '</td><td>' + (u.account_locked ? 'blocked' : 'active') + '</td><td><button class="btn btn-sm btn-outline-primary me-1" onclick="InstitutionsModule.editProfile(\'' + esc(u.id) + '\')">Edit</button><button class="btn btn-sm btn-outline-secondary me-1" onclick="InstitutionsModule.lockProfile(\'' + esc(u.id) + '\',' + (!u.account_locked) + ')">' + (u.account_locked ? 'Unlock' : 'Lock') + '</button><button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteProfile(\'' + esc(u.id) + '\')">Delete</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      document.getElementById('btnAddManageRole').onclick = function() { createRoleUser(role, school.id); };
      return;
    }

    if (tab === 'groups') {
      var g = await supabaseClient.from(CONFIG.tables.groups).select('group_code,max_capacity').eq('institution_id', school.id).order('group_code');
      var groups = g.error ? [] : (g.data || []);
      body.innerHTML = '<div class="mb-2"><button class="btn btn-sm btn-primary" id="btnGoGroupsView">Open Groups View</button></div>' +
        '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Group</th><th>Capacity</th><th>Students</th></tr></thead><tbody>' + (await Promise.all(groups.map(async function(row) {
          var c = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('institution_id', school.id).eq('rol', 'student').eq('is_active', true).eq('grupo', row.group_code);
          return '<tr><td>' + esc(row.group_code) + '</td><td>' + esc(row.max_capacity || '-') + '</td><td>' + (c.error ? 0 : (c.count || 0)) + '</td></tr>';
        }))).join('') + '</tbody></table></div>';
      document.getElementById('btnGoGroupsView').onclick = function() {
        var sel = document.getElementById('groupsSchoolSelect');
        if (sel) sel.value = school.id;
        if (window.showAdminView) window.showAdminView('groups');
      };
    }
  }

  async function saveManageOverview() {
    var school = getSchoolById(manageSchoolId);
    if (!school) return;
    var payload = {
      name: String(document.getElementById('manageSchoolName').value || '').trim(),
      subscription_plan: String(document.getElementById('manageSchoolPlan').value || 'BASIC'),
      active_ai_provider: String(document.getElementById('manageSchoolProvider').value || 'claude'),
      ai_credit_pool: Math.max(0, Number(document.getElementById('manageSchoolAiPool').value || 0))
    };
    if (!payload.name) return toast('School name is required', 'danger');
    var r = await supabaseClient.from(CONFIG.tables.institutions).update(payload).eq('id', school.id);
    if (r.error) return toast(r.error.message, 'danger');
    await logAudit('EDIT_SCHOOL', 'institution', school.id, payload);
    toast('School updated', 'success');
    await loadList();
    await loadDashboard();
  }

  function ensurePlanModal() {
    if (document.getElementById('planFeaturesModal')) return;
    var div = document.createElement('div');
    div.innerHTML = '<div class="modal fade" id="planFeaturesModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Plan & Features</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><input type="hidden" id="pfSchoolId"><div class="mb-2"><label class="form-label">Plan</label><select id="pfPlan" class="form-select"><option>BASIC</option><option>STANDARD</option><option>ADVANCED</option><option>PREMIUM</option><option>ENTERPRISE</option></select></div><div id="pfToggles"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="btnSavePlanFeatures">Save</button></div></div></div></div>';
    document.body.appendChild(div.firstChild);
    document.getElementById('btnSavePlanFeatures').onclick = savePlanFeatures;
  }

  function openPlanFeatures(schoolId) {
    ensurePlanModal();
    var school = getSchoolById(schoolId);
    if (!school) return;
    var features = Object.assign({
      ai_generator: true,
      exams_module: false,
      esp_module: false,
      store_auctions: true,
      geofence: true,
      analytics: false,
      bulk_import: true,
      speaking_module: false
    }, school.features || {});
    var plan = school.subscription_plan || school.plan || 'BASIC';
    document.getElementById('pfSchoolId').value = school.id;
    document.getElementById('pfPlan').value = plan;
    var list = [
      ['ai_generator', 'AI Challenge Generator'],
      ['exams_module', 'International Exams Module'],
      ['esp_module', 'ESP Module'],
      ['store_auctions', 'Store & Auctions'],
      ['geofence', 'Geofence Attendance'],
      ['analytics', 'Analytics Dashboard'],
      ['bulk_import', 'Bulk Import'],
      ['speaking_module', 'Speaking Module']
    ];
    document.getElementById('pfToggles').innerHTML = list.map(function(x) {
      return '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="pf_' + x[0] + '" ' + (features[x[0]] ? 'checked' : '') + '><label class="form-check-label" for="pf_' + x[0] + '">' + esc(x[1]) + '</label></div>';
    }).join('');
    if (window.UI && UI.showModal) UI.showModal('planFeaturesModal');
  }

  async function savePlanFeatures() {
    var id = String((document.getElementById('pfSchoolId') || {}).value || '').trim();
    if (!id) return;
    var payload = {
      subscription_plan: document.getElementById('pfPlan').value,
      features: {
        ai_generator: !!document.getElementById('pf_ai_generator').checked,
        exams_module: !!document.getElementById('pf_exams_module').checked,
        esp_module: !!document.getElementById('pf_esp_module').checked,
        store_auctions: !!document.getElementById('pf_store_auctions').checked,
        geofence: !!document.getElementById('pf_geofence').checked,
        analytics: !!document.getElementById('pf_analytics').checked,
        bulk_import: !!document.getElementById('pf_bulk_import').checked,
        speaking_module: !!document.getElementById('pf_speaking_module').checked
      }
    };
    var r = await supabaseClient.from(CONFIG.tables.institutions).update(payload).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    if (window.UI && UI.hideModal) UI.hideModal('planFeaturesModal');
    toast('Plan & features saved', 'success');
    await loadList();
  }

  async function createRoleUser(role, schoolId) {
    var name = prompt('Full name'); if (name == null) return;
    var doc = prompt('Document ID'); if (doc == null) return;
    var pin = prompt('PIN'); if (pin == null) return;
    var ins = await supabaseClient.from(CONFIG.tables.profiles).insert([{ nombre_completo: String(name).trim(), documento_id: String(doc).trim(), pin: String(pin).trim(), rol: role, institution_id: schoolId, is_active: true, monedas: 0 }]);
    if (ins.error) return toast(ins.error.message, 'danger');
    toast(role + ' created', 'success');
    renderManageTab(role === 'admin' ? 'admins' : 'teachers');
    loadAdminsSection();
  }

  async function editProfile(id) {
    var one = await supabaseClient.from(CONFIG.tables.profiles).select(PROFILE_SELECT).eq('id', id).single();
    if (one.error || !one.data) return;
    var n = prompt('Name', one.data.nombre_completo || ''); if (n == null) return;
    var d = prompt('Document', one.data.documento_id || ''); if (d == null) return;
    var p = prompt('PIN', one.data.pin || ''); if (p == null) return;
    var upd = await supabaseClient.from(CONFIG.tables.profiles).update({ nombre_completo: String(n).trim(), documento_id: String(d).trim(), pin: String(p).trim() }).eq('id', id);
    if (upd.error) return toast(upd.error.message, 'danger');
    await logAudit('EDIT_USER', 'profile', id, { nombre_completo: String(n).trim(), documento_id: String(d).trim() });
    toast('Profile updated', 'success');
    loadAdminsSection();
    renderManageTab(one.data.rol === 'admin' ? 'admins' : 'teachers');
  }

  async function lockProfile(id, next) {
    var r = await supabaseClient.from(CONFIG.tables.profiles).update({ account_locked: !!next }).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    await logAudit('LOCK_USER', 'profile', id, { account_locked: !!next });
    loadAdminsSection();
    renderManageTab('admins');
    renderManageTab('teachers');
  }

  async function deleteProfile(id) {
    if (!confirm('Soft delete this user?')) return;
    var r = await supabaseClient.from(CONFIG.tables.profiles).update({ is_active: false }).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    await logAudit('DELETE_USER', 'profile', id, { is_active: false });
    loadAdminsSection();
    renderManageTab('admins');
    renderManageTab('teachers');
  }

  function ensureSchoolModal() {
    var existing = document.getElementById('schoolEditModal');
    if (existing) return existing;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = '' +
      '<div class="modal fade" id="schoolEditModal" tabindex="-1">' +
      '  <div class="modal-dialog"><div class="modal-content">' +
      '    <div class="modal-header"><h5 class="modal-title" id="schoolModalTitle">Edit School</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '    <div class="modal-body">' +
      '      <input type="hidden" id="schoolModalId">' +
      '      <div class="mb-2"><label class="form-label">School name</label><input id="schoolModalName" class="form-control"></div>' +
      '      <div class="mb-2"><label class="form-label">Plan</label><select id="schoolModalPlan" class="form-select"><option>BASIC</option><option>STANDARD</option><option>ADVANCED</option><option>PREMIUM</option><option>ENTERPRISE</option></select></div>' +
      '      <div class="mb-2"><label class="form-label">AI Provider</label><select id="schoolModalProvider" class="form-select"><option value="chatgpt">chatgpt</option><option value="claude">claude</option><option value="gemini">gemini</option></select></div>' +
      '      <div class="mb-2"><label class="form-label">AI Credit Pool</label><input type="number" min="0" id="schoolModalPool" class="form-control"></div>' +
      '      <div class="mb-2"><label class="form-label">AI API Key</label><input type="password" id="schoolModalApiKey" class="form-control" placeholder="Optional"></div>' +
      '    </div>' +
      '    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn btn-primary" id="btnSaveSchoolModal">Save</button></div>' +
      '  </div></div>' +
      '</div>';
    document.body.appendChild(wrapper.firstChild);
    document.getElementById('btnSaveSchoolModal').addEventListener('click', saveSchoolModal);
    return document.getElementById('schoolEditModal');
  }

  function openSchoolModal(mode, school) {
    ensureSchoolModal();
    document.getElementById('schoolModalTitle').textContent = mode === 'create' ? 'Create New School' : 'Edit School';
    document.getElementById('schoolModalId').value = school && school.id ? school.id : '';
    document.getElementById('schoolModalName').value = school && school.nombre ? school.nombre : '';
    document.getElementById('schoolModalPlan').value = school && school.plan ? school.plan : 'BASIC';
    document.getElementById('schoolModalProvider').value = school && school.active_ai_provider ? school.active_ai_provider : 'claude';
    document.getElementById('schoolModalPool').value = Number(school && school.ai_credit_pool || 0);
    document.getElementById('schoolModalApiKey').value = '';
    if (window.UI && UI.showModal) UI.showModal('schoolEditModal');
  }

  async function saveSchoolModal() {
    var id = document.getElementById('schoolModalId').value;
    var payload = {
      name: String(document.getElementById('schoolModalName').value || '').trim(),
      subscription_plan: String(document.getElementById('schoolModalPlan').value || 'BASIC').trim(),
      active_ai_provider: String(document.getElementById('schoolModalProvider').value || 'claude').trim(),
      ai_credit_pool: Math.max(0, Number(document.getElementById('schoolModalPool').value || 0))
    };
    var apiKey = String(document.getElementById('schoolModalApiKey').value || '').trim();
    if (apiKey) payload.api_key = apiKey;
    if (!payload.name) return toast('School name is required', 'danger');
    var res;
    if (id) {
      res = await supabaseClient.from(CONFIG.tables.institutions).update(payload).eq('id', id);
    } else {
      payload.ai_used_credits = 0;
      payload.is_suspended = false;
      res = await supabaseClient.from(CONFIG.tables.institutions).insert([payload]);
    }
    if (res.error) return toast('Save failed: ' + res.error.message, 'danger');
    await logAudit(id ? 'EDIT_SCHOOL' : 'CREATE_SCHOOL', 'institution', id || payload.name, payload);
    if (window.UI && UI.hideModal) UI.hideModal('schoolEditModal');
    toast('School saved', 'success');
    await loadList();
  }

  async function writeCreditHistory(schoolId, operation, amount, previousPool, newPool) {
    var payload = {
      institution_id: schoolId,
      operation: operation,
      amount: amount,
      previous_pool: previousPool,
      new_pool: newPool,
      performed_by: state.user && state.user.id ? state.user.id : null
    };
    await supabaseClient.from('institution_credit_history').insert([payload]);
  }

  async function mutatePool(schoolId, mode) {
    var input = document.getElementById('schoolCreditInput_' + schoolId);
    if (!input) return;
    var amount = Math.max(0, Number(input.value || 0));
    if (!amount && mode !== 'reset') return toast('Enter a valid amount', 'danger');
    var school = getSchoolById(schoolId);
    if (!school) return;
    var prevPool = Number(school.ai_credit_pool || 0);
    var prevUsed = Number(school.ai_used_credits || 0);
    var nextPool = prevPool;
    var payload = {};
    if (mode === 'add') nextPool = prevPool + amount;
    if (mode === 'remove') nextPool = Math.max(0, prevPool - amount);
    payload.ai_credit_pool = nextPool;
    if (mode === 'reset') payload.ai_used_credits = 0;
    var upd = await supabaseClient.from(CONFIG.tables.institutions).update(payload).eq('id', schoolId);
    if (upd.error) return toast('Credit operation failed: ' + upd.error.message, 'danger');
    try { await writeCreditHistory(schoolId, mode, mode === 'reset' ? prevUsed : amount, prevPool, nextPool); } catch (_) {}
    await logAudit(mode === 'reset' ? 'RESET_CREDITS' : (mode === 'add' ? 'ADD_CREDITS' : 'REMOVE_CREDITS'), 'institution', schoolId, { amount: amount, next_pool: nextPool, reset_used: mode === 'reset' });
    await loadList();
    toast('Credits updated', 'success');
  }

  async function toggleSuspend(schoolId, next) {
    var upd = await supabaseClient.from(CONFIG.tables.institutions).update({ is_suspended: !!next }).eq('id', schoolId);
    if (upd.error) return toast('Suspend failed: ' + upd.error.message, 'danger');
    await logAudit('SUSPEND_SCHOOL', 'institution', schoolId, { is_suspended: !!next });
    await loadList();
    toast(next ? 'School suspended' : 'School activated', 'warning');
  }

  async function deleteSchool(schoolId) {
    var cnt = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('institution_id', schoolId).eq('is_active', true);
    if (!cnt.error && (cnt.count || 0) > 0) return toast('Cannot delete school with active users', 'danger');
    if (!confirm('Delete this school? This cannot be undone.')) return;
    var del = await supabaseClient.from(CONFIG.tables.institutions).delete().eq('id', schoolId);
    if (del.error) return toast('Delete failed: ' + del.error.message, 'danger');
    await loadList();
    toast('School deleted', 'success');
  }

  async function loadSchoolHistory(schoolId) {
    var host = document.getElementById('schoolHistory_' + schoolId);
    if (!host) return;
    var res = await supabaseClient
      .from('institution_credit_history')
      .select('operation,amount,previous_pool,new_pool,created_at')
      .eq('institution_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (res.error) {
      host.innerHTML = '<div class="small text-muted">No history available.</div>';
      return;
    }
    var rows = res.data || [];
    host.innerHTML = rows.length ? rows.map(function(r) {
      return '<div class="small">' + esc(String(r.operation || '').toUpperCase()) + ' ' + esc(r.amount) + ' <span class="text-muted">(' + esc(r.created_at || '') + ')</span></div>';
    }).join('') : '<div class="small text-muted">No operations yet.</div>';
  }

  async function renderSchoolCard(s) {
    var teachers = await countProfiles('teacher', s.id);
    var students = await countProfiles('student', s.id);
    var admins = await countProfiles('admin', s.id);
    var groupsRes = await supabaseClient.from(CONFIG.tables.groups).select('id', { count: 'exact', head: true }).eq('institution_id', s.id);
    var groups = groupsRes.error ? 0 : (groupsRes.count || 0);
    var pool = Number(s.ai_credit_pool || 0);
    var used = Number(s.ai_used_credits || 0);
    var free = Math.max(0, pool - used);
    var coins = await sumCoins(s.id);
    var pct = pool > 0 ? Math.min(100, Math.round((used / pool) * 100)) : 0;
    return '' +
      '<div class="glass-panel mb-3" style="padding:1rem;">' +
      '  <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">' +
      '    <div><h6 class="mb-1">' + esc(s.nombre || 'School') + '</h6><div class="small text-muted">Plan: ' + esc(s.plan || 'BASIC') + ' | AI: ' + esc(s.active_ai_provider || '-') + '</div></div>' +
      '    <div class="d-flex gap-2 flex-wrap">' +
      '      <button class="btn btn-sm btn-primary" onclick="InstitutionsModule.manageSchool(\'' + esc(s.id) + '\')">Manage</button>' +
      '      <button class="btn btn-sm btn-outline-warning" onclick="InstitutionsModule.openPlanFeatures(\'' + esc(s.id) + '\')">Plan & Features</button>' +
      '      <button class="btn btn-sm btn-outline-primary" onclick="InstitutionsModule.openEdit(\'' + esc(s.id) + '\')">Edit School</button>' +
      '      <button class="btn btn-sm btn-outline-warning" onclick="InstitutionsModule.toggleCredits(\'' + esc(s.id) + '\')">AI Credits</button>' +
      '      <button class="btn btn-sm btn-outline-info" onclick="InstitutionsModule.toggleStats(\'' + esc(s.id) + '\')">View Stats</button>' +
      '      <button class="btn btn-sm btn-outline-secondary" onclick="InstitutionsModule.suspend(\'' + esc(s.id) + '\',' + (!s.is_suspended) + ')">' + (s.is_suspended ? 'Unsuspend' : 'Suspend') + '</button>' +
      '      <button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteSchool(\'' + esc(s.id) + '\')">Delete</button>' +
      '    </div>' +
      '  </div>' +
      '  <div id="schoolStats_' + esc(s.id) + '" class="mt-2" style="display:none;">Teachers: ' + teachers + ' | Admins: ' + admins + ' | Students: ' + students + ' | Groups: ' + groups + ' | Coins: ' + coins + '</div>' +
      '  <div id="schoolCredits_' + esc(s.id) + '" class="mt-3" style="display:none;">' +
      '    <div class="small">Pool: ' + pool + ' | Used: ' + used + ' | Available: ' + free + '</div>' +
      '    <div class="progress mt-1 mb-2" style="height:8px;"><div class="progress-bar bg-warning" style="width:' + pct + '%"></div></div>' +
      '    <div class="d-flex gap-2 flex-wrap align-items-center">' +
      '      <input id="schoolCreditInput_' + esc(s.id) + '" class="form-control form-control-sm" style="max-width:140px;" type="number" min="0" placeholder="Amount">' +
      '      <button class="btn btn-sm btn-success" onclick="InstitutionsModule.creditAdd(\'' + esc(s.id) + '\')">Add Credits</button>' +
      '      <button class="btn btn-sm btn-danger" onclick="InstitutionsModule.creditRemove(\'' + esc(s.id) + '\')">Remove Credits</button>' +
      '      <button class="btn btn-sm btn-outline-secondary" onclick="InstitutionsModule.creditReset(\'' + esc(s.id) + '\')">Reset Used Counter</button>' +
      '    </div>' +
      '    <div id="schoolHistory_' + esc(s.id) + '" class="mt-2"></div>' +
      '  </div>' +
      '</div>';
  }

  async function fillSchoolSelectors() {
    var selectors = ['usersSchoolSelect', 'groupsSchoolSelect', 'challengeSchoolFilter', 'storeSchoolFilter', 'announcementSchoolFilter', 'feedbackSchoolFilter', 'adminsSchoolFilter', 'newAdminInstitution'];
    selectors.forEach(function(id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = '<option value="">All schools</option>';
      state.schools.forEach(function(s) {
        var o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.nombre;
        sel.appendChild(o);
      });
      if (cur) sel.value = cur;
    });
  }

  async function loadDashboard() {
    var host = document.getElementById('dashboardCards');
    if (!host) return;
    host.innerHTML = '<div class="small text-muted">Loading global stats...</div>';
    var schools = (await loadSchoolsResilient()).filter(function(s) { return !s.is_suspended; });
    var teachers = await countProfiles('teacher');
    var students = await countProfiles('student');
    var challengesRes = await supabaseClient.from(CONFIG.tables.challenges).select('id', { count: 'exact', head: true }).eq('is_active', true);
    var challenges = challengesRes.error ? 0 : (challengesRes.count || 0);
    var coins = await sumCoins(null);
    var usedToday = 0;
    try {
      var logs = await supabaseClient.from(CONFIG.tables.ai_usage_logs).select('tokens_used,created_at').gte('created_at', new Date(Date.now() - 86400000).toISOString());
      if (!logs.error) usedToday = (logs.data || []).reduce(function(a, r) { return a + Number(r.tokens_used || 0); }, 0);
    } catch (_) {}
    var blockedRes = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('account_locked', true);
    var blocked = blockedRes.error ? 0 : (blockedRes.count || 0);
    var warningSchools = schools.filter(function(s) {
      var pool = Number(s.ai_credit_pool || 0);
      var used = Number(s.ai_used_credits || 0);
      return pool > 0 && used / pool >= 0.8;
    });
    var groupsRes = await supabaseClient.from(CONFIG.tables.groups).select('id', { count: 'exact', head: true });
    var groupsCount = groupsRes.error ? 0 : (groupsRes.count || 0);
    var maxActive = { name: '-', value: -1 };
    for (var i = 0; i < schools.length; i += 1) {
      var st = await countProfiles('student', schools[i].id);
      if (st > maxActive.value) maxActive = { name: schools[i].nombre || '-', value: st };
    }
    function card(title, value, view, size, emoji) {
      var h = size === 'hero' ? '2rem' : (size === 'mid' ? '1.5rem' : '1.2rem');
      return '<button type="button" class="glass-panel text-start w-100" style="border:none;padding:1rem;" onclick="showAdminView(\'' + view + '\')"><div class="small text-muted">' + emoji + ' ' + esc(title) + '</div><div style="font-size:' + h + ';font-weight:700;">' + esc(value) + '</div></button>';
    }
    host.innerHTML = '' +
      '<div class="row g-3 mb-2"><div class="col-md-6">' + card('Escuelas activas', schools.length, 'institutions', 'hero', '🏫') + '</div><div class="col-md-6">' + card('Monedas en circulacion', coins, 'economy', 'hero', '🪙') + '</div></div>' +
      '<div class="row g-3 mb-2"><div class="col-md-4">' + card('Teachers', teachers, 'admins', 'mid', '👨‍🏫') + '</div><div class="col-md-4">' + card('Estudiantes', students, 'users', 'mid', '👨‍🎓') + '</div><div class="col-md-4">' + card('Grupos activos', groupsCount, 'groups', 'mid', '📚') + '</div></div>' +
      '<div class="row g-3"><div class="col-md-4">' + card('Challenges activos', challenges, 'institutions', 'small', '🏆') + '</div><div class="col-md-4">' + card('AI credits usados hoy', usedToday, 'economy', 'small', '🤖') + '</div><div class="col-md-4">' + card('Cuentas bloqueadas', blocked, 'admins', 'small', '⚠️') + '</div></div>' +
      '<div class="mt-3"><span class="badge text-bg-primary">Escuela mas activa: ' + esc(maxActive.name) + ' (' + maxActive.value + ' students)</span></div>';
    var alert = document.getElementById('dashboardAlert');
    if (alert) {
      var alerts = [];
      warningSchools.forEach(function(s) {
        var pool = Number(s.ai_credit_pool || 0);
        var used = Number(s.ai_used_credits || 0);
        var pct = pool > 0 ? Math.round((used / pool) * 100) : 0;
        alerts.push('<div class="alert alert-warning py-2 mb-2">⚠️ ' + esc(s.nombre || '-') + ' - ' + pct + '% of AI credits used (' + used + '/' + pool + ')</div>');
      });
      if (blocked > 0) alerts.push('<div class="alert alert-secondary py-2 mb-0">🔒 ' + blocked + ' accounts locked - Review in Admins</div>');
      alert.innerHTML = alerts.join('');
    }
  }

  async function loadChallengesAdmin() {
    var schoolId = document.getElementById('challengeSchoolFilter') ? document.getElementById('challengeSchoolFilter').value : '';
    var q = supabaseClient.from(CONFIG.tables.challenges).select('id,title,target_group,is_active,created_at,institution_id').order('created_at', { ascending: false }).limit(100);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var res = await q;
    var host = document.getElementById('challengesList');
    if (!host) return;
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    var rows = res.data || [];
    host.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Title</th><th>Group</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows.map(function(r) {
      return '<tr><td>' + esc(r.title || '-') + '</td><td>' + esc(r.target_group || 'all') + '</td><td>' + (r.is_active ? 'active' : 'closed') + '</td><td><button class="btn btn-sm btn-outline-warning me-1" onclick="InstitutionsModule.toggleChallenge(\'' + esc(r.id) + '\',' + (!r.is_active) + ')">' + (r.is_active ? 'Close' : 'Reopen') + '</button><button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteChallenge(\'' + esc(r.id) + '\')">Delete</button></td></tr>';
    }).join('') + '</tbody></table></div>';
    var createBtn = document.getElementById('btnCreateChallenge');
    if (createBtn) createBtn.style.display = 'none';
  }

  async function toggleChallenge(id, next) {
    var res = await supabaseClient.from(CONFIG.tables.challenges).update({ is_active: !!next }).eq('id', id);
    if (res.error) return toast(res.error.message, 'danger');
    loadChallengesAdmin();
  }

  async function deleteChallenge(id) {
    if (!confirm('Delete challenge permanently?')) return;
    var res = await supabaseClient.from(CONFIG.tables.challenges).delete().eq('id', id);
    if (res.error) return toast(res.error.message, 'danger');
    loadChallengesAdmin();
  }

  async function loadStoreAdmin() {
    var schoolId = document.getElementById('storeSchoolFilter') ? document.getElementById('storeSchoolFilter').value : '';
    var q = supabaseClient.from(CONFIG.tables.auctions).select('id,item_name,item_type,status,institution_id,current_bid').order('created_at', { ascending: false }).limit(100);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var res = await q;
    var host = document.getElementById('auctionList');
    if (!host) return;
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    var rows = res.data || [];
    host.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Item</th><th>Type</th><th>Status</th><th>Bid</th><th>Actions</th></tr></thead><tbody>' + rows.map(function(r) {
      return '<tr><td>' + esc(r.item_name || '-') + '</td><td>' + esc(r.item_type || '-') + '</td><td>' + esc(r.status || '-') + '</td><td>' + esc(r.current_bid || 0) + '</td><td><button class="btn btn-sm btn-outline-warning me-1" onclick="InstitutionsModule.closeAuction(\'' + esc(r.id) + '\')">Close</button><button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteAuction(\'' + esc(r.id) + '\')">Delete</button></td></tr>';
    }).join('') + '</tbody></table></div>';
    var createBtn = document.getElementById('btnCreateAuction');
    if (createBtn) createBtn.style.display = 'none';
  }

  async function closeAuction(id) {
    var res = await supabaseClient.from(CONFIG.tables.auctions).update({ status: 'closed' }).eq('id', id);
    if (res.error) return toast(res.error.message, 'danger');
    loadStoreAdmin();
  }

  async function deleteAuction(id) {
    var res = await supabaseClient.from(CONFIG.tables.auctions).delete().eq('id', id);
    if (res.error) return toast(res.error.message, 'danger');
    loadStoreAdmin();
  }

  async function loadAnnouncementsAdmin() {
    var schoolId = document.getElementById('announcementSchoolFilter') ? document.getElementById('announcementSchoolFilter').value : '';
    var q = supabaseClient.from(CONFIG.tables.announcements).select('id,title,target_group,created_at,institution_id,pinned').order('created_at', { ascending: false }).limit(100);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var res = await q;
    var host = document.getElementById('announcementsList');
    if (!host) return;
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    host.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Title</th><th>Target</th><th>Pinned</th><th>Actions</th></tr></thead><tbody>' + (res.data || []).map(function(a) {
      return '<tr><td>' + esc(a.title || '-') + '</td><td>' + esc(a.target_group || 'all') + '</td><td>' + (a.pinned ? 'yes' : 'no') + '</td><td><button class="btn btn-sm btn-outline-secondary me-1" onclick="InstitutionsModule.pinAnnouncement(\'' + esc(a.id) + '\',' + (!a.pinned) + ')">' + (a.pinned ? 'Unpin' : 'Pin') + '</button><button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteAnnouncement(\'' + esc(a.id) + '\')">Delete</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function pinAnnouncement(id, next) {
    var upd = await supabaseClient.from(CONFIG.tables.announcements).update({ pinned: !!next }).eq('id', id);
    if (upd.error) return toast(upd.error.message, 'danger');
    loadAnnouncementsAdmin();
  }

  async function deleteAnnouncement(id) {
    var del = await supabaseClient.from(CONFIG.tables.announcements).delete().eq('id', id);
    if (del.error) return toast(del.error.message, 'danger');
    loadAnnouncementsAdmin();
  }

  async function loadFeedbackAdmin() {
    var schoolId = document.getElementById('feedbackSchoolFilter') ? document.getElementById('feedbackSchoolFilter').value : '';
    var q = supabaseClient.from(CONFIG.tables.feedback_messages).select('id,message,status,created_at,student_id,institution_id').order('created_at', { ascending: false }).limit(100);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var res = await q;
    var host = document.getElementById('feedbackList');
    if (!host) return;
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    host.innerHTML = '<div class="mb-2"><button class="btn btn-sm btn-outline-success" onclick="InstitutionsModule.exportFeedbackCsv()">Export CSV</button></div>' +
      '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Message</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + (res.data || []).map(function(f) {
        return '<tr><td>' + esc(f.message || '-') + '</td><td>' + esc(f.status || 'new') + '</td><td><button class="btn btn-sm btn-outline-primary me-1" onclick="InstitutionsModule.markFeedback(\'' + esc(f.id) + '\',\'read\')">Read</button><button class="btn btn-sm btn-outline-success" onclick="InstitutionsModule.markFeedback(\'' + esc(f.id) + '\',\'resolved\')">Resolved</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  async function markFeedback(id, status) {
    var upd = await supabaseClient.from(CONFIG.tables.feedback_messages).update({ status: status }).eq('id', id);
    if (upd.error) return toast(upd.error.message, 'danger');
    loadFeedbackAdmin();
  }

  async function exportFeedbackCsv() {
    var rows = document.querySelectorAll('#feedbackList table tbody tr');
    var lines = ['message,status'];
    rows.forEach(function(r) {
      var t = r.querySelectorAll('td');
      lines.push('"' + String((t[0] && t[0].textContent) || '').replace(/"/g, '""') + '","' + String((t[1] && t[1].textContent) || '').replace(/"/g, '""') + '"');
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'feedback_export.csv';
    a.click();
    await logAudit('EXPORT_DATA', 'feedback', 'feedback_export.csv', {});
  }

  async function loadAdminsSection() {
    var host = document.getElementById('adminUsersList');
    if (!host) return;
    var schoolId = document.getElementById('adminsSchoolFilter') ? document.getElementById('adminsSchoolFilter').value : '';
    var q = supabaseClient.from(CONFIG.tables.profiles).select(PROFILE_SELECT).in('rol', ['admin', 'teacher']).eq('is_active', true).order('nombre_completo');
    if (schoolId) q = q.eq('institution_id', schoolId);
    var res = await q;
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    host.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Name</th><th>Doc</th><th>Role</th><th>School</th><th>Teacher Credits</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + (res.data || []).map(function(u) {
      var school = getSchoolById(u.institution_id);
      return '<tr><td>' + esc(u.nombre_completo || '-') + '</td><td>' + esc(u.documento_id || '-') + '</td><td>' + esc(u.rol || '-') + '</td><td>' + esc(school ? school.nombre : '-') + '</td><td>' + esc(u.teacher_credits || 0) + '</td><td>' + esc(u.last_login_at || '-') + '</td><td>' + (u.account_locked ? 'blocked' : 'active') + '</td><td><button class="btn btn-sm btn-outline-primary me-1" onclick="InstitutionsModule.editProfile(\'' + esc(u.id) + '\')">Edit</button><button class="btn btn-sm btn-outline-secondary me-1" onclick="InstitutionsModule.lockProfile(\'' + esc(u.id) + '\',' + (!u.account_locked) + ')">' + (u.account_locked ? 'Unlock' : 'Lock') + '</button><button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteProfile(\'' + esc(u.id) + '\')">Delete</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function createAdminTeacher() {
    var name = String((document.getElementById('newAdminName') || {}).value || '').trim();
    var doc = String((document.getElementById('newAdminDoc') || {}).value || '').trim();
    var pin = String((document.getElementById('newAdminPin') || {}).value || '').trim();
    var role = String((document.getElementById('newAdminRole') || {}).value || 'admin').trim();
    var sid = String((document.getElementById('newAdminInstitution') || {}).value || '').trim();
    if (!name || !doc || !pin || !sid) return toast('Complete required fields', 'warning');
    var r = await supabaseClient.from(CONFIG.tables.profiles).insert([{ nombre_completo: name, documento_id: doc, pin: pin, rol: role, institution_id: sid, is_active: true, monedas: 0 }]);
    if (r.error) return toast(r.error.message, 'danger');
    await logAudit('EDIT_USER', 'profile', doc, { action: 'create_admin_teacher', role: role, institution_id: sid });
    toast('User created', 'success');
    loadAdminsSection();
  }

  function exportCreditReport() {
    var lines = ['school,plan,pool,used,available'];
    state.schools.forEach(function(s) {
      var pool = Number(s.ai_credit_pool || 0);
      var used = Number(s.ai_used_credits || 0);
      lines.push([s.nombre, s.plan || '', pool, used, Math.max(0, pool - used)].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'credit_report.csv';
    a.click();
    logAudit('EXPORT_DATA', 'institution', 'credit_report.csv', {});
  }

  async function loadList() {
    var host = document.getElementById('institutionsList');
    if (!host) return;
    state.schools = await loadSchoolsResilient();
    state.selectedSchoolId = state.selectedSchoolId || (state.schools[0] ? state.schools[0].id : null);
    await fillSchoolSelectors();
    var cards = [];
    for (var i = 0; i < state.schools.length; i += 1) {
      cards.push(await renderSchoolCard(state.schools[i]));
    }
    host.innerHTML = cards.length ? cards.join('') : '<div class="alert alert-warning">No schools found.</div>';
    for (var j = 0; j < state.schools.length; j += 1) {
      loadSchoolHistory(state.schools[j].id);
    }
    loadAdminsSection();
  }

  function toggleStats(schoolId) {
    var el = document.getElementById('schoolStats_' + schoolId);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  }

  function toggleCredits(schoolId) {
    var el = document.getElementById('schoolCredits_' + schoolId);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  }

  function openEdit(schoolId) {
    openSchoolModal('edit', getSchoolById(schoolId));
  }

  async function init(ctx) {
    if (ctx && ctx.user) state.user = ctx.user;
    if (state.initialized) return;
    state.initialized = true;
    var createBtn = document.getElementById('btnCreateSchool');
    if (createBtn) createBtn.addEventListener('click', function() { openSchoolModal('create', null); });
    ['challengeSchoolFilter', 'storeSchoolFilter', 'announcementSchoolFilter', 'feedbackSchoolFilter', 'adminsSchoolFilter'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function() {
        if (id === 'challengeSchoolFilter') loadChallengesAdmin();
        if (id === 'storeSchoolFilter') loadStoreAdmin();
        if (id === 'announcementSchoolFilter') loadAnnouncementsAdmin();
        if (id === 'feedbackSchoolFilter') loadFeedbackAdmin();
        if (id === 'adminsSchoolFilter') loadAdminsSection();
      });
    });
    var btnExport = document.getElementById('btnExportCreditReport');
    if (btnExport) btnExport.onclick = exportCreditReport;
    var btnApi = document.getElementById('btnSaveApiKeys');
    if (btnApi) btnApi.onclick = function() { saveApiKeys().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnModels = document.getElementById('btnSaveAiModels');
    if (btnModels) btnModels.onclick = function() { saveAiModels().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnLimits = document.getElementById('btnSaveDailyLimits');
    if (btnLimits) btnLimits.onclick = function() { saveDailyLimits().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnRevealOpenai = document.getElementById('btnRevealOpenai'); if (btnRevealOpenai) btnRevealOpenai.onclick = function() { revealApiKey('openai'); };
    var btnRevealAnthropic = document.getElementById('btnRevealAnthropic'); if (btnRevealAnthropic) btnRevealAnthropic.onclick = function() { revealApiKey('anthropic'); };
    var btnRevealGoogle = document.getElementById('btnRevealGoogle'); if (btnRevealGoogle) btnRevealGoogle.onclick = function() { revealApiKey('google'); };
    var btnCopyOpenai = document.getElementById('btnCopyOpenai'); if (btnCopyOpenai) btnCopyOpenai.onclick = function() { copyApiKey('openai'); };
    var btnCopyAnthropic = document.getElementById('btnCopyAnthropic'); if (btnCopyAnthropic) btnCopyAnthropic.onclick = function() { copyApiKey('anthropic'); };
    var btnCopyGoogle = document.getElementById('btnCopyGoogle'); if (btnCopyGoogle) btnCopyGoogle.onclick = function() { copyApiKey('google'); };
    var btnTestOpenai = document.getElementById('btnTestOpenai'); if (btnTestOpenai) btnTestOpenai.onclick = function() { testProviderKey('openai'); };
    var btnTestAnthropic = document.getElementById('btnTestAnthropic'); if (btnTestAnthropic) btnTestAnthropic.onclick = function() { testProviderKey('anthropic'); };
    var btnTestGoogle = document.getElementById('btnTestGoogle'); if (btnTestGoogle) btnTestGoogle.onclick = function() { testProviderKey('google'); };
    var btnCreateAdmin = document.getElementById('btnCreateAdminUser');
    if (btnCreateAdmin) btnCreateAdmin.onclick = createAdminTeacher;
    await loadList();
    await loadDashboard();
  }

  window.InstitutionsModule = {
    init: init,
    loadList: loadList,
    loadDashboard: loadDashboard,
    loadEconomy: loadEconomy,
    loadAiConfig: loadAiConfig,
    loadChallengesAdmin: loadChallengesAdmin,
    loadStoreAdmin: loadStoreAdmin,
    loadAnnouncementsAdmin: loadAnnouncementsAdmin,
    loadFeedbackAdmin: loadFeedbackAdmin,
    loadAdminsSection: loadAdminsSection,
    loadPolicies: loadPolicies,
    requestAiConfigAccess: requestAiConfigAccess,
    manageSchool: manageSchool,
    openPlanFeatures: openPlanFeatures,
    editProfile: editProfile,
    lockProfile: lockProfile,
    deleteProfile: deleteProfile,
    openEdit: openEdit,
    toggleStats: toggleStats,
    toggleCredits: toggleCredits,
    suspend: toggleSuspend,
    deleteSchool: deleteSchool,
    creditAdd: function(id, customInputId) { if (customInputId) { var src = document.getElementById(customInputId); var dst = document.getElementById('schoolCreditInput_' + id); if (src && dst) dst.value = src.value; } return mutatePool(id, 'add'); },
    creditRemove: function(id, customInputId) { if (customInputId) { var src = document.getElementById(customInputId); var dst = document.getElementById('schoolCreditInput_' + id); if (src && dst) dst.value = src.value; } return mutatePool(id, 'remove'); },
    creditReset: function(id) { return mutatePool(id, 'reset'); },
    coinAdd: function(id, inputId) { return updateCoinPool(id, 'add', inputId); },
    coinRemove: function(id, inputId) { return updateCoinPool(id, 'remove', inputId); },
    aiAdd: function(id, inputId) { return updateAiPool(id, 'add', inputId); },
    aiRemove: function(id, inputId) { return updateAiPool(id, 'remove', inputId); },
    aiReset: function(id) { return updateAiPool(id, 'reset', ''); },
    toggleChallenge: toggleChallenge,
    deleteChallenge: deleteChallenge,
    closeAuction: closeAuction,
    deleteAuction: deleteAuction,
    pinAnnouncement: pinAnnouncement,
    deleteAnnouncement: deleteAnnouncement,
    markFeedback: markFeedback,
    exportFeedbackCsv: exportFeedbackCsv,
    exportCreditReport: exportCreditReport,
    toggleKeyVisibility: toggleKeyVisibility,
    testProviderKey: testProviderKey,
    revealApiKey: revealApiKey,
    copyApiKey: copyApiKey
  };
})();
