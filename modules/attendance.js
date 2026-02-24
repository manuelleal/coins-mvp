(function() {
  async function generateSession() {
    if (typeof window.generateQR === 'function') return window.generateQR();
  }
  async function loadTodayList() {
    if (typeof window.refreshAttendanceList === 'function') return window.refreshAttendanceList();
  }
  async function init() {
    var btn = document.getElementById('btnGenerateQR');
    if (btn) btn.onclick = generateSession;
    await loadTodayList();
  }
  window.AttendanceModule = { init: init, generateSession: generateSession, loadTodayList: loadTodayList };
})();
