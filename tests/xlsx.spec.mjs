/**
 * Spreadsheet parsing and question-column detection.
 *
 *   node tests/xlsx.spec.mjs
 *
 * Runs the real parser — the same code the browser runs — against real .xlsx
 * files. Nothing is mocked: `DecompressionStream('deflate-raw')` exists in Node
 * 18+ as well as every supported browser, which is exactly why the ZIP reader
 * uses it.
 *
 * Regenerate the fixtures with `node tests/fixtures/make-xlsx.mjs`.
 */

import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { openZip, looksLikeZip } from '../src/lib/unzip.js';
import {
  parseXlsx,
  parseSheet,
  parseSharedStrings,
  columnIndex,
  columnLabel,
  decodeEntities,
  attr,
} from '../src/lib/xlsx.js';
import { questionsFromSheets, describeReport } from '../src/lib/gridQuestions.js';
import { extractText } from '../src/lib/extract.js';

let passed = 0;
const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

/** extractText expects a File-like object; Node has no File in every version. */
const fileLike = (bytes, name, type) => ({
  name,
  type,
  size: bytes.length,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  text: async () => new TextDecoder().decode(bytes),
});

/* ── Small pure helpers ───────────────────────────────────────────────────── */

{
  check('columnIndex: A→0, C→2, Z→25, AA→26, AB→27',
    columnIndex('A1') === 0 && columnIndex('C7') === 2 && columnIndex('Z9') === 25 &&
    columnIndex('AA1') === 26 && columnIndex('AB1') === 27,
    `${columnIndex('A1')},${columnIndex('C7')},${columnIndex('Z9')},${columnIndex('AA1')},${columnIndex('AB1')}`);
  check('columnIndex: a reference with no letters is rejected', columnIndex('123') === -1);
  check('columnLabel round-trips', [0, 2, 25, 26, 27, 701].every((i) => columnIndex(`${columnLabel(i)}1`) === i),
    [0, 2, 25, 26, 27, 701].map(columnLabel).join(','));

  check('decodeEntities: named', decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot;') === 'a & b <c> "d"',
    decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot;'));
  check('decodeEntities: numeric decimal and hex',
    decodeEntities('&#65;&#x42;') === 'AB', decodeEntities('&#65;&#x42;'));
  check('decodeEntities: an unknown entity is left alone',
    decodeEntities('&bogus; &amp;') === '&bogus; &', decodeEntities('&bogus; &amp;'));
  check('decodeEntities: a bare ampersand is not corrupted',
    decodeEntities('Q&A and 5 & 6') === 'Q&A and 5 & 6', decodeEntities('Q&A and 5 & 6'));
  check('decodeEntities: no-& fast path', decodeEntities('plain text') === 'plain text');

  check('attr: reads a value regardless of order',
    attr('<c r="B2" t="s"', 't') === 's' && attr('<c t="s" r="B2"', 'r') === 'B2');
  check('attr: does not confuse id with r:id',
    attr('<sheet name="x" r:id="rId7"', 'id') === null,
    String(attr('<sheet name="x" r:id="rId7"', 'id')));
  check('attr: missing attribute is null', attr('<c r="A1"', 'zzz') === null);
}

/* ── Shared strings ───────────────────────────────────────────────────────── */

{
  const sst = parseSharedStrings(
    '<sst><si><t>One</t></si><si><t xml:space="preserve"> Two </t></si>' +
      '<si><r><t>Rich </t></r><r><t>text</t></r></si><si><t>A &amp; B</t></si></sst>',
  );
  check('sharedStrings: indexes in order', sst[0] === 'One', JSON.stringify(sst[0]));
  check('sharedStrings: preserves significant whitespace', sst[1] === ' Two ', JSON.stringify(sst[1]));
  check('sharedStrings: concatenates rich-text runs', sst[2] === 'Rich text', JSON.stringify(sst[2]));
  check('sharedStrings: decodes entities', sst[3] === 'A & B', JSON.stringify(sst[3]));
  check('sharedStrings: empty input is safe', parseSharedStrings('<sst/>').length === 0);
}

/* ── Sheet XML ────────────────────────────────────────────────────────────── */

{
  const strings = ['Question', 'Do you encrypt data?', 'Yes'];
  const xml =
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
    '<row r="2"/>' +
    // Out of order, with a gap at B and a number in C
    '<row r="3"><c r="C3"><v>42</v></c><c r="A3" t="s"><v>1</v></c></row>' +
    '<row r="4"><c r="A4" t="inlineStr"><is><t>Inline</t></is></c><c r="B4" t="b"><v>1</v></c>' +
    '<c r="C4" t="e"><v>#REF!</v></c></row>' +
    '</sheetData></worksheet>';

  const { rows, firstRow, lastRow } = parseSheet(xml, strings);
  check('sheet: blank rows are dropped', rows.length === 3, `${rows.length} rows`);
  check('sheet: cells land in their lettered column, not their order of appearance',
    rows[1][0] === 'Do you encrypt data?' && rows[1][1] === '' && rows[1][2] === '42',
    JSON.stringify(rows[1]));
  check('sheet: rows are rectangular', new Set(rows.map((r) => r.length)).size === 1,
    rows.map((r) => r.length).join(','));
  check('sheet: inline strings resolve', rows[2][0] === 'Inline', JSON.stringify(rows[2]));
  check('sheet: booleans become TRUE/FALSE', rows[2][1] === 'TRUE', rows[2][1]);
  check('sheet: error cells become empty', rows[2][2] === '', JSON.stringify(rows[2][2]));
  check('sheet: reports the real first and last row numbers',
    firstRow === 1 && lastRow === 4, `${firstRow}-${lastRow}`);
  check('sheet: an out-of-range shared string index is empty, not a crash',
    parseSheet('<sheetData><row r="1"><c r="A1" t="s"><v>99</v></c></row></sheetData>', strings)
      .rows.length === 0);
  check('sheet: empty sheetData is safe', parseSheet('<worksheet><sheetData/></worksheet>', []).rows.length === 0);
}

/* ── The ZIP reader ───────────────────────────────────────────────────────── */

{
  const bytes = fixture('sig-questionnaire.xlsx');
  check('looksLikeZip: true for a workbook', looksLikeZip(bytes));
  check('looksLikeZip: false for text', !looksLikeZip(Buffer.from('not a zip at all')));

  const zip = openZip(bytes);
  check('zip: lists its entries', zip.names.includes('xl/workbook.xml'), zip.names.join(','));
  check('zip: reports a missing entry', !zip.has('xl/nope.xml'));

  const text = await zip.readText('xl/workbook.xml');
  check('zip: inflates an entry', text.includes('<sheets>'), text.slice(0, 40));

  let threw = null;
  try {
    await zip.read('xl/does-not-exist.xml');
  } catch (err) {
    threw = err.message;
  }
  check('zip: reading a missing entry throws a clear error', /not in the archive/.test(threw || ''), threw);

  let notZip = null;
  try {
    openZip(Buffer.from('x'.repeat(200)));
  } catch (err) {
    notZip = err.message;
  }
  check('zip: rejects a non-archive with a clear error', /Not a ZIP archive/.test(notZip || ''), notZip);

  // A stored (uncompressed) entry is legal and must work as well as deflated.
  const stored = (() => {
    const name = Buffer.from('a.txt');
    const body = Buffer.from('hello stored');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0, 8); // method 0 = store
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + name.length, 12);
    eocd.writeUInt32LE(local.length + name.length + body.length, 16);
    return Buffer.concat([local, name, body, central, name, eocd]);
  })();
  check('zip: reads a stored (uncompressed) entry',
    (await openZip(stored).readText('a.txt')) === 'hello stored');
}

