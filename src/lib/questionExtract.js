/**
 * Pull discrete questions out of the raw text of a questionnaire.
 *
 * Security questionnaires are not structured data. They arrive as numbered
 * lists, lettered sub-items, control-ID tables, CSV grids, or prose with
 * question marks — often several of those in the same document. So this works
 * by scoring candidate lines rather than matching one format:
 *
 *   1. Split the text into lines, then stitch back lines that a PDF broke
 *      mid-sentence (a very common artifact of column layouts).
 *   2. Group lines into items using enumeration markers, so a question and its
 *      sub-clauses stay together.
 *   3. Score each item on how question-shaped it is, and keep what clears the
 *      bar.
 *   4. Strip the marker, drop boilerplate, and de-duplicate.
 *
 * Everything here is a pure function of the input text, which is what makes it
 * unit-testable without a browser — see tests/extraction.spec.mjs.
 */

/** A line that starts a new enumerated item: "1.", "1)", "Q1:", "a.", "iv)", "3.1.2". */
const MARKER = /^\s*(?:(?:Q|Question)\s*)?(\d+(?:\.\d+)*|[A-Za-z]|[ivxIVX]{1,5})\s*[.)\]:-]\s+/;

/**
 * Control-ID style prefixes: "AC-2", "CC6.1", "IAM.3", "A.9.2.1".
 *
 * Three alternatives rather than one loose pattern, so that "SOC 2 Type II
 * report" is NOT mistaken for a control ID and stripped: a bare
 * letters-space-digits form only counts when the number is dotted (CC 6.1),
 * otherwise the letters and digits must be joined by punctuation or nothing.
 */
const CONTROL_ID =
  /^\s*([A-Z]{1,6}[-.]\d+(?:\.\d+)*|[A-Z]{2,6}\s\d+(?:\.\d+)+|[A-Z]{1,6}\d+(?:\.\d+)+)\s*[:.)\-|]?\s+/;

/** Bullets. */
const BULLET = /^\s*[•▪◦‣·*+–—-]\s+/;

/** Words that make a line a question even without a question mark. */
const INTERROGATIVE = /^(do|does|did|is|are|was|were|has|have|had|can|could|will|would|should|shall|may|must|if|who|what|when|where|why|how|which|please|describe|explain|provide|list|specify|identify|confirm|indicate|state|detail|outline|summarize|summarise|attach|upload|document|demonstrate)\b/i;

/** Phrases that signal a requirement even mid-sentence. */
const REQUIREMENT = /\b(do you|does your|are you|is your|have you|has your|can you|will you|please (?:describe|explain|provide|list|specify|confirm|attach|indicate|detail)|describe (?:your|how|the|any|briefly|in detail)|explain (?:your|how|the|why|any)|provide (?:a|the|your|evidence|details)|list (?:all|any|the|your)|indicate (?:whether|how|if)|confirm (?:that|whether)|specify (?:the|your|how)|outline (?:your|the|how)|summari[sz]e (?:your|the|how)|how (?:do|does|are|is|many|often)|what (?:is|are|type|kind)|who (?:is|are|has)|where (?:is|are|do)|evidence of|documentation (?:of|for)|attach (?:a|the|your))\b/i;

/** Section headings and page furniture that are never questions. */
const BOILERPLATE =
  /^(section|part|appendix|annex|schedule|exhibit|table of contents|contents|page \d+|confidential|proprietary|copyright|©|introduction|overview|scope|purpose|definitions|glossary|instructions|revision history|version \d|last (?:updated|reviewed)|prepared (?:by|for)|classification|internal use|vendor (?:name|information)|company (?:name|information)|date completed?|completed by|reviewed by|approved by|signature|yes\s*\/\s*no|n\s*\/\s*a|response|answer|comments?|notes?|status|owner|evidence|attachments?)\b/i;

/**
 * Common response-column headers in CSV/table rows, stripped before scoring.
 *
 * Written carefully to avoid catastrophic backtracking. The earlier version was
 * `/\s*\|\s*(…|\s*)\s*$/` — three unbounded whitespace runs competing over the
 * same characters, plus an empty alternative. On a line containing `|`, a long
 * whitespace run and then a non-space character, the match fails at `$` and the
 * engine enumerates every way to partition that run: measured at 67 seconds for
 * a 5,000-character run, which froze the tab on an ordinary uploaded file.
 *
 * Now there is exactly one unbounded run after `\|`, and the optional keyword
 * group carries its own trailing spaces, so no two quantifiers can compete for
 * the same position. Leading whitespace is handled by `.trim()` instead.
 */
