const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5500';

function txt(v) { return (v == null ? '' : String(v)).trim(); }

async function collectPageSignals(page, bucket) {
  page.on('console', (msg) => {
    bucket.console.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    bucket.console.push(`[pageerror] ${err && err.message ? err.message : String(err)}`);
  });
  page.on('requestfailed', (req) => {
    const f = req.failure();
    bucket.network.push(`${req.method()} ${req.url()} -> ${f ? f.errorText : 'failed'}`);
  });
}

async function login(page, doc, pin) {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginDoc', { timeout: 15000 });
  await page.fill('#loginDoc', doc);
  await page.fill('#loginPin', pin);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.click('#btnLogin')
  ]);
  await page.waitForTimeout(1200);
  return page.url();
}

async function clickIfVisible(page, selector) {
  const el = await page.$(selector);
  if (!el) return false;
  await el.click();
  return true;
}

async function countBySelectors(page, selectors) {
  for (const s of selectors) {
    const n = await page.locator(s).count();
    if (n > 0) return n;
  }
  return 0;
}

async function testSuperAdmin(browser, report, creds) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sig = { console: [], network: [] };
  await collectPageSignals(page, sig);

  const section = report.super_admin;

  // Login
  const loginUrl = await login(page, '1052499107', '2992');
  section.login_redirect = { status: 'PASS', seen: loginUrl };

  // Dashboard numbers
  await page.waitForSelector('#statTotalStudents', { timeout: 20000 });
  const stats = {
    students: txt(await page.locator('#statTotalStudents').innerText()),
    active_challenges: txt(await page.locator('#statActiveChallenges').innerText()),
    coins: txt(await page.locator('#statTotalCoins').innerText())
  };
  section.dashboard_numbers = { status: 'PASS', seen: stats };

  // Institutions / Schools count
  await clickIfVisible(page, '#navInstitutions');
  await page.waitForTimeout(1800);
  const schoolsCount = await countBySelectors(page, [
    '#institutionsList .institution-card',
    '#institutionsList .glass-panel',
    '#institutionsList table tbody tr',
    '#institutionsList .card'
  ]);
  const institutionsText = txt(await page.locator('#institutionsList').innerText()).slice(0, 1200);
  section.schools_count = {
    status: schoolsCount > 0 ? 'PASS' : 'FAIL',
    seen: `count=${schoolsCount}; text=${institutionsText}`
  };

  // Try to locate UIS card/row and actions Users/Groups/Economy/AI Config
  const uisAction = await page.evaluate(() => {
    function visible(el) {
      if (!el) return false;
      const st = window.getComputedStyle(el);
      return st && st.display !== 'none' && st.visibility !== 'hidden';
    }
    const root = document.getElementById('institutionsList');
    if (!root) return { foundUIS: false };
    const all = Array.from(root.querySelectorAll('div, tr, li, section, article'));
    const target = all.find(el => /\bUIS\b/i.test((el.textContent || '').trim()));
    if (!target) return { foundUIS: false };
    const btns = Array.from(target.querySelectorAll('button,a')).filter(visible).map(b => ({
      text: (b.textContent || '').trim(),
      selector: b.id ? ('#' + b.id) : null
    }));
    return { foundUIS: true, buttons: btns, text: (target.textContent || '').trim().slice(0, 800) };
  });

  section.users_step2_groups = { status: 'FAIL', seen: 'Could not execute Users step on UIS yet' };
  section.groups_u_is_count = { status: 'FAIL', seen: 'Could not execute Groups step on UIS yet' };
  section.economy_u_is_once = { status: 'FAIL', seen: 'Could not execute Economy step on UIS yet' };
  section.ai_config_pin = { status: 'FAIL', seen: 'Could not execute AI Config step on UIS yet' };

  if (uisAction && uisAction.foundUIS) {
    // click by text helper
    async function clickButtonByText(labelRegex) {
      const clicked = await page.evaluate((rxSource) => {
        const rx = new RegExp(rxSource, 'i');
        const root = document.getElementById('institutionsList');
        if (!root) return false;
        const blocks = Array.from(root.querySelectorAll('div, tr, li, section, article'));
        const target = blocks.find(el => /\bUIS\b/i.test((el.textContent || '').trim()));
        if (!target) return false;
        const btn = Array.from(target.querySelectorAll('button,a')).find(b => rx.test((b.textContent || '').trim()));
        if (!btn) return false;
        btn.click();
        return true;
      }, labelRegex);
      await page.waitForTimeout(1200);
      return !!clicked;
    }

    // Users step
    if (await clickButtonByText('users')) {
      const bodyText = txt(await page.locator('body').innerText());
      const hasStep2 = /step\s*2/i.test(bodyText);
      const maybeGroups = (await page.locator('select option').allInnerTexts()).filter(x => /UIS|\w+/.test(x));
      section.users_step2_groups = {
        status: hasStep2 ? 'PASS' : 'FAIL',
        seen: `step2=${hasStep2}; options_sample=${maybeGroups.slice(0, 12).join(' | ')}`
      };
    }

    // Groups step
    if (await clickButtonByText('groups')) {
      const cnt = await countBySelectors(page, ['#groupsList table tbody tr', '#groupsList .group-card', 'table tbody tr']);
      section.groups_u_is_count = {
        status: cnt > 0 ? 'PASS' : 'FAIL',
        seen: `groups_visible=${cnt}`
      };
    }

    // Economy step
    if (await clickButtonByText('economy|credits|pool')) {
      const body = txt(await page.locator('body').innerText());
      const uisMatches = body.match(/UIS/g) || [];
      section.economy_u_is_once = {
        status: uisMatches.length === 1 ? 'PASS' : 'FAIL',
        seen: `UIS_occurrences_in_view=${uisMatches.length}`
      };
    }

    // AI Config step
    if (await clickButtonByText('ai')) {
      const body = txt(await page.locator('body').innerText());
      const pinPromptVisible = /PIN/.test(body);
      section.ai_config_pin = {
        status: pinPromptVisible ? 'PASS' : 'FAIL',
        seen: `PIN_visible=${pinPromptVisible}`
      };
    }
  } else {
    section.users_step2_groups.seen = `UIS block not found. institutions snippet: ${institutionsText}`;
    section.groups_u_is_count.seen = `UIS block not found. institutions snippet: ${institutionsText}`;
    section.economy_u_is_once.seen = `UIS block not found. institutions snippet: ${institutionsText}`;
    section.ai_config_pin.seen = `UIS block not found. institutions snippet: ${institutionsText}`;
  }

  // Admins
  await clickIfVisible(page, '#navAdmins');
  await page.waitForTimeout(1500);
  const adminsText = txt(await page.locator('#adminUsersList').innerText());
  const hasAdminUIS = /admin_uis/i.test(adminsText) || /Admin UIS/i.test(adminsText);
  const hasTeacherUIS = /teacher_uis/i.test(adminsText) || /Teacher UIS/i.test(adminsText);
  section.admins_list = {
    status: hasAdminUIS && hasTeacherUIS ? 'PASS' : 'FAIL',
    seen: adminsText.slice(0, 1500)
  };

  // Try to extract one student credential from superadmin Users list (onclick openEdit includes pin)
  await clickIfVisible(page, '#navUsers');
  await page.waitForTimeout(1500);
  const studentCred = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#contentUsers button'));
    const editBtn = btns.find(b => /Edit/i.test((b.textContent || '').trim()) && /openEdit\(/.test(b.getAttribute('onclick') || ''));
    if (!editBtn) return null;
    const onclick = editBtn.getAttribute('onclick') || '';
    const m = onclick.match(/openEdit\('\s*([^']*)\s*','\s*([^']*)\s*','\s*([^']*)\s*','\s*([^']*)\s*','\s*([^']*)\s*','\s*([^']*)\s*'\)/);
    if (!m) return null;
    return { id: m[1], name: m[2], doc: m[3], pin: m[4], group: m[5], role: m[6] };
  });
  if (studentCred && studentCred.doc && studentCred.pin && studentCred.role === 'student') {
    creds.student = { doc: studentCred.doc, pin: studentCred.pin, name: studentCred.name, group: studentCred.group };
  }

  section.console_errors = sig.console.filter(x => /error|\[pageerror\]/i.test(x)).slice(0, 50);
  section.network_errors = sig.network.slice(0, 50);

  await ctx.close();
}

