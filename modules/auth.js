(function() {
  var ROLE_SET = { student: true, teacher: true, admin: true, super_admin: true };

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('lingoCoins_user') || 'null');
    } catch (_) {
      return null;
    }
  }

  function isSessionShapeValid(user) {
    if (!user || typeof user !== 'object') return false;
    if (!user.id || !user.rol || !ROLE_SET[String(user.rol)]) return false;
    if (!user.documento_id || typeof user.documento_id !== 'string') return false;
    if (!user.pin || !/^\d{4,12}$/.test(String(user.pin))) return false;
    return true;
  }

  function invalidateSession(redirectTo) {
    try { localStorage.removeItem('lingoCoins_user'); } catch (_) {}
    window.location.href = redirectTo || 'index.html';
  }

  function verifySessionAgainstServer(user, redirectTo) {
    try {
      var client = null;
      if (window && window.supabaseClient) client = window.supabaseClient;
      else if (typeof supabaseClient !== 'undefined') client = supabaseClient;
      if (!client) return;

      var profilesTable = 'profiles';
      if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.tables && CONFIG.tables.profiles) {
        profilesTable = CONFIG.tables.profiles;
      } else if (window && window.CONFIG && window.CONFIG.tables && window.CONFIG.tables.profiles) {
        profilesTable = window.CONFIG.tables.profiles;
      }

      client
        .from(profilesTable)
        .select('id, rol, documento_id, pin, is_active')
        .eq('id', user.id)
        .maybeSingle()
        .then(function(res) {
          if (res.error || !res.data) return invalidateSession(redirectTo);
          var row = res.data;
          if (row.is_active === false) return invalidateSession(redirectTo);
          if (String(row.rol || '') !== String(user.rol || '')) return invalidateSession(redirectTo);
          if (String(row.documento_id || '') !== String(user.documento_id || '')) return invalidateSession(redirectTo);
          if (String(row.pin || '') !== String(user.pin || '')) return invalidateSession(redirectTo);
        })
        .catch(function() {
          // Network failures should not force logout here.
        });
    } catch (_) {}
  }

  function logout(redirectTo) {
    localStorage.removeItem('lingoCoins_user');
    window.location.href = redirectTo || 'index.html';
  }

  function guardRole(allowedRoles, redirectTo) {
    var user = getCurrentUser();
    var roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!isSessionShapeValid(user) || roles.indexOf(user.rol) === -1) {
      invalidateSession(redirectTo);
      return null;
    }
    verifySessionAgainstServer(user, redirectTo);
    return user;
  }

  window.Auth = {
    getCurrentUser: getCurrentUser,
    logout: logout,
    guardRole: guardRole
  };
})();
