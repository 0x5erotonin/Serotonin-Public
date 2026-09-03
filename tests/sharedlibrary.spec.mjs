/**
 * Shared library mode: does a second browser actually see the first one's data?
 *
 * The reported behaviour is that the app is blank from any endpoint but the one
 * that uploaded. That is by design — records are scoped to the caller's Cognito
 * identity, so two browsers are two libraries — and VITE_SHARED_LIBRARY=1 is the
 * switch that makes one library serve everyone.
 *
 * Asserting that properly means simulating a *different browser against the same
 * backend*. In the fake-AWS harness the server is `__fake_ddb` in localStorage
 * and the browser's identity is `__fake_identity_id`, so a second endpoint is:
 * keep the database, change the identity, drop every local mirror. That is
 * exactly what a colleague opening the URL looks like.
 *
 * Both modes are built by the harness — /index.html is private, /shared.html is
 * built with the flag on — so the contrast is tested rather than assumed.
 *
 *   SEROTONIN_URL=http://127.0.0.1:8098 node tests/sharedlibrary.spec.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = process.env.SEROTONIN_URL || 'http://127.0.0.1:8098';
const PRIVATE_APP = `${BASE}/index.html`;
const SHARED_APP = `${BASE}/shared.html`;

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

/** Everything the "server" holds. Survives a simulated change of endpoint. */
const table = (model) =>
  page.evaluate((m) => Object.values(JSON.parse(localStorage.getItem('__fake_ddb') || '{}')[m] || {}), model);

/**
 * Become a different browser against the same backend.
 *
 * Drops every local mirror and marker, and mints a new Cognito identity, while
 * leaving __fake_ddb — the server — untouched.
 */
async function becomeAnotherEndpoint(identity) {
  await page.evaluate((id) => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('serotonin.')) localStorage.removeItem(key);
    }
    localStorage.setItem('__fake_identity_id', id);
  }, identity);
  await page.evaluate(() => new Promise((resolve) => {
    // IndexedDB holds file bytes; a different endpoint would not have them.
    const request = indexedDB.deleteDatabase('serotonin-files');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }));
}

