(function() {
  async function loadList() {
    if (typeof window.loadFeedbackList === 'function') return window.loadFeedbackList();
  }
  async function init() { await loadList(); }
  window.FeedbackModule = { init: init, loadList: loadList };
})();