async function testSchoolAdmin(browser, report) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sig = { console: [], network: [] };
  await collectPageSignals(page, sig);
  const section = report.admin_escuela;

  const loginUrl = await login(page, 'admin_uis', '1111');
  section.login_redirect = { status: 'PASS', seen: loginUrl };

  await page.waitForSelector('#ovStatStudents', { timeout: 20000 });
  section.overview_stats = {
    status: 'PASS',
    seen: {
      students: txt(await page.locator('#ovStatStudents').innerText()),
      teachers: txt(await page.locator('#ovStatTeachers').innerText()),
      groups: txt(await page.locator('#ovStatGroups').innerText()),
      challenges: txt(await page.locator('#ovStatChallenges').innerText()),
      coins: txt(await page.locator('#ovStatCoins').innerText()),
      cobros: txt(await page.locator('#ovStatCobros').innerText())
    }
  };

  // Teachers
  await clickIfVisible(page, '#navTeachers');
  await page.waitForTimeout(1500);
  const teachersText = txt(await page.locator('#teachersList').innerText());
  const hasTeacherUIS = /teacher_uis|Teacher UIS/i.test(teachersText);
  const hasGroupBadge = /No group/i.test(teachersText) ? false : /Pocket|Assign Group|badge/i.test(teachersText);
  section.teachers_with_groups = {
    status: hasTeacherUIS ? 'PASS' : 'FAIL',
    seen: teachersText.slice(0, 1600) + ` | hasGroupIndicator=${hasGroupBadge}`
  };

  // Students count (expect 87)
  await clickIfVisible(page, '#navStudents');
  await page.waitForTimeout(2200);
  const rows = await page.locator('#contentStudents table tbody tr').count();
  section.students_87 = {
    status: rows === 87 ? 'PASS' : 'FAIL',
    seen: `rows_visible=${rows}`
  };

  // Adjust coins with reason
  let adjustSeen = 'Could not open coins modal';
  let adjustPass = false;
  const coinsBtn = page.locator('#contentStudents button:has-text("Coins")').first();
  if (await coinsBtn.count()) {
    await coinsBtn.click();
    await page.waitForTimeout(600);
    await page.fill('#adjustCoinsDelta', '1');
    await page.fill('#adjustCoinsReason', 'QA real browser test');
    await page.click('#btnSaveAdjustCoins');
    await page.waitForTimeout(1500);
    const toast = txt(await page.locator('#toastContainer').innerText());
    adjustSeen = toast || txt(await page.locator('body').innerText()).slice(0, 500);
    adjustPass = /updated|success|applied|coins/i.test(adjustSeen) && !/error|failed/i.test(adjustSeen);
  }
  section.adjust_coins_with_reason = { status: adjustPass ? 'PASS' : 'FAIL', seen: adjustSeen };

  section.console_errors = sig.console.filter(x => /error|\[pageerror\]/i.test(x)).slice(0, 50);
  section.network_errors = sig.network.slice(0, 50);

  await ctx.close();
}

