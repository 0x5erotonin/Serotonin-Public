/**
 * A questionnaire staying current with the knowledge base.
 *
 * The reported behaviour: start a questionnaire, import a policy document that
 * answers one of its questions, come back — and the question still says it needs
 * a manual answer, even after a refresh. Auto-review ran once at import and its
 * verdicts were frozen into the stored questions; reloading restored the verdict
 * rather than re-running the matcher.
 *
 * What has to be true now, and what must NOT change:
 *
 *   - an unanswered question picks up material imported after the review
 *   - it survives a refresh, because the refreshed verdict is persisted
 *   - an answer the reviewer typed is never overwritten, whatever turns up
 *   - an answered question whose better source appears is *marked*, not rewritten
 *
 *   npm run build && npm run preview &
 *   node tests/liveindex.spec.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.SEROTONIN_URL || 'http://127.0.0.1:4173';
const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// The favicon is served by the host, not the app — a missing one is noise here.
page.on('console', (m) => {
  const from = m.location()?.url || '';
  if (m.type() === 'error' && !from.includes('favicon') && !m.text().includes('favicon')) {
    pageErrors.push(`${m.text()} @ ${from}`);
  }
});

const progress = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('serotonin.v2.editorProgress') || 'null'));

const findQuestion = (state, needle) =>
  (state?.questions || []).find((q) => q.text.toLowerCase().includes(needle));

async function importDocument(name, body, category) {
  await page.goto(`${BASE}/#knowledge`, { waitUntil: 'networkidle' });
  await sleep(1200);
  await page.click('button:has-text("Import")');
  await page.waitForSelector('text=Access Control Policy', { timeout: 10000 });
  await page.click(`button:text-is("${category}")`);
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(body),
  });
  await sleep(500);
  await page.click('button:has-text("Import 1 document")');
  await sleep(3500);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Security compliance,', { timeout: 15000 });
  await sleep(1200);

  /* ── 1. Start a questionnaire with an empty knowledge base ─────────────── */
  await page.goto(`${BASE}/#editor`, { waitUntil: 'networkidle' });
  await sleep(1500);
  await page.fill('input >> nth=0', 'Northwind Health');
  await page.click('text=Manual entry');
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.fill(
    'textarea',
    [
      '1. Describe how customer data is encrypted at rest.',
      '2. How often is the disaster recovery plan tested?',
      '3. What is the airspeed velocity of an unladen swallow?',
    ].join('\n'),
  );
  await page.click('text=Process questions');
  await page.waitForSelector('text=Review auto-filled answers', { timeout: 25000 });
  await sleep(2500);

  const initial = await progress();
  const encryptionBefore = findQuestion(initial, 'encrypted at rest');
  check(
    'with nothing indexed, the questions need manual answers',
    encryptionBefore?.status === 'needs-input',
    `${encryptionBefore?.status}`,
  );

  // An answer the reviewer types themselves. This must survive everything below.
  const boxes = page.locator('textarea');
  await boxes.nth(1).fill('Tested twice a year. THIS IS MY OWN WORDING AND MUST NOT BE OVERWRITTEN.');
  await sleep(2000);

  /* ── 2. Import a document that answers question 1 ──────────────────────── */
  await importDocument(
    'information-security-policy.txt',
    [
      'Information Security Policy',
      '',
      'Section 4 — Cryptography',
      'All customer data is encrypted at rest using AES-256. Data in transit is protected with TLS 1.3. Encryption keys are managed in a key management service and rotated annually.',
      '',
      'Section 5 — Resilience',
      'The disaster recovery plan is exercised twice per year: one tabletop walkthrough and one full failover test to the secondary region.',
    ].join('\n'),
    'Information Security Policy',
  );

  /* ── 3. Return to the questionnaire — the reported scenario ────────────── */
  await page.goto(`${BASE}/#editor`, { waitUntil: 'networkidle' });
  await sleep(4000);

  const afterImport = await progress();
  const encryptionAfter = findQuestion(afterImport, 'encrypted at rest');
  check(
    'a question with no answer picks up a document imported after the review',
    encryptionAfter?.status !== 'needs-input' && !!encryptionAfter?.suggestion,
    `${encryptionAfter?.status} @ ${encryptionAfter?.confidence}% from ${encryptionAfter?.suggestion?.sourceName}`,
  );
  check(
    'the new material is cited by name',
    /information-security-policy/i.test(encryptionAfter?.suggestion?.sourceName || ''),
    encryptionAfter?.suggestion?.sourceName,
  );
  check(
    'the reviewer is told the knowledge base changed',
    /knowledge base updated|re-checking/i.test(await page.locator('body').innerText()),
    (await page.locator('body').innerText()).split('\n').find((l) => /knowledge base/i.test(l)) || 'no notice',
  );

  const typedAfterImport = findQuestion(afterImport, 'disaster recovery');
  check(
    'an answer the reviewer typed is not overwritten',
    /MUST NOT BE OVERWRITTEN/.test(typedAfterImport?.answer || ''),
    `"${(typedAfterImport?.answer || '').slice(0, 50)}"`,
  );

  /* ── 4. And it survives a refresh, which is where it used to fail ──────── */
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(3500);
  const afterReload = await progress();
  const encryptionReloaded = findQuestion(afterReload, 'encrypted at rest');
  check(
    'the refreshed verdict survives a page refresh',
    encryptionReloaded?.status !== 'needs-input',
    `${encryptionReloaded?.status} @ ${encryptionReloaded?.confidence}%`,
  );
  check(
    'the typed answer survives the refresh too',
    /MUST NOT BE OVERWRITTEN/.test(findQuestion(afterReload, 'disaster recovery')?.answer || ''),
  );
  check(
    'a question nothing covers still says it needs a manual answer',
    findQuestion(afterReload, 'airspeed')?.status === 'needs-input',
    findQuestion(afterReload, 'airspeed')?.status,
  );

  /* ── 5. Accept the suggestion, then import a competing document ────────── */
  const accept = page.locator('button:has-text("Use this answer")').first();
  if (await accept.count()) {
    await accept.click();
    await sleep(2000);
  }
  const accepted = findQuestion(await progress(), 'encrypted at rest');
  check(
    'accepting a suggestion answers the question',
    !!String(accepted?.answer || '').trim(),
    `"${(accepted?.answer || '').slice(0, 40)}"`,
  );

  await importDocument(
    'cryptographic-standard-2026.txt',
    [
      'Cryptographic Standard 2026',
      '',
      'Encryption at rest',
      'Customer data is encrypted at rest using AES-256-GCM with keys held in a hardware security module. Data in transit uses TLS 1.3 exclusively. Keys are rotated every 90 days and rotation is verified by automated control testing.',
      '',
      'Scope',
      'This standard supersedes the cryptography section of the information security policy for all production systems.',
    ].join('\n'),
    'Other',
  );

  await page.goto(`${BASE}/#editor`, { waitUntil: 'networkidle' });
  await sleep(4500);

  const afterSecond = await progress();
  const encryptionFinal = findQuestion(afterSecond, 'encrypted at rest');
  check(
    'an accepted answer is not rewritten when a competing document arrives',
    encryptionFinal?.answer === accepted?.answer,
    encryptionFinal?.answer === accepted?.answer
      ? 'unchanged'
      : `changed to "${(encryptionFinal?.answer || '').slice(0, 40)}"`,
  );
  check(
    'the newer source is surfaced as a marker instead',
    !!encryptionFinal?.update?.sourceName,
    encryptionFinal?.update
      ? `${encryptionFinal.update.sourceName} @ ${encryptionFinal.update.score}%`
      : 'no marker',
  );

  const finalText = await page.locator('body').innerText();
  check(
    'the marker is visible on the question',
    /NEWER SOURCE/i.test(finalText),
    finalText.split('\n').find((l) => /newer source/i.test(l)) || 'not rendered',
  );
  check(
    'the marker explains itself on hover rather than in the layout',
    !!(await page.locator('button[title*="has not been changed"]').count()),
    `${await page.locator('button[title*="has not been changed"]').count()} tooltip(s)`,
  );

  /* ── 6. Clean run ──────────────────────────────────────────────────────── */
  check('no page errors throughout', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (err) {
  check('test run completed without throwing', false, String(err?.message || err));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.passed).length;
console.log(`\n${passed}/${results.length} checks passed`);
try {
  writeFileSync(
    new URL('./results-liveindex.json', import.meta.url),
    JSON.stringify({ passed, total: results.length, results }, null, 2),
  );
} catch { /* read-only checkout */ }
if (passed !== results.length) process.exit(1);
