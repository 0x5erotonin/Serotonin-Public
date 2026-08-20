/**
 * .xlsx → sheets of cell text.
 *
 * Zero dependencies: `src/lib/unzip.js` opens the archive with the platform's
 * own DecompressionStream, and the XML is read with a linear scanner rather than
 * DOMParser. Two reasons for the scanner:
 *
 *   1. It runs identically in Node, so the whole parser is unit-testable without
 *      a browser or a DOM shim (tests/xlsx.spec.mjs).
 *   2. Sheet XML is machine-generated and highly regular, so indexOf-based
 *      scanning is both simpler and strictly linear. After the response-column
 *      regex in questionExtract.js turned out to be quadratic on real files, a
 *      parser with no backtracking at all seemed like the right default for
 *      code that reads untrusted uploads.
 *
 * Scope: cell *text*, which is all a questionnaire needs. Formulas contribute
 * their cached result. Styles, charts, images, pivot tables and conditional
 * formatting are ignored. Date cells come through as their underlying serial
 * number, because resolving them properly means parsing styles.xml and the
 * number-format table — see DATES below.
 */

import { openZip, looksLikeZip } from './unzip.js';

/** Guards against a workbook that would exhaust memory. A SIG Lite is ~300 rows. */
const MAX_ROWS_PER_SHEET = 20000;
const MAX_COLUMNS = 256;
const MAX_SHEETS = 60;

/**
 * Parse a workbook.
 *
 * @param buffer ArrayBuffer | Uint8Array of the .xlsx file
 * @returns {{ sheets: Array<{name, rows, rowNumbers, hidden, truncated, firstRow, lastRow}>, warnings: string[] }}
 *          `rows` is an array of arrays of strings, rectangular per row.
 *          `rowNumbers[i]` is the spreadsheet row number of `rows[i]` — blank
 *          rows are dropped, so the index is not the row number.
 */
export async function parseXlsx(buffer) {
  if (!looksLikeZip(buffer)) {
    throw new Error(
      'This does not look like a modern Excel file. Files saved as the older .xls format cannot be read — open it in Excel and save as .xlsx.',
    );
  }

  const zip = openZip(buffer);
  const warnings = [];

  if (!zip.has('xl/workbook.xml')) {
    throw new Error('The archive is not an Excel workbook (no xl/workbook.xml inside).');
  }

  const sharedStrings = zip.has('xl/sharedStrings.xml')
    ? parseSharedStrings(await zip.readText('xl/sharedStrings.xml'))
    : [];

  const rels = zip.has('xl/_rels/workbook.xml.rels')
    ? parseRels(await zip.readText('xl/_rels/workbook.xml.rels'))
    : new Map();

  const declared = parseWorkbook(await zip.readText('xl/workbook.xml'));
  const sheets = [];

  for (const entry of declared.slice(0, MAX_SHEETS)) {
    // Excel writes rels targets relative to xl/ ("worksheets/sheet1.xml");
    // openpyxl writes them absolute ("/xl/worksheets/sheet1.xml"). Accept both,
    // and fall back to positional naming if the rels are missing entirely.
    const target = rels.get(entry.relId);
    const path = target ? normalisePath(target) : `xl/worksheets/sheet${sheets.length + 1}.xml`;

    if (!zip.has(path)) {
      warnings.push(`Sheet "${entry.name}" could not be located inside the file.`);
      continue;
    }

    try {
      const parsed = parseSheet(await zip.readText(path), sharedStrings);
      sheets.push({
        name: entry.name,
        hidden: entry.hidden,
        rows: parsed.rows,
        rowNumbers: parsed.rowNumbers,
        truncated: parsed.truncated,
        firstRow: parsed.firstRow,
        lastRow: parsed.lastRow,
      });
      if (parsed.truncated) {
        warnings.push(
          `Sheet "${entry.name}" has more than ${MAX_ROWS_PER_SHEET} rows — only the first ${MAX_ROWS_PER_SHEET} were read.`,
        );
      }
    } catch (err) {
      warnings.push(`Sheet "${entry.name}" could not be read: ${err?.message || err}`);
    }
  }

  if (declared.length > MAX_SHEETS) {
    warnings.push(`The workbook has ${declared.length} sheets — only the first ${MAX_SHEETS} were read.`);
  }
  if (sheets.length === 0) {
    throw new Error('The workbook contains no readable sheets.');
  }

  return { sheets, warnings };
}

/* ── workbook.xml ─────────────────────────────────────────────────────────── */

/** Sheet name, relationship id and visibility, in tab order. */
function parseWorkbook(xml) {
  const sheets = [];
  for (const tag of tags(xml, '<sheet ')) {
    const name = decodeEntities(attr(tag, 'name') || `Sheet${sheets.length + 1}`);
    const relId = attr(tag, 'r:id') || attr(tag, 'id') || '';
    const state = (attr(tag, 'state') || 'visible').toLowerCase();
    sheets.push({ name, relId, hidden: state === 'hidden' || state === 'veryhidden' });
  }
  return sheets;
}

