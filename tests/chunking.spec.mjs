/**
 * Passage boundaries.
 *
 * The bug this exists for: auto-filled answers came back with the first word
 * chopped — "ative access to production" instead of "administrative access to
 * production". The chunker carried a 120-character overlap into the next passage
 * with `slice(-120)`, which starts wherever it lands, and for an imported
 * spreadsheet it landed mid-word constantly.
 *
 * Two things are asserted here. That no passage ever begins or ends mid-word,
 * and that a spreadsheet — one row per line, cells joined with " | " — is split
 * on row boundaries rather than through the middle of a control.
 *
 *   node tests/chunking.spec.mjs
 */

import { chunkPages } from '../src/lib/chunk.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) passed++; else failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${detail}`}`);
}

/** Every word in the source, so a fragment can be spotted. */
const vocabulary = (text) =>
  new Set(String(text).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/gi)?.map((w) => w.toLowerCase()) || []);

/**
 * A passage starts mid-word if its first token is not a word the source
 * actually contains. "ative" is the tell.
 */
function firstTokenIsReal(passage, vocab) {
  const first = String(passage).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/i);
  return !first || vocab.has(first[0].toLowerCase());
}

function lastTokenIsReal(passage, vocab) {
  const tokens = String(passage).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/gi) || [];
  const last = tokens[tokens.length - 1];
  return !last || vocab.has(last.toLowerCase());
}

/* ── 1. The reported case: an answered questionnaire imported as a document ── */

const ROWS = [
  'Ref | Control | Question | Response | Detail',
  'AC-01 | Privileged access management. Administrative access must be tightly controlled. | Describe how privileged access to production is granted and reviewed. | Yes | Multi-factor authentication is mandatory for all administrative access to production. Enforced through Okta with FIDO2/WebAuthn security keys; SMS and voice factors are disabled. Two break-glass accounts exist, stored in a sealed vault, alerting on use and reviewed quarterly. Evidence: NWS-IAM-POL-004, Okta factor enrollment export.',
  'AC-02 | Joiner / mover / leaver process. Access should be revoked promptly on termination. | Describe how access is revoked when an employee or contractor leaves the organisation. | Yes | Offboarding is triggered by the HRIS. Termination in Workday fires a webhook that suspends the Okta account and revokes all SSO sessions and OAuth grants within 15 minutes; SCIM deprovisioning removes downstream application access. Evidence: NWS-IAM-POL-007.',
  'AC-03 | Access reviews. Entitlements are recertified on a defined cadence. | How often are user entitlements reviewed and by whom? | Yes | Quarterly user access reviews are run by the system owner and signed off by the security team. Findings are tracked to closure in Jira with a 30 day SLA. Evidence: NWS-IAM-REV-2026Q1.',
  'CR-01 | Encryption at rest. All customer data must be encrypted at rest. | Describe your encryption at rest implementation. | Yes | All data at rest is encrypted with AES-256 using AWS KMS customer managed keys. Key rotation is annual and automatic. Evidence: NWS-CRY-POL-001.',
  'CR-02 | Encryption in transit. | Describe your encryption in transit implementation. | Yes | TLS 1.2 or higher is enforced on every external endpoint, with HSTS and modern cipher suites only. Internal service to service traffic uses mTLS. Evidence: NWS-CRY-POL-002.',
];
// Exactly how extract.js hands a spreadsheet over: one row per line, no blanks.
const SHEET = ['Sheet "Full Questionnaire"', '', ...ROWS].join('\n');

const sheetVocab = vocabulary(SHEET);
const sheetChunks = chunkPages([{ page: 1, text: SHEET }]);

check('a spreadsheet produces passages at all', sheetChunks.length > 0, `${sheetChunks.length}`);

const badStart = sheetChunks.find((c) => !firstTokenIsReal(c.text, sheetVocab));
check(
  'no passage begins with a word fragment',
  !badStart,
  badStart ? `"${String(badStart.text).slice(0, 60)}…"` : '',
);

