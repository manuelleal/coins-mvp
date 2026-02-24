(function() {
  async function loadList() {
    if (typeof window.loadAnnouncementsList === 'function') return window.loadAnnouncementsList();
  }
  async function init() { await loadList(); }
  window.AnnouncementsModule = { init: init, loadList: loadList };
})();
