/**
 * Export formatting and bulk-import category guessing.
 *
 * The CSV half carries a security requirement, not just a formatting one: these
 * cells come out of vendor questionnaires and other people's PDFs, and a cell
 * starting `=` is executed as a formula when the file is opened in Excel or
 * Sheets. An export that hands somebody a live formula is a vulnerability in the
 * export, not in their spreadsheet.
 *
 *   node tests/exportformats.spec.mjs
 */

import {
  csvField, toCsv, answerHistoryCsv, documentManifestCsv, assessmentsCsv,
  guessDocCategory, exportFilename, DOC_CATEGORIES,
} from '../src/lib/exportFormats.js';

let passed = 0;
let failed = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected;
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
};
const checkThat = (name, condition, detail = '') => {
  if (condition) passed++; else failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${detail}`}`);
};

/* ── CSV quoting ──────────────────────────────────────────────────────────── */

check('a plain field is untouched', csvField('SOC 2 Type II'), 'SOC 2 Type II');
check('a comma forces quoting', csvField('Yes, annually'), '"Yes, annually"');
check('a quote is doubled and wrapped', csvField('He said "yes"'), '"He said ""yes"""');
check('a newline forces quoting', csvField('Line one\nLine two'), '"Line one\nLine two"');
check('empty is empty', csvField(''), '');
check('null becomes empty rather than "null"', csvField(null), '');
check('undefined becomes empty', csvField(undefined), '');
check('a number is stringified', csvField(91), '91');
check('zero is not dropped', csvField(0), '0');

/* ── CSV injection ────────────────────────────────────────────────────────── */

check(
  'a formula is neutralised',
  csvField('=1+1'),
  "'=1+1",
);
check(
  'the classic command-execution payload is neutralised',
  csvField('=cmd|\'/c calc\'!A1'),
  "'=cmd|'/c calc'!A1",
);
check('a leading plus is neutralised', csvField('+1234'), "'+1234");
check('a leading minus is neutralised', csvField('-1+2'), "'-1+2");
check('a leading at-sign is neutralised', csvField('@SUM(A1:A9)'), "'@SUM(A1:A9)");
check('a leading tab is neutralised', csvField('\tvalue'), "'\tvalue");
checkThat(
  'a neutralised field that also needs quoting gets both',
  csvField('=HYPERLINK("http://evil","click"),x') === '"\'=HYPERLINK(""http://evil"",""click""),x"',
  csvField('=HYPERLINK("http://evil","click"),x'),
);
check(
  'a minus inside the text is left alone',
  csvField('Reviewed 2026-08-25'),
  'Reviewed 2026-08-25',
);
check('a negative number in a later position is fine', csvField('delta of -5'), 'delta of -5');

/* ── Document shape ──────────────────────────────────────────────────────── */

const doc = toCsv(['A', 'B'], [['1', '2'], ['3', '4']], { bom: false });
check('rows are CRLF separated and terminated', doc, 'A,B\r\n1,2\r\n3,4\r\n');
checkThat('a BOM is emitted by default, so Excel reads UTF-8', toCsv(['A'], [], {}).startsWith('﻿'));
checkThat('the BOM can be suppressed', !toCsv(['A'], [], { bom: false }).startsWith('﻿'));

/* ── Answer history ──────────────────────────────────────────────────────── */

const history = answerHistoryCsv([
  {
    vendor: 'Globex',
    date: 'Aug 2026',
    industry: 'SaaS',
    tags: ['SOC 2', 'HIPAA'],
    confidence: 91,
    qaData: [
      { text: 'Do you encrypt data at rest?', answer: 'Yes, AES-256.', source: 'Policy' },
      { text: 'MFA everywhere?', answer: '=yes', source: '' },
    ],
  },
  { vendor: 'Initech', date: 'Jul 2026', qaData: [] },
]);

