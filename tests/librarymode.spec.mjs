/**
 * Deciding whether a deployment serves one shared library or one per browser.
 *
 * This flag changes who can read a compliance library, so the parsing has to
 * fail closed: anything that is not unambiguously "yes" leaves the library
 * private. A typo in a console environment variable must never be the reason a
 * SOC 2 report becomes world-readable.
 *
 *   node tests/librarymode.spec.mjs
 */

import {
  readLibraryMode, SHARED_OWNER_KEY, SHARED_FILE_PREFIX, SHARED_REKEY_KEY,
} from '../src/lib/libraryMode.js';

let passed = 0;
let failed = 0;
const check = (name, condition, detail = '') => {
  if (condition) passed++; else failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${detail}`}`);
};
const shared = (value) => readLibraryMode({ VITE_SHARED_LIBRARY: value }).shared;

/* ── Off by default ───────────────────────────────────────────────────────── */

check('an empty environment leaves the library private', readLibraryMode({}).shared === false);
check('an undefined value leaves it private', shared(undefined) === false);
check('an empty string leaves it private', shared('') === false);
check('whitespace leaves it private', shared('   ') === false);
check('null leaves it private', shared(null) === false);
check('no argument at all does not throw', readLibraryMode().shared === false);

/* ── The values that do turn it on ────────────────────────────────────────── */

for (const value of ['1', 'true', 'yes', 'on', 'shared']) {
  check(`"${value}" turns sharing on`, shared(value) === true);
}
for (const value of ['TRUE', 'True', 'YES', 'On', 'SHARED']) {
  check(`"${value}" is accepted regardless of case`, shared(value) === true);
}
check('surrounding whitespace is tolerated', shared('  true  ') === true);
check('a boolean true is accepted', shared(true) === true);
check('the number 1 is accepted', shared(1) === true);

/* ── Explicit off ─────────────────────────────────────────────────────────── */

for (const value of ['0', 'false', 'no', 'off', 'FALSE']) {
  check(`"${value}" keeps it private`, shared(value) === false);
  check(`"${value}" is recognised as a deliberate off`, readLibraryMode({ VITE_SHARED_LIBRARY: value }).recognised === true);
}

/* ── Fail closed on anything ambiguous ────────────────────────────────────── */
// The whole point: a value nobody understood must not be read as consent.

for (const value of ['ture', 'enabled', '2', 'y', 'sharing', 'public', 'maybe', '-1', 'null', 'undefined', 'on ish']) {
  check(`"${value}" does not turn sharing on`, shared(value) === false);
  check(`"${value}" is reported as unrecognised so it can be surfaced`,
    readLibraryMode({ VITE_SHARED_LIBRARY: value }).recognised === false);
}

check(
  'the raw value is preserved so the UI can quote it back',
  readLibraryMode({ VITE_SHARED_LIBRARY: 'ture' }).raw === 'ture',
);
check(
  'an accepted value is marked recognised',
  readLibraryMode({ VITE_SHARED_LIBRARY: 'yes' }).recognised === true,
);
check(
  'an absent value is recognised, not flagged as a mistake',
  readLibraryMode({}).recognised === true,
);

/* ── The constants other modules key off ──────────────────────────────────── */

check('the shared owner key is a fixed, non-empty string',
  typeof SHARED_OWNER_KEY === 'string' && SHARED_OWNER_KEY.length > 0, SHARED_OWNER_KEY);
check('it cannot collide with a Cognito identity id',
  !SHARED_OWNER_KEY.includes(':'), SHARED_OWNER_KEY);
check('it cannot collide with a locally minted key',
  !SHARED_OWNER_KEY.startsWith('local-'), SHARED_OWNER_KEY);
check('the shared file prefix ends in a slash, so paths concatenate correctly',
  SHARED_FILE_PREFIX.endsWith('/'), SHARED_FILE_PREFIX);
check('the shared prefix is distinct from the per-identity ones',
  !SHARED_FILE_PREFIX.startsWith('user-files/') && !SHARED_FILE_PREFIX.startsWith('guest-files/'),
  SHARED_FILE_PREFIX);
check('the re-key marker is namespaced with the app\'s other storage keys',
  SHARED_REKEY_KEY.startsWith('serotonin.'), SHARED_REKEY_KEY);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
