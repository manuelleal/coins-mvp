(function() {
  async function loadList() {
    if (typeof window.loadChallengesList === 'function') return window.loadChallengesList();
  }
  function openBuilder() {
    var view = document.getElementById('viewChallenges');
    if (view) view.classList.add('active');
  }
  async function init() { await loadList(); }
  window.ChallengesModule = { init: init, loadList: loadList, openBuilder: openBuilder };
})();