function parseRels(xml) {
  const map = new Map();
  for (const tag of tags(xml, '<Relationship ')) {
    const id = attr(tag, 'Id');
    const target = attr(tag, 'Target');
    if (id && target) map.set(id, target);
  }
  return map;
}

function normalisePath(target) {
  const clean = decodeEntities(target).replace(/^\/+/, '');
  return clean.startsWith('xl/') ? clean : `xl/${clean}`;
}

/* ── sharedStrings.xml ────────────────────────────────────────────────────── */

/**
 * The shared string table, in index order.
 *
 * Excel deduplicates cell text into this table and references it by index;
 * openpyxl writes inline strings instead and omits the table entirely. Both
 * shapes have to work, which is why this returns an array that may be empty.
 *
 * A `<si>` holds either one `<t>`, or several `<r><t>` runs when the cell has
 * mixed formatting — the runs are concatenated, since formatting is irrelevant
 * to matching.
 */
export function parseSharedStrings(xml) {
  const strings = [];
  let cursor = 0;
  while (true) {
    const start = xml.indexOf('<si', cursor);
    if (start === -1) break;
    const end = xml.indexOf('</si>', start);
    // A self-closing <si/> is an empty string.
    if (end === -1) {
      strings.push('');
      break;
    }
    strings.push(collectText(xml.slice(start, end)));
    cursor = end + 5;
  }
  return strings;
}

/* ── worksheet XML ────────────────────────────────────────────────────────── */

/**
 * One sheet into a rectangular array of strings.
 *
 * Cells are placed by their column letters rather than by order of appearance:
 * a row's `<c>` elements are usually sequential, but blank cells are simply
 * absent, so "C7" has to land in column index 2 regardless of what came before.
 */
export function parseSheet(xml, sharedStrings = []) {
  const dataStart = xml.indexOf('<sheetData');
  const scope = dataStart === -1 ? xml : xml.slice(dataStart);

  const rows = [];
  // Real spreadsheet row numbers, parallel to `rows`.
  //
  // Blank rows are dropped rather than padded — a sheet with one entry at row
  // 10,000 should not allocate 10,000 arrays — which means an array index is NOT
  // a row number. Anything reported back to the user has to be the number they
  // would see in Excel, so it is tracked explicitly.
  const rowNumbers = [];
  let truncated = false;
  let firstRow = null;
  let lastRow = null;
  let widest = 0;

  const rowChunks = scope.split('<row');
  for (let i = 1; i < rowChunks.length; i += 1) {
    if (rows.length >= MAX_ROWS_PER_SHEET) {
      truncated = true;
      break;
    }
    const chunk = rowChunks[i];
    const rowNumber = Number(attr(headOf(chunk), 'r')) || rows.length + 1;
    const cells = [];

    const cellChunks = chunk.split('<c');
    for (let j = 1; j < cellChunks.length; j += 1) {
      const cell = cellChunks[j];
      const head = headOf(cell);
      const ref = attr(head, 'r');
      const column = ref ? columnIndex(ref) : cells.length;
      if (column < 0 || column >= MAX_COLUMNS) continue;

      const value = cellValue(cell, head, sharedStrings);
      if (value === '') continue; // leave gaps empty rather than padding early
      while (cells.length < column) cells.push('');
      cells[column] = value;
    }

    // Skip rows that are entirely empty, but keep their numbering intact.
    if (cells.some((c) => c !== '')) {
      if (firstRow === null) firstRow = rowNumber;
      lastRow = rowNumber;
      widest = Math.max(widest, cells.length);
      rows.push(cells);
      rowNumbers.push(rowNumber);
    }
  }

  // Make it rectangular so column indexing is safe for every row.
  for (const row of rows) {
    while (row.length < widest) row.push('');
  }

  return { rows, rowNumbers, truncated, firstRow, lastRow };
}

/**
 * A cell's text.
 *
 * DATES: a date cell is stored as a number whose *style* says "render this as a
 * date". Resolving that means parsing styles.xml, walking cellXfs to a numFmtId
 * and deciding whether the format string is date-like — a lot of machinery for
 * a field that is almost never the question text in a questionnaire. Serial
 * numbers therefore come through as numbers. If date columns ever matter,
 * that is where to add it.
 */
function cellValue(cell, head, sharedStrings) {
  const type = attr(head, 't') || 'n';

  if (type === 'inlineStr') {
    const isStart = cell.indexOf('<is');
    return isStart === -1 ? '' : collectText(cell.slice(isStart));
  }

  if (type === 'e') return ''; // #REF!, #N/A — not content

  const raw = elementText(cell, 'v');
  if (raw === null) {
    // No <v>: could still be a bare inline <t> (rare, non-conforming writers).
    const text = collectText(cell);
    return text;
  }

  if (type === 's') {
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 && index < sharedStrings.length
      ? sharedStrings[index]
      : '';
  }
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  return decodeEntities(raw);
}

