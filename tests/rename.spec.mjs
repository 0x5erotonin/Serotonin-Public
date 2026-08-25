/**
 * Renaming a knowledge base document.
 *
 * Two halves:
 *
 *   normaliseDocName      A document's name is also the filename handed to the
 *                         browser on download, so a rename is untrusted input on
 *                         a path that ends at someone's filesystem. These cover
 *                         the hostile inputs and the merely annoying ones.
 *
 *   withCurrentSources    Index rows store the document name and date denormalised for
 *                         citations. A rename must not leave auto-review quoting
 *                         a filename that no longer exists.
 *
 *   node tests/rename.spec.mjs
 */

import { normaliseDocName, extensionOf, MAX_DOC_NAME } from '../src/lib/docName.js';
import { withCurrentSources } from '../src/lib/sourceNames.js';

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

function checkThat(name, condition, detail = '') {
  if (condition) passed++; else failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${detail}`}`);
}

const PREV = 'security-questionnaire-test-answered.xlsx';

/* ── extensionOf ─────────────────────────────────────────────────────────── */

check('extension of a normal file', extensionOf('report.pdf'), '.pdf');
check('extension of a multi-dot name', extensionOf('soc2.type-ii.2026.pdf'), '.pdf');
check('no extension when there is no dot', extensionOf('SOC 2 Report'), '');
check('a leading dot is not an extension', extensionOf('.bashrc'), '');
check('a trailing dot is not an extension', extensionOf('report.'), '');
check('prose after a dot is not an extension', extensionOf('v1.2 final draft'), '');
check('an absurdly long suffix is not an extension', extensionOf('a.thisisnotanextension'), '');

/* ── The ordinary case ───────────────────────────────────────────────────── */

check(
  'a plain rename is kept as typed',
  normaliseDocName('Q3 Security Questionnaire.xlsx', PREV),
  'Q3 Security Questionnaire.xlsx',
);
check(
  'surrounding whitespace is trimmed',
  normaliseDocName('   Access Control Policy.pdf  ', 'old.pdf'),
  'Access Control Policy.pdf',
);
check(
  'internal whitespace runs collapse',
  normaliseDocName('SOC 2    Type   II.pdf', 'old.pdf'),
  'SOC 2 Type II.pdf',
);
check(
  'a pasted newline does not survive',
  normaliseDocName('Disaster\nRecovery\tPlan.pdf', 'old.pdf'),
  'Disaster Recovery Plan.pdf',
);

/* ── Extension handling ──────────────────────────────────────────────────── */

check(
  'dropping the extension keeps the old one',
  normaliseDocName('Answered SIG', PREV),
  'Answered SIG.xlsx',
);
check(
  'deliberately changing the extension is respected',
  normaliseDocName('Answered SIG.csv', PREV),
  'Answered SIG.csv',
);
check(
  'no extension anywhere is fine',
  normaliseDocName('Internal Notes', 'Scratch'),
  'Internal Notes',
);

/* ── Names that must be rejected ─────────────────────────────────────────── */

check('empty input is rejected', normaliseDocName('', PREV), null);
check('whitespace-only input is rejected', normaliseDocName('     ', PREV), null);
check('a single dot is rejected', normaliseDocName('.', PREV), null);
check('a double dot is rejected', normaliseDocName('..', PREV), null);
check('null is rejected', normaliseDocName(null, PREV), null);
check('undefined is rejected', normaliseDocName(undefined, PREV), null);
// Not rejected: after the leading dot goes, ".pdf" is just the word "pdf", which
// is a usable if odd name, and it then picks up the missing extension. Odd input
// gets an odd result rather than a silent refusal, and it is visible on screen
// immediately.
check('a bare dotted extension becomes a name', normaliseDocName('.pdf', PREV), 'pdf.xlsx');

/* ── Hostile input ───────────────────────────────────────────────────────── */

check(
  'a path traversal attempt cannot escape the download directory',
  normaliseDocName('../../../etc/passwd', PREV),
  'etcpasswd.xlsx',
);
check(
  'a windows path is flattened',
  normaliseDocName('C:\\Windows\\System32\\drivers\\etc\\hosts', PREV),
  'CWindowsSystem32driversetchosts.xlsx',
);
check(
  'a leading slash is removed',
  normaliseDocName('/etc/shadow', PREV),
  'etcshadow.xlsx',
);
check(
  'a NUL byte cannot truncate the name downstream',
  normaliseDocName('report\u0000.pdf.exe', PREV),
  'report.pdf.exe',
);
check(
  'control characters are stripped',
  normaliseDocName('re\u0007po\u001brt.pdf', PREV),
  'report.pdf',
);
check(
  'a rename cannot produce a hidden file',
  normaliseDocName('.hidden-policy.pdf', PREV),
  'hidden-policy.pdf',
);
check(
  'windows-illegal characters are removed',
  normaliseDocName('Q3: report <final>?.pdf', PREV),
  'Q3 report final.pdf',
);
check(
  'a reserved device name is made safe',
  normaliseDocName('CON', 'notes.txt'),
  'CON_.txt',
);
check(
  'a reserved device name with an extension is made safe',
  normaliseDocName('nul.pdf', PREV),
  'nul_.pdf',
);

