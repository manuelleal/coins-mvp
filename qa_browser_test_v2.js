const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5500';

function s(v) { return String(v == null ? '' : v).trim(); }
function short(v, n = 1500) { const t = s(v); return t.length > n ? t.slice(0, n) + '...' : t; }

function attachSignals(page, bucket) {
  page.on('console', (msg) => bucket.console.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => bucket.console.push(`[pageerror] ${err && err.message ? err.message : String(err)}`));
  page.on('requestfailed', (req) => {
    const f = req.failure();
    bucket.network.push(`${req.method()} ${req.url()} -> ${f ? f.errorText : 'failed'}`);
  });
  page.on('dialog', async (d) => {
    bucket.dialogs.push({ type: d.type(), message: d.message() });
    try { await d.dismiss(); } catch (_) {}
  });
}

async function login(page, doc, pin) {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.fill('#loginDoc', doc);
  await page.fill('#loginPin', pin);
  await Promise.all([page.waitForLoadState('networkidle'), page.click('#btnLogin')]);
  await page.waitForTimeout(1200);
  return page.url();
}

async function selectOptionByText(page, selector, rx) {
  const ok = await page.evaluate(({ selector, rxSource }) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const rx = new RegExp(rxSource, 'i');
    const opt = Array.from(el.options || []).find(o => rx.test(String(o.textContent || '').trim()));
    if (!opt) return false;
    el.value = opt.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { selector, rxSource: rx.source });
  await page.waitForTimeout(900);
  return ok;
}

