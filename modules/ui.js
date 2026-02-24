(function() {
  function escapeHtml(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  function showToast(message, type) {
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
      return window.showToast(message, type);
    }
    var container = document.getElementById('toastContainer');
    if (!container || typeof bootstrap === 'undefined') {
      alert(message);
      return;
    }
    var tone = type || 'info';
    var klass = tone === 'danger' ? 'text-bg-danger' : (tone === 'success' ? 'text-bg-success' : 'text-bg-primary');
    var el = document.createElement('div');
    el.className = 'toast align-items-center ' + klass + ' border-0';
    el.innerHTML = '<div class="d-flex"><div class="toast-body">' + escapeHtml(message || 'Done') + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    container.appendChild(el);
    var toast = new bootstrap.Toast(el, { delay: tone === 'danger' ? 4500 : 2800 });
    toast.show();
    el.addEventListener('hidden.bs.toast', function() { el.remove(); });
  }

  function renderSpinner(text) {
    return '<div class="d-flex align-items-center gap-2"><div class="spinner-border spinner-border-sm" role="status"></div><span>' + escapeHtml(text || 'Loading...') + '</span></div>';
  }

  function showModal(id) {
    var el = document.getElementById(id);
    if (!el || typeof bootstrap === 'undefined') return null;
    var m = bootstrap.Modal.getOrCreateInstance(el);
    m.show();
    return m;
  }

  function hideModal(id) {
    var el = document.getElementById(id);
    if (!el || typeof bootstrap === 'undefined') return;
    var m = bootstrap.Modal.getOrCreateInstance(el);
    m.hide();
  }

  window.UI = { showToast: showToast, escapeHtml: escapeHtml, renderSpinner: renderSpinner, showModal: showModal, hideModal: hideModal };
})();
