/**
 * Library listing + ownership test.
 *
 * Two behaviours that were reported as broken or missing:
 *
 *   1. An imported policy document is a knowledge base entry, so it has to be
 *      listed under "All entries" — not only under the Policy documents tab.
 *      The list used to be built from kbEntries alone, which made documents
 *      structurally unreachable from that tab.
 *
 *   2. An active assessment shows who owns it, and ownership can be handed to
 *      someone else. The transfer has to survive a refresh, and — the part that
 *      is easy to get wrong — it has to survive the original owner reopening
 *      the questionnaire, because the editor used to stamp its own profile name
 *      onto every autosave.
 *
 *   npm install
 *   npx playwright install chromium
 *   npm run build && npm run preview &
 *   node tests/ownership.spec.mjs
 *
 * Exits non-zero if any assertion fails.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.SEROTONIN_BASE || 'http://127.0.0.1:8099';
const results = [];

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
// The favicon is served by the host, not the app — a missing one is noise here.
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.location()?.url?.includes('favicon')) {
    consoleErrors.push(`${msg.text()} @ ${msg.location()?.url || ''}`);
  }
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

const readDrafts = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('serotonin.v2.drafts') || '[]'));

try {
  /* ── 1. Set a profile name, so "owner" means something ─────────────────── */
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Security compliance,', { timeout: 15000 });

  // The header renders: sidebar toggle, theme, bell, avatar.
  await page.locator('button').nth(3).click();
  await page.waitForSelector('input[placeholder="Your full name"]', { timeout: 10000 });
  await page.fill('input[placeholder="Your full name"]', 'Blayqe Forbes');
  await page.click('button:has-text("Save profile")');
  await sleep(1500);
  // Toggle the panel shut. Its click-outside overlay would otherwise swallow
  // every subsequent click.
  await page.locator('button').nth(3).click();
  await sleep(500);
  await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);

  /* ── 2. Create an assessment ───────────────────────────────────────────── */
  await page.click('text=Complete questionnaire');
  await page.waitForSelector('text=Where is the questionnaire', { timeout: 10000 });
  await page.fill('input >> nth=0', 'Northwind Health');
  await page.click('text=Manual entry');
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.fill(
    'textarea',
    '1. Do you have a SOC 2 Type II report?\n2. Describe your backup procedures.',
  );
  await page.click('text=Process questions');
  await page.waitForSelector('text=Review', { timeout: 20000 });
  await sleep(3000);

  const created = await readDrafts();
  check(
    'assessment is created with the signed-in profile as owner',
    created.length === 1 && created[0].owner === 'Blayqe Forbes',
    `owner=${created[0]?.owner}, initials=${created[0]?.ownerInitials}`,
  );

  /* ── 3. The dashboard shows ownership ──────────────────────────────────── */
  await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);
  const dashText = await page.locator('body').innerText();
  check(
    'active assessment card names its owner',
    dashText.includes('Northwind Health') && dashText.includes('Blayqe Forbes (you)'),
    dashText.split('\n').find((l) => l.includes('Blayqe Forbes')) || 'owner line not found',
  );
  check(
    'active assessment card offers a transfer control',
    await page.locator('button:has-text("Transfer")').first().isVisible(),
  );

  /* ── 4. Transfer it ────────────────────────────────────────────────────── */
  await page.locator('button:has-text("Transfer")').first().click();
  await page.waitForSelector('text=Transfer ownership', { timeout: 10000 });
  const panelText = await page.locator('body').innerText();
  check(
    'the transfer panel states the current owner',
    panelText.includes('is owned by'),
  );

  await page.fill('input[placeholder="New owner\'s name…"]', 'Sarah Lindqvist');
  await page.locator('button:text-is("Transfer")').last().click();
  await sleep(1800);

  const transferred = await readDrafts();
  check(
    'transfer writes the new owner to durable storage',
    transferred[0]?.owner === 'Sarah Lindqvist' && transferred[0]?.ownerInitials === 'SL',
    `owner=${transferred[0]?.owner}, initials=${transferred[0]?.ownerInitials}`,
  );
  check(
    'transfer does not disturb the questionnaire itself',
    transferred[0]?.questions?.length === 2 && transferred[0]?.vendor === 'Northwind Health',
    `${transferred[0]?.questions?.length} question(s), vendor=${transferred[0]?.vendor}`,
  );

  // The transfer is also written to the audit log as `questionnaire.transfer`,
  // which is not asserted here: recordAudit is a no-op with no backend attached
  // (there is no AuditLog table to append to), and this suite runs on the
  // on-device path. Re-run it against `npx ampx sandbox` to cover that.

  /* ── 5. It survives a refresh, and shows the new owner ─────────────────── */
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  const afterReload = await page.locator('body').innerText();
  check(
    'the new owner is shown after a refresh',
    afterReload.includes('Sarah Lindqvist') && !afterReload.includes('Blayqe Forbes (you)'),
    afterReload.split('\n').find((l) => l.includes('Sarah')) || 'new owner not shown',
  );

  /* ── 6. The original owner reopening it does not take it back ──────────── */
  // This is the regression that mattered: the editor built every autosave with
  // `owner: profile.name`, so simply resuming a transferred questionnaire
  // reverted the transfer within a couple of seconds.
  await page.click('text=Northwind Health');
  await page.waitForSelector('text=Review', { timeout: 15000 });
  const answers = page.locator('textarea');
  if (await answers.count()) {
    await answers.nth(0).fill('Yes — SOC 2 Type II, renewed annually.');
  }
  await sleep(3000);

  const afterResume = await readDrafts();
  check(
    'resuming a transferred assessment does not revert ownership',
    afterResume[0]?.owner === 'Sarah Lindqvist',
    `owner=${afterResume[0]?.owner}`,
  );
  check(
    'the answer typed by the previous owner is still saved',
    afterResume[0]?.questions?.some((q) => String(q.answer || '').includes('renewed annually')),
  );

  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  const afterEditorReload = await readDrafts();
  check(
    'ownership survives a refresh mid-edit',
    afterEditorReload[0]?.owner === 'Sarah Lindqvist',
    `owner=${afterEditorReload[0]?.owner}`,
  );

  /* ── 7. A new assessment still belongs to the person creating it ───────── */
  // Drop the editor's scratch copy so it opens at intake instead of resuming
  // Northwind. Doing it here rather than driving the whole approve-and-complete
  // flow keeps this suite about ownership; the completion path is covered by
  // persistence.spec.mjs.
  await page.evaluate(() => localStorage.removeItem('serotonin.v2.editorProgress'));
  await page.goto(`${BASE}/#editor`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  await page.waitForSelector('text=Where is the questionnaire', { timeout: 15000 });

  await page.fill('input >> nth=0', 'Contoso Ltd');
  await page.click('text=Manual entry');
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.fill('textarea', '1. Do you encrypt data at rest?');
  await page.click('text=Process questions');
  await page.waitForSelector('text=Review', { timeout: 20000 });
  await sleep(3000);

  const twoDrafts = await readDrafts();
  const contoso = twoDrafts.find((d) => d.vendor === 'Contoso Ltd');
  check(
    'a newly created assessment belongs to whoever created it, not the last owner',
    contoso?.owner === 'Blayqe Forbes',
    `owner=${contoso?.owner}`,
  );
  check(
    'the two assessments keep separate owners',
    twoDrafts.find((d) => d.vendor === 'Northwind Health')?.owner === 'Sarah Lindqvist',
    twoDrafts.map((d) => `${d.vendor}=${d.owner}`).join(', '),
  );

  await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle' });
  await sleep(1500);
  const bothText = await page.locator('body').innerText();
  check(
    'the dashboard shows each assessment against its own owner',
    bothText.includes('Sarah Lindqvist') && bothText.includes('Blayqe Forbes (you)'),
  );

  /* ── 8. Import a policy document ───────────────────────────────────────── */
  await page.goto(`${BASE}/#knowledge`, { waitUntil: 'networkidle' });
  await sleep(1200);
  await page.click('button:has-text("Import")');
  await page.waitForSelector('text=Access Control Policy', { timeout: 10000 });
  await page.click('button:text-is("SOC 2 Report")');
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'soc2-type-ii-2026.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n' + 'x'.repeat(2048),
    ),
  });
  await sleep(500);
  await page.click('button:has-text("Import 1 document")');
  await sleep(3000);

  /* ── 9. It is listed under "All entries" ───────────────────────────────── */
  // A full reload, not a hash navigation: the app is already on #knowledge, so
  // goto() would not remount it and the library would still be showing the
  // import screen.
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);

  const allTabLabel = await page.locator('button:has-text("All entries")').first().innerText();
  check(
    'the All entries tab counts documents as well as questionnaires',
    allTabLabel.includes('(1)'),
    `tab reads "${allTabLabel}"`,
  );

  // The library opens on "all". No tab click — that is the whole point.
  const allText = await page.locator('body').innerText();
  check(
    'a policy document is listed under All entries',
    allText.includes('soc2-type-ii-2026.pdf'),
    allText.includes('soc2-type-ii-2026.pdf') ? '' : 'document not on the all tab',
  );
  check(
    'the document is still openable from All entries',
    await page.locator('button[title="Open document"]').first().isVisible(),
  );

  /* ── 10. Search and the other tabs still behave ────────────────────────── */
  await page.fill('input[placeholder="Search by vendor, document, tag…"]', 'soc2');
  await sleep(600);
  const searched = await page.locator('body').innerText();
  check(
    'searching All entries matches document names',
    searched.includes('soc2-type-ii-2026.pdf'),
  );

  await page.fill('input[placeholder="Search by vendor, document, tag…"]', 'zzzz-no-such-thing');
  await sleep(600);
  const empty = await page.locator('body').innerText();
  check(
    'a search that matches nothing says so instead of listing everything',
    !empty.includes('soc2-type-ii-2026.pdf') && empty.includes('No results match your search'),
  );

  await page.fill('input[placeholder="Search by vendor, document, tag…"]', '');
  await sleep(600);
  await page.click('button:has-text("Completed (")');
  await sleep(800);
  const completedText = await page.locator('body').innerText();
  check(
    'the Completed tab still means completed questionnaires, not documents',
    !completedText.includes('soc2-type-ii-2026.pdf'),
  );

  await page.click('button:has-text("Policy documents (1)")');
  await sleep(800);
  const docsTabText = await page.locator('body').innerText();
  check(
    'the Policy documents tab still lists the document',
    docsTabText.includes('soc2-type-ii-2026.pdf'),
  );

  /* ── 11. Both kinds together, under headings ───────────────────────────── */
  // Seeded rather than driven through the five-step completion flow, which
  // persistence.spec.mjs already covers end to end.
  await page.evaluate(() => {
    localStorage.setItem('serotonin.v2.kbEntries', JSON.stringify([{
      id: 'seeded-entry-1',
      vendor: 'Globex Assurance',
      date: 'Aug 2026',
      questions: 12,
      answered: 12,
      industry: 'General',
      tags: ['SOC 2'],
      confidence: 91,
      source: 'Complete questionnaire',
      qaData: [{ text: 'Do you encrypt data at rest?', answer: 'Yes, AES-256.', source: 'Policy' }],
      savedAt: new Date().toISOString(),
    }]));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);

  const mixed = await page.locator('body').innerText();
  check(
    'All entries lists documents and questionnaires together',
    mixed.includes('soc2-type-ii-2026.pdf') && mixed.includes('Globex Assurance'),
    `docs=${mixed.includes('soc2-type-ii-2026.pdf')}, entries=${mixed.includes('Globex Assurance')}`,
  );
  check(
    'the mixed list labels its two sections',
    /POLICY DOCUMENTS \(1\)/i.test(mixed) && /COMPLETED QUESTIONNAIRES \(1\)/i.test(mixed),
    mixed.split('\n').filter((l) => /\(1\)/.test(l)).join(' | '),
  );
  check(
    'the All entries tab counts both kinds',
    (await page.locator('button:has-text("All entries")').first().innerText()).includes('(2)'),
  );

  /* ── 12. No noise ──────────────────────────────────────────────────────── */
  check(
    'no console errors',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '),
  );
} catch (err) {
  check('test run completed without throwing', false, String(err?.message || err));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} checks passed`);
try {
  writeFileSync(
    new URL('./results-ownership.json', import.meta.url),
    JSON.stringify({ passed, total: results.length, results }, null, 2),
  );
} catch { /* read-only checkout — the console output is the result */ }

if (passed !== results.length) process.exit(1);