const RESPONSE_COLUMN =
  /\|[ \t]*(?:(?:yes[ \t]*\/[ \t]*no|yes|no|n\/?a|not applicable|response|answer|comments?|notes?|evidence|status|owner|attachments?)[ \t]*)?$/i;

const MIN_LENGTH = 12;
const MAX_LENGTH = 700;

/**
 * @param rawText  text from src/lib/extract.js
 * @param options  { minScore = 2, sourceName = '' }
 * @returns { questions: [{ text, marker, score, signals[] }], stats }
 */
export function extractQuestions(rawText, options = {}) {
  const { minScore = 2, sourceName = '' } = options;
  const text = String(rawText || '');
  if (!text.trim()) {
    return { questions: [], stats: emptyStats(sourceName) };
  }

  const lines = stitchWrappedLines(
    text.split('\n').map((line) => line.trim()).filter(Boolean),
  );
  const items = groupIntoItems(lines);

  const scored = items
    .map((item) => scoreItem(item))
    .filter((item) => item.score >= minScore && item.text.length >= MIN_LENGTH);

  const questions = dedupe(scored).map((item, index) => ({
    ...item,
    text: item.text.length > MAX_LENGTH ? `${item.text.slice(0, MAX_LENGTH).trim()}…` : item.text,
    index,
  }));

  return {
    questions,
    stats: {
      sourceName,
      lines: lines.length,
      candidates: items.length,
      extracted: questions.length,
      rejected: items.length - scored.length,
      duplicates: scored.length - questions.length,
    },
  };
}

const emptyStats = (sourceName) => ({
  sourceName,
  lines: 0,
  candidates: 0,
  extracted: 0,
  rejected: 0,
  duplicates: 0,
});

/* ── 1. Repair PDF line wrapping ──────────────────────────────────────────── */

/**
 * Rejoin lines a PDF split mid-sentence.
 *
 * A continuation is a line that starts lowercase (or with a closing bracket)
 * where the previous line did not end in terminal punctuation and did not look
 * like a heading. Without this, "Do you maintain an incident" / "response plan?"
 * scores as two fragments and neither reads as a question.
 */