const badEnd = sheetChunks.find((c) => !lastTokenIsReal(c.text, sheetVocab));
check(
  'no passage ends with a word fragment',
  !badEnd,
  badEnd ? `"…${String(badEnd.text).slice(-60)}"` : '',
);

check(
  'the specific reported fragment does not occur',
  !sheetChunks.some((c) => /^ative\b/i.test(c.text.trim())),
);

// Every row should be recoverable in full from some passage — a control that is
// split across two passages is a control neither passage can answer properly.
const wholeRows = ROWS.filter((row) => row.startsWith('AC-') || row.startsWith('CR-'));
const intact = wholeRows.filter((row) =>
  sheetChunks.some((c) => c.text.replace(/\s+/g, ' ').includes(row.replace(/\s+/g, ' '))),
);
check(
  'each control row survives intact inside some passage',
  intact.length === wholeRows.length,
  `${intact.length} of ${wholeRows.length}`,
);

/* ── 2. Prose is not fragmented by the newline handling ─────────────────────── */

// PDF extraction leaves single newlines as line wraps inside a paragraph. Those
// must not become passage boundaries in their own right.
const wrapped = [
  'Our information security programme is reviewed annually by an independent',
  'third party. The most recent SOC 2 Type II report covers the twelve months',
  'ending 31 March 2026 and was issued without exceptions. Scope covers the',
  'production environment, the corporate identity provider and the change',
  'management process.',
].join('\n');
const proseParagraphs = Array.from({ length: 8 }, () => wrapped).join('\n\n');
const proseVocab = vocabulary(proseParagraphs);
const proseChunks = chunkPages([{ page: 3, text: proseParagraphs }]);

check('prose still chunks', proseChunks.length > 0, `${proseChunks.length}`);
check(
  'prose passages never begin mid-word',
  proseChunks.every((c) => firstTokenIsReal(c.text, proseVocab)),
);
check(
  'wrapped lines are rejoined rather than left as fragments',
  proseChunks.every((c) => c.text.length >= 60),
  `shortest ${Math.min(...proseChunks.map((c) => c.text.length))}`,
);
check(
  'a sentence is not left dangling across the overlap',
  proseChunks.every((c) => /^["'(\[]?[A-Z0-9]/.test(c.text.trim())),
  proseChunks.map((c) => c.text.slice(0, 20)).join(' / '),
);

/* ── 3. Pathological input still terminates and stays bounded ───────────────── */

const noSpaces = 'x'.repeat(5000);
const noSpaceChunks = chunkPages([{ page: 1, text: noSpaces }]);
check(
  'a single token longer than the cap is still cut, not dropped',
  noSpaceChunks.length > 0 && noSpaceChunks.every((c) => c.text.length <= 1100),
  `${noSpaceChunks.length} passage(s)`,
);

const oneLongLine = `${'word '.repeat(4000)}end.`;
const longLineChunks = chunkPages([{ page: 1, text: oneLongLine }]);
check(
  'an unbroken wall of words is bounded',
  longLineChunks.every((c) => c.text.length <= 1100),
  `longest ${Math.max(...longLineChunks.map((c) => c.text.length))}`,
);
check(
  'and is not truncated mid-word either',
  longLineChunks.every((c) => /^(word|end)/.test(c.text.trim())),
);

const mixed = chunkPages([{ page: 1, text: `${SHEET}\n\n${proseParagraphs}` }]);
check(
  'a document mixing a grid and prose stays within the cap',
  mixed.every((c) => c.text.length <= 1100),
  `longest ${Math.max(...mixed.map((c) => c.text.length))}`,
);
check('chunk indices stay sequential', mixed.every((c, i) => c.chunkIndex === i));

/* ── 4. Overlap still does its job ──────────────────────────────────────────── */

// The overlap exists so a control spanning a boundary is still findable. Confirm
// consecutive passages share some text rather than butting up cleanly.
const overlapping = proseChunks.length > 1 && proseChunks.some((c, i) => {
  if (i === 0) return false;
  const previous = proseChunks[i - 1].text;
  const opening = c.text.slice(0, 40);
  return previous.includes(opening);
});
check('consecutive passages still overlap', overlapping || proseChunks.length === 1);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
