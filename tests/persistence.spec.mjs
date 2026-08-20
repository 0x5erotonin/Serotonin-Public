/**
 * Persistence smoke test.
 *
 * Drives the real app in Chromium and asserts that the things that used to
 * evaporate on refresh now survive one: a draft mid-questionnaire, an uploaded
 * document's bytes, an approval-step attachment, notification read state,
 * profile edits, the theme, and legacy sessionStorage data left over from v2.0.
 * It also covers the cleanup paths — a cleared feed staying cleared, a completed
 * draft not coming back, attachments not being orphaned.
 *
 *   npm install
 *   npx playwright install chromium
 *   npm run build && npm run preview &
 *   node tests/persistence.spec.mjs
 *
 * With no amplify_outputs.json this covers the on-device path, which exercises
 * every store and hook seam the AWS path also uses. Run it again after
 * `npx ampx sandbox` to cover AppSync, DynamoDB and S3 for real.
 *
 * Exits non-zero if any assertion fails, so it works as a CI gate.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

// Point at `npm run preview` (or `npm run dev` on :5173).
const BASE = process.env.SEROTONIN_URL || 'http://127.0.0.1:4173';
const results = [];

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('response', (res) => {
  if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
});

/** The header renders four buttons: sidebar toggle, theme, bell, avatar. */
const headerButton = (index) => page.locator('button').nth(index);