function stitchWrappedLines(lines) {
  const out = [];
  for (const line of lines) {
    const previous = out[out.length - 1];
    const isContinuation =
      previous &&
      !/[.?!:;|]$/.test(previous) &&
      !startsNewItem(line) &&
      /^[a-z(\[]/.test(line) &&
      previous.length < 300;
    if (isContinuation) {
      out[out.length - 1] = `${previous} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

const startsNewItem = (line) =>
  MARKER.test(line) || CONTROL_ID.test(line) || BULLET.test(line);

/* ── 2. Group lines into items ────────────────────────────────────────────── */

/**
 * An enumerated line starts a new item; unmarked lines after it are appended,
 * so a question keeps its sub-clauses ("...including: (a) at rest (b) in
 * transit"). With no markers at all, every line is its own item.
 */
function groupIntoItems(lines) {
  const items = [];
  let current = null;

  for (const line of lines) {
    const marker = markerOf(line);
    if (marker !== null) {
      if (current) items.push(current);
      current = { raw: line, marker, extra: [] };
      continue;
    }
    // An unmarked line only continues the current item when that item is
    // genuinely unfinished. Three things end an item:
    //   • the previous text already ends in terminal punctuation — prose
    //     questions on consecutive lines are separate questions, not one blob;
    //   • either side is a table/CSV row, where each row stands alone;
    //   • the item is long enough to stand on its own, or this line is a heading.
    const previousText = current ? [current.raw, ...current.extra].join(' ') : '';
    const previousComplete = /[.?!]$/.test(previousText);
    const tableRow = line.includes('|') || previousText.includes('|');

    if (current && !previousComplete && !tableRow && !isHeading(line) && joinedLength(current) < 400) {
      current.extra.push(line);
    } else {
      if (current) items.push(current);
      current = { raw: line, marker: null, extra: [] };
    }
  }
  if (current) items.push(current);
  return items;
}

function markerOf(line) {
  const control = line.match(CONTROL_ID);
  if (control) return control[1];
  const enumerated = line.match(MARKER);
  if (enumerated) return enumerated[1];
  if (BULLET.test(line)) return '•';
  return null;
}

const joinedLength = (item) =>
  item.raw.length + item.extra.reduce((sum, line) => sum + line.length + 1, 0);

const isHeading = (line) =>
  BOILERPLATE.test(line) ||
  (line.length < 60 && !/[.?]$/.test(line) && line === line.toUpperCase() && /[A-Z]{3}/.test(line));

/* ── 3. Score how question-shaped an item is ──────────────────────────────── */

function scoreItem(item) {
  const joined = [item.raw, ...item.extra].join(' ');
  const stripped = stripResponseColumns(stripMarker(joined));
  const signals = [];
  let score = 0;

  if (/\?/.test(stripped)) {
    score += 3;
    signals.push('question mark');
  }
  if (REQUIREMENT.test(stripped)) {
    score += 2;
    signals.push('requirement phrasing');
  }
  if (INTERROGATIVE.test(stripped)) {
    score += 1;
    signals.push('interrogative opening');
  }
  if (item.marker !== null) {
    score += 1;
    signals.push('enumerated');
  }
  // A pipe means this came from a table or CSV row, where the left cell is
  // usually the question and the rest is the response column.
  if (joined.includes('|')) {
    score += 1;
    signals.push('table row');
  }

  // Penalties.
  if (BOILERPLATE.test(stripped)) {
    score -= 4;
    signals.push('boilerplate');
  }
  if (stripped.length < MIN_LENGTH) {
    score -= 2;
    signals.push('too short');
  }
  if (stripped.split(/\s+/).length < 4) {
    score -= 1;
    signals.push('too few words');
  }
  // Mostly digits/punctuation — a page number, a date, a table of figures.
  if (stripped.replace(/[^A-Za-z]/g, '').length < stripped.length * 0.5) {
    score -= 2;
    signals.push('not prose');
  }

  return { text: tidy(stripped), marker: item.marker, score, signals };
}

/**
 * Strip trailing response columns, repeatedly.
 *
 * A table row arrives as "Do you have a SOC 2 report? | Yes/No | Comments" —
 * one pass would only remove the last column, leaving "| Yes/No" in the question
 * text. Loop until it stops changing (bounded, so a pathological row cannot spin).
 */
function stripResponseColumns(text) {
  let current = text.trim();
  for (let i = 0; i < 8; i += 1) {
    const next = current.replace(RESPONSE_COLUMN, '').trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

function stripMarker(line) {
  return line
    .replace(CONTROL_ID, '')
    .replace(MARKER, '')
    .replace(BULLET, '')
    .trim();
}

function tidy(text) {
  return text
    .replace(/\s*\|\s*/g, ' — ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([?.,;:])/g, '$1')
    .replace(/[\s—–-]+$/, '')
    .trim();
}

/* ── 4. De-duplicate ──────────────────────────────────────────────────────── */

/**
 * Questionnaires repeat themselves — the same control appears in a summary
 * table and again in the detail section. Compare on a normalised key so
 * near-identical phrasings collapse, keeping the higher-scoring copy.
 */
function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || item.score > existing.score) seen.set(key, item);
  }
  // Map preserves insertion order, so document order survives.
  return [...seen.values()];
}

/**
 * Score a single string on how question-shaped it is.
 *
 * Exported so the spreadsheet path (src/lib/gridQuestions.js) can pick the
 * question column using exactly the same signals as the text path, instead of
 * duplicating the regexes and letting the two definitions drift apart.
 *
 * @returns { text, score, signals } — score is roughly -6..+6
 */
export function scoreLine(text) {
  const line = String(text || '').trim();
  if (!line) return { text: '', score: -5, signals: ['empty'] };
  return scoreItem({ raw: line, marker: null, extra: [] });
}

/**
 * The paste/manual path: one question per line, markers stripped, no scoring.
 *
 * The user typed these deliberately, so second-guessing them is wrong — this
 * exists so the manual path and the upload path produce the same shape.
 */
export function questionsFromLines(rawText) {
  return String(rawText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => tidy(stripMarker(line)))
    .filter((line) => line.length > 0)
    .map((text, index) => ({ text, marker: null, score: 99, signals: ['manual entry'], index }));
}