/* ── Length ──────────────────────────────────────────────────────────────── */

const long = normaliseDocName(`${'a'.repeat(500)}.pdf`, PREV);
checkThat(
  'an over-long name is capped',
  long.length <= MAX_DOC_NAME,
  `${long.length} characters`,
);
checkThat(
  'capping preserves the extension',
  long.endsWith('.pdf'),
  long.slice(-10),
);
const longNoExt = normaliseDocName('b'.repeat(500), 'notes');
checkThat(
  'an over-long name with no extension is capped too',
  longNoExt.length <= MAX_DOC_NAME,
  `${longNoExt.length} characters`,
);

/* ── Idempotence ─────────────────────────────────────────────────────────── */

const once = normaliseDocName('  Q3:  Security  Report <v2>.pdf ', PREV);
const twice = normaliseDocName(once, PREV);
check('cleaning an already-clean name changes nothing', twice, once);

/* ── withCurrentSources ──────────────────────────────────────────────────── */

const docs = [
  { id: 'doc1', name: 'Access Control Policy 2026.pdf', date: 'Aug 24, 2026', savedAt: '2026-08-24T09:00:00.000Z' },
  { id: 'doc2', name: 'DR Plan.pdf', date: 'Jan 3, 2026', savedAt: '2026-01-03T09:00:00.000Z' },
];
const entries = [
  { id: 'entry1', vendor: 'Acme Corp', date: 'Aug 2026', savedAt: '2026-08-01T09:00:00.000Z' },
];

const chunks = [
  { id: 'c1', sourceType: 'document', sourceId: 'doc1', sourceName: 'acp-final-v3-FINAL.pdf', text: 'a' },
  { id: 'c2', sourceType: 'document', sourceId: 'doc1', sourceName: 'acp-final-v3-FINAL.pdf', text: 'b' },
  { id: 'c3', sourceType: 'document', sourceId: 'doc2', sourceName: 'DR Plan.pdf', text: 'c' },
  { id: 'c4', sourceType: 'qa', sourceId: 'entry1', sourceName: 'Acme Corp · Aug 2026', question: 'q', text: 'd' },
];

const refreshed = withCurrentSources(chunks, { docs, entries });

check("a renamed document's citations use the new name", refreshed[0].sourceName, 'Access Control Policy 2026.pdf');
check('every row of that document is updated', refreshed[1].sourceName, 'Access Control Policy 2026.pdf');
check('an unrenamed document keeps its name', refreshed[2].sourceName, 'DR Plan.pdf');
check('a questionnaire row keeps its composed label', refreshed[3].sourceName, 'Acme Corp · Aug 2026');
checkThat('the passage text is not disturbed', refreshed.every((c, i) => c.text === chunks[i].text));
checkThat('rows are not reordered or dropped', refreshed.length === chunks.length && refreshed[3].id === 'c4');

// The date is what lets a reviewer tell a current policy from a stale one.
check('a document row is stamped with its upload date', refreshed[0].sourceDate, 'Aug 24, 2026');
check('an older document carries its own date', refreshed[2].sourceDate, 'Jan 3, 2026');
check('a questionnaire row is dated too', refreshed[3].sourceDate, 'Aug 2026');
check('the sortable timestamp comes through', refreshed[0].sourceSavedAt, '2026-08-24T09:00:00.000Z');

const deletedSource = withCurrentSources(
  [{ id: 'c9', sourceType: 'document', sourceId: 'gone', sourceName: 'Deleted Report.pdf' }],
  { docs, entries },
);
check(
  'a row whose document was deleted keeps its stored name',
  deletedSource[0].sourceName,
  'Deleted Report.pdf',
);

checkThat('no sources means no change', withCurrentSources(chunks, { docs: [], entries: [] }) === chunks);
checkThat('no chunks is handled', withCurrentSources([], { docs }).length === 0);
checkThat('missing arguments are handled', withCurrentSources().length === 0);
checkThat(
  'a second pass changes nothing',
  withCurrentSources(refreshed, { docs, entries }) === refreshed,
  'should return the same array when already current',
);
checkThat(
  'a document with no name keeps the citation readable',
  withCurrentSources(
    [{ id: 'c1', sourceType: 'document', sourceId: 'doc3', sourceName: 'Original.pdf' }],
    { docs: [{ id: 'doc3', name: '', date: 'Feb 2, 2026' }] },
  )[0].sourceName === 'Original.pdf',
);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
