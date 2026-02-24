const { chromium } = require('playwright');

const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:8080';

async function login(page, doc, pin) {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.fill('#loginDoc', doc);
  await page.fill('#loginPin', pin);
  await page.click('#btnLogin');
  await page.waitForTimeout(1800);
  return page.url();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = { step7: {} };

  // 1) admin_uis / 1111 -> must see Teacher UIS and Teacher QA
  const ctxA = await browser.newContext();
  const pA = await ctxA.newPage();
  let adminUrl = '';
  let teacherNames = [];
  try {
    adminUrl = await login(pA, 'admin_uis', '1111');
    if (/admin\.html/.test(adminUrl)) {
      // School admin now lands on TEACHERS view
      await pA.waitForSelector('#teachersList table', { timeout: 12000 });
      await pA.waitForTimeout(1200);
      teacherNames = await pA.$$eval('#teachersList table tbody tr td:first-child', cells => cells.map(c => (c.textContent || '').trim()).filter(Boolean));
    }
    const hasUIS = teacherNames.some(n => /teacher\s*uis/i.test(n));
    const hasQA = teacherNames.some(n => /teacher\s*qa/i.test(n));
    results.step7.admin_uis = {
      status: (/admin\.html/.test(adminUrl) && hasUIS && hasQA) ? 'PASS' : 'FAIL',
      seen: { url: adminUrl, teachers: teacherNames.slice(0, 10) }
    };
  } catch (e) {
    results.step7.admin_uis = { status: 'FAIL', seen: { url: adminUrl, error: e.message || String(e) } };
  }
  await ctxA.close();

  // 2) teacher_uis / 2222 -> must see only UIS-A1 students
  const ctxT = await browser.newContext();
  const pT = await ctxT.newPage();
  let teacherUrl = '';
  let groups = [];
  let teacherSeen = {};
  try {
    teacherUrl = await login(pT, 'teacher_uis', '2222');
    if (/teacher\.html/.test(teacherUrl)) {
      await pT.waitForSelector('#contentUsers', { timeout: 12000 });
      await pT.waitForTimeout(1200);
      groups = await pT.$$eval('#contentUsers table tbody tr', rows => rows.map(r => (r.getAttribute('data-group') || '').trim()).filter(Boolean));
      teacherSeen = await pT.evaluate(() => {
        const empty = document.querySelector('#contentUsers .empty-state');
        const filter = document.getElementById('adminGroupFilter');
        return {
          emptyState: empty ? (empty.textContent || '').trim() : '',
          selectedGroup: filter ? String(filter.value || '') : ''
        };
      });
    }
    const onlyUISA1 = groups.every(g => /uis-a1/i.test(g));
    const filterScoped = /uis-a1/i.test(String(teacherSeen.selectedGroup || ''));
    const emptyOk = !groups.length ? /no students|no students match|no group/i.test(String(teacherSeen.emptyState || '').toLowerCase()) : true;
    results.step7.teacher_uis = {
      status: (/teacher\.html/.test(teacherUrl) && onlyUISA1 && filterScoped && emptyOk) ? 'PASS' : 'FAIL',
      seen: { url: teacherUrl, groups: groups.slice(0, 20), selectedGroup: teacherSeen.selectedGroup, emptyState: teacherSeen.emptyState }
    };
  } catch (e) {
    results.step7.teacher_uis = { status: 'FAIL', seen: { url: teacherUrl, error: e.message || String(e) } };
  }
  await ctxT.close();

  // 3) Student ENGLISH 1 PB1 -> challenge banner visible when active
  const ctxS = await browser.newContext();
  const pS = await ctxS.newPage();
  let studentUrl = '';
  let pickedStudent = '1113';
  try {
    studentUrl = await login(pS, '1113', '2009');
    if (/student\.html/.test(studentUrl)) {
      await pS.waitForSelector('#viewDashboard', { timeout: 12000 });
      await pS.waitForTimeout(1200);
      const banner = await pS.$('#studentActiveChallengeBanner');
      const display = banner ? await banner.evaluate(el => getComputedStyle(el).display) : 'none';
      const text = await pS.$eval('#studentActiveChallengeBannerText', el => (el.textContent || '').trim()).catch(() => '');
      const visible = display !== 'none' && /active challenge/i.test(text);
      results.step7.student_banner = {
        status: visible ? 'PASS' : 'FAIL',
        seen: { url: studentUrl, display, text, student: pickedStudent || 'qa_student' }
      };
    } else {
      results.step7.student_banner = { status: 'FAIL', seen: { url: studentUrl, error: 'student login failed' } };
    }
  } catch (e) {
    results.step7.student_banner = { status: 'FAIL', seen: { url: studentUrl, error: e.message || String(e) } };
  }
  await ctxS.close();

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();
