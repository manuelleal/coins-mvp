/* ========================================
   ADMIN-INIT.JS — Layout switch + view routing for admin.html
   NO data loading here. Data loading is delegated to InstitutionsModule (modules/institutions.js).
   ======================================== */
(function() {
  'use strict';

  // --- Auth guard ---
  var user = null;
  try { user = JSON.parse(localStorage.getItem('lingoCoins_user') || 'null'); } catch(_) {}
  if (!user || !user.id || (user.rol !== 'super_admin' && user.rol !== 'admin')) {
    window.location.href = 'index.html';
  }

  var role = user ? user.rol : '';
  var INST_ID = user ? (user.institution_id || '') : '';

  // --- Apply body class (matches styles.css selectors) ---
  if (role === 'super_admin') {
    document.body.classList.add('admin-layout-super');
  } else if (role === 'admin') {
    document.body.classList.add('admin-layout-school');
  }

  // --- Show the correct layout wrapper ---
  var superLayout = document.getElementById('superAdminLayout');
  var schoolLayout = document.getElementById('schoolAdminLayout');

  if (role === 'super_admin') {
    if (superLayout) superLayout.style.display = '';
    if (schoolLayout) schoolLayout.style.display = 'none';
  } else if (role === 'admin') {
    if (superLayout) superLayout.style.display = 'none';
    if (schoolLayout) schoolLayout.style.display = '';
  }

  // --- View lists per role ---
  var SUPER_VIEWS = ['dashboard', 'institutions', 'users', 'groups', 'economy', 'aiConfig', 'policies', 'admins'];
  var SCHOOL_VIEWS = ['adminDashboard', 'teachers', 'groupsSchool', 'usersSchool', 'attendance', 'challenges', 'store', 'cobros', 'announcements', 'feedback'];

  // --- Capitalise first letter helper ---
  function ucFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // --- showAdminView: route views and trigger data loads ---
  window.showAdminView = function(viewName) {
    var views = role === 'super_admin' ? SUPER_VIEWS : SCHOOL_VIEWS;
    var container = role === 'super_admin' ? superLayout : schoolLayout;
    if (!container) return false;

    // Hide all views inside the active layout
    container.querySelectorAll('.admin-view').forEach(function(el) {
      el.classList.remove('active');
    });

    // Show requested view
    var viewEl = document.getElementById('view' + ucFirst(viewName));
    if (viewEl) viewEl.classList.add('active');

    // Update nav/tab active state
    if (role === 'super_admin') {
      container.querySelectorAll('.admin-nav-item').forEach(function(el) { el.classList.remove('active'); });
      var navEl = document.getElementById('nav' + ucFirst(viewName));
      if (navEl) navEl.classList.add('active');
      // Update breadcrumb
      var bc = document.getElementById('adminBreadcrumb');
      if (bc) bc.textContent = ucFirst(viewName);
    } else {
      container.querySelectorAll('.admin-tab-item').forEach(function(el) { el.classList.remove('active'); });
      var tabMap = {
        'adminDashboard': 'tabAdminDashboard',
        'teachers': 'tabTeachers',
        'groupsSchool': 'tabGroupsSchool',
        'usersSchool': 'tabUsersSchool',
        'attendance': 'tabAttendance',
        'challenges': 'tabChallenges',
        'store': 'tabStore',
        'cobros': 'tabCobros',
        'announcements': 'tabAnnouncements',
        'feedback': 'tabFeedback'
      };
      var tabEl = document.getElementById(tabMap[viewName] || '');
      if (tabEl) tabEl.classList.add('active');
    }

    // --- Trigger data loading via InstitutionsModule ---
    var IM = window.InstitutionsModule;
    if (role === 'super_admin' && IM) {
      if (viewName === 'dashboard') IM.loadDashboard();
      if (viewName === 'institutions') IM.loadList();
      if (viewName === 'economy') IM.loadEconomy();
      if (viewName === 'aiConfig') IM.loadAiConfig();
      if (viewName === 'policies') IM.loadPolicies();
      if (viewName === 'admins') IM.loadAdminsSection();
    }

    // School admin data loading (delegates to InstitutionsModule or school-specific loaders)
    if (role === 'admin') {
      if (viewName === 'adminDashboard') loadSchoolDashboard();
      if (viewName === 'teachers') loadSchoolTeachers();
      if (viewName === 'groupsSchool') loadSchoolGroups();
      if (viewName === 'usersSchool') loadSchoolUsers();
      if (viewName === 'attendance') loadSchoolAttendance();
      if (viewName === 'challenges') loadSchoolChallenges();
      if (viewName === 'store') loadSchoolStore();
      if (viewName === 'cobros') loadSchoolCobros();
      if (viewName === 'announcements') loadSchoolAnnouncements();
      if (viewName === 'feedback') loadSchoolFeedback();
    }

    return false;
  };

  // --- School admin data loaders (institution-scoped) ---
  async function loadSchoolDashboard() {
    if (!INST_ID) return;
    try {
      var stuRes = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('institution_id', INST_ID).eq('rol', 'student').eq('is_active', true);
      var tchRes = await supabaseClient.from(CONFIG.tables.profiles).select('id', { count: 'exact', head: true }).eq('institution_id', INST_ID).eq('rol', 'teacher').eq('is_active', true);
      var grpRes = await supabaseClient.from(CONFIG.tables.groups).select('id', { count: 'exact', head: true }).eq('institution_id', INST_ID);
      var el;
      el = document.getElementById('cardTeachers'); if (el) el.textContent = tchRes.count || 0;
      el = document.getElementById('cardStudents'); if (el) el.textContent = stuRes.count || 0;
      el = document.getElementById('cardGroups'); if (el) el.textContent = grpRes.count || 0;
    } catch(e) {
      console.error('[admin-init] loadSchoolDashboard error:', e);
    }
  }

  async function loadSchoolTeachers() {
    if (!INST_ID) return;
    var host = document.getElementById('teachersList');
    if (!host) return;
    var res = await supabaseClient.from(CONFIG.tables.profiles).select('id,nombre_completo,documento_id,is_active').eq('institution_id', INST_ID).eq('rol', 'teacher').order('nombre_completo');
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + (res.error.message || '') + '</div>'; return; }
    var rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No teachers found.</p>'; return; }
    host.innerHTML = '<div style="overflow-x:auto;"><table class="table table-sm" style="color:var(--admin-text);"><thead><tr><th>Name</th><th>Document</th><th>Status</th></tr></thead><tbody>' +
      rows.map(function(t) { return '<tr><td>' + esc(t.nombre_completo || '-') + '</td><td>' + esc(t.documento_id || '-') + '</td><td>' + (t.is_active ? 'Active' : 'Inactive') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  async function loadSchoolGroups() {
    if (!INST_ID) return;
    var host = document.getElementById('groupsListSchool');
    if (!host) return;
    var res = await supabaseClient.from(CONFIG.tables.groups).select('group_code,max_capacity').eq('institution_id', INST_ID).order('group_code');
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + (res.error.message || '') + '</div>'; return; }
    var rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No groups found.</p>'; return; }
    host.innerHTML = '<div style="overflow-x:auto;"><table class="table table-sm" style="color:var(--admin-text);"><thead><tr><th>Group Code</th><th>Capacity</th></tr></thead><tbody>' +
      rows.map(function(g) { return '<tr><td>' + esc(g.group_code || '-') + '</td><td>' + esc(g.max_capacity || '-') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  async function loadSchoolUsers() {
    var host = document.getElementById('contentUsersSchool');
    if (!host) return;
    if (!INST_ID) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No institution linked.</p>'; return; }
    host.innerHTML = '<p style="color:var(--admin-text-muted);">Click "Load Users" to display users.</p>';
    var btn = document.getElementById('btnLoadUsersSchool');
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', async function() {
        host.innerHTML = '<p style="color:var(--admin-text-muted);">Loading...</p>';
        var groupFilter = (document.getElementById('adminGroupFilter2') || {}).value || '';
        var roleFilter = (document.getElementById('usersRoleFilter2') || {}).value || '';
        var q = supabaseClient.from(CONFIG.tables.profiles).select('nombre_completo,documento_id,rol,grupo,monedas,is_active').eq('institution_id', INST_ID).order('nombre_completo');
        if (groupFilter) q = q.eq('grupo', groupFilter);
        if (roleFilter) q = q.eq('rol', roleFilter);
        var res = await q;
        if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
        var rows = res.data || [];
        if (!rows.length) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No users found.</p>'; return; }
        host.innerHTML = '<div style="overflow-x:auto;"><table class="table table-sm" style="color:var(--admin-text);"><thead><tr><th>Name</th><th>Doc</th><th>Role</th><th>Group</th><th>Coins</th></tr></thead><tbody>' +
          rows.map(function(u) { return '<tr><td>' + esc(u.nombre_completo || '-') + '</td><td>' + esc(u.documento_id || '-') + '</td><td>' + esc(u.rol || '-') + '</td><td>' + esc(u.grupo || '-') + '</td><td>' + (u.monedas || 0) + '</td></tr>'; }).join('') +
          '</tbody></table></div>';
      });
    }
  }

  async function loadSchoolAttendance() {
    // Placeholder — the attendance view has its own inline load button
  }
  async function loadSchoolChallenges() {
    var host = document.getElementById('adminChallengesList');
    if (!host || !INST_ID) return;
    var res = await supabaseClient.from(CONFIG.tables.challenges).select('id,title,target_group,is_active,created_at').eq('institution_id', INST_ID).order('created_at', { ascending: false });
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    var rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No challenges found.</p>'; return; }
    host.innerHTML = '<div style="overflow-x:auto;"><table class="table table-sm" style="color:var(--admin-text);"><thead><tr><th>Title</th><th>Group</th><th>Status</th></tr></thead><tbody>' +
      rows.map(function(c) { return '<tr><td>' + esc(c.title || '-') + '</td><td>' + esc(c.target_group || 'all') + '</td><td>' + (c.is_active ? 'Active' : 'Closed') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  async function loadSchoolStore() {
    var host = document.getElementById('adminAuctionList');
    if (!host || !INST_ID) return;
    var res = await supabaseClient.from(CONFIG.tables.auctions).select('id,item_name,item_type,status,current_bid').eq('institution_id', INST_ID).order('created_at', { ascending: false });
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    var rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No auctions found.</p>'; return; }
    host.innerHTML = '<div style="overflow-x:auto;"><table class="table table-sm" style="color:var(--admin-text);"><thead><tr><th>Item</th><th>Type</th><th>Status</th><th>Bid</th></tr></thead><tbody>' +
      rows.map(function(a) { return '<tr><td>' + esc(a.item_name || '-') + '</td><td>' + esc(a.item_type || '-') + '</td><td>' + esc(a.status || '-') + '</td><td>' + (a.current_bid || 0) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  async function loadSchoolCobros() {
    var host = document.getElementById('adminBillingClaimsList');
    if (!host || !INST_ID) return;
    var res = await supabaseClient.from('billing_claims').select('id,item_name,student_name,status,created_at').eq('institution_id', INST_ID).order('created_at', { ascending: false });
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    var rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No pending cobros.</p>'; return; }
    host.innerHTML = '<div style="overflow-x:auto;"><table class="table table-sm" style="color:var(--admin-text);"><thead><tr><th>Item</th><th>Student</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
      rows.map(function(c) { return '<tr><td>' + esc(c.item_name || '-') + '</td><td>' + esc(c.student_name || '-') + '</td><td>' + esc(c.status || '-') + '</td><td>' + esc((c.created_at || '').substring(0,10)) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  async function loadSchoolAnnouncements() {
    var host = document.getElementById('adminAnnouncementsList');
    if (!host || !INST_ID) return;
    var res = await supabaseClient.from(CONFIG.tables.announcements).select('id,title,message,type,created_at').eq('institution_id', INST_ID).order('created_at', { ascending: false });
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    var rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No announcements.</p>'; return; }
    host.innerHTML = '<div style="overflow-x:auto;"><table class="table table-sm" style="color:var(--admin-text);"><thead><tr><th>Title</th><th>Type</th><th>Date</th></tr></thead><tbody>' +
      rows.map(function(a) { return '<tr><td>' + esc(a.title || '-') + '</td><td>' + esc(a.type || 'info') + '</td><td>' + esc((a.created_at || '').substring(0,10)) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  async function loadSchoolFeedback() {
    var host = document.getElementById('adminFeedbackList');
    if (!host || !INST_ID) return;
    var res = await supabaseClient.from(CONFIG.tables.feedback_messages).select('id,message,status,created_at').eq('institution_id', INST_ID).order('created_at', { ascending: false });
    if (res.error) { host.innerHTML = '<div class="alert alert-danger">' + esc(res.error.message) + '</div>'; return; }
    var rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<p style="color:var(--admin-text-muted);">No feedback messages.</p>'; return; }
    host.innerHTML = '<div style="overflow-x:auto;"><table class="table table-sm" style="color:var(--admin-text);"><thead><tr><th>Message</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
      rows.map(function(f) { return '<tr><td>' + esc(f.message || '-') + '</td><td>' + esc(f.status || 'new') + '</td><td>' + esc((f.created_at || '').substring(0,10)) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  function esc(v) {
    if (window.UI && window.UI.escapeHtml) return window.UI.escapeHtml(v);
    var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML;
  }

  // --- DOMContentLoaded: set user info, wire logout, init InstitutionsModule, load default view ---
  document.addEventListener('DOMContentLoaded', function() {
    // Set user name in header
    if (role === 'super_admin') {
      var nameEl = document.getElementById('adminNameTop');
      if (nameEl) nameEl.textContent = user.nombre_completo || user.nombre || 'Admin';
    } else if (role === 'admin') {
      var nameEl2 = document.getElementById('adminNameTop2');
      if (nameEl2) nameEl2.textContent = user.nombre_completo || user.nombre || 'Admin';
      // Set school name (async)
      (async function() {
        try {
          if (INST_ID) {
            var res = await supabaseClient.from(CONFIG.tables.institutions).select('name,nombre').eq('id', INST_ID).maybeSingle();
            var school = res.data;
            var schoolName = (school && (school.name || school.nombre)) || 'School';
            var nameDisplay = document.getElementById('schoolNameDisplay');
            var avatarDisplay = document.getElementById('schoolAvatarDisplay');
            if (nameDisplay) nameDisplay.textContent = schoolName;
            if (avatarDisplay) avatarDisplay.textContent = schoolName.charAt(0).toUpperCase();
          }
        } catch(_) {}
      })();
    }

    // Wire logout buttons
    ['btnLogout', 'btnLogout2'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          localStorage.removeItem('lingoCoins_user');
          window.location.href = 'index.html';
        });
      }
    });

    // Init InstitutionsModule for super_admin
    if (role === 'super_admin' && window.InstitutionsModule && window.InstitutionsModule.init) {
      window.InstitutionsModule.init({ user: user }).catch(function(e) {
        console.error('[admin-init] InstitutionsModule.init error:', e);
      });
    }

    // Load default view
    if (role === 'super_admin') {
      window.showAdminView('dashboard');
    } else if (role === 'admin') {
      window.showAdminView('adminDashboard');
    }
  });
})();