/* ── A SIG-shaped workbook, end to end ───────────────────────────────────── */

{
  const { sheets, warnings } = await parseXlsx(fixture('sig-questionnaire.xlsx'));
  check('workbook: reads every sheet in tab order',
    sheets.map((s) => s.name).join('|') ===
      'Instructions|Full Questionnaire|Glossary|Old Version 2024',
    sheets.map((s) => s.name).join('|'));
  check('workbook: flags the hidden sheet',
    sheets.find((s) => s.name === 'Old Version 2024')?.hidden === true);
  check('workbook: no warnings on a clean file', warnings.length === 0, warnings.join('; '));

  const questionnaire = sheets.find((s) => s.name === 'Full Questionnaire');
  check('workbook: the title block above the header is preserved as a row',
    questionnaire.rows[0][0].startsWith('Vendor Security Assessment'),
    questionnaire.rows[0][0]);

  const { questions, report } = questionsFromSheets(sheets);
  check('detection: finds all ten questions', questions.length === 10, `${questions.length}`);
  check('detection: picks column C, the one headed "Question"',
    report.sheets[0]?.columnLabel === 'C' && report.sheets[0]?.headerLabel === 'Question',
    `${report.sheets[0]?.columnLabel} / ${report.sheets[0]?.headerLabel}`);
  check('detection: finds the header row below the title block',
    report.sheets[0]?.headerRow === 3, String(report.sheets[0]?.headerRow));
  check('detection: does not pick up the Ref or Domain columns',
    !questions.some((q) => /^(AC|CR|BC|HR|IR|MS)-\d/.test(q.text)) &&
      !questions.some((q) => q.text === 'Access Control'),
    questions.map((q) => q.text.slice(0, 14)).join('|'));
  check('detection: skips the instructions, glossary and hidden sheets',
    report.skipped.length === 3 &&
      report.skipped.some((s) => s.name === 'Instructions') &&
      report.skipped.some((s) => s.name === 'Glossary') &&
      report.skipped.some((s) => s.name === 'Old Version 2024'),
    report.skipped.map((s) => `${s.name}:${s.reason}`).join(', '));
  check('detection: reports the row number Excel would show, not the array index',
    questions[0].row === 4 && questions[9].row === 13,
    `first at row ${questions[0].row}, last at row ${questions[9].row}`);

  const description = describeReport(report, 'sig-questionnaire.xlsx');
  check('reporting: names the column, the sheet and what was skipped',
    /column C \("Question"\)/.test(description) &&
      /Full Questionnaire/.test(description) &&
      /skipped/.test(description),
    description);
}