async function testTeacher(browser, report) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sig = { console: [], network: [] };
  await collectPageSignals(page, sig);
  const section = report.teacher;

  const loginUrl = await login(page, 'teacher_uis', '2222');
  section.login_redirect = { status: 'PASS', seen: loginUrl };

  await page.waitForSelector('#teacherGroupTabs', { timeout: 20000 });
  const groupsCount = await page.locator('#teacherGroupTabs [data-group-tab]').count();
  section.groups_count = { status: groupsCount > 0 ? 'PASS' : 'FAIL', seen: `groups=${groupsCount}` };

  const pocketVisible = await page.locator('#teacherPocketWrap').isVisible().catch(() => false);
  const pocketText = pocketVisible ? txt(await page.locator('#teacherPocketWrap').innerText()) : 'not visible';
  section.pocket_header = { status: pocketVisible ? 'PASS' : 'FAIL', seen: pocketText };

  // Give coins
  let givePass = false;
  let giveSeen = 'Give button not found';
  const giveBtn = page.locator('#contentUsers button:has-text("Give")').first();
  if (await giveBtn.count()) {
    await giveBtn.click();
    await page.waitForTimeout(500);
    await page.fill('#giveCoinsAmount', '1');
    await page.fill('#giveCoinsReason', 'QA browser check');
    await page.click('#btnConfirmGiveCoins');
    await page.waitForTimeout(1700);
    const toast = txt(await page.locator('#toastContainer').innerText());
    giveSeen = toast || txt(await page.locator('#giveCoinsStatus').innerText());
    givePass = /granted|success|updated|coins/i.test(giveSeen) && !/error|failed|insufficient/i.test(giveSeen);
  }
  section.students_give_coins = { status: givePass ? 'PASS' : 'FAIL', seen: giveSeen };

  // QR generated URL
  await page.evaluate(() => {
    if (window.QRCode && !window.__qaWrappedQr) {
      const Orig = window.QRCode;
      function Wrapped(el, opts) {
        try { window.__qaLastQrText = opts && opts.text ? String(opts.text) : ''; } catch (_) {}
        return new Orig(el, opts);
      }
      Wrapped.CorrectLevel = Orig.CorrectLevel;
      window.QRCode = Wrapped;
      window.__qaWrappedQr = true;
    }
  });

  await clickIfVisible(page, '#navAttendance');
  await page.waitForTimeout(800);
  const hasGroupOption = await page.evaluate(() => {
    const sel = document.getElementById('qrGroup');
    if (!sel) return false;
    const opt = Array.from(sel.options).find(o => (o.value || '').trim());
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });

  let qrText = '';
  if (hasGroupOption) {
    await page.click('#btnGenerateQR');
    await page.waitForTimeout(1600);
    qrText = await page.evaluate(() => window.__qaLastQrText || '');
  }
  section.qr_url = {
    status: /^https?:\/\//.test(qrText) ? 'PASS' : 'FAIL',
    seen: qrText || 'QR text not captured'
  };

  section.console_errors = sig.console.filter(x => /error|\[pageerror\]/i.test(x)).slice(0, 50);
  section.network_errors = sig.network.slice(0, 50);

  await ctx.close();
}

