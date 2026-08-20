/**
 * Question-extraction tests.
 *
 * Real security questionnaires arrive in half a dozen shapes and the extractor
 * is heuristic, so these cases are the specification: each one is a format that
 * turned up during development and broke an earlier version.
 *
 *   node tests/extraction.spec.mjs
 *
 * Pure functions over text — no browser, no bundler, no network.
 */

import { extractQuestions, questionsFromLines } from '../src/lib/questionExtract.js';
import { chunkPages } from '../src/lib/chunk.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const texts = (result) => result.questions.map((q) => q.text);

/* ── Numbered list, the common PDF shape ──────────────────────────────────── */

{
  const result = extractQuestions(`
Security Questionnaire
Vendor: Acme Corp
CONFIDENTIAL

Section 1 — Access Control

1. Do you enforce multi-factor authentication for all administrative access?
2. Describe your process for provisioning and de-provisioning user accounts.
3. Is data encrypted at rest and in transit?
4. Please provide evidence of your most recent penetration test.

Section 2 — Business Continuity
5. Do you maintain a documented disaster recovery plan?
6. What is your Recovery Time Objective (RTO)?
Page 2 of 4
`);
  const found = texts(result);
  check('numbered list: finds all six questions', found.length === 6, `got ${found.length}: ${found.join(' | ')}`);
  check('numbered list: strips the "1." marker', found[0] === 'Do you enforce multi-factor authentication for all administrative access?', found[0]);
  check('numbered list: drops the vendor/confidential/page furniture',
    !found.some((q) => /confidential|page 2|vendor:/i.test(q)));
  check('numbered list: drops section headings', !found.some((q) => /^section/i.test(q)));
}

/* ── Lines wrapped by a PDF column break ──────────────────────────────────── */

{
  const found = texts(extractQuestions(`
1. Do you maintain an incident
response plan that is tested at
least annually?
2. Describe the controls you have in
place to prevent unauthorized
access to customer data.
`));
  check('wrapped lines: rejoins into two questions', found.length === 2, `got ${found.length}`);
  check('wrapped lines: first question is whole',
    found[0] === 'Do you maintain an incident response plan that is tested at least annually?', found[0]);
}

/* ── Control-ID prefixes ──────────────────────────────────────────────────── */

{
  const found = texts(extractQuestions(`
AC-2 Account Management — Does the organization manage information system accounts?
CC6.1 | Logical access controls restrict access. Describe how access is restricted. | Yes/No | Comments
A.9.2.1 User registration and de-registration: confirm that a formal process exists.
`));
  check('control IDs: one question per control', found.length === 3, `got ${found.length}: ${found.join(' | ')}`);
  check('control IDs: strips AC-2', found[0]?.startsWith('Account Management'), found[0]);
  check('control IDs: strips the single-letter ISO form A.9.2.1',
    found[2]?.startsWith('User registration'), found[2]);
  check('control IDs: strips the Yes/No and Comments response columns',
    !found.some((q) => /yes\/no|comments/i.test(q)), found[1]);
}

/* ── "SOC 2" must not be mistaken for a control ID ────────────────────────── */

{
  const found = texts(extractQuestions('Do you have a SOC 2 Type II report?'));
  check('SOC 2 is not stripped as a control ID',
    found[0] === 'Do you have a SOC 2 Type II report?', found[0]);
}

/* ── CSV grid exported from a spreadsheet questionnaire ───────────────────── */

{
  const found = texts(extractQuestions(`
Question | Response | Comments
Do you have a SOC 2 Type II report? | |
Describe your data retention policy. | |
Is MFA enforced for remote access? | |
Vendor Name | Acme Corp |
`));
  check('CSV grid: one question per row', found.length === 3, `got ${found.length}: ${found.join(' | ')}`);
  check('CSV grid: drops the header row', !found.some((q) => /^question/i.test(q)));
  check('CSV grid: drops the vendor name row', !found.some((q) => /acme/i.test(q)));
  check('CSV grid: strips empty trailing columns',
    found.every((q) => !q.includes('—') || !/—\s*$/.test(q)), found.join(' | '));
}

/* ── Prose with no markers at all ─────────────────────────────────────────── */

{
  const found = texts(extractQuestions(`
Please describe your organization's approach to vulnerability management.
We would like to understand your patching cadence.
Do you perform background checks on employees?
Thank you for completing this questionnaire.
`));
  check('prose: keeps the two real questions', found.length === 2, `got ${found.length}: ${found.join(' | ')}`);
  check('prose: does not merge consecutive sentences into one blob',
    found.every((q) => q.split('.').filter(Boolean).length <= 2), found.join(' | '));
  check('prose: drops the sign-off', !found.some((q) => /thank you/i.test(q)));
}

/* ── Pure noise ───────────────────────────────────────────────────────────── */