/* ── Awkward but legal shapes ─────────────────────────────────────────────── */

{
  const { sheets } = await parseXlsx(fixture('awkward-questionnaire.xlsx'));
  const { questions, report } = questionsFromSheets(sheets);

  check('awkward: reads a sheet with no header row at all',
    questions.filter((q) => q.sheet === 'Sheet1').length === 3,
    `${questions.filter((q) => q.sheet === 'Sheet1').length} of 3`);

  const controls = report.sheets.find((s) => s.name === 'Controls');
  check('awkward: prefers the question column over a longer guidance column',
    controls?.columnLabel === 'C',
    `chose ${controls?.columnLabel} ("${controls?.headerLabel}")`);
  check('awkward: guidance prose is not extracted as a question',
    !questions.some((q) => /This control exists to ensure/.test(q.text)),
    questions.map((q) => q.text.slice(0, 20)).join('|'));
  check('awkward: reads questions from every sheet that has them',
    new Set(questions.map((q) => q.sheet)).size === 2,
    [...new Set(questions.map((q) => q.sheet))].join(','));
}

/* ── Nothing to find ──────────────────────────────────────────────────────── */

{
  const { sheets } = await parseXlsx(fixture('no-questions.xlsx'));
  const { questions, report } = questionsFromSheets(sheets);
  check('no questions: extracts nothing rather than guessing', questions.length === 0,
    questions.map((q) => q.text).join('|'));
  check('no questions: says so, and says what it looked at',
    /No questions found/.test(describeReport(report, 'no-questions.xlsx')) &&
      /Cover|Data/.test(describeReport(report, 'no-questions.xlsx')),
    describeReport(report, 'no-questions.xlsx'));
}

