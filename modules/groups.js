(function() {
  var state = { user: null, schoolId: '', expanded: {} };
  var PROFILE_SELECT = 'id,nombre_completo,documento_id,pin,rol,grupo,monedas,is_active,account_locked,institution_id,last_login_at,teacher_credits,force_password_reset';

  function esc(v) { return UI.escapeHtml(v == null ? '' : String(v)); }

  async function logAudit(action, targetType, targetId, metadata) {
    if (window.__auditModeGroups == null) window.__auditModeGroups = 'legacy';
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
        institution_id: state.user && state.user.institution_id ? state.user.institution_id : null,
        action_type: action,
        result: 'SUCCESS',
        metadata: Object.assign({}, metadata || {}, { target_type: targetType || null, target_id: targetId == null ? null : String(targetId) }),
        ip_address: 'client-ip-unknown',
        created_at: new Date().toISOString()
      };

      var mode = window.__auditModeGroups;
      var ins = (mode === 'new')
        ? await supabaseClient.from('audit_logs').insert([payloadNew])
        : await supabaseClient.from('audit_logs').insert([payloadLegacy]);

      if (ins && ins.error) {
        var msg = String(ins.error.message || '').toLowerCase();
        var looksLikeNew = msg.includes('action_type') || msg.includes('result') || msg.includes('institution_id');
        var looksLikeLegacy = msg.includes('action') || msg.includes('target_type') || msg.includes('user_name');
        if (mode !== 'new' && looksLikeNew) {
          window.__auditModeGroups = 'new';
          await supabaseClient.from('audit_logs').insert([payloadNew]);
        } else if (mode !== 'legacy' && looksLikeLegacy) {
          window.__auditModeGroups = 'legacy';
          await supabaseClient.from('audit_logs').insert([payloadLegacy]);
        }
      }
    } catch (_) {}
  }

  function selectedSchoolId() {
    var s = document.getElementById('groupsSchoolSelect');
    return s ? String(s.value || '') : '';
  }

  function toggleGroupRow(groupCode) {
    var key = String(groupCode || '');
    if (!key) return;
    state.expanded[key] = !state.expanded[key];
    var el = document.getElementById('group_detail_' + key);
    if (el) el.style.display = state.expanded[key] ? '' : 'none';
  }

  async function loadTeachersBySchool(schoolId) {
    if (!schoolId) return [];
    var res = await supabaseClient.from(CONFIG.tables.profiles).select(PROFILE_SELECT).eq('rol', 'teacher').eq('institution_id', schoolId).eq('is_active', true).order('nombre_completo');
    return res.error ? [] : (res.data || []);
  }

  async function loadList() {
    var schoolId = selectedSchoolId();
    var el = document.getElementById('groupsList');
    if (!el) return;
    if (!schoolId) {
      el.innerHTML = '<div class="empty-state">Select a school and click Load Groups.</div>';
      return;
    }
    el.innerHTML = UI.renderSpinner('Loading groups...');

    // Some schemas don't have max_capacity (or capacity). Avoid breaking the entire Groups view.
    var groupsRes = await supabaseClient
      .from(CONFIG.tables.groups)
      .select('id,group_code,institution_id,max_capacity,capacity,last_admin_lat,last_admin_lng')
      .eq('institution_id', schoolId)
      .order('group_code');
    if (groupsRes.error && typeof isMissingColumnError === 'function' &&
        isMissingColumnError(groupsRes.error, 'max_capacity', CONFIG.tables.groups)) {
      groupsRes = await supabaseClient
        .from(CONFIG.tables.groups)
        .select('id,group_code,institution_id,capacity,last_admin_lat,last_admin_lng')
        .eq('institution_id', schoolId)
        .order('group_code');
    }
    if (groupsRes.error && typeof isMissingColumnError === 'function' &&
        isMissingColumnError(groupsRes.error, 'capacity', CONFIG.tables.groups)) {
      groupsRes = await supabaseClient
        .from(CONFIG.tables.groups)
        .select('id,group_code,institution_id,last_admin_lat,last_admin_lng')
        .eq('institution_id', schoolId)
        .order('group_code');
    }
    if (groupsRes.error) {
      el.innerHTML = '<div class="alert alert-danger">' + esc(groupsRes.error.message) + '</div>';
      return;
    }
    var groups = groupsRes.data || [];
    if (!groups.length) { el.innerHTML = '<p class="text-muted small">No groups found.</p>'; return; }

    var codes = groups.map(function(g) { return g.group_code; });
    var tMap = {};
    var sCount = {};
    var sRowsByGroup = {};
    if (codes.length) {
      var tRes = await supabaseClient.from(CONFIG.tables.teacher_groups).select('group_code,teacher_id').in('group_code', codes);
      var teacherIds = [];
      if (!tRes.error) {
        (tRes.data || []).forEach(function(x) { tMap[x.group_code] = x.teacher_id; teacherIds.push(x.teacher_id); });
      }
      var teacherNames = {};
      if (teacherIds.length) {
        var tr = await supabaseClient.from(CONFIG.tables.profiles).select(PROFILE_SELECT).in('id', teacherIds);
        if (!tr.error) (tr.data || []).forEach(function(t) { teacherNames[t.id] = t.nombre_completo; });
      }
      Object.keys(tMap).forEach(function(gc) { tMap[gc] = teacherNames[tMap[gc]] || '-'; });
      var stu = await supabaseClient.from(CONFIG.tables.profiles).select(PROFILE_SELECT).eq('rol', 'student').eq('is_active', true).eq('institution_id', schoolId).in('grupo', codes);
      if (!stu.error) {
        (stu.data || []).forEach(function(r) {
          var k = r.grupo || '';
          sCount[k] = (sCount[k] || 0) + 1;
          if (!sRowsByGroup[k]) sRowsByGroup[k] = [];
          sRowsByGroup[k].push(r);
        });
      }
    }

    var html = '<div class="mb-2"><button class="btn btn-sm btn-primary" id="btnCreateGroupModal">Create Group</button></div>' +
      '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr><th style="width:40px;"></th><th>Group code</th><th>Teacher</th><th>Students</th><th>Capacity</th><th>GPS</th><th>Actions</th></tr></thead><tbody>';
    groups.forEach(function(g) {
      var gCode = String(g.group_code || '');
      var expanded = !!state.expanded[gCode];
      var gps = (g.last_admin_lat != null && g.last_admin_lng != null) ? '✅' : '❌';
      var stuN = sCount[gCode] || 0;
      var canDelete = stuN === 0;
      var capDisplay = (g.max_capacity != null) ? g.max_capacity : ((g.capacity != null) ? g.capacity : '-');
      var topStudents = (sRowsByGroup[gCode] || []).slice().sort(function(a, b) {
        return String(a.nombre_completo || '').localeCompare(String(b.nombre_completo || ''));
      }).slice(0, 5);
      var detail = topStudents.length ? '<div class="admin-table-wrap mt-2"><table class="table table-sm mb-0"><thead><tr><th>Name</th><th>Document</th><th>Coins</th><th>Last login</th></tr></thead><tbody>' + topStudents.map(function(st) {
        return '<tr><td>' + esc(st.nombre_completo || '-') + '</td><td>' + esc(st.documento_id || '-') + '</td><td>' + Number(st.monedas || 0) + '</td><td>' + esc(st.last_login_at || '-') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="small text-muted">No students in this group.</div>';
      html += '<tr style="cursor:pointer;" onclick="GroupsModule.toggleGroupRow(\'' + esc(gCode) + '\')"><td><button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); GroupsModule.toggleGroupRow(\'' + esc(gCode) + '\')">' + (expanded ? '−' : '+') + '</button></td><td>' + esc(gCode) + '</td><td>' + esc(tMap[gCode] || '-') + '</td><td>' + stuN + '</td><td>' + esc(capDisplay) + '</td><td>' + gps + '</td><td class="d-flex gap-1 flex-wrap"><button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); GroupsModule.editGroup(\'' + esc(gCode) + '\')">Edit</button><button class="btn btn-sm btn-outline-info" onclick="event.stopPropagation(); GroupsModule.changeTeacher(\'' + esc(gCode) + '\')">Change Teacher</button><button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); GroupsModule.viewStudents(\'' + esc(gCode) + '\')">Ver todos</button>' + (canDelete ? '<button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); GroupsModule.deleteGroup(\'' + esc(gCode) + '\')">Delete</button>' : '<span class="small text-muted">Not empty</span>') + '</td></tr>';
      html += '<tr id="group_detail_' + esc(gCode) + '" style="display:' + (expanded ? '' : 'none') + ';"><td></td><td colspan="6">' + detail + '<button class="btn btn-sm btn-outline-secondary mt-2" onclick="GroupsModule.viewStudents(\'' + esc(gCode) + '\')">Ver todos</button></td></tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
    var c = document.getElementById('btnCreateGroupModal');
    if (c) c.onclick = createGroup;
  }

  async function updateTeacherMapping(groupCode, teacherId) {
    await supabaseClient.from(CONFIG.tables.teacher_groups).delete().eq('group_code', groupCode);
    if (!teacherId) return;
    await supabaseClient.from(CONFIG.tables.teacher_groups).insert([{ teacher_id: teacherId, group_code: groupCode }]);
  }

  function ensureChangeTeacherModal() {
    if (document.getElementById('groupTeacherModal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = '' +
      '<div class="modal fade" id="groupTeacherModal" tabindex="-1">' +
      '  <div class="modal-dialog"><div class="modal-content">' +
      '    <div class="modal-header"><h5 class="modal-title">Change Teacher</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '    <div class="modal-body">' +
      '      <input type="hidden" id="teacherGroupCode">' +
      '      <label class="form-label">Teacher</label>' +
      '      <select id="teacherGroupSelect" class="form-select"><option value="">Unassigned</option></select>' +
      '    </div>' +
      '    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn btn-primary" id="btnSaveTeacherGroup">Save</button></div>' +
      '  </div></div>' +
      '</div>';
    document.body.appendChild(wrap.firstChild);
    document.getElementById('btnSaveTeacherGroup').onclick = saveTeacherChange;
  }

  function ensureCreateGroupModal() {
    if (document.getElementById('groupCreateModal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = '' +
      '<div class="modal fade" id="groupCreateModal" tabindex="-1">' +
      '  <div class="modal-dialog"><div class="modal-content">' +
      '    <div class="modal-header"><h5 class="modal-title">Create Group</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '    <div class="modal-body">' +
      '      <div class="mb-2"><label class="form-label">Group code</label><input type="text" id="createGroupCode" class="form-control"></div>' +
      '      <div class="mb-2"><label class="form-label">Student limit</label><input type="number" id="createGroupCapacity" class="form-control" min="1" value="30"></div>' +
      '      <div class="mb-2"><label class="form-label">Latitude (optional)</label><input type="number" id="createGroupLat" class="form-control" step="any"></div>' +
      '      <div class="mb-2"><label class="form-label">Longitude (optional)</label><input type="number" id="createGroupLng" class="form-control" step="any"></div>' +
      '      <div class="mb-2"><label class="form-label">Teacher (optional)</label><select id="createGroupTeacher" class="form-select"><option value="">Unassigned</option></select></div>' +
      '    </div>' +
      '    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn btn-primary" id="btnSaveCreateGroup">Create</button></div>' +
      '  </div></div>' +
      '</div>';
    document.body.appendChild(wrap.firstChild);
    document.getElementById('btnSaveCreateGroup').onclick = saveCreateGroup;
  }

  async function editGroup(groupCode) {
    var schoolId = selectedSchoolId();
    // Try max_capacity first; fallback to capacity; fallback to no capacity column
    var one = await supabaseClient
      .from(CONFIG.tables.groups)
      .select('group_code,max_capacity,capacity,last_admin_lat,last_admin_lng')
      .eq('institution_id', schoolId)
      .eq('group_code', groupCode)
      .single();
    if (one.error && typeof isMissingColumnError === 'function' &&
        isMissingColumnError(one.error, 'capacity', CONFIG.tables.groups)) {
      one = await supabaseClient
        .from(CONFIG.tables.groups)
        .select('group_code,max_capacity,last_admin_lat,last_admin_lng')
        .eq('institution_id', schoolId)
        .eq('group_code', groupCode)
        .single();
    }
    if (one.error && typeof isMissingColumnError === 'function' &&
        isMissingColumnError(one.error, 'max_capacity', CONFIG.tables.groups)) {
      one = await supabaseClient
        .from(CONFIG.tables.groups)
        .select('group_code,capacity,last_admin_lat,last_admin_lng')
        .eq('institution_id', schoolId)
        .eq('group_code', groupCode)
        .single();
    }
    if (one.error && typeof isMissingColumnError === 'function' &&
        isMissingColumnError(one.error, 'capacity', CONFIG.tables.groups)) {
      one = await supabaseClient
        .from(CONFIG.tables.groups)
        .select('group_code,last_admin_lat,last_admin_lng')
        .eq('institution_id', schoolId)
        .eq('group_code', groupCode)
        .single();
    }
    if (one.error || !one.data) return UI.showToast('Group not found', 'danger');
    var row = one.data;
    var cap = row.max_capacity != null ? Number(row.max_capacity) : (row.capacity != null ? Number(row.capacity) : 30);
    document.getElementById('editGroupOldCode').value = row.group_code || '';
    document.getElementById('editGroupCode').value = row.group_code || '';
    document.getElementById('editGroupCapacity').value = cap;
    document.getElementById('editGroupLat').value = row.last_admin_lat == null ? '' : String(row.last_admin_lat);
    document.getElementById('editGroupLng').value = row.last_admin_lng == null ? '' : String(row.last_admin_lng);
    UI.showModal('groupEditModal');
  }

  async function saveEditGroup() {
    var oldCode = String((document.getElementById('editGroupOldCode') || {}).value || '').trim();
    var newCode = String((document.getElementById('editGroupCode') || {}).value || '').trim();
    var cap = Math.max(1, Number((document.getElementById('editGroupCapacity') || {}).value || 30));
    var latRaw = String((document.getElementById('editGroupLat') || {}).value || '').trim();
    var lngRaw = String((document.getElementById('editGroupLng') || {}).value || '').trim();
    if (!newCode) return UI.showToast('Group code is required', 'warning');
    // Use updateGroupSafe() from app.js — it handles max_capacity->capacity->no-capacity fallback
    // and propagates group_code rename across all related tables.
    if (typeof updateGroupSafe === 'function') {
      try {
        await updateGroupSafe(oldCode, {
          group_code: newCode,
          max_capacity: cap,
          last_admin_lat: latRaw ? Number(latRaw) : null,
          last_admin_lng: lngRaw ? Number(lngRaw) : null
        });
        UI.hideModal('groupEditModal');
        loadList();
      } catch (e) {
        UI.showToast(e.message || 'Save failed', 'danger');
      }
      return;
    }
    // Fallback: direct update with max_capacity->capacity chain
    var schoolId = selectedSchoolId();
    var baseFields = { group_code: newCode, last_admin_lat: latRaw ? Number(latRaw) : null, last_admin_lng: lngRaw ? Number(lngRaw) : null };
    var upd = await supabaseClient.from(CONFIG.tables.groups).update(Object.assign({}, baseFields, { max_capacity: cap })).eq('institution_id', schoolId).eq('group_code', oldCode);
    if (upd.error && typeof isMissingColumnError === 'function' && isMissingColumnError(upd.error, 'max_capacity', CONFIG.tables.groups)) {
      upd = await supabaseClient.from(CONFIG.tables.groups).update(Object.assign({}, baseFields, { capacity: cap })).eq('institution_id', schoolId).eq('group_code', oldCode);
    }
    if (upd.error && typeof isMissingColumnError === 'function' && isMissingColumnError(upd.error, 'capacity', CONFIG.tables.groups)) {
      upd = await supabaseClient.from(CONFIG.tables.groups).update(baseFields).eq('institution_id', schoolId).eq('group_code', oldCode);
    }
    if (upd.error) return UI.showToast(upd.error.message, 'danger');
    if (newCode !== oldCode) {
      await supabaseClient.from(CONFIG.tables.profiles).update({ grupo: newCode }).eq('institution_id', schoolId).eq('grupo', oldCode);
      await supabaseClient.from(CONFIG.tables.teacher_groups).update({ group_code: newCode }).eq('group_code', oldCode);
    }
    UI.hideModal('groupEditModal');
    loadList();
  }

  async function changeTeacher(groupCode) {
    ensureChangeTeacherModal();
    var schoolId = selectedSchoolId();
    var teachers = await loadTeachersBySchool(schoolId);
    var map = await supabaseClient.from(CONFIG.tables.teacher_groups).select('teacher_id').eq('group_code', groupCode).maybeSingle();
    var current = map.error || !map.data ? '' : String(map.data.teacher_id || '');
    var sel = document.getElementById('teacherGroupSelect');
    sel.innerHTML = '<option value="">Unassigned</option>' + teachers.map(function(t) { return '<option value="' + esc(t.id) + '">' + esc(t.nombre_completo || t.id) + '</option>'; }).join('');
    sel.value = current;
    document.getElementById('teacherGroupCode').value = groupCode;
    UI.showModal('groupTeacherModal');
  }

  async function saveTeacherChange() {
    var groupCode = String((document.getElementById('teacherGroupCode') || {}).value || '').trim();
    if (!groupCode) return;
    var teacherId = String((document.getElementById('teacherGroupSelect') || {}).value || '').trim() || null;
    await updateTeacherMapping(groupCode, teacherId);
    await logAudit('CHANGE_TEACHER', 'group', groupCode, { teacher_id: teacherId });
    UI.hideModal('groupTeacherModal');
    loadList();
  }

  function viewStudents(groupCode) {
    var userSel = document.getElementById('usersSchoolSelect');
    if (userSel) userSel.value = selectedSchoolId();
    var grpSel = document.getElementById('adminGroupFilter');
    if (grpSel) grpSel.value = groupCode;
    if (window.showAdminView) window.showAdminView('users');
    if (window.UsersModule) {
      UsersModule.loadGroupFilter().then(function() {
        var g2 = document.getElementById('adminGroupFilter');
        if (g2) g2.value = groupCode;
        return UsersModule.loadSchoolStats();
      }).then(function() {
        return UsersModule.refresh();
      });
    }
  }

  async function createGroup() {
    ensureCreateGroupModal();
    var schoolId = selectedSchoolId();
    if (!schoolId) return UI.showToast('Select school first', 'warning');
    var teachers = await loadTeachersBySchool(schoolId);
    var sel = document.getElementById('createGroupTeacher');
    sel.innerHTML = '<option value="">Unassigned</option>' + teachers.map(function(t) { return '<option value="' + esc(t.id) + '">' + esc(t.nombre_completo || t.id) + '</option>'; }).join('');
    document.getElementById('createGroupCode').value = '';
    document.getElementById('createGroupCapacity').value = '30';
    document.getElementById('createGroupLat').value = '';
    document.getElementById('createGroupLng').value = '';
    UI.showModal('groupCreateModal');
  }

  async function saveCreateGroup() {
    var schoolId = selectedSchoolId();
    if (!schoolId) return UI.showToast('Select school first', 'warning');
    var code = String((document.getElementById('createGroupCode') || {}).value || '').trim();
    var cap = Math.max(1, Number((document.getElementById('createGroupCapacity') || {}).value || 30));
    var latRaw = String((document.getElementById('createGroupLat') || {}).value || '').trim();
    var lngRaw = String((document.getElementById('createGroupLng') || {}).value || '').trim();
    var teacher = String((document.getElementById('createGroupTeacher') || {}).value || '').trim();
    if (!code) return UI.showToast('Group code is required', 'warning');

    // Use insertGroup() from app.js which handles max_capacity->capacity->no-capacity fallback
    // Then patch institution_id and GPS coords separately (insertGroup only sets group_code + capacity)
    if (typeof insertGroup === 'function') {
      try {
        await insertGroup(code, cap);
        // Patch institution_id and GPS (insertGroup doesn't set these)
        var patch = { institution_id: schoolId };
        if (latRaw) patch.last_admin_lat = Number(latRaw);
        if (lngRaw) patch.last_admin_lng = Number(lngRaw);
        await supabaseClient.from(CONFIG.tables.groups).update(patch).eq('group_code', code);
        await updateTeacherMapping(code, teacher || null);
        await logAudit('CREATE_GROUP', 'group', code, { group_code: code, institution_id: schoolId });
        UI.hideModal('groupCreateModal');
        loadList();
      } catch (e) {
        UI.showToast(e.message || 'Create failed', 'danger');
      }
      return;
    }

    // Fallback: direct insert with max_capacity->capacity chain
    var basePayload = { group_code: code, institution_id: schoolId, last_admin_lat: latRaw ? Number(latRaw) : null, last_admin_lng: lngRaw ? Number(lngRaw) : null };
    var ins = await supabaseClient.from(CONFIG.tables.groups).insert([Object.assign({}, basePayload, { max_capacity: cap })]);
    if (ins.error && typeof isMissingColumnError === 'function' && isMissingColumnError(ins.error, 'max_capacity', CONFIG.tables.groups)) {
      ins = await supabaseClient.from(CONFIG.tables.groups).insert([Object.assign({}, basePayload, { capacity: cap })]);
    }
    if (ins.error && typeof isMissingColumnError === 'function' && isMissingColumnError(ins.error, 'capacity', CONFIG.tables.groups)) {
      ins = await supabaseClient.from(CONFIG.tables.groups).insert([basePayload]);
    }
    if (ins.error) return UI.showToast(ins.error.message, 'danger');
    await updateTeacherMapping(code, teacher || null);
    await logAudit('CREATE_GROUP', 'group', code, basePayload);
    UI.hideModal('groupCreateModal');
    loadList();
  }

  async function deleteGroup(groupCode) {
    if (!confirm('Delete empty group ' + groupCode + '?')) return;
    var schoolId = selectedSchoolId();
    var c = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('institution_id', schoolId).eq('rol', 'student').eq('is_active', true).eq('grupo', groupCode);
    if (!c.error && (c.count || 0) > 0) return UI.showToast('Group is not empty', 'danger');
    var del = await supabaseClient.from(CONFIG.tables.groups).delete().eq('institution_id', schoolId).eq('group_code', groupCode);
    if (del.error) return UI.showToast(del.error.message, 'danger');
    await supabaseClient.from(CONFIG.tables.teacher_groups).delete().eq('group_code', groupCode);
    await logAudit('DELETE_GROUP', 'group', groupCode, { institution_id: schoolId });
    loadList();
  }

  async function init(ctx) {
    state.user = ctx.user;
    var isSchoolAdmin = String((ctx && ctx.role) || (state.user && state.user.rol) || '') === 'admin';

    if (isSchoolAdmin) {
      var sid = String((state.user && state.user.institution_id) || '').trim();
      var sel = document.getElementById('groupsSchoolSelect');
      if (sel && sid) {
        sel.innerHTML = '<option value="' + esc(sid) + '">My institution</option>';
        sel.value = sid;
        sel.disabled = true;
      }
      var btn = document.getElementById('btnLoadGroupsBySchool');
      if (btn) btn.style.display = 'none';
      // Auto-load for admins
      loadList();
    }
    var b = document.getElementById('btnLoadGroupsBySchool');
    if (b) b.onclick = loadList;
    var saveEdit = document.getElementById('btnSaveGroupEdit');
    if (saveEdit) saveEdit.onclick = saveEditGroup;
  }

  window.GroupsModule = {
    init: init,
    loadList: loadList,
    toggleGroupRow: toggleGroupRow,
    createGroup: createGroup,
    editGroup: editGroup,
    changeTeacher: changeTeacher,
    viewStudents: viewStudents,
    deleteGroup: deleteGroup
  };
})();
