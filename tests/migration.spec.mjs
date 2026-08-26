/**
 * Device → cloud migration, and the guard behind it.
 *
 * The failure this exists to prevent: everything created before a backend was
 * attached lives in this browser alone, and `putRecord` never marks it dirty —
 * with no client there is nothing to sync to, so no retry is queued. The first
 * time a backend appears, `listAll` reads an empty DynamoDB, succeeds, and
 * writes that empty result over the mirror. The only copy of the user's library
 * is destroyed by a successful read.
 *
 * Two independent defences, tested separately because either alone is enough to
 * prevent the loss and both should hold:
 *
 *   the guard      `listAll` refuses to overwrite an unsynced collection with an
 *                  empty cloud result
 *   the migration  on first connection, device records and files are uploaded
 *
 * This runs against the fake-AWS harness, where `__fake_ddb` in localStorage
 * stands in for DynamoDB, so the "backend just appeared" moment can be staged.
 *
 *   SEROTONIN_URL=http://127.0.0.1:8098 node tests/migration.spec.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.SEROTONIN_URL || 'http://127.0.0.1:8098';
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

/** The library as it would exist on a device that never had a backend. */
const DEVICE_STATE = {
  kbEntries: [
    {
      id: 'entry-legacy-1',
      vendor: 'Globex Assurance',
      date: 'Jul 2026',
      questions: 12,
      answered: 12,
      industry: 'General',
      tags: ['SOC 2'],
      confidence: 91,
      source: 'Complete questionnaire',
      qaData: [{ text: 'Do you encrypt data at rest?', answer: 'Yes, AES-256.', source: 'Policy' }],
      savedAt: '2026-07-02T10:00:00.000Z',
    },
  ],
  kbDocs: [
    {
      id: 'doc-legacy-1',
      name: 'soc2-type-ii-2026.pdf',
      category: 'SOC 2 Report',
      note: 'Imported before the backend existed',
      sizeBytes: 2048,
      size: '2 KB',
      contentType: 'application/pdf',
      storagePath: '',
      date: 'Jul 2, 2026',
      source: 'Imported',
      tags: [],
      savedAt: '2026-07-02T10:05:00.000Z',
    },
  ],
  drafts: [
    {
      id: 'draft-legacy-1',
      vendor: 'Northwind Health',
      status: 'draft',
      step: 'review',
      assignee: '',
      manualText: '',
      questions: [{ id: 1, text: 'Do you have a SOC 2 report?', answer: 'Yes.', status: 'auto-filled' }],
      owner: 'Blayqe Forbes',
      ownerInitials: 'BF',
      progress: 100,
      questionCount: 1,
      savedAt: '2026-07-03T09:00:00.000Z',
      savedAtLabel: 'Jul 3, 9:00 AM',
    },
  ],
};

/** Put the browser into "device-era data, empty cloud" and reload. */
async function stageDeviceEra({ alreadyMigrated }) {
  await page.evaluate(
    ({ state, migrated }) => {
      localStorage.setItem('__fake_ddb', JSON.stringify({}));
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('serotonin.v2.synced.')) localStorage.removeItem(key);
        if (key.startsWith('serotonin.v2.dirty.')) localStorage.removeItem(key);
        if (key.startsWith('serotonin.v2.tomb.')) localStorage.removeItem(key);
      }
      if (migrated) localStorage.setItem('serotonin.v2.migratedToCloud', 'true');
      else localStorage.removeItem('serotonin.v2.migratedToCloud');
      for (const [name, rows] of Object.entries(state)) {
        localStorage.setItem(`serotonin.v2.${name}`, JSON.stringify(rows));
      }
    },
    { state: DEVICE_STATE, migrated: alreadyMigrated },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(6000);
}

const mirror = (name) =>
  page.evaluate((n) => JSON.parse(localStorage.getItem(`serotonin.v2.${n}`) || '[]'), name);

