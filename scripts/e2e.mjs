// End-to-end browser tests (demo mode) using an installed Chrome/Edge.
//   npm run build && npm run test:e2e
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const shots = `${root}screenshots`;
mkdirSync(shots, { recursive: true });

// Serve the demo-mode build (dist-e2e, built with .env.demo by `npm run test:e2e`).
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'pipe',
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 30000);
  server.stdout.on('data', (b) => String(b).includes(String(PORT)) && (clearTimeout(t), resolve()));
});

let browser;
for (const channel of ['chrome', 'msedge']) {
  try { browser = await chromium.launch({ channel, headless: true }); break; } catch { /* try next */ }
}
if (!browser) throw new Error('No Chrome/Edge found');

let passed = 0;
let failed = 0;
const errors = [];
async function step(name, fn) {
  try { await fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) {
    failed++;
    console.log(`  ✘ ${name}\n      ${String(e.message).split('\n')[0]}`);
    const pages = browser.contexts().flatMap((c) => c.pages());
    for (const [i, p] of pages.entries()) await p.screenshot({ path: `${shots}/FAIL-${failed}-${i}.png` }).catch(() => {});
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function newPage(viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, timezoneId: 'Africa/Cairo' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.setDefaultTimeout(8000);
  return page;
}
async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
const toast = (page, text) => page.getByTestId('toast').filter({ hasText: text }).first().waitFor();

// Safety: refuse to run unless the app is in demo mode (local data only),
// so these tests can never modify a real database.
{
  const probe = await newPage();
  await probe.goto(`${BASE}/login`);
  const demo = await probe.getByText('Demo accounts').isVisible({ timeout: 5000 }).catch(() => false);
  await probe.context().close();
  if (!demo) {
    console.error('ABORT: the app under test is not in demo mode — refusing to touch a real database.');
    server.kill();
    await browser.close();
    process.exit(2);
  }
}

console.log('\nAuthentication');
const page = await newPage();
await step('unauthenticated users are redirected to login', async () => {
  await page.goto(`${BASE}/admin/members`);
  await page.waitForURL('**/login');
});
await step('login form validates input', async () => {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Enter a valid email address').waitFor();
});
await step('wrong password shows an error', async () => {
  await login(page, 'admin@example.com', 'wrong-password');
  await page.getByRole('alert').filter({ hasText: 'Incorrect email or password' }).waitFor();
});
await step('admin login redirects to the Admin Dashboard', async () => {
  await login(page, 'admin@example.com', 'Admin@12345');
  await page.waitForURL(`${BASE}/admin`);
  await page.getByRole('heading', { name: 'Admin Dashboard' }).waitFor();
  await page.getByText('Average Attendance').waitFor();
  await page.screenshot({ path: `${shots}/admin-dashboard.png`, fullPage: true });
});

console.log('\nTeam members');
await step('member list renders and search filters by name/ID/specialization', async () => {
  await page.goto(`${BASE}/admin/members`);
  await page.getByRole('link', { name: 'Hema Mohamed' }).first().waitFor();
  await page.getByPlaceholder('Search name, ID or specialization').fill('flutter');
  await page.waitForTimeout(100);
  const rows = await page.locator('table tbody tr').count();
  expect(rows === 2, `expected 2 Flutter members, got ${rows}`);
  await page.getByPlaceholder('Search name, ID or specialization').fill('');
});
await step('add member: validation then success toast', async () => {
  await page.getByRole('button', { name: 'Add member' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add member' }).click();
  await page.getByText('Full name is required').waitFor();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Full name').fill('Test Person');
  await dlg.getByLabel('Email').fill('test.person@example.com');
  await dlg.getByLabel('Specialization').selectOption({ label: 'Backend' });
  await dlg.getByRole('button', { name: 'Add member' }).click();
  await toast(page, 'Member added');
  await page.getByRole('link', { name: 'Test Person' }).first().waitFor();
});
await step('duplicate email is rejected', async () => {
  await page.getByRole('button', { name: 'Add member' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Full name').fill('Another');
  await dlg.getByLabel('Email').fill('TEST.person@example.com');
  await dlg.getByLabel('Specialization').selectOption({ label: 'Backend' });
  await dlg.getByRole('button', { name: 'Add member' }).click();
  await toast(page, 'Could not add member');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
});
await step('member with history cannot be deleted; can be deactivated', async () => {
  await page.getByRole('button', { name: 'Delete Hema Mohamed' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete member' }).click();
  await toast(page, 'Could not delete member');
  await page.getByRole('button', { name: 'Delete Test Person' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete member' }).click();
  await toast(page, 'Test Person deleted');
});

console.log('\nSessions');
const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
await step('create session (end before start rejected)', async () => {
  await page.goto(`${BASE}/admin/sessions`);
  await page.getByRole('button', { name: 'Create session' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Session title').fill('E2E Planning Session');
  await dlg.getByLabel('Date').fill(future);
  await dlg.getByLabel('Start time').fill('18:00');
  await dlg.getByLabel('End time').fill('17:00');
  await dlg.getByRole('button', { name: 'Create session' }).click();
  await dlg.getByText('End time must be after start time').waitFor();
  await dlg.getByLabel('End time').fill('19:30');
  await dlg.getByRole('button', { name: 'Create session' }).click();
  await toast(page, 'Session created');
  await page.getByRole('link', { name: 'E2E Planning Session' }).waitFor();
  await page.locator('table tr', { hasText: 'E2E Planning Session' }).getByText('12 members').waitFor();
});
await step('edit session time', async () => {
  await page.getByRole('button', { name: 'Actions for E2E Planning Session' }).click();
  await page.getByRole('menuitem', { name: 'Edit date & time' }).click();
  await page.getByRole('dialog').getByLabel('Start time').fill('17:30');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await toast(page, 'Session updated');
  await page.locator('table').getByText('05:30 PM - 07:30 PM').waitFor();
});
await step('cancel session moves it to Cancelled', async () => {
  await page.getByRole('button', { name: 'Actions for E2E Planning Session' }).click();
  await page.getByRole('menuitem', { name: 'Cancel session' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel session' }).click();
  await toast(page, 'Session cancelled');
  await page.getByRole('tab', { name: /Cancelled/ }).click();
  await page.getByRole('link', { name: 'E2E Planning Session' }).waitFor();
});
await page.context().close();

console.log('\nDoctor — take attendance');
const doc = await newPage();
let pendingUrl;
await step('doctor login redirects to Doctor Dashboard', async () => {
  await login(doc, 'doctor@example.com', 'Doctor@12345');
  await doc.waitForURL(`${BASE}/doctor`);
  await doc.getByRole('heading', { name: 'Doctor Dashboard' }).waitFor();
});
await step('doctor cannot open admin pages', async () => {
  await doc.goto(`${BASE}/admin/members`);
  await doc.waitForURL(`${BASE}/doctor`);
});
await step('take-attendance hub lists the unrecorded session', async () => {
  await doc.goto(`${BASE}/doctor/take-attendance`);
  await doc.getByText('Missing attendance').waitFor();
  await doc.locator('section', { hasText: 'Missing attendance' }).getByRole('link', { name: /Take attendance/ }).first().click();
  await doc.waitForURL('**/doctor/sessions/**');
  pendingUrl = doc.url();
});
await step('everyone defaults to Present; mark absent/late/excused; save shows summary', async () => {
  await doc.getByTestId('attendance-summary').waitFor();
  const presentChecked = await doc.getByRole('radio', { name: 'Present', checked: true }).count();
  expect(presentChecked === 12, `expected 12 present by default, got ${presentChecked}`);
  await doc.getByRole('radiogroup', { name: 'Attendance for Sara Ali' }).getByRole('radio', { name: 'Absent' }).click();
  await doc.getByRole('radiogroup', { name: 'Attendance for Omar Farouk' }).getByRole('radio', { name: 'Absent' }).click();
  await doc.getByRole('radiogroup', { name: 'Attendance for Mohamed Hassan' }).getByRole('radio', { name: 'Late' }).click();
  // keyboard shortcut: focus row, press E
  await doc.getByTestId('row-TM008').focus();
  await doc.keyboard.press('e');
  await doc.screenshot({ path: `${shots}/take-attendance.png`, fullPage: true });
  await doc.getByTestId('save-attendance').click();
  await toast(doc, 'Attendance saved');
  const dlg = doc.getByRole('dialog', { name: 'Attendance saved' });
  await dlg.waitFor();
  const text = await dlg.innerText();
  expect(/8\s*Present/.test(text) && /2\s*Absent/.test(text) && /1\s*Late/.test(text) && /1\s*Excused/.test(text), `summary wrong: ${text.replace(/\s+/g, ' ')}`);
  await dlg.getByRole('button', { name: 'Done' }).click();
});
await step('completed attendance is locked until explicitly edited', async () => {
  await doc.getByText('Attendance is locked').waitFor();
  expect((await doc.getByRole('radio').count()) === 0, 'roster should be read-only');
  await doc.getByRole('button', { name: 'Edit attendance' }).click();
  await doc.getByRole('dialog').getByRole('button', { name: 'Edit attendance' }).click();
  await doc.getByRole('radiogroup', { name: 'Attendance for Sara Ali' }).getByRole('radio', { name: 'Excused' }).click();
  await doc.getByTestId('save-attendance').click();
  await toast(doc, 'Attendance updated');
  await doc.getByRole('dialog', { name: 'Attendance saved' }).getByRole('button', { name: 'Done' }).click();
  await doc.getByText('Attendance is locked').waitFor();
});
await step('mark all present button', async () => {
  await doc.getByRole('button', { name: 'Edit attendance' }).click();
  await doc.getByRole('dialog').getByRole('button', { name: 'Edit attendance' }).click();
  await doc.getByRole('button', { name: 'Mark all present' }).click();
  const n = await doc.getByRole('radio', { name: 'Present', checked: true }).count();
  expect(n === 12, `expected 12 present, got ${n}`);
  // In-app navigation with unsaved changes asks for confirmation
  await doc.getByRole('link', { name: 'Attendance History' }).click();
  await doc.getByRole('dialog', { name: 'Discard unsaved attendance?' }).getByRole('button', { name: 'Discard' }).click();
  await doc.waitForURL('**/doctor/attendance');
});
await step('attendance history filters by status', async () => {
  await doc.getByLabel('Status', { exact: true }).selectOption('excused');
  await doc.getByText(/\d+ records?/).first().waitFor();
});
await step('reports: preset "below threshold" and Excel exports download', async () => {
  await doc.goto(`${BASE}/doctor/reports`);
  await doc.getByRole('button', { name: /Below 75%/ }).click();
  await doc.getByRole('tab', { name: /Member summary/ }).waitFor();
  await doc.getByRole('button', { name: 'Clear all' }).click();
  const [dl] = await Promise.all([doc.waitForEvent('download'), doc.getByRole('button', { name: 'Export attendance' }).click()]);
  expect(/^Team_Attendance_Report_.+\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await dl.saveAs(`${shots}/${dl.suggestedFilename()}`);
  await toast(doc, 'Excel export completed');
  const [dl2] = await Promise.all([doc.waitForEvent('download'), doc.getByRole('button', { name: 'Export records' }).click()]);
  expect(/^Attendance_Records_.+\.xlsx$/.test(dl2.suggestedFilename()), dl2.suggestedFilename());
  await doc.screenshot({ path: `${shots}/reports.png`, fullPage: true });
});
await step('session export from attendance screen', async () => {
  await doc.goto(pendingUrl);
  const [dl] = await Promise.all([doc.waitForEvent('download'), doc.getByRole('button', { name: 'Export', exact: true }).click()]);
  expect(/^Session_Attendance_.+\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
});
await doc.context().close();

console.log('\nVisitor (no account, view only)');
const guest = await newPage({ width: 390, height: 844 });
await step('opening the site shows the dashboard without signing in (mobile)', async () => {
  await guest.goto(BASE);
  await guest.waitForURL(`${BASE}/`);
  await guest.getByText('Average Attendance').waitFor();
  await guest.locator('main').getByText('view only').waitFor();
  await guest.screenshot({ path: `${shots}/visitor-dashboard-mobile.png`, fullPage: true });
});
await step('visitor sees members and a member profile without email/phone/notes', async () => {
  await guest.goto(`${BASE}/members`);
  await guest.getByText('Hema Mohamed').first().waitFor();
  expect((await guest.getByRole('button', { name: /Add member|Edit|Delete/ }).count()) === 0, 'visitor must not see edit controls');
  await guest.getByRole('link', { name: 'Hema Mohamed' }).first().click();
  await guest.getByText('Attendance history').waitFor();
  const text = await guest.locator('main').innerText();
  expect(!text.includes('@example.com') && !text.includes('+20'), 'private fields leaked to visitor');
  expect(!text.includes('Medical excuse'), 'attendance notes leaked to visitor');
  expect((await guest.getByLabel('Attendance status').count()) === 0, 'visitor must not see status editors');
});
await step('visitor sessions list is read-only', async () => {
  await guest.goto(`${BASE}/sessions`);
  await guest.getByRole('heading', { name: 'Sessions' }).waitFor();
  expect((await guest.getByRole('button', { name: 'Create session' }).count()) === 0, 'no create button for visitors');
});
await step('visitor cannot open staff pages', async () => {
  for (const p of ['/admin', '/doctor/sessions', '/admin/settings']) {
    await guest.goto(`${BASE}${p}`);
    await guest.waitForURL('**/login');
  }
});
await step('staff sign-in link from the public site and back', async () => {
  await guest.goto(BASE);
  await guest.getByTestId('staff-sign-in').click();
  await guest.getByRole('heading', { name: 'Staff sign in' }).waitFor();
  await guest.getByRole('link', { name: /View team attendance without signing in/ }).click();
  await guest.waitForURL(`${BASE}/`);
});
await step('mobile navigation drawer works', async () => {
  await guest.getByTestId('open-menu').click();
  await guest.getByRole('link', { name: 'Team Members' }).click();
  await guest.waitForURL('**/members');
});
await guest.context().close();

console.log('\nMobile responsiveness (390px)');
const mob = await newPage({ width: 390, height: 844 });
await login(mob, 'admin@example.com', 'Admin@12345');
await mob.waitForURL(`${BASE}/admin`);
for (const p of ['/admin', '/admin/members', '/admin/sessions', '/admin/attendance', '/admin/reports', '/admin/settings', '/admin/specializations']) {
  await step(`no horizontal page overflow on ${p}`, async () => {
    await mob.goto(`${BASE}${p}`);
    await mob.waitForLoadState('networkidle');
    await mob.waitForTimeout(400);
    const [sw, iw] = await mob.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw <= iw + 1, `scrollWidth ${sw} > ${iw}`);
    await mob.screenshot({ path: `${shots}/mobile${p.replace(/\//g, '-')}.png`, fullPage: true });
  });
}
await step('empty state when search has no results', async () => {
  await mob.goto(`${BASE}/admin/members`);
  await mob.getByPlaceholder('Search name, ID or specialization').fill('zzzz-nobody');
  await mob.getByText('No members match your filters').waitFor();
});
await mob.context().close();

await browser.close();
server.kill();

const relevant = errors.filter((e) => !/Failed to load resource|favicon/.test(e));
if (relevant.length) {
  console.log('\nBrowser errors:');
  relevant.forEach((e) => console.log('  - ' + e));
}
console.log(`\n${passed} passed, ${failed} failed, ${relevant.length} browser errors\n`);
process.exit(failed || relevant.length ? 1 : 0);