checkThat('answer history has a header row', history.includes('Vendor,Date,Industry'));
checkThat('every Q&A pair becomes a row', history.split('\r\n').filter(Boolean).length === 3, history);
checkThat('tags are joined into one cell', history.includes('SOC 2; HIPAA'));
checkThat('an entry with no pairs contributes nothing', !history.includes('Initech'));
checkThat("an answer that looks like a formula is neutralised here too", history.includes("'=yes"));

/* ── Manifest and assessments ────────────────────────────────────────────── */

const manifest = documentManifestCsv(
  [
    { id: 'd1', name: 'soc2.pdf', category: 'SOC 2 Report', date: 'Aug 2026', size: '2 MB', storagePath: 'idb://x', tags: [] },
    { id: 'd2', name: 'dr.pdf', category: 'Disaster Recovery Plan', date: 'Jan 2026', size: '1 MB', storagePath: '', tags: ['DR'] },
  ],
  new Set(['d1']),
);
checkThat('the manifest reports which documents are searchable', manifest.includes('searchable'));
checkThat('and which are not indexed', manifest.includes('not indexed'));
checkThat('and which have no stored file', manifest.includes('metadata only'));

const assessments = assessmentsCsv([
  { vendor: 'Northwind', step: 'review', owner: 'Blayqe Forbes', assignee: '', progress: 40, questions: [1, 2, 3], savedAtLabel: 'Aug 25, 9:00 AM' },
]);
checkThat('assessments export their owner', assessments.includes('Blayqe Forbes'));
checkThat('and their progress as a percentage', assessments.includes('40%'));
checkThat('and fall back to counting questions', assessments.includes(',3,'), assessments);

/* ── Category guessing ───────────────────────────────────────────────────── */

check('a SOC 2 report is recognised', guessDocCategory('soc2-type-ii-2026.pdf'), 'SOC 2 Report');
check('spaced and cased variants too', guessDocCategory('SOC 2 Type II Report FY26.pdf'), 'SOC 2 Report');
check('underscores are treated as spaces', guessDocCategory('access_control_policy_v3.pdf'), 'Access Control Policy');
check('hyphenated names work', guessDocCategory('disaster-recovery-plan.docx'), 'Disaster Recovery Plan');
check('an acronym is enough', guessDocCategory('BCP-2026.pdf'), 'Business Continuity Plan');
check('incident response', guessDocCategory('Incident Response Plan.pdf'), 'Incident Response Plan');
check('vendor management', guessDocCategory('third-party-risk.pdf'), 'Vendor Management Policy');
check('pen test', guessDocCategory('pentest-report-q3.pdf'), 'Penetration Test Report');
check('risk assessment', guessDocCategory('2026 Risk Register.xlsx'), 'Risk Assessment');
check('information security policy', guessDocCategory('infosec-policy.pdf'), 'Information Security Policy');
check('data classification', guessDocCategory('Data Classification Policy.pdf'), 'Data Classification Policy');
check('a BAA', guessDocCategory('signed-baa-acme.pdf'), 'Business Associate Agreement');

// The ordering traps: these two share a prefix, and the more specific must win.
check(
  'business continuity beats business associate',
  guessDocCategory('business-continuity-plan.pdf'),
  'Business Continuity Plan',
);
check(
  'business associate is still matched on its own',
  guessDocCategory('business associate agreement.pdf'),
  'Business Associate Agreement',
);

check('an unrecognisable name falls back to Other', guessDocCategory('scan_0043.pdf'), 'Other');
check('an empty name does not throw', guessDocCategory(''), 'Other');
check('a null name does not throw', guessDocCategory(null), 'Other');
check(
  'the extension is not matched against hints',
  guessDocCategory('notes.baa'),
  'Other',
);
checkThat(
  'every guess is a category the import screen offers',
  ['soc2.pdf', 'bcp.pdf', 'x.pdf', 'infosec.pdf'].every((n) => DOC_CATEGORIES.includes(guessDocCategory(n))),
);

/* ── Filenames ───────────────────────────────────────────────────────────── */

check(
  'export filenames are dated',
  exportFilename('answer-history', 'csv', new Date('2026-08-25T12:00:00Z')),
  'serotonin-answer-history-2026-08-25.csv',
);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