const table = (model) =>
  page.evaluate(
    (m) => Object.values(JSON.parse(localStorage.getItem('__fake_ddb') || '{}')[m] || {}),
    model,
  );

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Security compliance,', { timeout: 15000 });
  await sleep(1500);

  /* ── 1. The guard on its own ────────────────────────────────────────────
   * Migration is marked as already done, so nothing uploads. An empty cloud
   * must still not be allowed to erase the device. */
  await stageDeviceEra({ alreadyMigrated: true });

  check(
    'an empty cloud does not erase unsynced device records',
    (await mirror('kbEntries')).length === 1 && (await mirror('kbDocs')).length === 1,
    `kbEntries=${(await mirror('kbEntries')).length}, kbDocs=${(await mirror('kbDocs')).length}`,
  );
  check(
    'and the drafts survive too',
    (await mirror('drafts')).length === 1,
    `${(await mirror('drafts')).length} draft(s)`,
  );

  await page.goto(`${BASE}/#knowledge`, { waitUntil: 'networkidle' });
  await sleep(2500);
  check(
    'the library still shows them on screen',
    (await page.locator('body').innerText()).includes('soc2-type-ii-2026.pdf'),
  );

  /* ── 2. The migration ───────────────────────────────────────────────────
   * Same starting state, but this device has never migrated. Everything should
   * be uploaded rather than merely preserved. */
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await stageDeviceEra({ alreadyMigrated: false });

  const uploadedEntries = await table('KbEntry');
  const uploadedDocs = await table('KbDocument');
  const uploadedDrafts = await table('Questionnaire');

  check(
    'completed questionnaires are uploaded to the cloud',
    uploadedEntries.length === 1 && uploadedEntries[0].vendor === 'Globex Assurance',
    `${uploadedEntries.length} row(s) in KbEntry`,
  );
  check(
    'knowledge base documents are uploaded',
    uploadedDocs.length === 1 && uploadedDocs[0].name === 'soc2-type-ii-2026.pdf',
    `${uploadedDocs.length} row(s) in KbDocument`,
  );
  check(
    'in-flight questionnaires are uploaded',
    uploadedDrafts.length === 1 && uploadedDrafts[0].vendor === 'Northwind Health',
    `${uploadedDrafts.length} row(s) in Questionnaire`,
  );
  check(
    'the uploaded records carry an owner key',
    uploadedEntries.every((row) => !!row.ownerKey),
    uploadedEntries[0]?.ownerKey,
  );
  check(
    'the device copy is kept as well, not moved',
    (await mirror('kbEntries')).length === 1,
  );
  check(
    'the user is told it happened',
    /moved to cloud storage/i.test(await page.locator('body').innerText()),
    (await page.locator('body').innerText()).split('\n').find((l) => /cloud storage/i.test(l)) || 'no banner',
  );

  /* ── 3. It runs once, and never duplicates ──────────────────────────────── */
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(5000);
  check(
    'a second load does not upload everything again',
    (await table('KbEntry')).length === 1 && (await table('KbDocument')).length === 1,
    `KbEntry=${(await table('KbEntry')).length}, KbDocument=${(await table('KbDocument')).length}`,
  );
  check(
    'and the banner does not reappear on every load',
    !/moved to cloud storage/i.test(await page.locator('body').innerText()),
  );

  /* ── 4. A cloud that already has data is not overwritten ────────────────── */
  // The conflicting row has to carry *this* caller's ownerKey. The existence
  // check is scoped by owner — correctly, since another user's rows must not
  // block your migration — so seeding it under a different owner would leave
  // this testing nothing while still passing.
  const ownerKey = (await table('KbEntry'))[0]?.ownerKey;
  check('the fixture can use the real owner key', !!ownerKey, ownerKey);

  await page.evaluate((owner) => {
    localStorage.removeItem('serotonin.v2.migratedToCloud');
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('serotonin.v2.synced.')) localStorage.removeItem(key);
    }
    // A different device, same account, got there first.
    const tables = JSON.parse(localStorage.getItem('__fake_ddb') || '{}');
    tables.KbEntry = {
      'entry-from-elsewhere': {
        id: 'entry-from-elsewhere',
        ownerKey: owner,
        vendor: 'Initech',
        savedAt: '2026-08-01T00:00:00.000Z',
      },
    };
    localStorage.setItem('__fake_ddb', JSON.stringify(tables));
    localStorage.setItem('serotonin.v2.kbEntries', JSON.stringify([
      { id: 'entry-local-only', vendor: 'Local Only', date: 'Aug 2026', questions: 1, answered: 1, savedAt: '2026-08-02T00:00:00.000Z' },
    ]));
  }, ownerKey);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(6000);

  const afterConflict = await table('KbEntry');
  check(
    "another device's row is not overwritten",
    afterConflict.some((row) => row.id === 'entry-from-elsewhere' && row.vendor === 'Initech'),
    `${afterConflict.length} row(s): ${afterConflict.map((r) => r.vendor).join(', ')}`,
  );
  // The subtle one. Skipping a populated collection looks safe and is not: the
  // device's own record exists nowhere else, and a non-empty cloud result
  // bypasses the guard in listAll, so the next read would overwrite it. The
  // migration merges by id instead.
  check(
    'a record that exists only on this device is merged into a populated collection',
    afterConflict.some((row) => row.id === 'entry-local-only' && row.vendor === 'Local Only'),
    `${afterConflict.length} row(s): ${afterConflict.map((r) => r.vendor).join(', ')}`,
  );
  check(
    'nothing is duplicated by the merge',
    new Set(afterConflict.map((r) => r.id)).size === afterConflict.length,
    afterConflict.map((r) => r.id).join(', '),
  );
  check(
    'the local-only record is still on the device too',
    (await mirror('kbEntries')).some((row) => row.id === 'entry-local-only'),
  );

  /* ── 5. Export produces something restorable ────────────────────────────── */
  await page.goto(`${BASE}/#knowledge`, { waitUntil: 'networkidle' });
  await sleep(2000);
  await page.click('button:has-text("Storage info")');
  await page.waitForSelector('text=Storage & Security', { timeout: 10000 });
  check(
    'the storage panel offers a backup',
    await page.locator('button:has-text("Export everything")').isVisible(),
  );

  const download = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.click('button:has-text("Export everything")');
  const file = await download;
  check('exporting downloads a file', !!file, file ? await file.suggestedFilename() : 'no download');

  if (file) {
    const stream = await file.createReadStream();
    let raw = '';
    for await (const part of stream) raw += part;
    let bundle = null;
    try { bundle = JSON.parse(raw); } catch { /* reported below */ }
    check('the backup is valid JSON in the expected format', bundle?.format === 'serotonin.backup', bundle?.format);
    check(
      'the backup contains the library',
      Array.isArray(bundle?.collections?.kbEntries) && Array.isArray(bundle?.collections?.kbDocs),
      bundle ? Object.keys(bundle.collections).join(', ') : '',
    );
    check('the backup is dated', !!bundle?.exportedAt, bundle?.exportedAt);
  }

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
    new URL('./results-migration.json', import.meta.url),
    JSON.stringify({ passed, total: results.length, results }, null, 2),
  );
} catch { /* read-only checkout */ }
if (passed !== results.length) process.exit(1);
