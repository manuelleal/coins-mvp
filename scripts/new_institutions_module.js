(function() {
  var state = { user: null, schools: [], configs: {}, initialized: false };

  function esc(v) { return window.UI && UI.escapeHtml ? UI.escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v); }
  function toast(msg, type) { if (window.UI && UI.showToast) UI.showToast(msg, type || 'info'); }

  async function fetchSchools() {
    var fields = 'id,nombre,plan,subscription_plan,is_suspended,active_ai_provider,ai_credit_pool,ai_used_credits,coin_pool,features,limits';
    var r = await supabaseClient.from(CONFIG.tables.institutions).select(fields).order('nombre');
    if (r.error) {
      var r2 = await supabaseClient.from(CONFIG.tables.institutions).select('id,nombre,plan,subscription_plan,is_suspended,active_ai_provider,ai_credit_pool,ai_used_credits').order('nombre');
      return r2.error ? [] : (r2.data || []);
    }
    return r.data || [];
  }

  async function countProfilesByRole(role, schoolId) {
    var q = supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('is_active', true);
    if (role) q = q.eq('rol', role);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var r = await q;
    return r.error ? 0 : (r.count || 0);
  }

  async function countGroups(schoolId) {
    var q = supabaseClient.from(CONFIG.tables.groups).select('group_code', { count: 'exact', head: true }).eq('is_active', true);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var r = await q;
    return r.error ? 0 : (r.count || 0);
  }

  async function sumCoins(schoolId) {
    var q = supabaseClient.from(CONFIG.tables.profiles).select('monedas').eq('is_active', true);
    if (schoolId) q = q.eq('institution_id', schoolId);
    var r = await q;
    if (r.error) return 0;
    return (r.data || []).reduce(function(acc, row) { return acc + Number(row.monedas || 0); }, 0);
  }

  function findSchool(id) {
    return (state.schools || []).find(function(s) { return String(s.id) === String(id); }) || null;
  }

  function planOf(s) {
    return s.subscription_plan || s.plan || 'BASIC';
  }

  function limitsOf(s) {
    return Object.assign({ max_students: 200, max_teachers: 10, max_groups: 20, daily_ai_credits: 100 }, s.limits || {});
  }

  function featuresOf(s) {
    return Object.assign({
      ai_generator: true,
      exams_module: false,
      esp_module: false,
      store_auctions: true,
      geofence: true,
      analytics: false,
      bulk_import: true,
      speaking_module: false
    }, s.features || {});
  }

  async function loadDashboard() {
    var host = document.getElementById('dashboardCards');
    if (!host) return;
    host.innerHTML = '<p class="text-muted small">Loading dashboard...</p>';

    var schools = await fetchSchools();
    var activeSchools = schools.filter(function(s) { return !s.is_suspended; });
    var admins = await countProfilesByRole('admin');
    var teachers = await countProfilesByRole('teacher');
    var students = await countProfilesByRole('student');
    var groups = await countGroups();
    var coins = await sumCoins(null);
    var aiToday = 0;
    try {
      var logs = await supabaseClient.from(CONFIG.tables.ai_usage_logs).select('tokens_used,created_at').gte('created_at', new Date(Date.now() - 86400000).toISOString());
      if (!logs.error) aiToday = (logs.data || []).reduce(function(a, x) { return a + Number(x.tokens_used || 0); }, 0);
    } catch (_) {}
    var blocked = await (async function() {
      var r = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('account_locked', true).eq('is_active', true);
      return r.error ? 0 : (r.count || 0);
    })();

    var warningSchools = schools.filter(function(s) {
      var pool = Number(s.ai_credit_pool || 0);
      var used = Number(s.ai_used_credits || 0);
      return pool > 0 && used / pool >= 0.8;
    });

    var cards = [
      ['Escuelas activas / total', activeSchools.length + ' / ' + schools.length, 'institutions'],
      ['Total admins', admins, 'admins'],
      ['Total teachers', teachers, 'admins'],
      ['Total estudiantes activos', students, 'users'],
      ['Total grupos', groups, 'groups'],
      ['Total monedas en circulacion', coins, 'economy'],
      ['Total AI credits usados hoy', aiToday, 'economy'],
      ['Cuentas bloqueadas', blocked, 'admins']
    ];

    host.innerHTML = '<div class="d-flex flex-wrap gap-2">' + cards.map(function(c) {
      return '<button type="button" class="glass-panel text-start" style="min-width:220px;padding:1rem;border:none;" onclick="showAdminView(\'' + c[2] + '\')"><div class="small text-muted">' + esc(c[0]) + '</div><div style="font-size:1.6rem;font-weight:700;">' + esc(c[1]) + '</div></button>';
    }).join('') + '</div>';

    var alert = document.getElementById('dashboardAlert');
    if (alert) {
      if (warningSchools.length) {
        alert.innerHTML = '<div class="alert alert-warning py-2">AI usage > 80% in: ' + warningSchools.map(function(s) { return esc(s.nombre); }).join(', ') + '</div>';
      } else {
        alert.innerHTML = '';
      }
    }
  }

  async function schoolStats(id) {
    return {
      admins: await countProfilesByRole('admin', id),
      teachers: await countProfilesByRole('teacher', id),
      students: await countProfilesByRole('student', id),
      groups: await countGroups(id),
      coins: await sumCoins(id)
    };
  }

  function ensureManagePanel() {
    if (document.getElementById('schoolManagePanel')) return;
    var div = document.createElement('div');
    div.id = 'schoolManagePanel';
    div.style.cssText = 'position:fixed;right:0;top:0;width:min(640px,100%);height:100%;background:#111;z-index:1200;overflow:auto;display:none;padding:1rem;border-left:1px solid rgba(255,255,255,.15);';
    div.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="mb-0" id="manageSchoolTitle">Manage School</h5><button class="btn btn-sm btn-outline-light" id="btnCloseManagePanel">Close</button></div>' +
      '<ul class="nav nav-tabs mb-2" id="manageTabs"><li class="nav-item"><a class="nav-link active" href="#" data-tab="overview">Overview</a></li><li class="nav-item"><a class="nav-link" href="#" data-tab="admins">Admins</a></li><li class="nav-item"><a class="nav-link" href="#" data-tab="teachers">Teachers</a></li><li class="nav-item"><a class="nav-link" href="#" data-tab="groups">Groups</a></li></ul>' +
      '<div id="manageTabBody"></div>';
    document.body.appendChild(div);
    document.getElementById('btnCloseManagePanel').onclick = function() { div.style.display = 'none'; };
    document.getElementById('manageTabs').addEventListener('click', function(e) {
      var a = e.target.closest('a[data-tab]');
      if (!a) return;
      e.preventDefault();
      document.querySelectorAll('#manageTabs .nav-link').forEach(function(x) { x.classList.remove('active'); });
      a.classList.add('active');
      renderManageTab(a.getAttribute('data-tab'));
    });
  }

  var manageSchoolId = null;

  async function openManageSchool(schoolId) {
    ensureManagePanel();
    manageSchoolId = schoolId;
    var school = findSchool(schoolId);
    document.getElementById('manageSchoolTitle').textContent = 'Manage: ' + (school ? school.nombre : 'School');
    document.getElementById('schoolManagePanel').style.display = 'block';
    renderManageTab('overview');
  }

  async function renderManageTab(tab) {
    var school = findSchool(manageSchoolId);
    var body = document.getElementById('manageTabBody');
    if (!school || !body) return;
    if (tab === 'overview') {
      var l = limitsOf(school);
      body.innerHTML = '<div class="mb-2"><label class="form-label small">School name</label><input id="manageSchoolName" class="form-control" value="' + esc(school.nombre || '') + '"></div>' +
        '<div class="row g-2"><div class="col-6"><label class="form-label small">Max students</label><input id="limitMaxStudents" type="number" class="form-control" value="' + Number(l.max_students || 200) + '"></div>' +
        '<div class="col-6"><label class="form-label small">Max teachers</label><input id="limitMaxTeachers" type="number" class="form-control" value="' + Number(l.max_teachers || 10) + '"></div>' +
        '<div class="col-6"><label class="form-label small">Max groups</label><input id="limitMaxGroups" type="number" class="form-control" value="' + Number(l.max_groups || 20) + '"></div>' +
        '<div class="col-6"><label class="form-label small">Daily AI credits</label><input id="limitDailyAiCredits" type="number" class="form-control" value="' + Number(l.daily_ai_credits || 100) + '"></div></div>' +
        '<button class="btn btn-primary btn-sm mt-2" id="btnSaveOverview">Save</button>';
      document.getElementById('btnSaveOverview').onclick = saveOverview;
      return;
    }

    if (tab === 'admins' || tab === 'teachers') {
      var role = tab === 'admins' ? 'admin' : 'teacher';
      var r = await supabaseClient.from(CONFIG.tables.profiles).select('id,nombre_completo,documento_id,account_locked').eq('institution_id', school.id).eq('rol', role).eq('is_active', true).order('nombre_completo');
      var rows = r.error ? [] : (r.data || []);
      body.innerHTML = '<div class="mb-2"><button class="btn btn-sm btn-primary" id="btnAddRoleUser">Add ' + role + '</button></div>' +
        '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Name</th><th>Doc</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + rows.map(function(u) {
          return '<tr><td>' + esc(u.nombre_completo) + '</td><td>' + esc(u.documento_id) + '</td><td>' + (u.account_locked ? 'blocked' : 'active') + '</td><td><button class="btn btn-sm btn-outline-primary me-1" onclick="InstitutionsModule.editProfile(\'' + esc(u.id) + '\')">Edit</button><button class="btn btn-sm btn-outline-secondary me-1" onclick="InstitutionsModule.lockProfile(\'' + esc(u.id) + '\',' + (!u.account_locked) + ')">' + (u.account_locked ? 'Unlock' : 'Lock') + '</button><button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteProfile(\'' + esc(u.id) + '\')">Delete</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      document.getElementById('btnAddRoleUser').onclick = function() { createRoleUser(role, school.id); };
      return;
    }

    if (tab === 'groups') {
      var g = await supabaseClient.from(CONFIG.tables.groups).select('group_code,max_capacity').eq('institution_id', school.id).eq('is_active', true).order('group_code');
      var groups = g.error ? [] : (g.data || []);
      body.innerHTML = '<div class="mb-2"><button class="btn btn-sm btn-primary" id="btnAddGroupFromManage">Add Group</button></div><div id="manageGroupsWrap"></div>';
      var wrap = document.getElementById('manageGroupsWrap');
      if (wrap) {
        var parts = [];
        for (var i = 0; i < groups.length; i += 1) {
          var code = groups[i].group_code;
          var tr = await supabaseClient.from(CONFIG.tables.teacher_groups).select('teacher_id').eq('group_code', code).maybeSingle();
          var teacherName = '-';
          if (!tr.error && tr.data && tr.data.teacher_id) {
            var p = await supabaseClient.from(CONFIG.tables.profiles).select('nombre_completo').eq('id', tr.data.teacher_id).maybeSingle();
            teacherName = p.error || !p.data ? '-' : (p.data.nombre_completo || '-');
          }
          var st = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('institution_id', school.id).eq('rol', 'student').eq('is_active', true).eq('grupo', code);
          var count = st.error ? 0 : (st.count || 0);
          parts.push('<tr><td>' + esc(code) + '</td><td>' + esc(teacherName) + '</td><td>' + count + '</td><td><button class="btn btn-sm btn-outline-primary me-1" onclick="GroupsModule.editGroup(\'' + esc(code) + '\')">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="GroupsModule.deleteGroup(\'' + esc(code) + '\')">Delete</button></td></tr>');
        }
        wrap.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Group</th><th>Teacher</th><th>Students</th><th>Actions</th></tr></thead><tbody>' + parts.join('') + '</tbody></table></div>';
      }
      document.getElementById('btnAddGroupFromManage').onclick = function() { if (window.showAdminView) showAdminView('groups'); };
    }
  }

  async function saveOverview() {
    var school = findSchool(manageSchoolId);
    if (!school) return;
    var payload = {
      nombre: String(document.getElementById('manageSchoolName').value || '').trim(),
      limits: {
        max_students: Number(document.getElementById('limitMaxStudents').value || 200),
        max_teachers: Number(document.getElementById('limitMaxTeachers').value || 10),
        max_groups: Number(document.getElementById('limitMaxGroups').value || 20),
        daily_ai_credits: Number(document.getElementById('limitDailyAiCredits').value || 100)
      }
    };
    var r = await supabaseClient.from(CONFIG.tables.institutions).update(payload).eq('id', school.id);
    if (r.error) return toast(r.error.message, 'danger');
    toast('Overview saved', 'success');
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
  }

  async function editProfile(id) {
    var one = await supabaseClient.from(CONFIG.tables.profiles).select('nombre_completo,documento_id,pin,rol,institution_id').eq('id', id).single();
    if (one.error || !one.data) return;
    var n = prompt('Name', one.data.nombre_completo || ''); if (n == null) return;
    var d = prompt('Document', one.data.documento_id || ''); if (d == null) return;
    var p = prompt('PIN', one.data.pin || ''); if (p == null) return;
    var upd = await supabaseClient.from(CONFIG.tables.profiles).update({ nombre_completo: String(n).trim(), documento_id: String(d).trim(), pin: String(p).trim() }).eq('id', id);
    if (upd.error) return toast(upd.error.message, 'danger');
    toast('Profile updated', 'success');
    loadAdminsSection();
    renderManageTab(one.data.rol === 'admin' ? 'admins' : 'teachers');
  }

  async function lockProfile(id, next) {
    var r = await supabaseClient.from(CONFIG.tables.profiles).update({ account_locked: !!next }).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    loadAdminsSection();
    renderManageTab('admins');
    renderManageTab('teachers');
  }

  async function deleteProfile(id) {
    if (!confirm('Soft delete this user?')) return;
    var r = await supabaseClient.from(CONFIG.tables.profiles).update({ is_active: false }).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    loadAdminsSection();
  }

  function ensurePlanModal() {
    if (document.getElementById('planFeaturesModal')) return;
    var div = document.createElement('div');
    div.innerHTML = '<div class="modal fade" id="planFeaturesModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Plan & Features</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><input type="hidden" id="pfSchoolId"><div class="mb-2"><label class="form-label">Plan</label><select id="pfPlan" class="form-select"><option>BASIC</option><option>STANDARD</option><option>PREMIUM</option><option>ENTERPRISE</option></select></div><div id="pfToggles"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="btnSavePlanFeatures">Save</button></div></div></div></div>';
    document.body.appendChild(div.firstChild);
    document.getElementById('btnSavePlanFeatures').onclick = savePlanFeatures;
  }

  function openPlanFeatures(schoolId) {
    ensurePlanModal();
    var school = findSchool(schoolId); if (!school) return;
    var f = featuresOf(school);
    document.getElementById('pfSchoolId').value = school.id;
    document.getElementById('pfPlan').value = planOf(school);
    var list = [
      ['ai_generator', 'AI Challenge Generator'],
      ['exams_module', 'International Exams Module'],
      ['esp_module', 'English for Specific Purposes'],
      ['store_auctions', 'Store & Auctions'],
      ['geofence', 'Geofence Attendance'],
      ['analytics', 'Analytics Dashboard'],
      ['bulk_import', 'Bulk CSV Import'],
      ['speaking_module', 'Speaking Module']
    ];
    document.getElementById('pfToggles').innerHTML = list.map(function(x) {
      return '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="pf_' + x[0] + '" ' + (f[x[0]] ? 'checked' : '') + '><label class="form-check-label" for="pf_' + x[0] + '">' + esc(x[1]) + '</label></div>';
    }).join('');
    if (window.UI && UI.showModal) UI.showModal('planFeaturesModal');
  }

  async function savePlanFeatures() {
    var id = document.getElementById('pfSchoolId').value;
    var payload = {
      subscription_plan: document.getElementById('pfPlan').value,
      features: {
        ai_generator: document.getElementById('pf_ai_generator').checked,
        exams_module: document.getElementById('pf_exams_module').checked,
        esp_module: document.getElementById('pf_esp_module').checked,
        store_auctions: document.getElementById('pf_store_auctions').checked,
        geofence: document.getElementById('pf_geofence').checked,
        analytics: document.getElementById('pf_analytics').checked,
        bulk_import: document.getElementById('pf_bulk_import').checked,
        speaking_module: document.getElementById('pf_speaking_module').checked
      }
    };
    var r = await supabaseClient.from(CONFIG.tables.institutions).update(payload).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    if (window.UI && UI.hideModal) UI.hideModal('planFeaturesModal');
    toast('Plan & features saved', 'success');
    loadList();
  }

  async function toggleSuspend(schoolId, next) {
    var r = await supabaseClient.from(CONFIG.tables.institutions).update({ is_suspended: !!next }).eq('id', schoolId);
    if (r.error) return toast(r.error.message, 'danger');
    toast(next ? 'School suspended' : 'School activated', 'warning');
    await loadList();
    await loadDashboard();
  }

  async function deleteSchool(schoolId) {
    var school = findSchool(schoolId);
    if (!school) return;
    var c = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('institution_id', schoolId).eq('is_active', true);
    if (!c.error && (c.count || 0) > 0) return toast('Cannot delete school with active users', 'danger');
    if (!confirm('Delete school "' + school.nombre + '"?')) return;
    var d = await supabaseClient.from(CONFIG.tables.institutions).delete().eq('id', schoolId);
    if (d.error) return toast(d.error.message, 'danger');
    toast('School deleted', 'success');
    loadList();
  }

  async function createSchool() {
    var name = prompt('School name'); if (name == null) return;
    var plan = prompt('Plan BASIC/STANDARD/PREMIUM/ENTERPRISE', 'BASIC'); if (plan == null) return;
    var maxStudents = Number(prompt('Max students', '200') || 200);
    var maxTeachers = Number(prompt('Max teachers', '10') || 10);
    var maxGroups = Number(prompt('Max groups', '20') || 20);
    var aiPool = Number(prompt('Initial AI credit pool', '100') || 100);
    var ins = await supabaseClient.from(CONFIG.tables.institutions).insert([{
      nombre: String(name).trim(),
      subscription_plan: String(plan).trim().toUpperCase(),
      plan: String(plan).trim().toUpperCase(),
      ai_credit_pool: Math.max(0, aiPool),
      ai_used_credits: 0,
      coin_pool: 0,
      is_suspended: false,
      limits: { max_students: maxStudents, max_teachers: maxTeachers, max_groups: maxGroups, daily_ai_credits: 100 }
    }]);
    if (ins.error) return toast(ins.error.message, 'danger');
    toast('School created', 'success');
    loadList();
  }

  async function loadList() {
    var host = document.getElementById('institutionsList');
    if (!host) return;
    state.schools = await fetchSchools();
    fillSchoolSelectors();
    var html = '';
    for (var i = 0; i < state.schools.length; i += 1) {
      var s = state.schools[i];
      var st = await schoolStats(s.id);
      var pool = Number(s.ai_credit_pool || 0);
      var used = Number(s.ai_used_credits || 0);
      var pct = pool > 0 ? Math.min(100, Math.round((used / pool) * 100)) : 0;
      var plan = planOf(s);
      html += '<div class="glass-panel mb-2" style="padding:1rem;">' +
        '<div class="d-flex justify-content-between align-items-start gap-2 flex-wrap"><div><h6 class="mb-1">' + esc(s.nombre) + ' ' + (s.is_suspended ? '<span class="badge text-bg-danger">SUSPENDED</span>' : '<span class="badge text-bg-success">ACTIVE</span>') + '</h6><div class="small text-muted">Plan: ' + esc(plan) + '</div></div>' +
        '<div class="d-flex gap-1 flex-wrap"><button class="btn btn-sm btn-outline-primary" onclick="InstitutionsModule.manageSchool(\'' + esc(s.id) + '\')">Manage</button><button class="btn btn-sm btn-outline-warning" onclick="InstitutionsModule.openPlanFeatures(\'' + esc(s.id) + '\')">Plan & Features</button><button class="btn btn-sm btn-outline-secondary" onclick="InstitutionsModule.suspend(\'' + esc(s.id) + '\',' + (!s.is_suspended) + ')">' + (s.is_suspended ? 'Activate' : 'Suspend') + '</button><button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteSchool(\'' + esc(s.id) + '\')">Delete</button></div></div>' +
        '<div class="small mt-2">Admins: ' + st.admins + ' | Teachers: ' + st.teachers + ' | Students: ' + st.students + ' | Groups: ' + st.groups + '</div>' +
        '<div class="small">Coin pool: ' + Number(s.coin_pool || 0) + '</div>' +
        '<div class="small">AI Credits: ' + used + '/' + pool + '</div>' +
        '<div class="progress" style="height:7px;"><div class="progress-bar ' + (pct > 80 ? 'bg-danger' : (pct >= 60 ? 'bg-warning' : 'bg-success')) + '" style="width:' + pct + '%"></div></div>' +
      '</div>';
    }
    host.innerHTML = html || '<p class="text-muted small">No schools found.</p>';
  }

  function schoolOptionHtml() {
    return '<option value="">All schools</option>' + (state.schools || []).map(function(s) { return '<option value="' + esc(s.id) + '">' + esc(s.nombre) + '</option>'; }).join('');
  }

  function fillSchoolSelectors() {
    ['usersSchoolSelect', 'groupsSchoolSelect', 'adminsSchoolFilter', 'newAdminInstitution'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var cur = el.value;
      el.innerHTML = schoolOptionHtml();
      if (cur) el.value = cur;
    });
  }

  async function loadCreditHistory(schoolId) {
    var r = await supabaseClient.from('institution_credit_history').select('operation,amount,created_at').eq('institution_id', schoolId).order('created_at', { ascending: false }).limit(5);
    return r.error ? [] : (r.data || []);
  }

  async function updateCoinPool(id, mode, inputId) {
    var school = findSchool(id); if (!school) return;
    var el = document.getElementById(inputId); if (!el) return;
    var amount = Math.max(0, Number(el.value || 0));
    if (!amount) return toast('Enter amount', 'warning');
    var pool = Number(school.coin_pool || 0);
    var next = mode === 'add' ? (pool + amount) : Math.max(0, pool - amount);
    var r = await supabaseClient.from(CONFIG.tables.institutions).update({ coin_pool: next }).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    loadEconomy();
  }

  async function updateAiPool(id, mode, inputId) {
    var school = findSchool(id); if (!school) return;
    var payload = {};
    if (mode === 'reset') {
      payload.ai_used_credits = 0;
    } else {
      var el = document.getElementById(inputId); if (!el) return;
      var amount = Math.max(0, Number(el.value || 0));
      if (!amount) return toast('Enter amount', 'warning');
      var pool = Number(school.ai_credit_pool || 0);
      payload.ai_credit_pool = mode === 'add' ? pool + amount : Math.max(0, pool - amount);
      await supabaseClient.from('institution_credit_history').insert([{ institution_id: id, operation: mode, amount: amount, previous_pool: pool, new_pool: payload.ai_credit_pool, performed_by: state.user && state.user.id ? state.user.id : null }]);
    }
    var r = await supabaseClient.from(CONFIG.tables.institutions).update(payload).eq('id', id);
    if (r.error) return toast(r.error.message, 'danger');
    loadEconomy();
    loadList();
  }

  async function loadEconomy() {
    var coin = document.getElementById('economyCoinTable');
    var ai = document.getElementById('economyAiTable');
    if (!coin || !ai) return;
    state.schools = await fetchSchools();

    var coinRows = '';
    for (var i = 0; i < state.schools.length; i += 1) {
      var s = state.schools[i];
      var inCirculation = await sumCoins(s.id);
      var pool = Number(s.coin_pool || 0);
      var available = Math.max(0, pool - inCirculation);
      coinRows += '<tr><td>' + esc(s.nombre) + '</td><td>' + esc(planOf(s)) + '</td><td>' + pool + '</td><td>' + inCirculation + '</td><td>' + available + '</td><td><div class="d-flex gap-1"><input id="coin_' + esc(s.id) + '" type="number" class="form-control form-control-sm" style="max-width:90px;"><button class="btn btn-sm btn-success" onclick="InstitutionsModule.coinAdd(\'' + esc(s.id) + '\',\'coin_' + esc(s.id) + '\')">Add Coins</button><button class="btn btn-sm btn-danger" onclick="InstitutionsModule.coinRemove(\'' + esc(s.id) + '\',\'coin_' + esc(s.id) + '\')">Remove Coins</button></div></td></tr>';
    }
    coin.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Escuela</th><th>Plan</th><th>Coin Pool</th><th>En circulacion</th><th>Disponible</th><th>Accion</th></tr></thead><tbody>' + coinRows + '</tbody></table></div>';

    var aiRows = '';
    for (var j = 0; j < state.schools.length; j += 1) {
      var z = state.schools[j];
      var poolAi = Number(z.ai_credit_pool || 0);
      var usedAi = Number(z.ai_used_credits || 0);
      var availAi = Math.max(0, poolAi - usedAi);
      var pct = poolAi > 0 ? Math.round((usedAi / poolAi) * 100) : 0;
      var cls = pct > 80 ? 'bg-danger' : (pct >= 60 ? 'bg-warning' : 'bg-success');
      var hist = await loadCreditHistory(z.id);
      aiRows += '<tr><td>' + esc(z.nombre) + '</td><td>' + poolAi + '</td><td>' + usedAi + '</td><td>' + availAi + '</td><td style="min-width:140px;"><div class="progress" style="height:7px;"><div class="progress-bar ' + cls + '" style="width:' + pct + '%"></div></div><div class="small">' + pct + '%</div></td><td><div class="d-flex gap-1 flex-wrap"><input id="aic_' + esc(z.id) + '" type="number" class="form-control form-control-sm" style="max-width:90px;"><button class="btn btn-sm btn-success" onclick="InstitutionsModule.aiAdd(\'' + esc(z.id) + '\',\'aic_' + esc(z.id) + '\')">Add</button><button class="btn btn-sm btn-danger" onclick="InstitutionsModule.aiRemove(\'' + esc(z.id) + '\',\'aic_' + esc(z.id) + '\')">Remove</button><button class="btn btn-sm btn-outline-secondary" onclick="InstitutionsModule.aiReset(\'' + esc(z.id) + '\')">Reset Used</button></div><details class="mt-1"><summary class="small">History</summary>' + (hist.length ? hist.map(function(h) { return '<div class="small">' + esc(String(h.operation || '').toUpperCase()) + ' ' + Number(h.amount || 0) + ' <span class="text-muted">' + esc(h.created_at || '') + '</span></div>'; }).join('') : '<div class="small text-muted">No records</div>') + '</details></td></tr>';
    }
    ai.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Escuela</th><th>Pool</th><th>Usado</th><th>Disponible</th><th>%</th><th>Accion</th></tr></thead><tbody>' + aiRows + '</tbody></table></div>';
  }

  async function getSystemConfig(key, fallback) {
    var r = await supabaseClient.from('system_configs').select('config_value').eq('config_key', key).maybeSingle();
    if (r.error || !r.data || !r.data.config_value) return fallback;
    return r.data.config_value;
  }

  async function upsertSystemConfig(key, value) {
    var p = { config_key: key, config_value: value, updated_by: state.user && state.user.id ? state.user.id : null, updated_at: new Date().toISOString() };
    var r = await supabaseClient.from('system_configs').upsert([p], { onConflict: 'config_key' });
    if (r.error) throw r.error;
  }

  function buildModelRow(slot, label, providers, modelsByProvider, cost) {
    var row = document.createElement('div');
    row.className = 'row g-2 mb-2';
    row.innerHTML = '<div class="col-md-4"><label class="form-label small">' + label + '</label><select id="modelProvider_' + slot + '" class="form-select">' + providers.map(function(p) { return '<option value="' + p + '">' + p + '</option>'; }).join('') + '</select></div>' +
      '<div class="col-md-5"><label class="form-label small">Model</label><select id="modelName_' + slot + '" class="form-select"></select></div>' +
      '<div class="col-md-3"><label class="form-label small">Cost credits</label><input id="modelCost_' + slot + '" class="form-control" type="number" value="' + cost + '" readonly></div>';
    var pEl = row.querySelector('#modelProvider_' + slot);
    var mEl = row.querySelector('#modelName_' + slot);
    function fillModels(provider) {
      var list = modelsByProvider[provider] || [];
      mEl.innerHTML = list.map(function(m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
    }
    pEl.addEventListener('change', function() { fillModels(pEl.value); });
    fillModels(pEl.value);
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

    document.getElementById('apiKeyOpenai').value = keys.openai || '';
    document.getElementById('apiKeyAnthropic').value = keys.anthropic || '';
    document.getElementById('apiKeyGoogle').value = keys.google || '';

    document.getElementById('limitDaily').value = Number(limits.challenges_daily || 10);
    document.getElementById('limitExam').value = Number(limits.challenges_exam || 5);
    document.getElementById('limitEsp').value = Number(limits.challenges_esp || 5);
    document.getElementById('limitCoinsChallenges').value = Number(limits.coins_per_day_challenges || 50);
    document.getElementById('limitCoinsAttendance').value = Number(limits.coins_per_day_attendance || 10);

    var providerModels = {
      anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514', 'claude-opus-4-6'],
      openai: ['gpt-4o-mini', 'gpt-4o'],
      google: ['gemini-flash', 'gemini-pro', 'gemini-ultra']
    };
    var providers = ['anthropic', 'openai', 'google'];
    var form = document.getElementById('aiModelsForm');
    form.innerHTML = '';
    form.appendChild(buildModelRow('daily', 'Daily Practice', providers, providerModels, 1));
    form.appendChild(buildModelRow('exam', 'Exam Preparation', providers, providerModels, 3));
    form.appendChild(buildModelRow('esp', 'ESP / International', providers, providerModels, 5));

    ['daily', 'exam', 'esp'].forEach(function(slot) {
      var slotCfg = models[slot] || {};
      var p = document.getElementById('modelProvider_' + slot);
      var m = document.getElementById('modelName_' + slot);
      if (p && slotCfg.provider) p.value = slotCfg.provider;
      if (p) p.dispatchEvent(new Event('change'));
      if (m && slotCfg.model) m.value = slotCfg.model;
    });
  }

  async function saveApiKeys() {
    await upsertSystemConfig('api_keys', {
      openai: String(document.getElementById('apiKeyOpenai').value || '').trim(),
      anthropic: String(document.getElementById('apiKeyAnthropic').value || '').trim(),
      google: String(document.getElementById('apiKeyGoogle').value || '').trim()
    });
    toast('API keys saved', 'success');
  }

  async function saveAiModels() {
    await upsertSystemConfig('ai_models', {
      daily: { provider: document.getElementById('modelProvider_daily').value, model: document.getElementById('modelName_daily').value, cost_credits: 1 },
      exam: { provider: document.getElementById('modelProvider_exam').value, model: document.getElementById('modelName_exam').value, cost_credits: 3 },
      esp: { provider: document.getElementById('modelProvider_esp').value, model: document.getElementById('modelName_esp').value, cost_credits: 5 }
    });
    toast('AI models saved', 'success');
  }

  async function saveDailyLimits() {
    await upsertSystemConfig('daily_limits', {
      challenges_daily: Number(document.getElementById('limitDaily').value || 10),
      challenges_exam: Number(document.getElementById('limitExam').value || 5),
      challenges_esp: Number(document.getElementById('limitEsp').value || 5),
      coins_per_day_challenges: Number(document.getElementById('limitCoinsChallenges').value || 50),
      coins_per_day_attendance: Number(document.getElementById('limitCoinsAttendance').value || 10)
    });
    toast('Daily limits saved', 'success');
  }

  async function loadAdminsSection() {
    var host = document.getElementById('adminUsersList');
    if (!host) return;
    var sid = document.getElementById('adminsSchoolFilter') ? document.getElementById('adminsSchoolFilter').value : '';
    var q = supabaseClient.from(CONFIG.tables.profiles).select('id,nombre_completo,documento_id,rol,institution_id,last_login_at,account_locked').in('rol', ['admin', 'teacher']).eq('is_active', true).order('nombre_completo');
    if (sid) q = q.eq('institution_id', sid);
    var r = await q;
    if (r.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(r.error.message) + '</div>'; return; }
    host.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Name</th><th>Doc</th><th>Role</th><th>School</th><th>Last login</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + (r.data || []).map(function(u) {
      var school = findSchool(u.institution_id);
      return '<tr><td>' + esc(u.nombre_completo) + '</td><td>' + esc(u.documento_id) + '</td><td>' + esc(u.rol) + '</td><td>' + esc(school ? school.nombre : '-') + '</td><td>' + esc(u.last_login_at || '-') + '</td><td>' + (u.account_locked ? 'blocked' : 'active') + '</td><td><button class="btn btn-sm btn-outline-primary me-1" onclick="InstitutionsModule.editProfile(\'' + esc(u.id) + '\')">Edit</button><button class="btn btn-sm btn-outline-secondary me-1" onclick="InstitutionsModule.lockProfile(\'' + esc(u.id) + '\',' + (!u.account_locked) + ')">' + (u.account_locked ? 'Unlock' : 'Lock') + '</button><button class="btn btn-sm btn-outline-danger" onclick="InstitutionsModule.deleteProfile(\'' + esc(u.id) + '\')">Delete</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  async function createAdminTeacher() {
    var name = String(document.getElementById('newAdminName').value || '').trim();
    var doc = String(document.getElementById('newAdminDoc').value || '').trim();
    var pin = String(document.getElementById('newAdminPin').value || '').trim();
    var role = String(document.getElementById('newAdminRole').value || 'admin');
    var sid = String(document.getElementById('newAdminInstitution').value || '');
    if (!name || !doc || !pin || !sid) return toast('Complete required fields', 'warning');
    var r = await supabaseClient.from(CONFIG.tables.profiles).insert([{ nombre_completo: name, documento_id: doc, pin: pin, rol: role, institution_id: sid, is_active: true, monedas: 0 }]);
    if (r.error) return toast(r.error.message, 'danger');
    toast('User created', 'success');
    loadAdminsSection();
  }

  function exportCreditReport() {
    var lines = ['school,plan,coin_pool,ai_pool,ai_used,ai_available'];
    (state.schools || []).forEach(function(s) {
      var pool = Number(s.ai_credit_pool || 0);
      var used = Number(s.ai_used_credits || 0);
      lines.push([s.nombre, planOf(s), Number(s.coin_pool || 0), pool, used, Math.max(0, pool - used)].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'credit_report.csv';
    a.click();
  }

  async function init(ctx) {
    state.user = ctx && ctx.user ? ctx.user : null;
    if (state.initialized) return;
    state.initialized = true;

    state.schools = await fetchSchools();
    fillSchoolSelectors();

    var btnCreateSchool = document.getElementById('btnCreateSchool');
    if (btnCreateSchool) btnCreateSchool.onclick = createSchool;
    var btnApi = document.getElementById('btnSaveApiKeys');
    if (btnApi) btnApi.onclick = function() { saveApiKeys().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnModels = document.getElementById('btnSaveAiModels');
    if (btnModels) btnModels.onclick = function() { saveAiModels().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnLimits = document.getElementById('btnSaveDailyLimits');
    if (btnLimits) btnLimits.onclick = function() { saveDailyLimits().catch(function(e) { toast(e.message, 'danger'); }); };
    var btnCreateAdmin = document.getElementById('btnCreateAdminUser');
    if (btnCreateAdmin) btnCreateAdmin.onclick = createAdminTeacher;
    var filterAdmins = document.getElementById('adminsSchoolFilter');
    if (filterAdmins) filterAdmins.onchange = loadAdminsSection;
    var btnExport = document.getElementById('btnExportCreditReport');
    if (btnExport) btnExport.onclick = exportCreditReport;

    await loadDashboard();
  }

  window.InstitutionsModule = {
    init: init,
    loadDashboard: loadDashboard,
    loadList: loadList,
    loadEconomy: loadEconomy,
    loadAiConfig: loadAiConfig,
    loadAdminsSection: loadAdminsSection,
    manageSchool: openManageSchool,
    openPlanFeatures: openPlanFeatures,
    suspend: toggleSuspend,
    deleteSchool: deleteSchool,
    editProfile: editProfile,
    lockProfile: lockProfile,
    deleteProfile: deleteProfile,
    coinAdd: function(id, inputId) { return updateCoinPool(id, 'add', inputId); },
    coinRemove: function(id, inputId) { return updateCoinPool(id, 'remove', inputId); },
    aiAdd: function(id, inputId) { return updateAiPool(id, 'add', inputId); },
    aiRemove: function(id, inputId) { return updateAiPool(id, 'remove', inputId); },
    aiReset: function(id) { return updateAiPool(id, 'reset', ''); },
    exportCreditReport: exportCreditReport
  };
})();