{
  const found = texts(extractQuestions(`
Table of Contents
Section 1 .......... 3
Section 2 .......... 7
Page 1
© 2026 Acme Corp. All rights reserved.
Classification: Internal Use Only
`));
  check('noise: extracts nothing from front matter', found.length === 0, `got ${found.join(' | ')}`);
}

/* ── Duplicates ───────────────────────────────────────────────────────────── */

{
  const found = texts(extractQuestions(`
1. Is data encrypted at rest?
2. Do you have an incident response plan?
3. Is data encrypted at rest?
`));
  check('duplicates: collapsed', found.length === 2, `got ${found.length}: ${found.join(' | ')}`);
}

/* ── Empty and junk input ─────────────────────────────────────────────────── */

{
  check('empty string is handled', extractQuestions('').questions.length === 0);
  check('null is handled', extractQuestions(null).questions.length === 0);
  check('whitespace only is handled', extractQuestions('   \n\n  \t ').questions.length === 0);
}

/* ── Manual-entry path ────────────────────────────────────────────────────── */

{
  const manual = questionsFromLines('1. First question?\n2) Second question?\n\nThird one');
  check('manual entry: keeps every non-empty line', manual.length === 3, `got ${manual.length}`);
  check('manual entry: strips markers', manual[0].text === 'First question?', manual[0].text);
  check('manual entry: does not filter on question-shape',
    manual[2].text === 'Third one', manual[2]?.text);
}

/* ── Chunking, which feeds the index ─────────────────────────────────────── */

{
  const pages = [
    { page: 1, text: 'Access control policy.\n\n' + 'Users are granted least privilege. '.repeat(40) },
    { page: 2, text: 'Encryption at rest uses AES-256. ' + 'Keys rotate annually. '.repeat(30) },
  ];
  const chunks = chunkPages(pages);
  check('chunking: produces multiple passages', chunks.length >= 2, `got ${chunks.length}`);
  check('chunking: every passage carries its page number',
    chunks.every((c) => c.page === 1 || c.page === 2));
  check('chunking: no passage exceeds the hard cap',
    chunks.every((c) => c.text.length <= 1100),
    `longest was ${Math.max(...chunks.map((c) => c.text.length))}`);
  check('chunking: passages are non-trivial',
    chunks.every((c) => c.text.length >= 60));
  check('chunking: indices are sequential',
    chunks.every((c, i) => c.chunkIndex === i));

  const short = chunkPages([{ page: 1, text: 'Too short.' }]);
  check('chunking: drops fragments below the minimum', short.length === 0, `got ${short.length}`);

  const single = chunkPages([], 'x'.repeat(3000));
  check('chunking: falls back to full text when there are no pages',
    single.length >= 2, `got ${single.length}`);
}

/* ── Performance: pathological whitespace must not hang the tab ───────────── */

{
  // Regression test. The response-column pattern used to have three unbounded
  // whitespace quantifiers over the same characters, so a line containing a pipe,
  // a long whitespace run and then any non-space character sent the regex engine
  // enumerating partitions: ~n³, measured at 67 seconds for a 5,000-character
  // run. An ordinary vendor questionnaire full of thin spaces could trigger it.
  const cases = [
    ['ordinary spaces', `Do you encrypt data? |${' '.repeat(5000)}x`],
    ['thin spaces (U+2009)', `Do you encrypt data? |${' '.repeat(5000)}x`],
    ['ideographic spaces', `Do you encrypt data? |${'　'.repeat(4000)}x`],
    ['form feeds', `Do you encrypt data? |${'\f'.repeat(4000)}x`],
    ['tabs and mixed', `Question |${'\t  '.repeat(1500)}x`],
    ['many pipes', `Q? ${'| '.repeat(2000)}x`],
  ];

  for (const [label, input] of cases) {
    const started = Date.now();
    extractQuestions(input);
    const elapsed = Date.now() - started;
    check(
      `performance: ${label} parses fast`,
      elapsed < 1000,
      `took ${elapsed}ms`,
    );
  }

  // A whole document of it, which is the realistic shape.
  const doc = Array.from(
    { length: 200 },
    (_, i) => `${i + 1}. Do you do the thing? |${' '.repeat(200)}| Yes/No | Comments`,
  ).join('\n');
  const started = Date.now();
  const result = extractQuestions(doc);
  const elapsed = Date.now() - started;
  check(
    'performance: a 200-row padded table parses fast',
    elapsed < 2000,
    `took ${elapsed}ms for ${result.questions.length} questions`,
  );
  check(
    'padded table rows still yield clean questions',
    result.questions.length > 0 && !/\|/.test(result.questions[0].text),
    result.questions[0]?.text,
  );
}

/* ── Summary ──────────────────────────────────────────────────────────────── */

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  process.exit(1);
}
