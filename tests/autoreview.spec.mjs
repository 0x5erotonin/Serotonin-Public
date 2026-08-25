/**
 * End-to-end auto-review test.
 *
 * Uploads a real PDF, parsed by the real PDF.js in a real browser, and asserts
 * the whole chain: extract text → find questions → index the knowledge base →
 * match → classify → render citations the analyst can accept.
 *
 * The knowledge base is seeded through the UI itself — import a policy document,
 * complete a questionnaire — so indexing-on-import and indexing-on-completion
 * are covered too, rather than injecting fixtures into storage.
 *
 *   npm install
 *   npx playwright install chromium
 *   npm run build && npm run preview &
 *   node tests/autoreview.spec.mjs
 *
 * With no amplify_outputs.json this exercises the lexical half. Run it again
 * after `npx ampx sandbox` to cover Bedrock embeddings and the semantic half.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

// Point at `npm run preview` (or `npm run dev` on :5173).
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
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

const ls = (key) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(`serotonin.v2.${k}`) || 'null'), key);

const headerButton = (i) => page.locator('button').nth(i);

async function freshEditor() {
  await page.evaluate(() => localStorage.removeItem('serotonin.v2.editorProgress')).catch(() => {});
  await page.goto(`${BASE}/#editor`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Security compliance,', { timeout: 15000 });
  await sleep(1500);

  /* ── 1. Seed the knowledge base: import a policy document ─────────────── */
  await page.click('text=Knowledge base');
  await sleep(800);
  await page.click('button:has-text("Import")');
  await page.waitForSelector('text=Access Control Policy', { timeout: 10000 });
  await page.click('button:text-is("Information Security Policy")');

  const policyText = [
    'Information Security Policy',
    '',
    'Section 4 — Cryptography',
    'All customer data is encrypted at rest using AES-256. Data in transit is protected with TLS 1.3. Encryption keys are managed in AWS KMS and rotated annually. Access to key material is restricted to the security engineering team.',
    '',
    'Section 5 — Resilience',
    'The disaster recovery plan is exercised twice per year: one tabletop walkthrough and one full failover test to the secondary region. Results are documented and reviewed by the CISO within 30 days.',
    '',
    'Section 6 — Personnel',
    'All employees complete criminal background and employment verification checks prior to their start date. Security awareness training is completed on hire and annually thereafter.',
  ].join('\n');

  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'information-security-policy.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(policyText),
  });
  await sleep(400);
  await page.click('button:has-text("Import 1 document")');
  await sleep(3500);

  // A second document covering the same ground on purpose. One source is not a
  // choice, so the source picker only appears when at least two sources can
  // answer a question — this is what makes that path testable.
  await page.click('button:has-text("Import")');
  await page.waitForSelector('text=Access Control Policy', { timeout: 10000 });
  await page.click('button:text-is("Access Control Policy")');
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'access-control-standard-2026.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from([
      'Access Control Standard 2026',
      '',
      'Section 2 — Authentication',
      'Multi-factor authentication is mandatory for all administrative access to production systems. Enforcement is through the corporate identity provider using FIDO2 security keys; SMS and voice factors are disabled outright.',
      '',
      'Section 3 — Cryptographic controls',
      'Customer data is encrypted at rest with AES-256 and in transit with TLS 1.3. Key material is held in a managed key service and rotated annually.',
    ].join('\n')),
  });
  await sleep(400);
  await page.click('button:has-text("Import 1 document")');
  await sleep(3500);

  const chunks = await ls('chunks');
  check(
    'importing a document indexes it into searchable passages',
    Array.isArray(chunks) && chunks.length > 0,
    `${chunks?.length ?? 0} passage(s)`,
  );
  check(
    'passages carry their source document name',
    (chunks || []).some((c) => c.sourceName === 'information-security-policy.txt') &&
      (chunks || []).some((c) => c.sourceName === 'access-control-standard-2026.txt') &&
      (chunks || []).every((c) => !!c.sourceName),
    [...new Set((chunks || []).map((c) => c.sourceName))].join(' | '),
  );
  check(
    'the document is marked searchable in the library',
    (await page.locator('body').innerText()).includes('Searchable') ||
      (await page.locator('text=Everything indexed').count()) > 0,
  );

  /* ── 2. Seed answer history: complete a questionnaire ─────────────────── */
  await freshEditor();
  await page.fill('input >> nth=0', 'Globex');
  await page.click('text=Manual entry');
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.fill(
    'textarea',
    '1. Do you require multi-factor authentication for administrative access?\n2. Describe your process for provisioning and de-provisioning user accounts.',
  );
  await page.click('text=Process questions');
  await page.waitForSelector('text=Review auto-filled answers', { timeout: 20000 });
  await sleep(1200);

  const boxes = page.locator('textarea');
  await boxes.nth(0).fill('Yes. MFA via hardware tokens or TOTP is enforced for all administrative and remote access, with no exceptions.');
  await boxes.nth(1).fill('Accounts are provisioned through our IdP on ticket approval and de-provisioned automatically within 4 hours of termination.');
  await sleep(1500);

  await page.click('button:has-text("Approve & Continue")');
  await page.waitForSelector('text=Review the package', { timeout: 10000 });
  const popup = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  await page.click('button:has-text("Download PDF")');
  const win = await popup;
  if (win) await win.close().catch(() => {});
  await sleep(600);
  await page.click('button:has-text("Mark complete")');
  await page.waitForSelector('text=Questionnaire sent.', { timeout: 10000 });
  await sleep(3500);

  const afterQa = await ls('chunks');
  const qaChunks = (afterQa || []).filter((c) => c.sourceType === 'qa');
  check(
    'completing a questionnaire indexes its answers for reuse',
    qaChunks.length === 2,
    `${qaChunks.length} Q&A passage(s)`,
  );
  check(
    'Q&A passages keep the question and the answer separately',
    qaChunks.every((c) => c.question && c.text && c.question !== c.text),
  );

  /* ── 3. The real test: upload a PDF and auto-review it ────────────────── */
  await freshEditor();
  const pdf = readFileSync('tests/fixtures/questionnaire.pdf');
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'northwind-security-questionnaire.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });

  // Extraction + matching, then the review screen.
  await page.waitForSelector('text=Review auto-filled answers', { timeout: 40000 });
  await sleep(1500);

  const reviewText = await page.locator('body').innerText();

  check(
    'the PDF was parsed and questions were found',
    /Found \d+ questions? in northwind-security-questionnaire\.pdf/.test(reviewText) ||
      reviewText.includes('Do you require multi-factor authentication'),
    reviewText.split('\n').find((l) => l.includes('Found')) || 'no notice line',
  );

  const editorProgress = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.editorProgress') || 'null'),
  );
  const extracted = editorProgress?.questions || [];
  check(
    'six questions extracted from the PDF, page furniture excluded',
    extracted.length === 6,
    `${extracted.length}: ${extracted.map((q) => q.text.slice(0, 28)).join(' | ')}`,
  );
  check(
    'the vendor and CONFIDENTIAL header lines were not treated as questions',
    !extracted.some((q) => /confidential|page 1 of/i.test(q.text)),
  );
  check(
    'section headings were not treated as questions',
    !extracted.some((q) => /^section \d/i.test(q.text)),
  );

  const find = (needle) => extracted.find((q) => q.text.toLowerCase().includes(needle));

  const mfa = find('multi-factor');
  check(
    'a question answered before is auto-filled from history',
    mfa?.status === 'auto-filled' && /MFA via hardware tokens/.test(mfa.answer || ''),
    `${mfa?.status} @ ${mfa?.confidence}% — "${(mfa?.answer || '').slice(0, 40)}"`,
  );
  check(
    'the auto-filled answer is attributed to the questionnaire it came from',
    /Globex/.test(mfa?.source || ''),
    mfa?.source,
  );
  // Provenance an auto-filled answer has to carry: which source, and when that
  // source landed, so a reviewer can tell a current policy from a stale one.
  check(
    'the auto-filled answer records the source it was pulled from',
    !!mfa?.suggestion?.sourceName,
    mfa?.suggestion?.sourceName,
  );
  check(
    'the auto-filled answer carries the source date',
    !!mfa?.suggestion?.sourceDate,
    `sourceDate="${mfa?.suggestion?.sourceDate}"`,
  );
  // Alternatives are match-run state and must NOT be persisted: six full
  // passages per question is over a megabyte on a large questionnaire, several
  // times the DynamoDB item limit. `extracted` is read from storage, so their
  // absence here is the assertion, and the picker itself is checked in the DOM.
  check(
    'alternatives are kept out of the stored record',
    (mfa?.alternatives ?? []).length === 0,
    `${mfa?.alternatives?.length ?? 0} stored on a record that must stay under 400 KB`,
  );

  const pickerButtons = page.locator('button:has-text("Change source")');
  const pickerCount = await pickerButtons.count();
  check(
    'the review screen offers to change the source',
    pickerCount >= 1,
    `${pickerCount} question(s) offer a source picker`,
  );

  if (pickerCount > 0) {
    await pickerButtons.first().click();
    await sleep(600);
    const pickerText = await page.locator('body').innerText();
    check(
      'the picker lists sources to choose from',
      /answer from a different source/i.test(pickerText),
    );
    check(
      'each listed source shows when it was added',
      /added\s+\w/.test(pickerText),
      pickerText.split('\n').find((l) => l.includes('added')) || 'no date line',
    );
    check(
      'the source in use is marked as such',
      pickerText.includes('IN USE') || pickerText.includes('In use'),
    );
    check(
      'a listed source can be applied',
      await page.locator('button:has-text("Use this answer")').first().isVisible(),
    );
    await pickerButtons.first().click();
    await sleep(400);
  }
  check(
    'the source name is shown on screen, not just held in state',
    (await page.locator('body').innerText()).includes(mfa?.suggestion?.sourceName || ' '),
    mfa?.suggestion?.sourceName,
  );

  // The reported truncation bug, checked end to end against real PDF.js output:
  // a cited passage must not begin mid-word ("ative access to production").
  const cited = extracted.filter((q) => (q.suggestion?.text || '').trim());
  const fragments = cited.filter((q) => {
    const opening = q.suggestion.text.trim().match(/^[A-Za-z][A-Za-z'-]*/);
    if (!opening) return false;
    // Compare against the document text the passage came from: if the opening
    // token appears nowhere as a whole word, it is a fragment of one.
    return !new RegExp(`\\b${opening[0]}\\b`, 'i').test(q.suggestion.text.slice(opening[0].length + 1) + ' ' + (q.text || ''))
      && /^[a-z]/.test(q.suggestion.text.trim());
  });
  check(
    'no cited passage opens with a lowercase word fragment',
    fragments.length === 0,
    fragments.map((q) => `"${q.suggestion.text.slice(0, 40)}…"`).join(' | '),
  );

  const encryption = find('encrypted at rest');
  check(
    'a question covered by a policy document is flagged, not auto-filled',
    encryption?.status === 'flagged' && !encryption?.answer,
    `${encryption?.status} @ ${encryption?.confidence}% answer="${encryption?.answer}"`,
  );
  check(
    'the document match cites the source document',
    /information-security-policy/i.test(encryption?.suggestion?.sourceName || ''),
    encryption?.suggestion?.sourceName,
  );
  check(
    'the cited passage is the encryption paragraph',
    /AES-256/.test(encryption?.suggestion?.text || ''),
    (encryption?.suggestion?.text || '').slice(0, 60),
  );

  const dr = find('disaster recovery');
  check(
    'the DR question finds the resilience passage',
    dr?.status === 'flagged' && /failover|tabletop/.test(dr?.suggestion?.text || ''),
    `${dr?.status} — ${(dr?.suggestion?.text || '').slice(0, 50)}`,
  );

  const swallow = find('swallow');
  check(
    'an unanswerable question is marked for a manual answer',
    swallow?.status === 'needs-input' && !swallow?.suggestion,
    `${swallow?.status} @ ${swallow?.confidence}%`,
  );
  check(
    'the manual case explains why nothing matched',
    /No related material|Closest match/.test(swallow?.recommendation || ''),
    swallow?.recommendation,
  );

  /* ── 4. Accepting a suggestion ─────────────────────────────────────────── */
  check(
    'suggestions render with the source and an accept button',
    /from your documents/i.test(reviewText) && /use this answer/i.test(reviewText),
  );
  check(
    'the match is explained to the analyst',
    /matched on .*(encryption|at rest|transit)/i.test(reviewText) || /keyword \d+%/.test(reviewText),
    reviewText.split('\n').find((l) => l.includes('matched on')) || '',
  );

  await page.click('button:has-text("Use this answer")');
  await sleep(2000);

  const afterAccept = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.editorProgress') || 'null'),
  );
  const accepted = (afterAccept?.questions || []).filter((q) => q.answer?.trim()).length;
  check(
    'accepting a suggestion writes it into the answer',
    accepted >= 2,
    `${accepted} answered of ${afterAccept?.questions?.length}`,
  );

  /* ── 5. It survives a refresh, like everything else ───────────────────── */
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  const afterReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.editorProgress') || 'null'),
  );
  check(
    'the reviewed questionnaire survives a refresh with its statuses',
    (afterReload?.questions || []).length === 6 &&
      afterReload.questions.some((q) => q.status === 'auto-filled'),
    `${afterReload?.questions?.length} questions`,
  );

  /* ── 6. Unsupported and unreadable files fail honestly ────────────────── */
  await freshEditor();
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'questionnaire.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('PK not really a spreadsheet'),
  });
  await sleep(1500);
  const xlsxText = await page.locator('body').innerText();
  // Predates the spreadsheet reader, when the app could only say "export it as
  // CSV". It reads .xlsx natively now, so a corrupt one has to fail on its own
  // terms — naming what is wrong with the archive rather than the format.
  check(
    'a corrupt .xlsx says what is actually wrong with it',
    /not a zip archive|not an excel workbook|truncated or corrupt|could not be read/i.test(xlsxText),
    xlsxText.split('\n').find((l) => /zip|archive|workbook|corrupt/i.test(l)) || 'no message',
  );

  // A real .xls — the pre-2007 binary format — is a different failure with a
  // different remedy, and the message has to say which.
  await freshEditor();
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'legacy-questionnaire.xls',
    mimeType: 'application/vnd.ms-excel',
    buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]),
  });
  await sleep(2500);
  const xlsText = await page.locator('body').innerText();
  check(
    'a legacy .xls upload says to re-save as .xlsx',
    /save as \.xlsx/i.test(xlsText),
    xlsText.split('\n').find((l) => /\.xls/i.test(l)) || 'no message',
  );

  // And a real workbook goes all the way through: the reader picks the
  // questionnaire sheet and the question column out of a SIG-shaped file.
  await freshEditor();
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'sig-questionnaire.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: readFileSync('tests/fixtures/sig-questionnaire.xlsx'),
  });
  await page.waitForSelector('text=Review auto-filled answers', { timeout: 40000 });
  await sleep(1500);
  const sheetQuestions = (await page.evaluate(() =>
    JSON.parse(localStorage.getItem('serotonin.v2.editorProgress') || 'null'),
  ))?.questions || [];
  check(
    'a SIG-shaped workbook yields its questions',
    sheetQuestions.length >= 8,
    `${sheetQuestions.length} question(s)`,
  );
  check(
    'the question column was used, not the reference or domain columns',
    sheetQuestions.every((q) => q.text.length > 20 && !/^[A-Z]{2,3}-\d+$/.test(q.text.trim())),
    sheetQuestions.slice(0, 3).map((q) => q.text.slice(0, 24)).join(' | '),
  );

  await freshEditor();
  await page.setInputFiles('input[type="file"] >> nth=0', {
    name: 'empty.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Table of Contents\nPage 1\n(c) 2026\n'),
  });
  await sleep(2000);
  const emptyText = await page.locator('body').innerText();
  check(
    'a file with no questions says so rather than proceeding with nothing',
    /No questions found/i.test(emptyText),
    emptyText.split('\n').find((l) => /No questions/i.test(l)) || 'no message',
  );

  /* ── 7. Clean run ─────────────────────────────────────────────────────── */
  const realErrors = pageErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('DevTools') && !e.includes('Failed to load resource'),
  );
  check('no page errors throughout', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await page.screenshot({ path: 'tests/final-autoreview.png', fullPage: false });
} catch (err) {
  check('test run completed without throwing', false, String(err?.message || err));
  await page.screenshot({ path: 'tests/error-autoreview.png' }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
writeFileSync('tests/results-autoreview.json', JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