/* ── Through extractText, the way the app calls it ────────────────────────── */

{
  const bytes = fixture('sig-questionnaire.xlsx');
  const result = await extractText(fileLike(bytes, 'sig-questionnaire.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));

  check('extractText: recognises a workbook by extension', result.kind === 'spreadsheet', result.kind);
  check('extractText: returns the grid for question detection',
    Array.isArray(result.sheets) && result.sheets.length === 4, `${result.sheets?.length}`);
  check('extractText: also returns text, so the KB can index a spreadsheet',
    result.text.includes('Do you require multi-factor authentication'),
    result.text.slice(0, 60));
  check('extractText: text names each sheet, so a cited passage says where it came from',
    result.text.includes('Sheet "Full Questionnaire"'), result.text.slice(0, 80));
  check('extractText: one page per sheet', result.pages.length === 4, `${result.pages.length}`);
  check('extractText: no error', result.error === null, String(result.error));
}

/* ── Failure paths must be honest ─────────────────────────────────────────── */

{
  const notXlsx = await extractText(fileLike(Buffer.from('just some text'), 'book.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  check('a mislabelled .xlsx explains the problem',
    /does not look like a modern Excel file|Not a ZIP/.test(notXlsx.error || ''), notXlsx.error);

  const legacy = await extractText(fileLike(Buffer.from('\xD0\xCF\x11\xE0binary'), 'old.xls', ''));
  check('legacy .xls says to re-save as .xlsx',
    /save as \.xlsx/i.test(legacy.error || ''), legacy.error);

  // A ZIP that is not a workbook.
  const zipNotXlsx = (() => {
    const name = Buffer.from('hello.txt');
    const body = deflateRawSync(Buffer.from('hi'));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(2, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(2, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + name.length, 12);
    eocd.writeUInt32LE(local.length + name.length + body.length, 16);
    return Buffer.concat([local, name, body, central, name, eocd]);
  })();
  const wrongZip = await extractText(fileLike(zipNotXlsx, 'archive.xlsx', ''));
  check('a ZIP that is not a workbook says so',
    /not an Excel workbook/.test(wrongZip.error || ''), wrongZip.error);

  check('an empty buffer is handled',
    !!(await extractText(fileLike(Buffer.alloc(0), 'empty.xlsx', ''))).error);
}

/* ── Performance ──────────────────────────────────────────────────────────── */

{
  // A CAIQ is ~260 rows; a full SIG can be 1,600. Build something larger than
  // both and make sure parsing plus detection stays well inside a second.
  const rows = [['Ref', 'Domain', 'Question', 'Response']];
  for (let i = 0; i < 3000; i += 1) {
    rows.push([
      `C-${i}`,
      'Domain',
      `Do you perform control number ${i} on a regular basis and document the outcome?`,
      '',
    ]);
  }
  const strings = [];
  const cellXml = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (!value) return '';
          let index = strings.indexOf(value);
          if (index === -1) {
            strings.push(value);
            index = strings.length - 1;
          }
          return `<c r="${columnLabel(c)}${r + 1}" t="s"><v>${index}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  const started = Date.now();
  const sheet = parseSheet(`<worksheet><sheetData>${cellXml}</sheetData></worksheet>`, strings);
  const parseMs = Date.now() - started;
  check('performance: a 3,000-row sheet parses fast', parseMs < 1500, `${parseMs}ms`);

  const detectStart = Date.now();
  const { questions } = questionsFromSheets([{ name: 'Big', rows: sheet.rows, hidden: false }]);
  const detectMs = Date.now() - detectStart;
  check('performance: column detection on 3,000 rows is fast', detectMs < 2000, `${detectMs}ms`);
  check('performance: and it still finds them all', questions.length === 3000, `${questions.length}`);
}

/* ── Summary ──────────────────────────────────────────────────────────────── */

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  process.exit(1);
}
