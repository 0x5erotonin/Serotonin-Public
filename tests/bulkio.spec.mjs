/**
 * Bulk import and manual export, driven through the real UI.
 *
 * The old importer took a list of files, applied one category to all of them,
 * and ran upload → extract → index in a single loop behind a boolean spinner.
 * Fine for two files, unusable for thirty: no progress, no per-file category,
 * and one thrown error taking the whole batch down.
 *
 * What is asserted here:
 *
 *   - many files import in one pass, each with its own guessed category
 *   - a .zip is expanded, and the entries that are not documents are skipped
 *   - a file that fails is reported by name and the rest still import
 *   - the batch reports progress and a per-file outcome
 *   - export produces files that actually download and parse
 *
 *   node tests/fixtures/make-zip.mjs        # once, to build the archive
 *   npm run build && npm run preview &
 *   node tests/bulkio.spec.mjs
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.SEROTONIN_URL || 'http://127.0.0.1:4173';
const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  const from = m.location()?.url || '';
  if (m.type() === 'error' && !from.includes('favicon') && !m.text().includes('favicon')) {
    pageErrors.push(`${m.text()} @ ${from}`);
  }
});

const docs = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('serotonin.v2.kbDocs') || '[]'));

const readDownload = async (fileHandle) => {
  const stream = await fileHandle.createReadStream();
  let raw = '';
  for await (const part of stream) raw += part;
  return raw;
};

const textFile = (name, body) => ({
  name,
  mimeType: 'text/plain',
  buffer: Buffer.from(body),
});

/**
 * Open a fresh import screen.
 *
 * A reload rather than a hash navigation: #knowledge → #knowledge does not
 * remount, so the previous import screen — and its now-disabled button — would
 * still be what is on the page.
 */
