(function() {
  var state = { page: 0, pageSize: 50, total: 0, user: null, role: null, rows: [], selected: {}, adminMode: false };
  var PROFILE_SELECT = 'id,nombre_completo,documento_id,pin,rol,grupo,monedas,is_active,account_locked,institution_id,last_login_at,teacher_credits,force_password_reset';

  function esc(v) { return UI.escapeHtml(v == null ? '' : String(v)); }
  function isAdminMode() { return !!state.adminMode; }
  function schoolId() {
    if (isAdminMode()) return String((state.user && state.user.institution_id) || '');
    var s = document.getElementById('usersSchoolSelect');
    return s ? String(s.value || '') : '';
  }

  async function logAudit(action, targetType, targetId, metadata) {
    // NOTE: audit_logs schema differs across migrations.
    // - legacy: (user_id, institution_id, action_type, result, metadata, ip_address, created_at)
    // - new:    (user_id, user_name, action, target_type, target_id, metadata, ip_address, created_at)
    // Avoid spamming the console with 400s by caching the working mode.
    if (window.__auditModeUsers == null) window.__auditModeUsers = 'legacy';
    try {
      var payloadNew = {
        user_id: state.user && state.user.id ? state.user.id : null,
        user_name: state.user && state.user.nombre_completo ? state.user.nombre_completo : null,
        action: action,
        target_type: targetType || null,
        target_id: targetId == null ? null : String(targetId),
        metadata: metadata || {},
        ip_address: 'client-ip-unknown',
        created_at: new Date().toISOString()
      };
      var payloadLegacy = {
        user_id: state.user && state.user.id ? state.user.id : null,
        institution_id: (state.user && state.user.institution_id) ? state.user.institution_id : null,
        action_type: action,
        result: 'SUCCESS',
        metadata: Object.assign({}, metadata || {}, { target_type: targetType || null, target_id: targetId == null ? null : String(targetId) }),
        ip_address: 'client-ip-unknown',
        created_at: new Date().toISOString()
      };

      var mode = window.__auditModeUsers;
      var ins;
      if (mode === 'new') ins = await supabaseClient.from('audit_logs').insert([payloadNew]);
      else ins = await supabaseClient.from('audit_logs').insert([payloadLegacy]);

      if (ins && ins.error) {
        var msg = String(ins.error.message || '').toLowerCase();
        var looksLikeNew = msg.includes('action_type') || msg.includes('result') || msg.includes('institution_id');
        var looksLikeLegacy = msg.includes('action') || msg.includes('target_type') || msg.includes('user_name');
        if (mode !== 'new' && looksLikeNew) {
          window.__auditModeUsers = 'new';
          await supabaseClient.from('audit_logs').insert([payloadNew]);
        } else if (mode !== 'legacy' && looksLikeLegacy) {
          window.__auditModeUsers = 'legacy';
          await supabaseClient.from('audit_logs').insert([payloadLegacy]);
        }
      }
    } catch (_) {}
  }

  function selectedIds() {
    return Object.keys(state.selected).filter(function(k) { return !!state.selected[k]; });
  }

  async function loadSchoolStats() {
    var sid = schoolId();
    var out = document.getElementById('usersSchoolStats');
    if (!out) return;
    if (!sid) { out.textContent = 'Select a school to load users.'; return; }
    var roles = ['admin', 'teacher', 'student'];
    var c = {};
    for (var i = 0; i < roles.length; i += 1) {
      var r = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('institution_id', sid).eq('is_active', true).eq('rol', roles[i]);
      c[roles[i]] = r.error ? 0 : (r.count || 0);
    }
    out.textContent = 'Total admins: ' + c.admin + ' | Total teachers: ' + c.teacher + ' | Total students: ' + c.student;
  }

  async function loadGroupFilter() {
    var sid = schoolId();
    var sel = document.getElementById('adminGroupFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">All groups</option>';
    sel.disabled = !sid;
    if (!sid) return;
    var r = await supabaseClient.from(CONFIG.tables.groups).select('group_code').eq('institution_id', sid).order('group_code');
    if (r.error) return;
    (r.data || []).forEach(function(g) { var o = document.createElement('option'); o.value = g.group_code; o.textContent = g.group_code; sel.appendChild(o); });
  }

  function applyCommonFilters(q, forCount) {
    var sid = schoolId();
    var role = (document.getElementById('usersRoleFilter') || {}).value || '';
    var text = String((document.getElementById('studentSearch') || {}).value || '').trim();
    var doc = String((document.getElementById('usersDocExact') || {}).value || '').trim();
    var group = String((document.getElementById('adminGroupFilter') || {}).value || '').trim();
    if (sid) q = q.eq('institution_id', sid);
    if (role) q = q.eq('rol', role);
    if (group) q = q.eq('grupo', group);
    if (doc) q = q.eq('documento_id', doc);
    else if (text) q = q.or('nombre_completo.ilike.%' + text + '%,documento_id.ilike.%' + text + '%');
    if (!forCount) {
      var from = state.page * 50;
      q = q.range(from, from + 49);
    }
    return q;
  }

  async function countRows() {
    var q = supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('is_active', true);
    var r = await applyCommonFilters(q, true);
    return r.error ? 0 : (r.count || 0);
  }

  async function fetchRows() {
    var q = supabaseClient.from(CONFIG.tables.profiles)
      .select(PROFILE_SELECT)
      .eq('is_active', true)
      .order('nombre_completo', { ascending: true });
    var r = await applyCommonFilters(q, false);
    if (r.error) throw r.error;
    return r.data || [];
  }

  function renderPagination() {
    var el = document.getElementById('usersPagination');
    if (!el) return;
    var pages = Math.max(1, Math.ceil(state.total / 50));
    el.innerHTML = '<button class="btn btn-sm btn-outline-secondary" id="usersPrev">Anterior</button> <span class="small">Pagina ' + (state.page + 1) + ' de ' + pages + '</span> <button class="btn btn-sm btn-outline-secondary" id="usersNext">Siguiente</button>';
    document.getElementById('usersPrev').disabled = state.page <= 0;
    document.getElementById('usersNext').disabled = state.page >= pages - 1;
    document.getElementById('usersPrev').onclick = function() { if (state.page > 0) { state.page -= 1; refresh(); } };
    document.getElementById('usersNext').onclick = function() { if (state.page < pages - 1) { state.page += 1; refresh(); } };
  }

  function roleBadge(rol) {
    var t = rol === 'super_admin' ? 'danger' : (rol === 'admin' ? 'warning' : (rol === 'teacher' ? 'info' : 'secondary'));
    return '<span class="badge text-bg-' + t + '">' + esc(rol) + '</span>';
  }

  function renderRows(rows) {
    var el = document.getElementById('contentUsers');
    if (!el) return;
    if (!schoolId()) { el.innerHTML = '<div class="empty-state">Select a school and click Load Users.</div>'; return; }
    if (!rows.length) { el.innerHTML = '<div class="empty-state">No users found.</div>'; return; }

    // School admin UX: manage students only (no bulk destructive actions).
    if (isAdminMode()) {
      el.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Name</th><th>Document</th><th>PIN</th><th>Group</th><th>Coins</th><th>Last Login</th><th>Actions</th></tr></thead><tbody>' +
        rows.map(function(u) {
          return '<tr><td>' + esc(u.nombre_completo) + '</td><td>' + esc(u.documento_id) + '</td>' +
            '<td><span id="pin_' + esc(u.id) + '">••••</span> <button class="btn btn-sm btn-link" onclick="UsersModule.togglePin(\'' + esc(u.id) + '\',\'' + esc(u.pin || '') + '\')"><i class="bi bi-eye"></i></button></td>' +
            '<td>' + esc(u.grupo || '-') + '</td>' +
            '<td>' + esc(u.monedas || 0) + '</td>' +
            '<td>' + esc(u.last_login_at || '-') + '</td>' +
            '<td class="d-flex gap-1 flex-wrap">' +
              '<button class="btn btn-sm btn-outline-primary" onclick="UsersModule.openEditModal(\'' + esc(u.id) + '\')">Edit</button>' +
              '<button class="btn btn-sm btn-outline-warning" onclick="UsersModule.adjustCoins(\'' + esc(u.id) + '\')">+/- Coins</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table></div>';
      return;
    }

    el.innerHTML = '<div class="mb-2 d-flex gap-2 flex-wrap"><button class="btn btn-sm btn-outline-secondary" id="usersSelectPage">Select page</button><button class="btn btn-sm btn-outline-danger" id="usersDeleteSelected">Delete Selected</button><button class="btn btn-sm btn-outline-primary" id="usersMoveSelectedGroup">Move Selected to Group</button><button class="btn btn-sm btn-outline-success" id="usersExportCsv">Export CSV</button><button class="btn btn-sm btn-primary" id="btnCreateUser">Create User</button></div>' +
      '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th><input id="usersCheckAll" type="checkbox"></th><th>Name</th><th>Document</th><th>PIN</th><th>Role</th><th>Group</th><th>Coins</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
      rows.map(function(u) {
        return '<tr><td><input type="checkbox" class="user-check" data-id="' + esc(u.id) + '"></td><td>' + esc(u.nombre_completo) + '</td><td>' + esc(u.documento_id) + '</td><td><span id="pin_' + esc(u.id) + '">••••</span> <button class="btn btn-sm btn-link" onclick="UsersModule.togglePin(\'' + esc(u.id) + '\',\'' + esc(u.pin || '') + '\')"><i class="bi bi-eye"></i></button></td><td>' + roleBadge(u.rol) + '</td><td>' + esc(u.grupo || '-') + '</td><td>' + esc(u.monedas || 0) + '</td><td>' + esc(u.last_login_at || '-') + '</td><td>' + (u.account_locked ? 'blocked' : 'active') + '</td><td class="d-flex gap-1 flex-wrap"><button class="btn btn-sm btn-outline-primary" onclick="UsersModule.openEditModal(\'' + esc(u.id) + '\')">Edit</button><button class="btn btn-sm btn-outline-secondary" onclick="UsersModule.toggleLock(\'' + esc(u.id) + '\',' + (!u.account_locked) + ')">' + (u.account_locked ? 'Unlock' : 'Lock') + '</button><button class="btn btn-sm btn-outline-info" onclick="UsersModule.forcePinReset(\'' + esc(u.id) + '\')">Force PIN Reset</button><button class="btn btn-sm btn-outline-dark" onclick="UsersModule.moveToSchool(\'' + esc(u.id) + '\')">Move School</button><button class="btn btn-sm btn-outline-danger" onclick="UsersModule.softDelete(\'' + esc(u.id) + '\')">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    bindBulkHandlers();
  }

  async function fetchAdminTeacherRows() {
    var sid = schoolId();
    if (!sid) return [];

    var teachersRes = await supabaseClient
      .from(CONFIG.tables.profiles)
      .select('id,nombre_completo,rol,grupo,monedas,pin,teacher_credits,institution_id')
      .eq('institution_id', sid)
      .eq('rol', 'teacher')
      .eq('is_active', true)
      .order('nombre_completo', { ascending: true });
    if (teachersRes.error) throw teachersRes.error;

    var teachers = teachersRes.data || [];
    if (!teachers.length) return [];

    var groupCodes = teachers.map(function(t) { return String(t.grupo || '').trim(); }).filter(Boolean);
    var studentsByGroup = {};
    var coinsByGroup = {};
    var activeChallengesByGroup = {};
    var activeAllCount = 0;

    if (groupCodes.length) {
      var studentRes = await supabaseClient
        .from(CONFIG.tables.profiles)
        .select('grupo,monedas')
        .eq('institution_id', sid)
        .eq('rol', 'student')
        .eq('is_active', true)
        .in('grupo', groupCodes);
      if (!studentRes.error) {
        (studentRes.data || []).forEach(function(s) {
          var gc = String(s.grupo || '');
          studentsByGroup[gc] = (studentsByGroup[gc] || 0) + 1;
          coinsByGroup[gc] = (coinsByGroup[gc] || 0) + (Number(s.monedas) || 0);
        });
      }

      var chalRes = await supabaseClient
        .from(CONFIG.tables.challenges)
        .select('target_group,status')
        .eq('status', 'active')
        .in('target_group', groupCodes);
      if (!chalRes.error) {
        (chalRes.data || []).forEach(function(c) {
          var tg = String(c.target_group || '');
          activeChallengesByGroup[tg] = (activeChallengesByGroup[tg] || 0) + 1;
        });
      }
    }

    var allRes = await supabaseClient
      .from(CONFIG.tables.challenges)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('target_group', 'all');
    if (!allRes.error) activeAllCount = Number(allRes.count) || 0;

    return teachers.map(function(t) {
      var gc = String(t.grupo || '');
      return {
        id: t.id,
        nombre_completo: t.nombre_completo,
        rol: t.rol,
        grupo: gc,
        monedas: t.monedas,
        pin: t.pin,
        teacher_credits: Number(t.teacher_credits) || 0,
        student_count: studentsByGroup[gc] || 0,
        active_challenges_count: (activeChallengesByGroup[gc] || 0) + activeAllCount,
        coins_in_circulation: coinsByGroup[gc] || 0
      };
    });
  }

  function renderAdminTeacherRows(rows) {
    var el = document.getElementById('contentUsers');
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<div class="empty-state">No teachers found for your school.</div>';
      return;
    }

    el.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th>Name</th><th>Group assigned</th><th>Student count</th><th>Active challenges</th><th>Coins in circulation</th><th>Actions</th></tr></thead><tbody>' +
      rows.map(function(t) {
        return '<tr>' +
          '<td><strong>' + esc(t.nombre_completo || '-') + '</strong></td>' +
          '<td><span class="badge bg-primary-subtle text-primary-emphasis">' + esc(t.grupo || '-') + '</span></td>' +
          '<td>' + Number(t.student_count || 0) + '</td>' +
          '<td>' + Number(t.active_challenges_count || 0) + '</td>' +
          '<td>' + Number(t.coins_in_circulation || 0) + '</td>' +
          '<td class="d-flex gap-1 flex-wrap">' +
          '<button class="btn btn-sm btn-outline-primary" onclick="UsersModule.editTeacherPin(\'' + esc(t.id) + '\')">Edit PIN</button>' +
          '<button class="btn btn-sm btn-outline-secondary" onclick="UsersModule.changeTeacherGroup(\'' + esc(t.id) + '\',\'' + esc(t.grupo || '') + '\')">Change group</button>' +
          '<button class="btn btn-sm btn-outline-warning" onclick="UsersModule.adjustTeacherPocket(\'' + esc(t.id) + '\')">Add/remove coins</button>' +
          '<button class="btn btn-sm btn-outline-success" onclick="UsersModule.setTeacherAiCredits(\'' + esc(t.id) + '\',' + Number(t.teacher_credits || 0) + ')">Set AI challenge credits</button>' +
          '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function bindBulkHandlers() {
    state.selected = {};
    var all = document.getElementById('usersCheckAll');
    if (all) all.onchange = function() { document.querySelectorAll('.user-check').forEach(function(c) { c.checked = all.checked; state.selected[c.dataset.id] = all.checked; }); };
    document.querySelectorAll('.user-check').forEach(function(c) { c.onchange = function() { state.selected[c.dataset.id] = c.checked; }; });
    var sp = document.getElementById('usersSelectPage'); if (sp) sp.onclick = function() { document.querySelectorAll('.user-check').forEach(function(c) { c.checked = true; state.selected[c.dataset.id] = true; }); if (all) all.checked = true; };
    var bd = document.getElementById('usersDeleteSelected'); if (bd) bd.onclick = bulkDelete;
    var bm = document.getElementById('usersMoveSelectedGroup'); if (bm) bm.onclick = bulkMoveGroup;
    var bc = document.getElementById('usersExportCsv'); if (bc) bc.onclick = exportCsv;
    var cu = document.getElementById('btnCreateUser'); if (cu) cu.onclick = createUser;
  }

  async function refresh() {
    var host = document.getElementById('contentUsers');
    if (!host) return;
    if (!schoolId()) {
      host.innerHTML = '<div class="empty-state">Select a school and click Load Users.</div>';
      var pag = document.getElementById('usersPagination');
      if (pag) pag.innerHTML = '';
      return;
    }

    host.innerHTML = UI.renderSpinner('Loading users...');
    state.total = await countRows();
    state.rows = await fetchRows();
    renderRows(state.rows);
    renderPagination();
  }

  function togglePin(id, pin) { var el = document.getElementById('pin_' + id); if (el) el.textContent = el.textContent === '••••' ? pin : '••••'; }

  function getById(id) { return (state.rows || []).find(function(r) { return String(r.id) === String(id); }); }

  async function openEditModal(id) {
    var u = getById(id); if (!u) return;
    var name = prompt('Name', u.nombre_completo || ''); if (name == null) return;
    var doc = prompt('Document', u.documento_id || ''); if (doc == null) return;
    var pin = prompt('PIN (blank=keep)', ''); if (pin == null) return;

    // School admin: students only (no role or active toggles here)
    var grupo = prompt('Group', u.grupo || ''); if (grupo == null) return;
    var payload = { nombre_completo: String(name).trim(), documento_id: String(doc).trim(), grupo: String(grupo).trim() || null, institution_id: schoolId() };
    if (!isAdminMode()) {
      var rol = prompt('Role student/teacher/admin/super_admin', u.rol || 'student'); if (rol == null) return;
      var active = prompt('Active? yes/no', 'yes'); if (active == null) return;
      payload.rol = String(rol).trim().toLowerCase();
      payload.is_active = String(active).toLowerCase() !== 'no';
    }
    if (String(pin || '').trim()) payload.pin = String(pin).trim();
    var r = await supabaseClient.from(CONFIG.tables.profiles).update(payload).eq('id', id);
    if (r.error) return UI.showToast(r.error.message, 'danger');
    await logAudit('EDIT_USER', 'profile', id, payload);
    refresh();
  }

  async function adjustCoins(id) { var u = getById(id); var amount = Number(prompt('Amount (+/-)', '10') || 0); if (!amount) return; var next = Math.max(0, Number(u.monedas || 0) + amount); var r = await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: next }).eq('id', id); if (r.error) return UI.showToast(r.error.message, 'danger'); refresh(); }
  async function editTeacherPin(id) {
    var pin = prompt('New PIN (4-12 digits)', '');
    if (pin == null) return;
    pin = String(pin || '').trim();
    if (!/^\d{4,12}$/.test(pin)) return UI.showToast('Invalid PIN format', 'warning');
    var r = await supabaseClient.from(CONFIG.tables.profiles).update({ pin: pin }).eq('id', id).eq('institution_id', schoolId()).eq('rol', 'teacher');
    if (r.error) return UI.showToast(r.error.message, 'danger');
    await logAudit('EDIT_TEACHER_PIN', 'profile', id, { institution_id: schoolId() });
    refresh();
  }

  async function changeTeacherGroup(id, currentGroup) {
    var nextGroup = prompt('New group code', String(currentGroup || ''));
    if (nextGroup == null) return;
    nextGroup = String(nextGroup || '').trim();
    var r = await supabaseClient.from(CONFIG.tables.profiles).update({ grupo: nextGroup || null }).eq('id', id).eq('institution_id', schoolId()).eq('rol', 'teacher');
    if (r.error) return UI.showToast(r.error.message, 'danger');
    try {
      await supabaseClient.from(CONFIG.tables.teacher_groups).delete().eq('teacher_id', id);
      if (nextGroup) {
        await supabaseClient.from(CONFIG.tables.teacher_groups).insert([{ teacher_id: id, group_code: nextGroup }]);
      }
    } catch (_) {}
    await logAudit('CHANGE_TEACHER_GROUP', 'profile', id, { group: nextGroup || null });
    refresh();
  }

  async function adjustTeacherPocket(id) {
    var amount = Number(prompt('Adjust teacher coin pocket (+/-)', '10') || 0);
    if (!amount) return;
    var read = await supabaseClient.from(CONFIG.tables.profiles).select('coin_pocket,monedas').eq('id', id).eq('institution_id', schoolId()).eq('rol', 'teacher').maybeSingle();
    if (read.error && !(typeof isMissingColumnError === 'function' && isMissingColumnError(read.error, 'coin_pocket', CONFIG.tables.profiles))) {
      return UI.showToast(read.error.message, 'danger');
    }
    var current = 0;
    if (!read.error && read.data) current = Number(read.data.coin_pocket) || 0;
    else if (read.data) current = Number(read.data.monedas) || 0;
    var next = Math.max(0, current + amount);
    var upd = await supabaseClient.from(CONFIG.tables.profiles).update({ coin_pocket: next }).eq('id', id).eq('institution_id', schoolId()).eq('rol', 'teacher');
    if (upd.error && typeof isMissingColumnError === 'function' && isMissingColumnError(upd.error, 'coin_pocket', CONFIG.tables.profiles)) {
      upd = await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: next }).eq('id', id).eq('institution_id', schoolId()).eq('rol', 'teacher');
    }
    if (upd.error) return UI.showToast(upd.error.message, 'danger');
    await logAudit('ADJUST_TEACHER_POCKET', 'profile', id, { delta: amount, new_value: next });
    refresh();
  }

  async function setTeacherAiCredits(id, currentCredits) {
    var value = prompt('Set AI challenge credits', String(Number(currentCredits || 0)));
    if (value == null) return;
    var credits = Math.max(0, Math.floor(Number(value) || 0));
    var r = await supabaseClient.from(CONFIG.tables.profiles).update({ teacher_credits: credits }).eq('id', id).eq('institution_id', schoolId()).eq('rol', 'teacher');
    if (r.error && !(typeof isMissingColumnError === 'function' && isMissingColumnError(r.error, 'teacher_credits', CONFIG.tables.profiles))) {
      return UI.showToast(r.error.message, 'danger');
    }
    await logAudit('SET_TEACHER_AI_CREDITS', 'profile', id, { teacher_credits: credits });
    refresh();
  }
  async function toggleLock(id, next) { var r = await supabaseClient.from(CONFIG.tables.profiles).update({ account_locked: !!next }).eq('id', id); if (r.error) return UI.showToast(r.error.message, 'danger'); await logAudit('LOCK_USER', 'profile', id, { account_locked: !!next }); refresh(); }
  async function forcePinReset(id) { var r = await supabaseClient.from(CONFIG.tables.profiles).update({ force_password_reset: true }).eq('id', id); if (r.error) return UI.showToast(r.error.message, 'danger'); refresh(); }
  async function moveToSchool(id) { var target = prompt('Target school UUID'); if (target == null) return; target = String(target || '').trim(); if (!target) return; var r = await supabaseClient.from(CONFIG.tables.profiles).update({ institution_id: target }).eq('id', id); if (r.error) return UI.showToast(r.error.message, 'danger'); refresh(); }
  async function softDelete(id) { if (!confirm('Soft delete this user?')) return; var r = await supabaseClient.from(CONFIG.tables.profiles).update({ is_active: false }).eq('id', id); if (r.error) return UI.showToast(r.error.message, 'danger'); await logAudit('DELETE_USER', 'profile', id, { is_active: false }); refresh(); }

  async function bulkDelete() { var ids = selectedIds(); if (!ids.length) return UI.showToast('No users selected', 'warning'); if (!confirm('Soft delete selected users?')) return; var r = await supabaseClient.from(CONFIG.tables.profiles).update({ is_active: false }).in('id', ids); if (r.error) return UI.showToast(r.error.message, 'danger'); await logAudit('DELETE_USER', 'profile', 'bulk', { ids: ids, is_active: false }); refresh(); }
  async function bulkMoveGroup() { var ids = selectedIds(); if (!ids.length) return UI.showToast('No users selected', 'warning'); var g = prompt('Target group'); if (g == null) return; var r = await supabaseClient.from(CONFIG.tables.profiles).update({ grupo: String(g || '').trim() || null }).in('id', ids); if (r.error) return UI.showToast(r.error.message, 'danger'); refresh(); }
  function exportCsv() { var lines = ['nombre_completo,documento_id,pin,rol,grupo,monedas,last_login_at,status']; state.rows.forEach(function(u) { lines.push('"' + String(u.nombre_completo || '').replace(/"/g, '""') + '","' + String(u.documento_id || '').replace(/"/g, '""') + '","' + String(u.pin || '').replace(/"/g, '""') + '",' + (u.rol || '') + ',"' + String(u.grupo || '').replace(/"/g, '""') + '",' + Number(u.monedas || 0) + ',"' + String(u.last_login_at || '') + '",' + (u.account_locked ? 'blocked' : 'active')); }); var b = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'users_export.csv'; a.click(); logAudit('EXPORT_DATA', 'profiles', 'users_export.csv', { count: state.rows.length }); }
  async function createUser() {
    var sid = schoolId();
    if (!sid) return UI.showToast('Select school first', 'warning');
    var n = prompt('Full name'); if (n == null) return;
    var d = prompt('Document ID'); if (d == null) return;
    var p = prompt('PIN'); if (p == null) return;
    var r = isAdminMode() ? 'student' : prompt('Role student/teacher/admin', 'student');
    if (r == null) return;
    var g = prompt('Group (optional)', ''); if (g == null) return;
    var ins = await supabaseClient.from(CONFIG.tables.profiles).insert([{
      nombre_completo: String(n).trim(),
      documento_id: String(d).trim(),
      pin: String(p).trim(),
      rol: String(r).trim().toLowerCase(),
      grupo: String(g).trim() || null,
      institution_id: sid,
      monedas: 0,
      current_streak: 0,
      is_active: true
    }]);
    if (ins.error) return UI.showToast(ins.error.message, 'danger');
    refresh();
  }

  function bindEvents() {
    var loadBtn = document.getElementById('btnLoadUsersBySchool'); if (loadBtn) loadBtn.onclick = function() { state.page = 0; loadGroupFilter().then(loadSchoolStats).then(refresh); };
    var refreshBtn = document.getElementById('btnRefreshUsers'); if (refreshBtn) refreshBtn.onclick = function() { state.page = 0; refresh(); };
    var school = document.getElementById('usersSchoolSelect'); if (school) school.onchange = function() {
      state.page = 0;
      state.selected = {};
      var groupSel = document.getElementById('adminGroupFilter');
      var roleSel = document.getElementById('usersRoleFilter');
      var search = document.getElementById('studentSearch');
      var exact = document.getElementById('usersDocExact');
      if (groupSel) groupSel.value = '';
      if (roleSel) roleSel.value = '';
      if (search) search.value = '';
      if (exact) exact.value = '';
      loadGroupFilter().then(loadSchoolStats).then(refresh);
    };
    var search = document.getElementById('studentSearch'); if (search) search.oninput = function() { state.page = 0; refresh(); };
    var exact = document.getElementById('usersDocExact'); if (exact) exact.oninput = function() { state.page = 0; refresh(); };
    var role = document.getElementById('usersRoleFilter'); if (role) role.onchange = function() { state.page = 0; refresh(); };
    var group = document.getElementById('adminGroupFilter'); if (group) group.onchange = function() { state.page = 0; refresh(); };
  }

  async function init(opts) {
    state.user = opts.user;
    state.role = opts.role;
    state.adminMode = String(state.role || '') === 'admin';
    bindEvents();
    if (state.adminMode) {
      var sid = schoolId();
      var schoolSel = document.getElementById('usersSchoolSelect');
      if (schoolSel && sid) {
        schoolSel.innerHTML = '<option value="' + esc(sid) + '">My institution</option>';
        schoolSel.value = sid;
        schoolSel.disabled = true;
      }
      var loadBtn = document.getElementById('btnLoadUsersBySchool');
      if (loadBtn) loadBtn.style.display = 'none';
      var roleSel = document.getElementById('usersRoleFilter');
      if (roleSel) {
        roleSel.value = 'student';
        roleSel.disabled = true;
      }
      var groupSel = document.getElementById('adminGroupFilter');
      if (groupSel) groupSel.disabled = false;
      loadGroupFilter().then(loadSchoolStats).then(refresh);
      return;
    }
    loadGroupFilter();
  }

  window.UsersModule = {
    init: init,
    refresh: refresh,
    togglePin: togglePin,
    openEditModal: openEditModal,
    adjustCoins: adjustCoins,
    editTeacherPin: editTeacherPin,
    changeTeacherGroup: changeTeacherGroup,
    adjustTeacherPocket: adjustTeacherPocket,
    setTeacherAiCredits: setTeacherAiCredits,
    toggleLock: toggleLock,
    forcePinReset: forcePinReset,
    moveToSchool: moveToSchool,
    softDelete: softDelete,
    loadSchoolStats: loadSchoolStats,
    loadGroupFilter: loadGroupFilter
  };
})();
