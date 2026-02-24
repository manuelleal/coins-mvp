(function() {
  async function loadList() {
    if (typeof window.loadAuctionList === 'function') return window.loadAuctionList();
  }
  async function loadCobros() {
    if (typeof window.loadBillingClaims === 'function') return window.loadBillingClaims();
  }
  async function init() {
    await loadList();
    await loadCobros();
  }
  window.StoreModule = { init: init, loadList: loadList, loadCobros: loadCobros };
})();