async function openImport() {
  await page.goto(`${BASE}/#knowledge`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  await page.click('button:has-text("Import"):not([disabled])');
  await page.waitForSelector('text=Default category for new files', { timeout: 10000 });
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Security compliance,', { timeout: 15000 });
  await sleep(1500);

  /* ── 1. A mixed batch, categories guessed per file ─────────────────────── */
  await openImport();

  // No category chosen on purpose: the guess has to carry the batch.
  await page.setInputFiles('input[type="file"][multiple]', [
    textFile('access-control-policy-v4.txt', 'Access Control Policy\n\nMFA is required for all administrative access to production. Enforcement is through the identity provider with hardware keys, and SMS is disabled.'),
    textFile('disaster-recovery-plan-2026.txt', 'Disaster Recovery Plan\n\nRecovery time objective is four hours. The plan is exercised twice a year with a full failover to the secondary region.'),
    textFile('soc2-type-ii-fy26.txt', 'SOC 2 Type II\n\nCustomer data is encrypted at rest with AES-256 and in transit with TLS 1.3. No exceptions were noted.'),
    textFile('incident-response-plan.txt', 'Incident Response Plan\n\nSeverity one incidents page the on-call engineer within five minutes and a post-incident review is held within five business days.'),
    textFile('scan_0043.txt', 'Miscellaneous notes about the security programme that do not match any category name at all.'),
  ]);
  await sleep(1200);

  const queueText = await page.locator('body').innerText();
  check('every selected file is queued', /queue \(5\)/i.test(queueText), queueText.split('\n').find((l) => l.startsWith('QUEUE')) || '');

  const categories = await page.locator('select[aria-label^="Category for"]').evaluateAll(
    (nodes) => nodes.map((n) => [n.getAttribute('aria-label'), n.value]),
  );
  const categoryFor = (needle) =>
    (categories.find(([label]) => label.toLowerCase().includes(needle)) || [])[1];

  check(
    'each file gets its own category, guessed from its name',
    categoryFor('access-control') === 'Access Control Policy' &&
      categoryFor('disaster-recovery') === 'Disaster Recovery Plan' &&
      categoryFor('soc2') === 'SOC 2 Report' &&
      categoryFor('incident-response') === 'Incident Response Plan',
    categories.map(([, v]) => v).join(' | '),
  );
  check(
    'an unrecognisable filename falls back to Other rather than guessing wrong',
    categoryFor('scan_0043') === 'Other',
    categoryFor('scan_0043'),
  );
  check(
    'the category is editable per file',
    !(await page.locator('select[aria-label^="Category for"]').first().isDisabled()),
  );

  // Correct one by hand, which is the point of having them editable.
  await page.locator('select[aria-label*="scan_0043"]').selectOption('Risk Assessment');
  await sleep(400);

  await page.click('button:has-text("Import 5 documents")');
  await page.waitForSelector('text=Imported 5 of 5', { timeout: 60000 });
  await sleep(2500);

  const afterBatch = await docs();
  check('all five documents are saved', afterBatch.length === 5, `${afterBatch.length} saved`);
  check(
    'the per-file categories are what was saved, including the hand correction',
    afterBatch.find((d) => d.name.includes('soc2'))?.category === 'SOC 2 Report' &&
      afterBatch.find((d) => d.name.includes('scan_0043'))?.category === 'Risk Assessment',
    afterBatch.map((d) => `${d.name.slice(0, 18)}=${d.category}`).join(', '),
  );
  check(
    'every document kept its bytes',
    afterBatch.every((d) => !!d.storagePath),
    afterBatch.filter((d) => !d.storagePath).map((d) => d.name).join(', ') || 'all stored',
  );

  const chunks = await page.evaluate(() => JSON.parse(localStorage.getItem('serotonin.v2.chunks') || '[]'));
  check(
    'the batch is indexed for auto-review',
    new Set(chunks.map((c) => c.sourceId)).size === 5,
    `${chunks.length} passage(s) across ${new Set(chunks.map((c) => c.sourceId)).size} source(s)`,
  );

  /* ── 2. A .zip of documents ────────────────────────────────────────────── */
  await openImport();

  await page.setInputFiles('input[type="file"][multiple]', {
    name: 'policies.zip',
    mimeType: 'application/zip',
    buffer: readFileSync('tests/fixtures/policies.zip'),
  });
  await sleep(3000);

  const zipQueue = await page.locator('body').innerText();
  check(
    'the archive is expanded into its documents',
    /queue \(3\)/i.test(zipQueue),
    zipQueue.split('\n').find((l) => l.startsWith('QUEUE')) || 'queue not shown',
  );
  check(
    'non-document entries, dotfiles and macOS metadata are skipped',
    !zipQueue.includes('logo.png') && !zipQueue.includes('DS_Store') && !zipQueue.includes('._access'),
  );
  check(
    'entries from an archive are labelled as such',
    /FROM ZIP/i.test(zipQueue),
  );
  check(
    'nested paths are flattened to the filename',
    zipQueue.includes('access-control-policy.txt') && !zipQueue.includes('policies/access-control'),
  );

  await page.click('button:has-text("Import 3 documents")');
  await page.waitForSelector('text=Imported 3 of 3', { timeout: 60000 });
  await sleep(2500);

  const afterZip = await docs();
  check('the archive contents are saved', afterZip.length === 8, `${afterZip.length} total`);
  check(
    'they are recorded as having come from an archive',
    afterZip.filter((d) => d.source === 'Imported from archive').length === 3,
    afterZip.filter((d) => d.source === 'Imported from archive').length + ' from archive',
  );

  /* ── 3. One bad file does not take the batch with it ───────────────────── */
  await openImport();
  await page.setInputFiles('input[type="file"][multiple]', [
    textFile('vendor-management-policy.txt', 'Vendor Management Policy\n\nAll third parties handling customer data are assessed before onboarding and reassessed annually.'),
    // A .xlsx that is not a spreadsheet: stored, but unreadable, so it cannot be
    // indexed. The import must say so and carry on.
    { name: 'broken-questionnaire.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK not really a spreadsheet') },
    textFile('data-classification-policy.txt', 'Data Classification Policy\n\nData is classified as public, internal, confidential or restricted, and handling requirements follow from the classification.'),
  ]);
  await sleep(1200);
  await page.click('button:has-text("Import 3 documents")');
  await page.waitForSelector('text=Imported 3 of 3', { timeout: 60000 });
  await sleep(2500);

  const summary = await page.locator('body').innerText();
  check(
    'the unreadable file is named in the summary',
    /broken-questionnaire\.xlsx/.test(summary),
    summary.split('\n').find((l) => /broken-questionnaire/.test(l)) || 'not reported',
  );
  check(
    'and it says the file was stored but is not searchable',
    /not searchable/i.test(summary),
  );
  const afterMixed = await docs();
  check(
    'the good files in the same batch still imported',
    afterMixed.some((d) => d.name.includes('vendor-management')) &&
      afterMixed.some((d) => d.name.includes('data-classification')),
    `${afterMixed.length} documents total`,
  );

  /* ── 4. Manual export ──────────────────────────────────────────────────── */
  await page.goto(`${BASE}/#knowledge`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  check(
    'export is reachable from the library, not buried',
    await page.locator('button:has-text("Export")').first().isVisible(),
  );
  await page.locator('button:has-text("Export")').first().click();
  await page.waitForSelector('text=Full backup', { timeout: 10000 });

  check(
    'the export screen offers a manifest and a backup',
    /document manifest/i.test(await page.locator('body').innerText()) &&
      /full backup/i.test(await page.locator('body').innerText()),
  );

  // The manifest.
  const manifestDownload = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.click('button[aria-label="Download Document manifest (CSV)"]');
  const manifestFile = await manifestDownload;
  check('the manifest downloads', !!manifestFile, manifestFile ? await manifestFile.suggestedFilename() : 'no download');
  if (manifestFile) {
    const csv = await readDownload(manifestFile);
    check('the manifest is a CSV with a header row', csv.includes('Document,Category,Added'), csv.slice(0, 60));
    check(
      'it lists the documents that were imported',
      csv.includes('soc2-type-ii-fy26.txt') && csv.includes('Risk Assessment'),
    );
    check('it reports index status per document', /searchable/.test(csv));
    check('it starts with a UTF-8 BOM so Excel reads it correctly', csv.charCodeAt(0) === 0xfeff);
  }

  // The full backup.
  const backupDownload = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await page.click('button[aria-label="Download Full backup (JSON)"]');
  const backupFile = await backupDownload;
  check('the backup downloads', !!backupFile, backupFile ? await backupFile.suggestedFilename() : 'no download');
  if (backupFile) {
    const bundle = JSON.parse(await readDownload(backupFile));
    check('the backup is in the expected format', bundle.format === 'serotonin.backup', bundle.format);
    check(
      'the backup carries every document record',
      (bundle.collections.kbDocs || []).length === afterMixed.length,
      `${(bundle.collections.kbDocs || []).length} of ${afterMixed.length}`,
    );
    check(
      'the backup inlines the stored file bytes, not just the metadata',
      Object.keys(bundle.files || {}).length >= afterMixed.length,
      `${Object.keys(bundle.files || {}).length} file(s) inlined`,
    );
    const firstFile = Object.values(bundle.files || {})[0];
    check(
      'an inlined file is base64 with its name and type',
      !!firstFile?.base64 && !!firstFile?.name,
      firstFile ? `${firstFile.name} (${firstFile.contentType})` : 'none',
    );
  }

  /* ── 5. Answer history export refuses honestly when empty ──────────────── */
  const emptyAnswers = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
  await page.click('button[aria-label="Download Answer history (CSV)"]');
  await sleep(1200);
  const answersFile = await emptyAnswers;
  check(
    'exporting answer history with none recorded says so instead of downloading an empty file',
    !answersFile && /no answer history yet/i.test(await page.locator('body').innerText()),
    answersFile ? 'downloaded an empty file' : (await page.locator('body').innerText()).split('\n').find((l) => /no answer/i.test(l)) || '',
  );

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
    new URL('./results-bulkio.json', import.meta.url),
    JSON.stringify({ passed, total: results.length, results }, null, 2),
  );
} catch { /* read-only checkout */ }
if (passed !== results.length) process.exit(1);