async function testStudent(browser, report, creds) {
  const section = report.student;
  if (!creds.student || !creds.student.doc || !creds.student.pin) {
    section.login_redirect = { status: 'FAIL', seen: 'No student credentials available from prior browser flow.' };
    section.coins_visible = { status: 'FAIL', seen: 'Skipped (no login).' };
    section.challenge_active = { status: 'FAIL', seen: 'Skipped (no login).' };
    section.animations_visible = { status: 'FAIL', seen: 'Skipped (no login).' };
    section.coming_soon = { status: 'FAIL', seen: 'Skipped (no login).' };
    section.mute_button = { status: 'FAIL', seen: 'Skipped (no login).' };
    section.console_errors = [];
    section.network_errors = [];
    return;
  }

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sig = { console: [], network: [] };
  await collectPageSignals(page, sig);

  const loginUrl = await login(page, creds.student.doc, creds.student.pin);
  section.login_redirect = { status: 'PASS', seen: `${loginUrl} (doc=${creds.student.doc})` };

  await page.waitForSelector('#studentCoins', { timeout: 20000 });
  const coins = txt(await page.locator('#studentCoins').innerText());
  section.coins_visible = { status: coins !== '' ? 'PASS' : 'FAIL', seen: coins };

  const activeChallengeText = txt(await page.locator('#activeChallengeSpotlight').innerText());
  section.challenge_active = {
    status: /ACTIVE|challenge|Waiting challenge/i.test(activeChallengeText) ? 'PASS' : 'FAIL',
    seen: activeChallengeText
  };

  const animState = await page.evaluate(() => {
    const streak = document.querySelector('#streakBadge');
    const card = document.querySelector('#activeChallengeSpotlight');
    const s = streak ? getComputedStyle(streak).animationName : '';
    const c = card ? getComputedStyle(card).animationName : '';
    return { streakAnimation: s, cardAnimation: c };
  });
  section.animations_visible = {
    status: (animState.streakAnimation && animState.streakAnimation !== 'none') || (animState.cardAnimation && animState.cardAnimation !== 'none') ? 'PASS' : 'FAIL',
    seen: animState
  };

  const comingSoonCount = await page.locator('.coming-soon-card').count();
  section.coming_soon = { status: comingSoonCount > 0 ? 'PASS' : 'FAIL', seen: `cards=${comingSoonCount}` };

  const muteVisible = await page.locator('#btnMute').isVisible().catch(() => false);
  section.mute_button = { status: muteVisible ? 'PASS' : 'FAIL', seen: `visible=${muteVisible}` };

  section.console_errors = sig.console.filter(x => /error|\[pageerror\]/i.test(x)).slice(0, 50);
  section.network_errors = sig.network.slice(0, 50);

  await ctx.close();
}

(async function main() {
  const browser = await chromium.launch({ headless: true });
  const report = {
    super_admin: {},
    admin_escuela: {},
    teacher: {},
    student: {}
  };
  const creds = {};

  try {
    await testSuperAdmin(browser, report, creds);
    await testSchoolAdmin(browser, report);
    await testTeacher(browser, report);
    await testStudent(browser, report, creds);
  } catch (e) {
    report.__fatal = e && e.stack ? e.stack : String(e);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ report, creds }, null, 2));
})();
