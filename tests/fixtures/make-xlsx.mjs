/**
 * Build the .xlsx fixtures used by tests/xlsx.spec.mjs.
 *
 *   node tests/fixtures/make-xlsx.mjs
 *
 * Writes the files by hand rather than with a library, for two reasons: there is
 * no spreadsheet dependency in this project (see src/lib/unzip.js for why), and
 * writing the XML directly is the only way to reproduce the specific shapes that
 * matter — Excel's shared-string table, rich-text runs, sparse and out-of-order
 * cells, hidden sheets, a header row buried under a title block.
 *
 * The committed fixtures are small, so regenerating them is only necessary when
 * adding a case.
 */

import { deflateRawSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/* ── A very small ZIP writer ──────────────────────────────────────────────── */

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

/** @param entries [{ name, content }] — everything is deflated. */
function makeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, content } of entries) {
    const raw = Buffer.from(content, 'utf8');
    const deflated = deflateRawSync(raw);
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += local.length + nameBytes.length + deflated.length;
  }

  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuffer, eocd]);
}

/* ── Workbook helpers ─────────────────────────────────────────────────────── */

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const esc = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const contentTypes = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`;
const rootRels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function workbookXml(sheets) {
  const tags = sheets
    .map(
      (sheet, i) =>
        `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}"${sheet.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`,
    )
    .join('');
  return `${HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tags}</sheets></workbook>`;
}

function workbookRels(count) {
  const rels = Array.from(
    { length: count },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}${`<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`}</Relationships>`;
}

const columnRef = (index) => {
  let label = '';
  let n = index + 1;
  while (n > 0) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
};

/**
 * Build a sheet using a shared-string table, the way Excel does.
 * A cell value of `null` is skipped entirely, which is how blanks appear.
 */
function sheetXml(rows, strings, { startRow = 1 } = {}) {
  const xml = rows
    .map((row, rowIndex) => {
      const number = startRow + rowIndex;
      if (row === null) return `<row r="${number}"/>`;
      const cells = row
        .map((value, columnIndex) => {
          if (value === null || value === undefined || value === '') return '';
          const ref = `${columnRef(columnIndex)}${number}`;
          if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
          let index = strings.indexOf(value);
          if (index === -1) {
            strings.push(value);
            index = strings.length - 1;
          }
          return `<c r="${ref}" t="s"><v>${index}</v></c>`;
        })
        .join('');
      return `<row r="${number}">${cells}</row>`;
    })
    .join('');
  return `${HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`;
}

const sharedStringsXml = (strings) =>
  `${HEAD}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
    .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
    .join('')}</sst>`;

function buildWorkbook(sheets) {
  const strings = [];
  const rendered = sheets.map((sheet) => sheetXml(sheet.rows, strings, sheet));
  return makeZip([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/workbook.xml', content: workbookXml(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels(sheets.length) },
    { name: 'xl/sharedStrings.xml', content: sharedStringsXml(strings) },
    ...rendered.map((content, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content })),
  ]);
}

/* ── Fixture 1: a SIG-shaped workbook ─────────────────────────────────────── */

const sigQuestions = [
  ['AC-01', 'Access Control', 'Do you require multi-factor authentication for administrative access?'],
  ['AC-02', 'Access Control', 'Describe your process for provisioning and de-provisioning user accounts.'],
  ['AC-03', 'Access Control', 'Is access reviewed on a periodic basis?'],
  ['CR-01', 'Cryptography', 'Is data encrypted at rest and in transit?'],
  ['CR-02', 'Cryptography', 'How are encryption keys managed and rotated?'],
  ['BC-01', 'Resilience', 'How often is your disaster recovery plan tested?'],
  ['BC-02', 'Resilience', 'What is your Recovery Time Objective for tier-1 systems?'],
  ['HR-01', 'Personnel', 'Do you perform background checks on employees?'],
  ['IR-01', 'Incident Response', 'Please describe your breach notification timelines.'],
  ['MS-01', 'Miscellaneous', 'What is the airspeed velocity of an unladen swallow?'],
];

const sig = buildWorkbook([
  {
    name: 'Instructions',
    rows: [
      ['Vendor Security Assessment'],
      null,
      ['Complete the Full Questionnaire tab. Do not modify the Ref column.'],
      ['Return the workbook to security@example.com within 10 business days.'],
    ],
  },
  {
    name: 'Full Questionnaire',
    rows: [
      // A title block above the header, so row 1 is not the header.
      ['Vendor Security Assessment — 2026 Edition'],
      null,
      ['Ref', 'Domain', 'Question', 'Response', 'Comments'],
      ...sigQuestions.map(([ref, domain, question]) => [ref, domain, question, '', '']),
    ],
  },
  {
    name: 'Glossary',
    rows: [
      ['Term', 'Definition'],
      ['MFA', 'Multi-factor authentication'],
      ['RTO', 'Recovery Time Objective'],
    ],
  },
  {
    name: 'Old Version 2024',
    hidden: true,
    rows: [
      ['Ref', 'Question'],
      ['X-01', 'Do you have a firewall?'],
    ],
  },
]);

/* ── Fixture 2: awkward but legal ─────────────────────────────────────────── */

const awkward = buildWorkbook([
  {
    // No header row at all, questions in column A, and a numeric column.
    name: 'Sheet1',
    rows: [
      ['Do you maintain an asset inventory?', 1],
      ['Is vulnerability scanning performed at least monthly?', 2],
      ['Describe how you segregate customer data.', 3],
    ],
  },
  {
    // The question column is to the RIGHT of a long "guidance" column, which is
    // prose but not question-shaped — the detector has to prefer the questions.
    name: 'Controls',
    rows: [
      ['ID', 'Guidance', 'Control Question', 'Yes/No'],
      [
        'C-1',
        'This control exists to ensure that only authorised personnel can reach production systems and that such access is logged for later review.',
        'Do you log all administrative access to production?',
        '',
      ],
      [
        'C-2',
        'Encryption protects data in the event that storage media are lost, stolen or improperly decommissioned by a third party.',
        'Is full-disk encryption enforced on employee laptops?',
        '',
      ],
    ],
  },
]);

/* ── Fixture 3: nothing to find ───────────────────────────────────────────── */

const empty = buildWorkbook([
  { name: 'Cover', rows: [['Acme Corp'], ['Confidential']] },
  { name: 'Data', rows: [['Region', 'Count'], ['EMEA', 12], ['APAC', 7]] },
]);

/* ── Write ────────────────────────────────────────────────────────────────── */

mkdirSync(here, { recursive: true });
writeFileSync(join(here, 'sig-questionnaire.xlsx'), sig);
writeFileSync(join(here, 'awkward-questionnaire.xlsx'), awkward);
writeFileSync(join(here, 'no-questions.xlsx'), empty);
console.log('wrote sig-questionnaire.xlsx, awkward-questionnaire.xlsx, no-questions.xlsx');