async function testSuperAdmin(browser, report, stash) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sig = { console: [], network: [], dialogs: [] };
  attachSignals(page, sig);
  const out = {};

  try {
    const url = await login(page, '1052499107', '2992');
    out.login_redirect = { status: 'PASS', seen: url };

    // Dashboard
    await page.waitForSelector('#dashboardCards', { timeout: 20000 });
    out.dashboard_numbers = {
      status: 'PASS',
      seen: short(await page.locator('#dashboardCards').innerText())
    };

    // Schools
    await page.click('#navInstitutions');
    await page.waitForTimeout(1500);
    const schoolsCount = await page.locator('#institutionsList table tbody tr, #institutionsList .glass-panel, #institutionsList .card').count();
    out.schools_count = {
      status: schoolsCount > 0 ? 'PASS' : 'FAIL',
      seen: `rows/cards=${schoolsCount}; ${short(await page.locator('#institutionsList').innerText())}`
    };

    // Users -> UIS Step 2 groups
    await page.click('#navUsers');
    await page.waitForTimeout(1000);
    const usersSchoolSel = await selectOptionByText(page, '#usersSchoolSelect', /UIS/);
    if (usersSchoolSel) {
      await page.click('#btnLoadUsersBySchool');
      await page.waitForTimeout(1800);
      const groupOptions = await page.locator('#adminGroupFilter option').allInnerTexts();
      out.users_step2_groups = {
        status: groupOptions.length > 1 ? 'PASS' : 'FAIL',
        seen: `options=${groupOptions.length}; ${groupOptions.join(' | ')}`
      };

      // try stash student credentials from edit onclick if available
      const cred = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('#contentUsers button,[onclick*="openEdit("]'));
        for (const b of btns) {
          const onclick = b.getAttribute('onclick') || '';
          const m = onclick.match(/openEdit\('\s*([^']*)\s*','\s*([^']*)\s*','\s*([^']*)\s*','\s*([^']*)\s*','\s*([^']*)\s*','\s*([^']*)\s*'\)/);
          if (m && m[6] === 'student' && m[3] && m[4]) {
            return { id: m[1], name: m[2], doc: m[3], pin: m[4], group: m[5], role: m[6] };
          }
        }
        return null;
      });
      if (cred) stash.student = cred;
    } else {
      out.users_step2_groups = { status: 'FAIL', seen: 'Could not select UIS in usersSchoolSelect' };
    }

    // Groups -> UIS count
    await page.click('#navGroups');
    await page.waitForTimeout(1000);
    const groupsSchoolSel = await selectOptionByText(page, '#groupsSchoolSelect', /UIS/);
    if (groupsSchoolSel) {
      await page.click('#btnLoadGroupsBySchool');
      await page.waitForTimeout(1800);
      const groupRows = await page.locator('#groupsList table tbody tr, #groupsList .group-card, #groupsList .glass-panel').count();
      out.groups_uis_count = { status: groupRows > 0 ? 'PASS' : 'FAIL', seen: `groups_visible=${groupRows}` };
    } else {
      out.groups_uis_count = { status: 'FAIL', seen: 'Could not select UIS in groupsSchoolSelect' };
    }

    // Economy -> UIS once
    await page.click('#navEconomy');
    await page.waitForTimeout(1400);
    const ecoText = s(await page.locator('#viewEconomy').innerText());
    const uisMatches = ecoText.match(/UIS/g) || [];
    out.economy_uis_once = {
      status: uisMatches.length === 1 ? 'PASS' : 'FAIL',
      seen: `UIS_occurrences=${uisMatches.length}; snippet=${short(ecoText)}`
    };

    // AI config -> asks PIN
    await page.click('#navAiConfig');
    await page.waitForTimeout(1400);
    const askedPin = sig.dialogs.some(d => /pin/i.test(d.message));
    out.ai_config_pin = {
      status: askedPin ? 'PASS' : 'FAIL',
      seen: askedPin ? sig.dialogs.map(d => d.message).join(' | ') : `dialogs=0; viewText=${short(await page.locator('#viewAiConfig').innerText())}`
    };

    // Admins -> admin_uis + teacher_uis
    await page.click('#navAdmins');
    await page.waitForTimeout(1400);
    const adminsText = s(await page.locator('#adminUsersList').innerText());
    const hasAdminUIS = /admin_uis|Admin UIS/i.test(adminsText);
    const hasTeacherUIS = /teacher_uis|Teacher UIS/i.test(adminsText);
    out.admins_list = {
      status: hasAdminUIS && hasTeacherUIS ? 'PASS' : 'FAIL',
      seen: short(adminsText)
    };

  } catch (e) {
    out.__fatal = e && e.message ? e.message : String(e);
  }

  out.console_errors = sig.console.filter(x => /error|\[pageerror\]/i.test(x));
  out.network_errors = sig.network;

  report.super_admin = out;
  await ctx.close();
}

async function testSchoolAdmin(browser, report) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sig = { console: [], network: [], dialogs: [] };
  attachSignals(page, sig);
  const out = {};

  try {
    const url = await login(page, 'admin_uis', '1111');
    out.login_redirect = { status: 'PASS', seen: url };

    await page.waitForSelector('#ovStatStudents', { timeout: 20000 });
    out.overview_stats = {
      status: 'PASS',
      seen: {
        students: s(await page.locator('#ovStatStudents').innerText()),
        teachers: s(await page.locator('#ovStatTeachers').innerText()),
        groups: s(await page.locator('#ovStatGroups').innerText()),
        challenges: s(await page.locator('#ovStatChallenges').innerText()),
        coins: s(await page.locator('#ovStatCoins').innerText()),
        cobros: s(await page.locator('#ovStatCobros').innerText())
      }
    };

    await page.click('#navTeachers');
    await page.waitForTimeout(1500);
    const teachersText = s(await page.locator('#teachersList').innerText());
    out.teachers_with_groups = {
      status: /teacher_uis|Teacher UIS/i.test(teachersText) ? 'PASS' : 'FAIL',
      seen: short(teachersText)
    };

    await page.click('#navStudents');
    await page.waitForTimeout(2200);
    const studentsRows = await page.locator('#contentStudents table tbody tr').count();
    out.students_87 = {
      status: studentsRows === 87 ? 'PASS' : 'FAIL',
      seen: `rows=${studentsRows}`
    };

    // adjust coins with reason
    let adjustSeen = 'Coins button not found';
    let adjustPass = false;
    const coinsBtn = page.locator('#contentStudents button:has-text("Coins")').first();
    if (await coinsBtn.count()) {
      await coinsBtn.click();
      await page.waitForTimeout(700);
      await page.fill('#adjustCoinsDelta', '1');
      await page.fill('#adjustCoinsReason', 'QA real browser');
      await page.click('#btnSaveAdjustCoins');
      await page.waitForTimeout(1500);
      const toast = s(await page.locator('#toastContainer').innerText());
      adjustSeen = toast || s(await page.locator('body').innerText());
      adjustPass = /success|updated|coins/i.test(adjustSeen) && !/error|failed/i.test(adjustSeen);
    }
    out.adjust_coins_with_reason = { status: adjustPass ? 'PASS' : 'FAIL', seen: short(adjustSeen) };

  } catch (e) {
    out.__fatal = e && e.message ? e.message : String(e);
  }

  out.console_errors = sig.console.filter(x => /error|\[pageerror\]/i.test(x));
  out.network_errors = sig.network;

  report.admin_escuela = out;
  await ctx.close();
}