/* ── Small XML helpers, all linear ────────────────────────────────────────── */

/** The opening tag of a chunk, i.e. everything up to the first '>'. */
function headOf(chunk) {
  const end = chunk.indexOf('>');
  return end === -1 ? chunk : chunk.slice(0, end);
}

/**
 * Attribute value by name. Plain indexOf scanning: no regex, so no
 * backtracking, and attribute order does not matter.
 */
export function attr(tag, name) {
  const needle = `${name}="`;
  let from = 0;
  while (true) {
    const at = tag.indexOf(needle, from);
    if (at === -1) return null;
    // Must be preceded by whitespace, so `id="x"` does not match `r:id="y"`.
    const before = at === 0 ? ' ' : tag[at - 1];
    if (before === ' ' || before === '\n' || before === '\t' || before === '\r') {
      const start = at + needle.length;
      const end = tag.indexOf('"', start);
      return end === -1 ? null : tag.slice(start, end);
    }
    from = at + needle.length;
  }
}

/** Iterate the opening tags matching a prefix, e.g. '<sheet '. */
function* tags(xml, prefix) {
  let cursor = 0;
  while (true) {
    const start = xml.indexOf(prefix, cursor);
    if (start === -1) return;
    const end = xml.indexOf('>', start);
    if (end === -1) return;
    yield xml.slice(start, end);
    cursor = end + 1;
  }
}

/** Text content of the first <name> element in a chunk, or null if absent. */
function elementText(chunk, name) {
  const open = chunk.indexOf(`<${name}`);
  if (open === -1) return null;
  const tagEnd = chunk.indexOf('>', open);
  if (tagEnd === -1) return null;
  if (chunk[tagEnd - 1] === '/') return ''; // <v/>
  const close = chunk.indexOf(`</${name}>`, tagEnd);
  if (close === -1) return null;
  return chunk.slice(tagEnd + 1, close);
}

/**
 * Concatenate every <t> element in a chunk.
 *
 * Used for both inline strings and shared-string runs. `xml:space="preserve"`
 * needs no special handling: the raw content is taken verbatim and whitespace is
 * normalised later, by the caller.
 */
function collectText(chunk) {
  let out = '';
  let cursor = 0;
  while (true) {
    const open = chunk.indexOf('<t', cursor);
    if (open === -1) break;
    // Must be <t> or <t ...>, not <tableParts> or similar.
    const next = chunk[open + 2];
    if (next !== '>' && next !== ' ' && next !== '/' && next !== '\n' && next !== '\t') {
      cursor = open + 2;
      continue;
    }
    const tagEnd = chunk.indexOf('>', open);
    if (tagEnd === -1) break;
    if (chunk[tagEnd - 1] === '/') {
      cursor = tagEnd + 1;
      continue;
    }
    const close = chunk.indexOf('</t>', tagEnd);
    if (close === -1) break;
    out += chunk.slice(tagEnd + 1, close);
    cursor = close + 4;
  }
  return decodeEntities(out);
}

/** "C7" → 2. Returns -1 for a reference with no column letters. */
export function columnIndex(ref) {
  let index = 0;
  let seen = 0;
  for (let i = 0; i < ref.length; i += 1) {
    const code = ref.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      index = index * 26 + (code - 64);
      seen += 1;
    } else if (code >= 97 && code <= 122) {
      index = index * 26 + (code - 96);
      seen += 1;
    } else {
      break;
    }
  }
  return seen === 0 ? -1 : index - 1;
}

/** 0 → "A", 26 → "AA". For reporting which column was used. */
export function columnLabel(index) {
  let n = Number(index);
  if (!Number.isInteger(n) || n < 0) return '?';
  let label = '';
  n += 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode XML entities. Only runs when '&' is present, which is the common case. */
export function decodeEntities(text) {
  const input = String(text ?? '');
  if (!input.includes('&')) return input;

  let out = '';
  let cursor = 0;
  while (cursor < input.length) {
    const amp = input.indexOf('&', cursor);
    if (amp === -1) {
      out += input.slice(cursor);
      break;
    }
    out += input.slice(cursor, amp);
    const semi = input.indexOf(';', amp);
    // An unterminated or absurdly long entity is literal text.
    if (semi === -1 || semi - amp > 12) {
      out += '&';
      cursor = amp + 1;
      continue;
    }
    const body = input.slice(amp + 1, semi);
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      out += Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : `&${body};`;
    } else if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)) {
      out += NAMED_ENTITIES[body];
    } else {
      out += `&${body};`;
    }
    cursor = semi + 1;
  }
  return out;
}
