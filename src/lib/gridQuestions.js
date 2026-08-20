/**
 * Finding the questions in a spreadsheet.
 *
 * A real SIG or CAIQ workbook is not a list of questions. It is several sheets —
 * a cover page, instructions, a glossary, the questionnaire itself, sometimes an
 * old version left in — and on the questionnaire sheet the question is rarely in
 * column A. It sits to the right of a control ID and a domain, with empty
 * response and comment columns after it.
 *
 * So rather than treating the grid as CSV text, this:
 *
 *   1. skips sheets that are clearly not questionnaires (by name, and by having
 *      nothing question-shaped in them),
 *   2. finds the header row, which is often not row 1,
 *   3. scores each column and picks the one holding questions,
 *   4. reports exactly what it chose.
 *
 * Step 4 matters as much as the rest. Auto-detection is invisible when it works
 * and baffling when it does not, so the result always carries a plain-language
 * account of which sheet and column were used and what was skipped — see
 * `describeReport`.
 *
 * Scoring reuses `scoreLine` from questionExtract.js, so the spreadsheet path and
 * the text path share one definition of "looks like a question".
 */

import { scoreLine } from './questionExtract.js';
import { columnLabel } from './xlsx.js';

/** Sheet names that are almost never the questionnaire. */
const SKIP_SHEET =
  /^\s*(instructions?|how to|guidance|read ?me|cover|title|front ?page|about|glossary|definitions?|terms|legend|key|revision history|version history|change ?log|contents?|index|toc|scoring|rating|scale|reference|lookup|dropdowns?|lists?|validation|data ?validation)\b/i;

/** Header cells that name a question column outright — the strongest signal available. */
const QUESTION_HEADER =
  /^\s*(question|questions|control question|requirement|requirements|control|control description|description|criteria|inquiry|ask|item|assessment question|control objective)\s*$/i;

