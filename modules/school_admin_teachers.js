(function() {
  var state = { user: null, schoolId: '', groups: [], groupSet: {}, teacherRows: [] };

  function esc(v) {
    if (window.UI && typeof UI.escapeHtml === 'function') return UI.escapeHtml(v == null ? '' : String(v));
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Jump from Teachers → Groups CRUD and expand the selected group row.
  async function manageGroup(groupCode) {
    var gc = String(groupCode || '').trim();
    if (!gc) return;
    if (typeof window.showAdminView === 'function') window.showAdminView('groups');
    // Ensure school selector is correct (admin mode locks it already, but this is safe)
    try {
      var sel = document.getElementById('groupsSchoolSelect');
      if (sel && state.schoolId) sel.value = state.schoolId;
    } catch (_) {}

    if (window.GroupsModule && typeof GroupsModule.loadList === 'function') {
      await GroupsModule.loadList();
      // Expand + scroll after render
      setTimeout(function() {
        try {
          if (GroupsModule.toggleGroupRow) GroupsModule.toggleGroupRow(gc);
          var row = document.getElementById('group_detail_' + gc);
          if (row && row.scrollIntoView) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {}
      }, 50);
    }
  }

  function toast(msg, type) {
    if (window.UI && typeof UI.showToast === 'function') return UI.showToast(msg, type || 'info');
    try { console.log('[toast]', type || 'info', msg); } catch (_) {}
    alert(msg);
  }

  async function loadSchoolGroups() {
    state.groups = [];
    state.groupSet = {};
    if (!state.schoolId) return;
    var g = await supabaseClient
      .from(CONFIG.tables.groups)
      .select('group_code')
      .eq('institution_id', state.schoolId)
      .order('group_code');
    if (g.error) return;
    (g.data || []).forEach(function(row) {
      var code = String(row.group_code || '').trim();
      if (!code) return;
      state.groups.push(code);
      state.groupSet[code] = true;
    });
  }

  async function fetchTeachers() {
    if (!state.schoolId) return [];
    // NOTE: Some schemas don't have coin_budget / coin_pocket yet.
    // If we select a missing column, Supabase returns 400 and blocks the whole view.
    var baseSel = 'id,nombre_completo,rol,grupo,monedas,pin,teacher_credits,institution_id,is_active';
    var baseSelNoCredits = 'id,nombre_completo,rol,grupo,monedas,pin,institution_id,is_active';
    var selWithBudget = baseSel + ',coin_budget,coin_pocket';
    var selWithBudgetNoCredits = baseSelNoCredits + ',coin_budget,coin_pocket';
    var teachersRes = await supabaseClient
      .from(CONFIG.tables.profiles)
      .select(selWithBudget)
      .eq('institution_id', state.schoolId)
      .eq('rol', 'teacher')
      .eq('is_active', true)
      .order('nombre_completo', { ascending: true });

    if (teachersRes.error && typeof isMissingColumnError === 'function' &&
        isMissingColumnError(teachersRes.error, 'teacher_credits', CONFIG.tables.profiles)) {
      // Retry without teacher_credits
      teachersRes = await supabaseClient
        .from(CONFIG.tables.profiles)
        .select(selWithBudgetNoCredits)
        .eq('institution_id', state.schoolId)
        .eq('rol', 'teacher')
        .eq('is_active', true)
        .order('nombre_completo', { ascending: true });
    }

    if (teachersRes.error && typeof isMissingColumnError === 'function' &&
        (isMissingColumnError(teachersRes.error, 'coin_budget', CONFIG.tables.profiles) ||
         isMissingColumnError(teachersRes.error, 'coin_pocket', CONFIG.tables.profiles))) {
      // Fallback to legacy columns only.
      teachersRes = await supabaseClient
        .from(CONFIG.tables.profiles)
        .select(baseSel)
        .eq('institution_id', state.schoolId)
        .eq('rol', 'teacher')
        .eq('is_active', true)
        .order('nombre_completo', { ascending: true });

      if (teachersRes.error && typeof isMissingColumnError === 'function' &&
          isMissingColumnError(teachersRes.error, 'teacher_credits', CONFIG.tables.profiles)) {
        teachersRes = await supabaseClient
          .from(CONFIG.tables.profiles)
          .select(baseSelNoCredits)
          .eq('institution_id', state.schoolId)
          .eq('rol', 'teacher')
          .eq('is_active', true)
          .order('nombre_completo', { ascending: true });
      }
    }

    if (teachersRes.error) throw teachersRes.error;
    return teachersRes.data || [];
  }

  async function fetchTeacherGroups(teacherIds) {
    var map = {}; // teacherId -> [group_code]
    teacherIds.forEach(function(id) { map[String(id)] = []; });

    // Prefer teacher_groups table (many-to-many). Fallback to legacy profiles.grupo later.
    if (!teacherIds.length) return map;
    try {
      var r = await supabaseClient
        .from(CONFIG.tables.teacher_groups)
        .select('teacher_id,group_code')
        .in('teacher_id', teacherIds);
      if (!r.error) {
        (r.data || []).forEach(function(x) {
          var tid = String(x.teacher_id || '');
          var gc = String(x.group_code || '').trim();
          if (!tid || !gc) return;
          if (!map[tid]) map[tid] = [];
          if (map[tid].indexOf(gc) === -1) map[tid].push(gc);
        });
      }
    } catch (_) {}

    return map;
  }

  async function fetchStudentAggregates() {
    var byGroup = {}; // group_code -> {count, coins}
    if (!state.schoolId || !state.groups.length) return byGroup;
    var res = await supabaseClient
      .from(CONFIG.tables.profiles)
      .select('grupo,monedas')
      .eq('institution_id', state.schoolId)
      .eq('rol', 'student')
      .eq('is_active', true)
      .in('grupo', state.groups);
    if (res.error) return byGroup;
    (res.data || []).forEach(function(s) {
      var gc = String(s.grupo || '').trim();
      if (!gc) return;
      if (!byGroup[gc]) byGroup[gc] = { count: 0, coins: 0 };
      byGroup[gc].count += 1;
      byGroup[gc].coins += (Number(s.monedas) || 0);
    });
    return byGroup;
  }

  function extractChallengeTarget(c) {
    if (!c) return null;
    if (c.target_group != null && String(c.target_group).trim() !== '') return String(c.target_group).trim();
    if (c.group_code != null && String(c.group_code).trim() !== '') return String(c.group_code).trim();
    return null;
  }

  async function fetchActiveChallengesByGroup() {
    var byGroup = {}; // group_code -> count
    var allCount = 0;
    if (!state.groups.length) return { byGroup: byGroup, allCount: 0 };

    var r = await supabaseClient
      .from(CONFIG.tables.challenges)
      .select('id,status,target_group,group_code')
      .eq('status', 'active');
    if (r.error) return { byGroup: byGroup, allCount: 0 };

    (r.data || []).forEach(function(ch) {
      var t = extractChallengeTarget(ch);
      if (!t || t === 'all') {
        allCount += 1;
        return;
      }
      if (!state.groupSet[t]) return;
      byGroup[t] = (byGroup[t] || 0) + 1;
    });

    return { byGroup: byGroup, allCount: allCount };
  }

  function render(rows) {
    var host = document.getElementById('teachersList');
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<div class="empty-state">No teachers found for your school.</div>';
      return;
    }

    host.innerHTML = '<div class="admin-table-wrap"><table class="table table-sm"><thead><tr>' +
      '<th>Name</th>' +
      '<th>Groups</th>' +
      '<th>Students</th>' +
      '<th>Challenges</th>' +
      '<th>Coins circ.</th>' +
      '<th>Budget</th>' +
      '<th>Actions</th>' +
      '</tr></thead><tbody>' +
      rows.map(function(t) {
        var groupsHtml = (t.groups && t.groups.length)
          ? t.groups.map(function(gc) {
              var meta = t.groupMeta && t.groupMeta[gc] ? t.groupMeta[gc] : { students: 0, coins: 0, challenges: 0 };
              return '<button type="button" class="badge bg-primary-subtle text-primary-emphasis me-1" style="border:0;cursor:pointer;" title="Manage group\nStudents: ' + meta.students + ' | Coins: ' + meta.coins + ' | Challenges: ' + meta.challenges + '" onclick="SchoolAdminTeachersModule.manageGroup(\'' + esc(gc) + '\')">' + esc(gc) + '</button>';
            }).join('')
          : '<span class="text-muted small">—</span>';
        var budgetDisplay = t.coin_budget != null ? Number(t.coin_budget)
          : (t.coin_pocket != null ? Number(t.coin_pocket)
            : (t.monedas != null ? Number(t.monedas) : '—'));

        return '<tr>' +
          '<td><strong>' + esc(t.nombre_completo || '-') + '</strong></td>' +
          '<td>' + groupsHtml + '</td>' +
          '<td>' + Number(t.totalStudents || 0) + '</td>' +
          '<td>' + Number(t.totalActiveChallenges || 0) + '</td>' +
          '<td>' + Number(t.totalCoins || 0) + '</td>' +
          '<td><span class="badge bg-warning text-dark" id="budget_' + esc(t.id) + '">' + budgetDisplay + '</span></td>' +
          '<td class="d-flex gap-1 flex-wrap">' +
            '<button class="btn btn-sm btn-outline-primary" onclick="UsersModule.editTeacherPin(\'' + esc(t.id) + '\')">Edit PIN</button>' +
            '<button class="btn btn-sm btn-outline-secondary" onclick="SchoolAdminTeachersModule.openAssignGroup(\'' + esc(t.id) + '\')">Assign Group</button>' +
            '<button class="btn btn-sm btn-success btn-sm" onclick="SchoolAdminTeachersModule.allocateBudget(\'' + esc(t.id) + '\')">Allocate Budget</button>' +
            '<button class="btn btn-sm btn-outline-success" onclick="UsersModule.setTeacherAiCredits(\'' + esc(t.id) + '\',' + Number(t.teacher_credits || 0) + ')">AI Credits</button>' +
            (t.groups && t.groups.length ? '<button class="btn btn-sm btn-outline-dark" onclick="SchoolAdminTeachersModule.viewStudents(\'' + esc((t.groups && t.groups[0]) || '') + '\')">Students</button>' : '') +
          '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function ensureAssignGroupModal() {
    if (document.getElementById('assignGroupModal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = '' +
      '<div class="modal fade" id="assignGroupModal" tabindex="-1">' +
      '  <div class="modal-dialog">' +
      '    <div class="modal-content">' +
      '      <div class="modal-header">' +
      '        <h5 class="modal-title">Assign Group</h5>' +
      '        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
      '      </div>' +
      '      <div class="modal-body">' +
      '        <input type="hidden" id="assignTeacherId">' +
      '        <label class="form-label">Group</label>' +
      '        <select id="assignGroupCode" class="form-select"></select>' +
      '        <div class="form-text">This will reassign the group to this teacher (one teacher per group).</div>' +
      '        <div id="assignGroupStatus" class="small mt-2"></div>' +
      '      </div>' +
      '      <div class="modal-footer">' +
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>' +
      '        <button type="button" class="btn btn-primary" id="btnConfirmAssignGroup">Assign</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(wrap.firstChild);
    document.getElementById('btnConfirmAssignGroup').onclick = saveAssignGroup;
  }

  async function openAssignGroup(teacherId) {
    ensureAssignGroupModal();
    await loadSchoolGroups();
    var sel = document.getElementById('assignGroupCode');
    sel.innerHTML = '<option value="">Select group</option>' + state.groups.map(function(gc) {
      return '<option value="' + esc(gc) + '">' + esc(gc) + '</option>';
    }).join('');
    document.getElementById('assignTeacherId').value = teacherId;
    document.getElementById('assignGroupStatus').textContent = '';
    if (window.UI && typeof UI.showModal === 'function') UI.showModal('assignGroupModal');
    else {
      var m = new bootstrap.Modal(document.getElementById('assignGroupModal'));
      m.show();
    }
  }

  async function saveAssignGroup() {
    var teacherId = String((document.getElementById('assignTeacherId') || {}).value || '').trim();
    var groupCode = String((document.getElementById('assignGroupCode') || {}).value || '').trim();
    var st = document.getElementById('assignGroupStatus');
    if (st) { st.className = 'small mt-2 text-muted'; st.textContent = 'Saving...'; }
    if (!teacherId || !groupCode) {
      if (st) { st.className = 'small mt-2 text-danger'; st.textContent = 'Teacher and group are required.'; }
      return;
    }

    try {
      // One teacher per group: clear existing mapping for that group.
      await supabaseClient.from(CONFIG.tables.teacher_groups).delete().eq('group_code', groupCode);
      var ins = await supabaseClient.from(CONFIG.tables.teacher_groups).insert([{ teacher_id: teacherId, group_code: groupCode }]);
      if (ins.error) throw ins.error;

      if (st) { st.className = 'small mt-2 text-success'; st.textContent = 'Assigned!'; }
      toast('Group assigned', 'success');
      if (window.UI && typeof UI.hideModal === 'function') UI.hideModal('assignGroupModal');
      await refresh();
    } catch (e) {
      if (st) { st.className = 'small mt-2 text-danger'; st.textContent = String(e && e.message || e || 'Could not assign group'); }
    }
  }

  function viewStudents(groupCode) {
    var gc = String(groupCode || '').trim();
    if (!gc) return;
    if (window.showAdminView) window.showAdminView('users');
    var sel = document.getElementById('adminGroupFilter');
    if (sel) sel.value = gc;
    if (window.UsersModule && typeof UsersModule.refresh === 'function') UsersModule.refresh();
  }

  async function refresh() {
    var host = document.getElementById('teachersList');
    if (host) host.innerHTML = (window.UI && UI.renderSpinner) ? UI.renderSpinner('Loading teachers...') : '<p class="text-muted small">Loading...</p>';

    state.schoolId = String((state.user && state.user.institution_id) || '');
    await loadSchoolGroups();

    var teachers = await fetchTeachers();
    var teacherIds = teachers.map(function(t) { return String(t.id); }).filter(Boolean);
    var tgMap = await fetchTeacherGroups(teacherIds);

    // Legacy fallback: if no teacher_groups entries, use profiles.grupo
    teachers.forEach(function(t) {
      var tid = String(t.id);
      var legacy = String(t.grupo || '').trim();
      if ((!tgMap[tid] || !tgMap[tid].length) && legacy) tgMap[tid] = [legacy];
      if (tgMap[tid]) tgMap[tid] = tgMap[tid].filter(function(gc) { return !!state.groupSet[gc]; });
    });

    var studentAgg = await fetchStudentAggregates();
    var challAgg = await fetchActiveChallengesByGroup();

    var rows = teachers.map(function(t) {
      var tid = String(t.id);
      var groups = (tgMap[tid] || []).slice().sort();
      var meta = {};
      var totalStudents = 0;
      var totalCoins = 0;
      var totalCh = 0;
      groups.forEach(function(gc) {
        var s = studentAgg[gc] || { count: 0, coins: 0 };
        var c = (challAgg.byGroup[gc] || 0) + (challAgg.allCount || 0);
        meta[gc] = { students: s.count, coins: s.coins, challenges: c };
        totalStudents += s.count;
        totalCoins += s.coins;
        totalCh += c;
      });
      return {
        id: t.id,
        nombre_completo: t.nombre_completo,
        teacher_credits: Number(t.teacher_credits) || 0,
        coin_budget: t.coin_budget != null ? Number(t.coin_budget) : null,
        coin_pocket: t.coin_pocket != null ? Number(t.coin_pocket) : null,
        monedas: t.monedas != null ? Number(t.monedas) : null,
        groups: groups,
        groupMeta: meta,
        totalStudents: totalStudents,
        totalCoins: totalCoins,
        totalActiveChallenges: totalCh
      };
    });

    state.teacherRows = rows;
    render(rows);
  }

  // Allocate coin budget from admin pool to teacher
  async function allocateBudget(teacherId) {
    try {
      var amount = Math.floor(Number(prompt('Coins to allocate to this teacher (from School Pocket):', '100') || 0));
      if (!amount || amount <= 0) return;
      var adminId = state.user && state.user.id ? String(state.user.id) : '';
      if (!adminId) return toast('Admin ID not found', 'danger');

      if (typeof allocateCoinBudgetToTeacher === 'function') {
        var r = await allocateCoinBudgetToTeacher(adminId, teacherId, amount);
        if (!r || !r.ok) return toast('Could not allocate: ' + ((r && r.error) || 'Unknown error'), 'danger');
        toast('Allocated ' + amount + ' coins. Teacher pocket: ' + r.newTeacherBudget + ' | School pocket: ' + r.newAdminPool, 'success');
        // Update badge in-place quickly, then refresh for accurate fallbacks/columns.
        var badge = document.getElementById('budget_' + teacherId);
        if (badge) badge.textContent = String(r.newTeacherBudget);
        await refresh();
        return;
      }

      // Fallback: direct monedas adjustment
      var read = await supabaseClient.from(CONFIG.tables.profiles).select('monedas').eq('id', teacherId).maybeSingle();
      if (read.error || !read.data) return toast('Teacher not found', 'danger');
      var next = Math.max(0, Number(read.data.monedas || 0) + amount);
      var upd = await supabaseClient.from(CONFIG.tables.profiles).update({ monedas: next }).eq('id', teacherId);
      if (upd.error) return toast(upd.error.message, 'danger');
      toast('Allocated ' + amount + ' coins to teacher', 'success');
      var badge2 = document.getElementById('budget_' + teacherId);
      if (badge2) badge2.textContent = String(next);
      await refresh();
    } catch (e) {
      try { console.error('[ALLOCATE_BUDGET]', e); } catch (_) {}
      toast(String((e && e.message) || e || 'Allocation failed'), 'danger');
    }
  }

  function init(ctx) {
    state.user = ctx && ctx.user ? ctx.user : null;
    state.schoolId = String((state.user && state.user.institution_id) || '');
    ensureAssignGroupModal();
  }

  window.SchoolAdminTeachersModule = {
    init: init,
    refresh: refresh,
    openAssignGroup: openAssignGroup,
    viewStudents: viewStudents,
    allocateBudget: allocateBudget,
    manageGroup: manageGroup
  };
})();
