/**
 * Turning the library into files a person can open.
 *
 * Pure, dependency-free, and deliberately separate from the store so it can be
 * unit tested in plain Node — the store pulls in the Amplify client, which uses
 * `import.meta.glob` and cannot be imported outside a bundler.
 */

/** Categories the import screen offers, in the order it offers them. */
export const DOC_CATEGORIES = [
  'Access Control Policy',
  'Disaster Recovery Plan',
  'Business Continuity Plan',
  'SOC 2 Report',
  'Information Security Policy',
  'Incident Response Plan',
  'Data Classification Policy',
  'Vendor Management Policy',
  'Risk Assessment',
  'Penetration Test Report',
  'Business Associate Agreement',
  'Other',
];

/**
 * Words that point at a category, checked against the filename.
 *
 * Bulk import is the reason this exists: making somebody set a category for
 * thirty files one at a time is how a bulk import becomes a manual one. A guess
 * from the filename is right often enough to be worth correcting occasionally,
 * and every guess is shown and editable before anything is written.
 *
 * Ordered most specific first — "business continuity" must beat "business
 * associate" on "business-continuity-plan.pdf", and "soc 2" must not be caught
 * by a looser rule.
 */
const CATEGORY_HINTS = [
  ['SOC 2 Report', ['soc2', 'soc 2', 'soc-2', 'soc_2', 'sox2', 'type ii', 'typeii', 'type-ii']],
  ['Business Continuity Plan', ['business continuity', 'business-continuity', 'businesscontinuity', 'bcp']],
  ['Business Associate Agreement', ['business associate', 'business-associate', 'baa']],
  ['Disaster Recovery Plan', ['disaster recovery', 'disaster-recovery', 'disasterrecovery', 'dr plan', 'dr-plan', 'drp']],
  ['Incident Response Plan', ['incident response', 'incident-response', 'incidentresponse', 'irp']],
  ['Access Control Policy', ['access control', 'access-control', 'accesscontrol', 'iam policy', 'identity and access']],
  ['Data Classification Policy', ['data classification', 'data-classification', 'dataclassification']],
  ['Vendor Management Policy', ['vendor management', 'vendor-management', 'third party', 'third-party', 'tprm']],
  ['Penetration Test Report', ['penetration test', 'pen test', 'pentest', 'pen-test']],
  ['Risk Assessment', ['risk assessment', 'risk-assessment', 'riskassessment', 'risk register']],
  ['Information Security Policy', ['information security', 'infosec', 'security policy', 'isms']],
];

/**
 * Best guess at a document's category from its filename.
 *
 * Returns 'Other' rather than null: a category is required to import, and
 * 'Other' is an honest answer that does not pretend to knowledge.
 */
export function guessDocCategory(filename) {
  const name = String(filename || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,8}$/, '')     // drop the extension
    .replace(/[_]+/g, ' ');

  for (const [category, hints] of CATEGORY_HINTS) {
    for (const hint of hints) {
      if (name.includes(hint)) return category;
    }
  }
  return 'Other';
}

/* ── CSV ──────────────────────────────────────────────────────────────────── */

/**
 * One CSV field, quoted per RFC 4180 and neutralised against formula injection.
 *
 * The second part matters more than it looks. A cell beginning `=`, `+`, `-`,
 * `@`, tab or carriage return is executed as a formula by Excel and Sheets when
 * the file is opened, and this data is untrusted: it comes out of vendor
 * questionnaires and PDFs written by other people. `=cmd|'/c calc'!A1` in an
 * answer field is a real attack on whoever opens the export. Prefixing with an
 * apostrophe makes the cell literal text, which is what it always was.
 */
export function csvField(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Rows of arrays → a CSV document, with a UTF-8 BOM so Excel reads accents. */
export function toCsv(headers, rows, { bom = true } = {}) {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(','));
  // CRLF: RFC 4180, and the only line ending Excel is reliably happy with.
  return `${bom ? '﻿' : ''}${lines.join('\r\n')}\r\n`;
}

/**
 * Every question and answer ever recorded, flattened.
 *
 * The most useful export by a distance: it is the asset the app is actually
 * accumulating, and a CSV of it can be reviewed, bulk-edited, or handed to
 * someone who does not have the app.
 */
export function answerHistoryCsv(entries = []) {
  const rows = [];
  for (const entry of entries) {
    for (const pair of entry.qaData || []) {
      rows.push([
        entry.vendor || '',
        entry.date || '',
        entry.industry || '',
        (entry.tags || []).join('; '),
        entry.confidence ?? '',
        pair.text || '',
        pair.answer || '',
        pair.source || '',
      ]);
    }
  }
  return toCsv(
    ['Vendor', 'Date', 'Industry', 'Tags', 'Confidence', 'Question', 'Answer', 'Source'],
    rows,
  );
}

/** The document library as a manifest — what is held, and whether it is searchable. */
export function documentManifestCsv(docs = [], indexedIds = new Set()) {
  const rows = docs.map((doc) => [
    doc.name || '',
    doc.category || '',
    doc.date || '',
    doc.size || '',
    doc.note || '',
    (doc.tags || []).join('; '),
    doc.storagePath ? 'stored' : 'metadata only',
    indexedIds.has(String(doc.id)) ? 'searchable' : 'not indexed',
  ]);
  return toCsv(
    ['Document', 'Category', 'Added', 'Size', 'Note', 'Tags', 'File', 'Index'],
    rows,
  );
}

/** Questionnaires in flight, for a status report. */
export function assessmentsCsv(drafts = []) {
  const rows = drafts.map((draft) => [
    draft.vendor || '',
    draft.step || '',
    draft.owner || '',
    draft.assignee || '',
    `${draft.progress ?? 0}%`,
    draft.questionCount ?? (draft.questions || []).length,
    draft.savedAtLabel || draft.savedAt || '',
  ]);
  return toCsv(
    ['Vendor', 'Step', 'Owner', 'Assignee', 'Progress', 'Questions', 'Last saved'],
    rows,
  );
}

/* ── Filenames ────────────────────────────────────────────────────────────── */

/** `serotonin-answer-history-2026-08-25.csv` */
export function exportFilename(kind, extension, now) {
  const stamp = (now instanceof Date ? now : new Date()).toISOString().slice(0, 10);
  return `serotonin-${kind}-${stamp}.${extension}`;
}