/** Header cells that name something that is definitely not the question. */
const NON_QUESTION_HEADER =
  /^\s*(#|no\.?|num|number|id|ref|ref\.?|reference|control ?id|question ?(?:id|no|number|#)|domain|category|section|area|family|group|type|response|answer|reply|comments?|notes?|remarks?|evidence|attachments?|status|owner|assignee|due|date|score|weight|priority|applicab\w*|in ?scope|yes\/no|y\/n)\s*$/i;

/** Words that suggest a header row rather than data. */
const HEADER_WORD =
  /^\s*(#|no\.?|id|ref|reference|control|domain|category|section|question|requirement|description|response|answer|comments?|notes?|evidence|status|owner|score|weight|priority|applicab\w*|yes\/no|y\/n|criteria|guidance)\b/i;

/** A column must average at least this to be treated as the question column. */
const MIN_COLUMN_SCORE = 1.2;
/** A single cell must clear this to be kept as a question. */
const MIN_CELL_SCORE = 2;
/** Rows scanned when scoring columns. Enough to characterise a sheet cheaply. */
const SAMPLE_ROWS = 400;
const MAX_HEADER_SCAN = 25;
const MIN_LENGTH = 12;
const MAX_LENGTH = 700;

/**
 * @param sheets  from parseXlsx: [{ name, rows, hidden }]
 * @returns {{ questions, report }}
 *   questions  [{ text, score, signals, sheet, column, row }]
 *   report     { sheets: [...], skipped: [...], total, mode }
 */
export function questionsFromSheets(sheets, options = {}) {
  const { includeHidden = false } = options;
  const report = { sheets: [], skipped: [], total: 0 };
  const collected = [];

  const candidates = [];
  for (const sheet of sheets || []) {
    if (!includeHidden && sheet.hidden) {
      report.skipped.push({ name: sheet.name, reason: 'hidden sheet' });
      continue;
    }
    if (!sheet.rows || sheet.rows.length === 0) {
      report.skipped.push({ name: sheet.name, reason: 'empty' });
      continue;
    }
    candidates.push(sheet);
  }

  // Name-based skipping is a heuristic, so it is only allowed to skip a sheet
  // when something else remains. A workbook whose only sheet is called
  // "Reference" still gets read.
  const byName = candidates.filter((s) => SKIP_SHEET.test(s.name));
  const keep = byName.length < candidates.length
    ? candidates.filter((s) => !SKIP_SHEET.test(s.name))
    : candidates;
  for (const sheet of candidates) {
    if (!keep.includes(sheet)) {
      report.skipped.push({ name: sheet.name, reason: describeSkip(sheet.name) });
    }
  }

  for (const sheet of keep) {
    const analysis = analyseSheet(sheet);
    if (analysis.questions.length === 0) {
      report.skipped.push({
        name: sheet.name,
        reason: analysis.reason || 'nothing question-shaped found',
      });
      continue;
    }
    report.sheets.push({
      name: sheet.name,
      questions: analysis.questions.length,
      column: analysis.column,
      columnLabel: analysis.column === null ? null : columnLabel(analysis.column),
      headerLabel: analysis.headerLabel,
      headerRow: analysis.headerRow,
      mode: analysis.mode,
    });
    collected.push(...analysis.questions.map((q) => ({ ...q, sheet: sheet.name })));
  }

  const questions = dedupe(collected).map((q, index) => ({ ...q, index }));
  report.total = questions.length;
  return { questions, report };
}

/* ── One sheet ────────────────────────────────────────────────────────────── */

function analyseSheet(sheet) {
  const rows = sheet.rows;
  // Blank rows are dropped during parsing, so an array index is not a row
  // number. Report the number the user would see in Excel.
  const rowNumberAt = (index) => sheet.rowNumbers?.[index] ?? index + 1;
  const header = findHeaderRow(rows);
  const bodyStart = header.index === -1 ? 0 : header.index + 1;
  const body = rows.slice(bodyStart, bodyStart + SAMPLE_ROWS);
  if (body.length === 0) {
    return { questions: [], reason: 'no rows below the header', column: null, mode: 'none' };
  }

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const scores = [];

  for (let column = 0; column < width; column += 1) {
    const cells = body.map((row) => String(row[column] ?? '').trim());
    const filled = cells.filter(Boolean);
    if (filled.length === 0) {
      scores.push({ column, mean: -5, hits: 0, filled: 0 });
      continue;
    }

    let total = 0;
    let hits = 0;
    for (const cell of filled) {
      const { score } = scoreLine(cell);
      total += score;
      if (score >= MIN_CELL_SCORE && cell.length >= MIN_LENGTH) hits += 1;
    }

    // Mean over *filled* cells, so a sparsely-populated question column is not
    // punished for the blank rows between sections.
    let mean = total / filled.length;

    // The header is the strongest signal there is: a column literally titled
    // "Question" beats any amount of cell scoring, and one titled "Comments"
    // should lose even if an analyst wrote prose in it.
    const headerCell = header.index === -1 ? '' : String(rows[header.index]?.[column] ?? '').trim();
    if (QUESTION_HEADER.test(headerCell)) mean += 3;
    else if (NON_QUESTION_HEADER.test(headerCell)) mean -= 3;

    scores.push({ column, mean, hits, filled, headerCell });
  }

  const best = scores.reduce((a, b) => (b.mean > a.mean ? b : a), scores[0]);

  // A clear winner: extract that column.
  if (best && best.mean >= MIN_COLUMN_SCORE && best.hits > 0) {
    const questions = [];
    for (let i = bodyStart; i < rows.length; i += 1) {
      const cell = String(rows[i]?.[best.column] ?? '').trim();
      if (!cell) continue;
      const scored = scoreLine(cell);
      if (scored.score < MIN_CELL_SCORE || cell.length < MIN_LENGTH) continue;
      questions.push({
        text: truncate(scored.text || cell),
        score: scored.score,
        signals: scored.signals,
        column: best.column,
        row: rowNumberAt(i),
      });
    }
    if (questions.length > 0) {
      return {
        questions,
        column: best.column,
        headerLabel: best.headerCell || null,
        headerRow: header.index === -1 ? null : rowNumberAt(header.index),
        mode: 'column',
      };
    }
  }

  // No column stands out — the sheet may be prose, or one question per row
  // spread across merged cells. Fall back to treating each row as a line, which
  // is what the CSV path does.
  const rowQuestions = [];
  for (let i = bodyStart; i < rows.length; i += 1) {
    const joined = (rows[i] || []).map((c) => String(c ?? '').trim()).filter(Boolean).join(' ');
    if (!joined) continue;
    const scored = scoreLine(joined);
    if (scored.score < MIN_CELL_SCORE || joined.length < MIN_LENGTH) continue;
    rowQuestions.push({
      text: truncate(scored.text || joined),
      score: scored.score,
      signals: scored.signals,
      column: null,
      row: rowNumberAt(i),
    });
  }

  return {
    questions: rowQuestions,
    column: null,
    headerLabel: null,
    headerRow: header.index === -1 ? null : rowNumberAt(header.index),
    mode: rowQuestions.length > 0 ? 'row' : 'none',
    reason: rowQuestions.length === 0 ? 'no question-shaped cells' : undefined,
  };
}

/**
 * Locate the header row.
 *
 * Questionnaires often open with a title block, a logo row or a note to the
 * respondent, so row 1 is frequently not the header. The header is taken to be
 * the first row within the first 25 that has at least two short, header-like
 * cells — and only if no earlier row already looks like data.
 */
function findHeaderRow(rows) {
  const limit = Math.min(rows.length, MAX_HEADER_SCAN);
  for (let i = 0; i < limit; i += 1) {
    const cells = (rows[i] || []).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const headerish = cells.filter((c) => c.length <= 40 && HEADER_WORD.test(c)).length;
    if (headerish >= 2) return { index: i, cells };

    // A row that already contains a real question means the header is missing.
    if (cells.some((c) => scoreLine(c).score >= MIN_CELL_SCORE + 1)) break;
  }
  return { index: -1, cells: [] };
}

const truncate = (text) =>
  text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH).trim()}…` : text;

/** Same normalised-key de-duplication as the text path. */
function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || item.score > existing.score) seen.set(key, item);
  }
  return [...seen.values()];
}

function describeSkip(name) {
  const lower = String(name).toLowerCase();
  if (/gloss|definit|term|legend|key/.test(lower)) return 'looks like a glossary';
  if (/instruct|how to|guidance|read ?me/.test(lower)) return 'looks like guidance';
  if (/cover|title|front|about/.test(lower)) return 'looks like a cover page';
  if (/revision|version|change ?log/.test(lower)) return 'looks like a change log';
  if (/scor|rating|scale/.test(lower)) return 'looks like a scoring key';
  if (/content|index|toc/.test(lower)) return 'looks like a contents page';
  return 'not a questionnaire sheet';
}

/**
 * One sentence describing what the detector did, for the intake screen.
 *
 * Deliberately specific about the column, because that is the decision most
 * likely to be wrong and the hardest for a user to guess at.
 */
export function describeReport(report, fileName = 'the workbook') {
  if (!report || report.total === 0) {
    const skipped = (report?.skipped || []).map((s) => `"${s.name}" (${s.reason})`);
    return skipped.length > 0
      ? `No questions found in ${fileName}. Skipped ${skipped.join(', ')}.`
      : `No questions found in ${fileName}.`;
  }

  const parts = [];
  const sheetCount = report.sheets.length;
  parts.push(
    `Found ${report.total} question${report.total !== 1 ? 's' : ''} in ${fileName}` +
      (sheetCount > 1 ? ` across ${sheetCount} sheets` : ''),
  );

  const detail = report.sheets
    .map((s) => {
      const where = s.mode === 'column' && s.columnLabel
        ? `column ${s.columnLabel}${s.headerLabel ? ` ("${s.headerLabel}")` : ''}`
        : 'whole rows';
      return `${s.questions} from ${where} of "${s.name}"`;
    })
    .join('; ');
  if (detail) parts.push(`used ${detail}`);

  if (report.skipped.length > 0) {
    const skipped = report.skipped.slice(0, 4).map((s) => `"${s.name}" (${s.reason})`);
    parts.push(
      `skipped ${skipped.join(', ')}${report.skipped.length > 4 ? ` and ${report.skipped.length - 4} more` : ''}`,
    );
  }

  return `${parts.join(' — ')}.`;
}