try {
  /* ── 1. Boots ──────────────────────────────────────────────────────────── */
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Security compliance,', { timeout: 15000 });
  check('app boots to the dashboard', true);

  /* ── 2. Create a questionnaire ─────────────────────────────────────────── */
  await page.click('text=Complete questionnaire');
  await page.waitForSelector('text=Where is the questionnaire', { timeout: 10000 });

  await page.fill('input >> nth=0', 'Acme Corp');
  await page.click('text=Manual entry');
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.fill(
    'textarea',
    '1. Do you have a SOC 2 Type II report?\n2. Describe your backup procedures.\n3. Do you run a bug bounty?',
  );
  check('manual entry accepts questions', (await page.locator('textarea').inputValue()).includes('SOC 2'));

  await page.click('text=Process questions');
  // The app fakes 2.5s of processing, then autosaves 1.2s later.
  await page.waitForSelector('text=Review', { timeout: 15000 });
  await sleep(3000);

  const draftsBefore = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.drafts') || '[]'),
  );
  check(
    'draft written to durable storage',
    draftsBefore.length === 1 && draftsBefore[0].vendor === 'Acme Corp',
    `${draftsBefore.length} draft(s), vendor=${draftsBefore[0]?.vendor}`,
  );
  check(
    'draft carries all three questions',
    draftsBefore[0]?.questions?.length === 3,
    `questions=${draftsBefore[0]?.questions?.length}`,
  );

  /* ── 3. Answer a question, then reload ─────────────────────────────────── */
  const answerBoxes = page.locator('textarea');
  const boxCount = await answerBoxes.count();
  if (boxCount > 0) {
    await answerBoxes.nth(0).fill('Yes — SOC 2 Type II, audited annually by an independent firm.');
    await sleep(2000);
  }

  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);

  const afterReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.drafts') || '[]'),
  );
  check(
    'draft survives a refresh',
    afterReload.length === 1 && afterReload[0].questions.length === 3,
    `${afterReload.length} draft(s)`,
  );

  const answerPersisted = afterReload[0]?.questions?.some((q) =>
    String(q.answer || '').includes('SOC 2 Type II, audited annually'),
  );
  check('typed answer survives a refresh', !!answerPersisted);

  const editorText = await page.locator('body').innerText();
  check(
    'editor reopens on the saved step, not back at intake',
    !editorText.includes('Where is the questionnaire'),
  );

  /* ── 4. Dashboard reflects the persisted draft ─────────────────────────── */
  await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);
  const dashText = await page.locator('body').innerText();
  check(
    'dashboard lists the assessment after a cold load',
    dashText.includes('1 active assessment') && dashText.includes('Acme Corp'),
    dashText.split('\n').find((l) => l.includes('active assessment')) || '',
  );

  /* ── 5. Upload a document to the knowledge base ────────────────────────── */
  await page.click('text=Knowledge base');
  await sleep(800);
  await page.click('button:has-text("Import")');
  await page.waitForSelector('text=Access Control Policy', { timeout: 10000 });
  await page.click('button:text-is("SOC 2 Report")');

  const pdfBytes = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n' + 'x'.repeat(4096),
  );
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'soc2-type-ii-2026.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes,
  });
  await sleep(500);
  await page.click('button:has-text("Import 1 document")');
  await sleep(2500);

  const docsAfter = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.kbDocs') || '[]'),
  );
  check(
    'document record saved',
    docsAfter.length === 1 && docsAfter[0].name === 'soc2-type-ii-2026.pdf',
    `${docsAfter.length} doc(s)`,
  );
  check(
    'document has a storage path (bytes were kept, not discarded)',
    !!docsAfter[0]?.storagePath,
    `storagePath=${docsAfter[0]?.storagePath}`,
  );

  /* ── 6. The file itself round-trips through IndexedDB after a reload ───── */
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  await page.goto(`${BASE}/#knowledge`, { waitUntil: 'networkidle' });
  await sleep(1500);
  // The library defaults to the "all" filter, which lists questionnaires; the
  // documents tab is where imported files live.
  await page.click('button:has-text("Policy documents (1)")');
  await sleep(600);

  const kbText = await page.locator('body').innerText();
  check('document still listed after a refresh', kbText.includes('soc2-type-ii-2026.pdf'));
  check(
    'stored document offers a download after a refresh',
    await page.locator('button[title="Open document"]').first().isVisible(),
  );

  const storedBlob = await page.evaluate(async (path) => {
    const key = path.replace('idb://', '');
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('serotonin-files', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const getReq = tx.objectStore('files').get(key);
      tx.oncomplete = () =>
        resolve(getReq.result ? { size: getReq.result.size, type: getReq.result.type } : null);
      tx.onerror = () => reject(tx.error);
    });
  }, docsAfter[0].storagePath);

  check(
    'uploaded file bytes are retrievable after a refresh',
    !!storedBlob && storedBlob.size === pdfBytes.length,
    storedBlob ? `${storedBlob.size} bytes, ${storedBlob.type}` : 'blob missing',
  );

  /* ── 7. Notifications persist their read state ─────────────────────────── */
  await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);
  const seeded = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.notifications') || '[]'),
  );
  check('notification feed seeded once', seeded.length === 8, `${seeded.length} notifications`);

  const unreadBefore = seeded.filter((n) => !n.read).length;
  await headerButton(2).click(); // bell
  await page.waitForSelector('text=Mark all read', { timeout: 10000 });
  await page.click('text=Mark all read');
  await sleep(1500);

  const afterRead = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.notifications') || '[]'),
  );
  check(
    'mark-all-read persists to storage',
    afterRead.length === 8 && afterRead.every((n) => n.read),
    `${afterRead.filter((n) => !n.read).length} still unread of ${afterRead.length} (was ${unreadBefore} unread)`,
  );

  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  await headerButton(2).click(); // bell again
  await page.waitForSelector('text=Mark all read', { timeout: 10000 }).catch(() => {});
  const panelText = await page.locator('body').innerText();
  // "Mark all read" only renders while something is unread.
  check(
    'read state stays read after a refresh',
    !panelText.includes('Mark all read'),
    panelText.includes('Mark all read') ? 'panel still offers Mark all read' : '',
  );
  // Toggle the bell shut. Pressing Escape leaves the click-outside overlay in
  // place, which would swallow the next click.
  await headerButton(2).click();
  await sleep(500);

  /* ── 8. Profile edits persist ──────────────────────────────────────────── */
  await headerButton(3).click(); // avatar
  await page.waitForSelector('input[placeholder="Your full name"]', { timeout: 10000 });
  await page.fill('input[placeholder="Your full name"]', 'Blayqe Forbes');
  await page.fill('input[placeholder="e.g. GRC Analyst"]', 'Security Engineer');
  await page.click('button:has-text("Save profile")');
  await sleep(1500);

  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  const storedProfile = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.profile') || 'null'),
  );
  check(
    'profile edits persist',
    storedProfile?.name === 'Blayqe Forbes' && storedProfile?.title === 'Security Engineer',
    `name=${storedProfile?.name}, title=${storedProfile?.title}`,
  );

  /* ── 8b. Clearing the notification feed is not undone by re-seeding ────── */
  await headerButton(2).click();
  await page.waitForSelector('text=Clear all', { timeout: 10000 });
  await page.click('text=Clear all');
  await sleep(1500);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  const afterClear = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.notifications') || '[]'),
  );
  check(
    'cleared notifications stay cleared (seed does not re-run)',
    afterClear.length === 0,
    `${afterClear.length} notification(s) came back`,
  );

  /* ── 8c. Complete the questionnaire: KB entry in, draft out, no resurrect ─ */
  await page.goto(`${BASE}/#editor`, { waitUntil: 'networkidle' });
  await sleep(2500);
  await page.click('button:has-text("Approve & Continue")');
  await page.waitForSelector('text=Review the package', { timeout: 10000 });

  // Attach a file on the approval step, so the cleanup path has something to do.
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'baa-signed.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nBAA\n%%EOF\n' + 'z'.repeat(512)),
  });
  await sleep(2000);
  const attachments = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.attachments') || '[]'),
  );
  check(
    'approval-step attachment is persisted with its bytes',
    attachments.length === 1 && !!attachments[0].storagePath,
    `${attachments.length} attachment(s), storagePath=${attachments[0]?.storagePath}`,
  );

  // Dispatch (the app gates completion on it), then complete.
  const printPopup = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  await page.click('button:has-text("Download PDF")');
  const pdfWindow = await printPopup;
  if (pdfWindow) await pdfWindow.close().catch(() => {});
  await sleep(1000);
  await page.click('button:has-text("Mark complete")');
  await page.waitForSelector('text=Questionnaire sent.', { timeout: 10000 });
  await sleep(3000); // outlast the autosave debounce and any in-flight write

  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  const afterComplete = await page.evaluate(() => ({
    drafts: JSON.parse(localStorage.getItem('serotonin.v2.drafts') || '[]'),
    kb: JSON.parse(localStorage.getItem('serotonin.v2.kbEntries') || '[]'),
    attachments: JSON.parse(localStorage.getItem('serotonin.v2.attachments') || '[]'),
  }));
  check(
    'completing a questionnaire creates the KB entry',
    afterComplete.kb.some((e) => e.vendor === 'Acme Corp' && e.questions === 3),
    `${afterComplete.kb.length} KB entry(s)`,
  );
  check(
    'the completed draft does not come back from an in-flight save',
    afterComplete.drafts.length === 0,
    `${afterComplete.drafts.length} draft(s): ${afterComplete.drafts.map((d) => d.vendor).join(', ')}`,
  );
  check(
    'attachments are cleaned up rather than orphaned',
    afterComplete.attachments.length === 0,
    `${afterComplete.attachments.length} attachment(s) left behind`,
  );

  /* ── 9. Theme choice persists, and a corrupt value cannot brick the app ── */
  await page.evaluate(() => localStorage.setItem('serotonin.v2.theme', '"not-a-real-theme"'));
  await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  check(
    'a corrupt stored theme falls back instead of breaking the app',
    (await page.locator('body').innerText()).includes('Security compliance,'),
  );

  await page.evaluate(() => localStorage.setItem('serotonin.v2.theme', '"obsidian"'));
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  const themeAfter = await page.evaluate(() => localStorage.getItem('serotonin.v2.theme'));
  check('theme choice persists', themeAfter === '"obsidian"', `theme=${themeAfter}`);

  /* ── 10. Legacy sessionStorage migration ───────────────────────────────── */
  await page.evaluate(() => {
    localStorage.removeItem('serotonin.v2.kbEntries');
    sessionStorage.setItem(
      'serotonin_kb',
      JSON.stringify([
        {
          id: 987654321,
          vendor: 'Legacy Vendor Inc',
          date: 'Jan 1, 2026',
          questions: 12,
          answered: 12,
          tags: ['Completed'],
          confidence: 91,
          source: 'Complete questionnaire',
          qaData: [{ text: 'Q', answer: 'A', source: 'S' }],
        },
      ]),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  const migrated = await page.evaluate(() => ({
    kb: JSON.parse(localStorage.getItem('serotonin.v2.kbEntries') || '[]'),
    legacy: sessionStorage.getItem('serotonin_kb'),
  }));
  check(
    'legacy sessionStorage data is migrated, not lost',
    migrated.kb.some((e) => e.vendor === 'Legacy Vendor Inc') && migrated.legacy === null,
    `${migrated.kb.length} entry(s), legacy key ${migrated.legacy === null ? 'cleared' : 'still present'}`,
  );

  /* ── 11. No console errors along the way ───────────────────────────────── */
  const realFailures = failedRequests.filter((r) => !r.includes('favicon'));
  const realErrors = consoleErrors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('Download the React DevTools') &&
      !(e.includes('Failed to load resource') && realFailures.length === 0),
  );
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));
  check(
    'no failed network requests',
    realFailures.length === 0,
    realFailures.slice(0, 4).join(' | '),
  );

  await page.screenshot({ path: 'tests/final.png', fullPage: false });
} catch (err) {
  check('test run completed without throwing', false, String(err?.message || err));
  await page.screenshot({ path: 'tests/error.png' }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
writeFileSync('tests/results.json', JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
