/**
 * Phase 6 — Validation Script
 * Checks all required element IDs and CSS classes from the migration plan
 */
const fs = require('fs');
const html = fs.readFileSync('student.html', 'utf8');

// ── A. Required Element IDs (from migration plan Section A) ──
const requiredIds = [
  'geofenceGate', 'geofenceMsg', 'navGreeting',
  'navDashboard', 'navAttendance', 'navChallenges', 'navStore', 'navBag',
  'btnMute', 'btnLogoutStudent',
  'viewDashboard', 'viewAttendance', 'viewChallenges', 'viewStore', 'viewBag',
  'studentActiveChallengeBanner', 'studentActiveChallengeBannerText', 'btnGoToChallengesBanner',
  'studentCoins', 'levelBadge', 'streakBadge', 'studentGroup',
  'xpLabel', 'xpPercLabel', 'xpBarFill',
  'progressToTop10', 'progressToTop1', 'topProgressBar',
  'attendanceMiniWeek', 'attendanceMiniSummary',
  'studentBadgesGrid', 'activeChallengeSpotlight',
  'todayStatus', 'bulletinSection', 'bulletinList',
  'leaderboard',
  'feedbackForm', 'feedbackEmail', 'feedbackMessage',
  'attendanceRiskWarning', 'manualCode', 'btnManualCheckin', 'manualCheckinStatus',
  'attendanceHistory',
  'studentChallengeActiveList', 'studentChallengeFinishedList',
  'finishedChallengesAccordion', 'finishedChallengesBody', 'finishedChallengesHeading',
  'drakoFeedbackPanel',
  'marketplace', 'inventoryList'
];

console.log('=== PHASE 6 VALIDATION ===\n');
console.log('--- A. Element IDs ---');
let idPass = 0, idFail = 0;
requiredIds.forEach(id => {
  const found = html.includes('id="' + id + '"');
  if (found) { idPass++; }
  else { idFail++; console.log('  MISSING: #' + id); }
});
console.log('  Result: ' + idPass + '/' + requiredIds.length + ' found' + (idFail ? ', ' + idFail + ' MISSING' : ' - ALL PRESENT'));

// ── B. Required CSS Classes (from migration plan Section B) ──
console.log('\n--- B. CSS Classes in HTML ---');
const requiredClasses = [
  'student-view', 'student-nav', 'active',
  'container-custom', 'challenge-card', 'active-glow',
  'challenge-active-card', 'active-challenge-banner',
  'streak-badge', 'level-badge', 'badge-unlock',
  'coins-float', 'coin-float',
  'challenge-flow-overlay', // dynamically created by JS
  'glass-panel', 'marketplace-card', // dynamically created by JS
  'attendance-dot', 'dot-present', 'dot-absent', 'dot-noclass'
];
let clsPass = 0, clsFail = 0, clsDynamic = [];
requiredClasses.forEach(cls => {
  const inHtml = html.includes(cls);
  if (inHtml) { clsPass++; }
  else {
    // Check if it's only used in CSS (dynamically created by JS)
    const inCss = html.includes('.' + cls);
    if (inCss) { clsPass++; clsDynamic.push(cls); }
    else { clsFail++; console.log('  MISSING: .' + cls); }
  }
});
if (clsDynamic.length) console.log('  Dynamic (CSS only, JS creates): ' + clsDynamic.join(', '));
console.log('  Result: ' + clsPass + '/' + requiredClasses.length + ' found' + (clsFail ? ', ' + clsFail + ' MISSING' : ' - ALL PRESENT'));

// ── C. SPA View Switching ──
console.log('\n--- C. SPA View Switching ---');
const views = ['Dashboard', 'Attendance', 'Challenges', 'Store', 'Bag'];
views.forEach(v => {
  const viewId = 'view' + v;
  const hasView = html.includes('id="' + viewId + '"');
  const hasClass = html.includes('id="' + viewId + '" class="student-view');
  console.log('  ' + viewId + ': ' + (hasView ? 'EXISTS' : 'MISSING') + (hasClass ? ' + .student-view' : ''));
});

// ── D. Nav Links ──
console.log('\n--- D. Nav Links ---');
const navIds = ['navDashboard', 'navAttendance', 'navChallenges', 'navStore', 'navBag', 'navMe'];
navIds.forEach(n => {
  const found = html.includes('id="' + n + '"');
  const hasOnclick = new RegExp('id="' + n + '"[^>]*onclick').test(html);
  console.log('  ' + n + ': ' + (found ? 'EXISTS' : 'MISSING') + (hasOnclick ? ' + onclick handler' : (n === 'navBag' ? ' (hidden compat link)' : ' NO ONCLICK')));
});

// ── E. Script Loading Order ──
console.log('\n--- E. Script Loading Order ---');
const scripts = ['bootstrap@5.3.2', 'supabase-js@2', 'config.js', 'app.js', 'howler', 'ui-assets.js'];
let lastIdx = -1;
let orderOk = true;
scripts.forEach(s => {
  const idx = html.indexOf(s);
  if (idx === -1) { console.log('  MISSING: ' + s); orderOk = false; }
  else if (idx < lastIdx) { console.log('  WRONG ORDER: ' + s); orderOk = false; }
  else { lastIdx = idx; }
});
console.log('  Result: ' + (orderOk ? 'ALL SCRIPTS IN ORDER' : 'ORDER ISSUE'));

// ── F. Challenge Flow Overlay CSS ──
console.log('\n--- F. Challenge Flow Overlay CSS ---');
const flowClasses = [
  'challenge-flow-overlay', 'challenge-question-card',
  'challenge-flow-input', 'challenge-flow-submit',
  'challenge-tf-btn', 'challenge-ms-check', 'challenge-q-text'
];
flowClasses.forEach(cls => {
  const inCss = html.includes('.' + cls);
  console.log('  .' + cls + ': ' + (inCss ? 'STYLED' : 'NOT STYLED'));
});

// ── G. Engrama Theme Check ──
console.log('\n--- G. Engrama Theme ---');
console.log('  body.engrama class: ' + (html.includes('class="bg-dashboard engrama"') ? 'SET' : 'MISSING'));
console.log('  Phosphor Icons CDN: ' + (html.includes('phosphor-icons') ? 'LOADED' : 'MISSING'));
console.log('  Howler.js CDN: ' + (html.includes('howler') ? 'LOADED' : 'MISSING'));
console.log('  Lexend font: ' + (html.includes('Lexend') ? 'LOADED' : 'MISSING'));
console.log('  CSS variables: ' + (html.includes('--eng-bg') ? 'DEFINED' : 'MISSING'));

// ── H. Accessibility & Edge Cases ──
console.log('\n--- H. Edge Cases ---');
console.log('  Reduced motion: ' + (html.includes('prefers-reduced-motion') ? 'HANDLED' : 'NOT HANDLED'));
console.log('  Geofence gate: ' + (html.includes('ENABLE_DASHBOARD_GEOFENCE') ? 'CONFIGURABLE' : 'MISSING'));
console.log('  Bootstrap accordion: ' + (html.includes('data-bs-toggle="collapse"') ? 'INTACT' : 'BROKEN'));

console.log('\n=== VALIDATION COMPLETE ===');