async function importDocument(appUrl, name, body) {
  await page.goto(`${appUrl}#knowledge`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  await page.click('button:has-text("Import"):not([disabled])');
  await page.waitForSelector('text=Default category for new files', { timeout: 15000 });
  await page.setInputFiles('input[type="file"][multiple]', {
    name, mimeType: 'text/plain', buffer: Buffer.from(body),
  });
  await sleep(1000);
  await page.click('button:has-text("Import 1 document")');
  await page.waitForSelector('text=Imported 1 of 1', { timeout: 60000 });
  await sleep(2500);
}

const libraryText = async (appUrl) => {
  await page.goto(`${appUrl}#knowledge`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(4000);
  return page.locator('body').innerText();
};

try {
  /* ── 1. Private mode: the reported behaviour, confirmed ──────────────────── */
  await page.goto(PRIVATE_APP, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);

  await importDocument(PRIVATE_APP, 'private-mode-policy.txt',
    'Access Control Policy\n\nMFA is required for all administrative access to production systems.');

  const privateRows = await table('KbDocument');
  check(
    'the document reaches the backend',
    privateRows.length === 1,
    `${privateRows.length} row(s) in KbDocument`,
  );
  check(
    'and is filed under this browser\'s own identity',
    privateRows[0]?.ownerKey?.startsWith('us-east-1:'),
    privateRows[0]?.ownerKey,
  );

  await becomeAnotherEndpoint('us-east-1:99999999-cccc-dddd-eeee-ffffffffffff');
  const privateFromElsewhere = await libraryText(PRIVATE_APP);
  check(
    'a second endpoint sees nothing — the reported symptom, reproduced',
    !privateFromElsewhere.includes('private-mode-policy.txt'),
    'the second endpoint could see it, so the premise of this test is wrong',
  );
  check(
    'even though the record is still on the server',
    (await table('KbDocument')).length === 1,
    `${(await table('KbDocument')).length} row(s) still present`,
  );

  /* ── 2. Shared mode: the same journey, different outcome ─────────────────── */
  await page.goto(SHARED_APP, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('serotonin-files');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }));
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);

  const sharedNotice = await page.locator('body').innerText();
  check(
    'shared mode says so on screen, without opening a panel',
    /shared library/i.test(sharedNotice) && /anyone with this url/i.test(sharedNotice),
    sharedNotice.split('\n').find((l) => /shared library/i.test(l)) || 'no notice',
  );

  await importDocument(SHARED_APP, 'shared-mode-policy.txt',
    'Disaster Recovery Plan\n\nThe plan is exercised twice per year with a full failover to the secondary region.');

  const sharedRows = (await table('KbDocument')).filter((r) => r.name === 'shared-mode-policy.txt');
  check(
    'the document reaches the backend in shared mode too',
    sharedRows.length === 1,
    `${sharedRows.length} row(s)`,
  );
  check(
    'filed under one shared key rather than a per-browser identity',
    sharedRows[0]?.ownerKey === 'shared-library',
    sharedRows[0]?.ownerKey,
  );

  // The whole question, asked properly.
  await becomeAnotherEndpoint('us-east-1:11111111-2222-3333-4444-555555555555');
  const sharedFromElsewhere = await libraryText(SHARED_APP);
  check(
    'a completely different endpoint sees the document',
    sharedFromElsewhere.includes('shared-mode-policy.txt'),
    sharedFromElsewhere.includes('shared-mode-policy.txt') ? '' : 'still blank from the second endpoint',
  );
  check(
    'and the shared-library notice is shown there too',
    /shared library/i.test(sharedFromElsewhere),
  );

  // A third endpoint, to be sure this is not an artefact of the second.
  await becomeAnotherEndpoint('us-east-1:aaaa1111-bbbb-2222-cccc-333333333333');
  const thirdEndpoint = await libraryText(SHARED_APP);
  check(
    'so does a third',
    thirdEndpoint.includes('shared-mode-policy.txt'),
  );

  /* ── 3. A second endpoint can contribute, not just read ──────────────────── */
  await importDocument(SHARED_APP, 'contributed-elsewhere.txt',
    'Incident Response Plan\n\nSeverity one incidents page the on-call engineer within five minutes.');

  await becomeAnotherEndpoint('us-east-1:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  const backAtTheFirst = await libraryText(SHARED_APP);
  check(
    'a document added from one endpoint appears at another',
    backAtTheFirst.includes('contributed-elsewhere.txt'),
  );
  check(
    'and the original is still there — nothing was displaced',
    backAtTheFirst.includes('shared-mode-policy.txt'),
  );
  check(
    'every shared record carries the shared key',
    (await table('KbDocument'))
      .filter((r) => r.name.includes('shared-mode') || r.name.includes('contributed'))
      .every((r) => r.ownerKey === 'shared-library'),
  );

  /* ── 4. Private data written before the switch is re-keyed, not lost ─────── */
  // The trap: turning the flag on changes the key every query filters by, so
  // records written under a per-identity key stop matching and the library looks
  // wiped. They are re-filed instead.
  await page.goto(PRIVATE_APP, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('__fake_ddb', JSON.stringify({}));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2000);
  await importDocument(PRIVATE_APP, 'written-before-the-switch.txt',
    'Vendor Management Policy\n\nThird parties handling customer data are assessed before onboarding.');

  const beforeSwitch = await table('KbDocument');
  check(
    'a record exists under the private key before the switch',
    beforeSwitch.length === 1 && beforeSwitch[0].ownerKey.startsWith('us-east-1:'),
    beforeSwitch[0]?.ownerKey,
  );

  // Flip the deployment to shared, same browser, same backend.
  const afterSwitchText = await libraryText(SHARED_APP);
  const afterSwitch = await table('KbDocument');
  check(
    'after switching to shared mode the record is re-keyed, not orphaned',
    afterSwitch.length === 1 && afterSwitch[0].ownerKey === 'shared-library',
    `${afterSwitch.length} row(s), ownerKey=${afterSwitch[0]?.ownerKey}`,
  );
  check(
    'and it is still visible in the library',
    afterSwitchText.includes('written-before-the-switch.txt'),
  );
  check(
    'the re-key did not duplicate it',
    afterSwitch.length === 1,
    `${afterSwitch.length} row(s)`,
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
    new URL('./results-sharedlibrary.json', import.meta.url),
    JSON.stringify({ passed, total: results.length, results }, null, 2),
  );
} catch { /* read-only checkout */ }
if (passed !== results.length) process.exit(1);