async function testTeacher(browser, report) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sig = { console: [], network: [], dialogs: [] };
  attachSignals(page, sig);
  const out = {};

  try {
    const url = await login(page, 'teacher_uis', '2222');
    out.login_redirect = { status: 'PASS', seen: url };

    await page.waitForSelector('#teacherGroupTabs', { timeout: 20000 });
    const groupTabs = await page.locator('#teacherGroupTabs [data-group-tab]').count();
    out.groups_count = { status: groupTabs > 0 ? 'PASS' : 'FAIL', seen: `groups=${groupTabs}` };

    const pocketVisible = await page.locator('#teacherPocketWrap').isVisible().catch(() => false);
    out.pocket_header = {
      status: pocketVisible ? 'PASS' : 'FAIL',
      seen: pocketVisible ? s(await page.locator('#teacherPocketWrap').innerText()) : 'not visible'
    };

    let giveSeen = 'Give button not found';
    let givePass = false;
    const giveBtn = page.locator('#contentUsers button:has-text("Give")').first();
    if (await giveBtn.count()) {
      await giveBtn.click();
      await page.waitForTimeout(600);
      await page.fill('#giveCoinsAmount', '1');
      await page.fill('#giveCoinsReason', 'QA real browser');
      await page.click('#btnConfirmGiveCoins');
      await page.waitForTimeout(1500);
      const toast = s(await page.locator('#toastContainer').innerText());
      const status = s(await page.locator('#giveCoinsStatus').innerText());
      giveSeen = toast || status;
      givePass = /success|granted|updated|coins/i.test(giveSeen) && !/error|failed|insufficient/i.test(giveSeen);
    }
    out.students_give_coins = { status: givePass ? 'PASS' : 'FAIL', seen: short(giveSeen) };

    // QR url capture
    await page.evaluate(() => {
      if (window.QRCode && !window.__qaWrappedQr2) {
        const Orig = window.QRCode;
        function Wrapped(el, opts) {
          try { window.__qaQrLastText = opts && opts.text ? String(opts.text) : ''; } catch (_) {}
          return new Orig(el, opts);
        }
        Wrapped.CorrectLevel = Orig.CorrectLevel;
        window.QRCode = Wrapped;
        window.__qaWrappedQr2 = true;
      }
    });

    await page.click('#navAttendance');
    await page.waitForTimeout(800);
    const selected = await page.evaluate(() => {
      const sel = document.getElementById('qrGroup');
      if (!sel) return false;
      const opt = Array.from(sel.options).find(o => String(o.value || '').trim());
      if (!opt) return false;
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });

    let qrText = '';
    if (selected) {
      await page.click('#btnGenerateQR');
      await page.waitForTimeout(1700);
      qrText = await page.evaluate(() => window.__qaQrLastText || '');
    }
    out.qr_url = { status: /^https?:\/\//.test(qrText) ? 'PASS' : 'FAIL', seen: qrText || 'not captured' };

  } catch (e) {
    out.__fatal = e && e.message ? e.message : String(e);
  }

  out.console_errors = sig.console.filter(x => /error|\[pageerror\]/i.test(x));
  out.network_errors = sig.network;

  report.teacher = out;
  await ctx.close();
}

async function testStudent(browser, report, stash) {
  const out = {};
  if (!stash.student || !stash.student.doc || !stash.student.pin) {
    out.login_redirect = { status: 'FAIL', seen: 'No student credentials discovered in browser flow.' };
    out.coins_visible = { status: 'FAIL', seen: 'Skipped' };
    out.challenge_active = { status: 'FAIL', seen: 'Skipped' };
    out.animations_visible = { status: 'FAIL', seen: 'Skipped' };
    out.coming_soon = { status: 'FAIL', seen: 'Skipped' };
    out.mute_button = { status: 'FAIL', seen: 'Skipped' };
    out.console_errors = [];
    out.network_errors = [];
    report.student = out;
    return;
  }

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sig = { console: [], network: [], dialogs: [] };
  attachSignals(page, sig);

  try {
    const url = await login(page, stash.student.doc, stash.student.pin);
    out.login_redirect = { status: 'PASS', seen: `${url} (doc=${stash.student.doc})` };

    await page.waitForSelector('#studentCoins', { timeout: 20000 });
    out.coins_visible = { status: 'PASS', seen: s(await page.locator('#studentCoins').innerText()) };

    const challengeText = s(await page.locator('#activeChallengeSpotlight').innerText());
    out.challenge_active = { status: /ACTIVE|challenge|waiting/i.test(challengeText) ? 'PASS' : 'FAIL', seen: short(challengeText) };

    const anim = await page.evaluate(() => {
      const streak = document.getElementById('streakBadge');
      const spotlight = document.getElementById('activeChallengeSpotlight');
      return {
        streakAnimation: streak ? getComputedStyle(streak).animationName : '',
        spotlightAnimation: spotlight ? getComputedStyle(spotlight).animationName : ''
      };
    });
    out.animations_visible = {
      status: (anim.streakAnimation && anim.streakAnimation !== 'none') || (anim.spotlightAnimation && anim.spotlightAnimation !== 'none') ? 'PASS' : 'FAIL',
      seen: anim
    };

    const comingSoon = await page.locator('.coming-soon-card').count();
    out.coming_soon = { status: comingSoon > 0 ? 'PASS' : 'FAIL', seen: `cards=${comingSoon}` };

    const muteVisible = await page.locator('#btnMute').isVisible().catch(() => false);
    out.mute_button = { status: muteVisible ? 'PASS' : 'FAIL', seen: `visible=${muteVisible}` };

  } catch (e) {
    out.__fatal = e && e.message ? e.message : String(e);
  }

  out.console_errors = sig.console.filter(x => /error|\[pageerror\]/i.test(x));
  out.network_errors = sig.network;

  report.student = out;
  await ctx.close();
}

(async function run() {
  const browser = await chromium.launch({ headless: true });
  const report = {};
  const stash = {};

  try { await testSuperAdmin(browser, report, stash); } catch (e) { report.super_admin = { __fatal: String(e) }; }
  try { await testSchoolAdmin(browser, report); } catch (e) { report.admin_escuela = { __fatal: String(e) }; }
  try { await testTeacher(browser, report); } catch (e) { report.teacher = { __fatal: String(e) }; }
  try { await testStudent(browser, report, stash); } catch (e) { report.student = { __fatal: String(e) }; }

  await browser.close();

  console.log(JSON.stringify({ report, stash }, null, 2));
})();
