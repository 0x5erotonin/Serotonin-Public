/**
 * Document text extraction, in the browser.
 *
 * This replaces the placeholder the app used to show on the upload path —
 * "Connect a file parsing service (PDF.js, Mammoth for DOCX)". It is now
 * connected:
 *
 *   .pdf            PDF.js, page by page, preserving line breaks and page numbers
 *   .docx           Mammoth (raw text)
 *   .txt .md        read directly
 *   .csv .tsv       parsed as a grid, so questionnaire spreadsheets exported to
 *                   CSV keep their row structure for the question extractor
 *
 * Both parsers are pulled in with dynamic `import()` so they are code-split:
 * PDF.js alone is over a megabyte, and someone who only pastes text never
 * downloads it.
 *
 * Two limitations worth being explicit about rather than failing silently:
 *
 *   • A scanned or image-only PDF contains no text layer. We detect that (pages
 *     parse, produce nothing) and say so, rather than reporting "0 questions
 *     found". OCR would need Textract or tesseract.js.
 *   • .xlsx/.xls are not parsed — that needs SheetJS. Since real questionnaires
 *     (SIG, CAIQ) often arrive as spreadsheets, the error tells the user to
 *     export the sheet as CSV, which is supported.
 */

/** Result: { text, pages, kind, warnings[], error }. `text` is '' on failure. */
export async function extractText(file) {
  const name = file?.name || 'document';
  const kind = detectKind(name, file?.type);
  const base = { text: '', pages: [], kind, warnings: [], error: null };

  if (!file) return { ...base, error: 'No file provided.' };

  try {
    switch (kind) {
      case 'pdf':
        return { ...base, ...(await extractPdf(file)) };
      case 'docx':
        return { ...base, ...(await extractDocx(file)) };
      case 'text':
        return { ...base, ...(await extractPlain(file)) };
      case 'delimited':
        return { ...base, ...(await extractDelimited(file, name)) };
      case 'spreadsheet':
        return {
          ...base,
          error:
            'Excel files are not parsed yet. Open the sheet, "Save As" or export it as CSV, and upload that instead — CSV questionnaires are parsed row by row.',
        };
      case 'legacy-doc':
        return {
          ...base,
          error:
            'Legacy .doc files use a binary format that cannot be read in the browser. Open it in Word and save as .docx.',
        };
      default:
        return {
          ...base,
          error: `Unsupported file type "${name.split('.').pop()}". Supported: PDF, DOCX, TXT, MD, CSV, TSV.`,
        };
    }
  } catch (err) {
    console.warn('[serotonin] Text extraction failed.', err);
    return {
      ...base,
      error: `Could not read ${name}: ${err?.message || err}`,
    };
  }
}

/* ── Type detection ───────────────────────────────────────────────────────── */

function detectKind(name, mimeType) {
  const ext = String(name).toLowerCase().split('.').pop();
  const mime = String(mimeType || '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (ext === 'doc' || mime === 'application/msword') return 'legacy-doc';
  if (ext === 'csv' || ext === 'tsv') return 'delimited';
  if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheetml')) return 'spreadsheet';
  if (ext === 'txt' || ext === 'md' || ext === 'text' || mime.startsWith('text/')) return 'text';
  return 'unknown';
}

/* ── PDF ──────────────────────────────────────────────────────────────────── */

let pdfjsPromise = null;

/**
 * Load PDF.js and point it at its worker.
 *
 * The `?url` import is how Vite hands back a hashed asset path for the worker
 * bundle. If that fails (a different bundler, or the path moves in a future
 * major), fall back to running the parser on the main thread: slower and it
 * blocks the UI on big files, but it produces text instead of an error.
 */
async function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const pdfjs = await import('pdfjs-dist');
    try {
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch (err) {
      console.warn('[serotonin] PDF.js worker unavailable — parsing on the main thread.', err);
    }
    return pdfjs;
  })().catch((err) => {
    pdfjsPromise = null;
    throw err;
  });
  return pdfjsPromise;
}

async function extractPdf(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const pages = [];
  const warnings = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({ page: pageNumber, text: joinTextItems(content.items) });
      // Release the page's operator list; long documents otherwise accumulate.
      page.cleanup();
    }
  } finally {
    // Always tear down the worker transport, even if a page threw.
    await doc.destroy().catch(() => {});
  }

  const text = pages.map((p) => p.text).join('\n\n');
  if (text.trim().length === 0 && pages.length > 0) {
    warnings.push(
      `${file.name} has ${pages.length} page${pages.length !== 1 ? 's' : ''} but no text layer — it is probably a scan or an image export. Questions cannot be extracted without OCR.`,
    );
  }
  return { text, pages, warnings };
}

/**
 * Reassemble PDF text items into lines.
 *
 * PDF.js emits positioned fragments, not lines. Its `hasEOL` flag marks the end
 * of a text run, which is the closest thing to a newline the format offers —
 * without honouring it, a numbered questionnaire collapses into one paragraph
 * and the question extractor has nothing to split on.
 */
function joinTextItems(items) {
  let out = '';
  for (const item of items) {
    if (typeof item?.str !== 'string') continue;
    out += item.str;
    if (item.hasEOL) out += '\n';
    else if (item.str && !item.str.endsWith(' ')) out += ' ';
  }
  return out
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/* ── DOCX ─────────────────────────────────────────────────────────────────── */

async function extractDocx(file) {
  // Vite resolves mammoth's `browser` field to its browser bundle. If a build
  // ever complains about `fs`, uncomment the alias in vite.config.js.
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule?.default ?? mammothModule;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  const warnings = (result?.messages || [])
    .filter((m) => m?.type === 'warning')
    .slice(0, 3)
    .map((m) => `DOCX: ${m.message}`);

  const text = normaliseWhitespace(result?.value || '');
  if (!text.trim()) {
    warnings.push(`${file.name} parsed but contained no text.`);
  }
  return { text, pages: [{ page: 1, text }], warnings };
}

/* ── Plain text ───────────────────────────────────────────────────────────── */

async function extractPlain(file) {
  const text = normaliseWhitespace(await file.text());
  return { text, pages: [{ page: 1, text }], warnings: [] };
}

/* ── CSV / TSV ────────────────────────────────────────────────────────────── */

/**
 * Parse a delimited questionnaire into one line per row.
 *
 * Questionnaire spreadsheets put the question in one column and leave others for
 * the response, so cells are joined with ' | ' and the extractor picks the
 * question-shaped part out of the row. Handles quoted fields containing the
 * delimiter, newlines, and escaped quotes.
 */
async function extractDelimited(file, name) {
  const raw = await file.text();
  const delimiter = name.toLowerCase().endsWith('.tsv') ? '\t' : guessDelimiter(raw);
  const rows = parseDelimited(raw, delimiter);
  const lines = rows
    // Normalise inside each cell too, not just at its edges — interior padding
    // is common in exported spreadsheets.
    .map((row) => row.map((cell) => cell.replace(/[^\S\n]+/g, ' ').trim()).filter(Boolean).join(' | '))
    .filter((line) => line.length > 0);
  const text = lines.join('\n');
  return {
    text,
    pages: [{ page: 1, text }],
    warnings: rows.length === 0 ? [`${name} contained no rows.`] : [],
  };
}

function guessDelimiter(sample) {
  const head = sample.slice(0, 4000);
  const counts = [
    [',', (head.match(/,/g) || []).length],
    [';', (head.match(/;/g) || []).length],
    ['\t', (head.match(/\t/g) || []).length],
  ].sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function parseDelimited(input, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Treat \r\n as one break.
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* ── Shared ───────────────────────────────────────────────────────────────── */

/**
 * Collapse every run of intra-line whitespace to a single space.
 *
 * `[^\S\n]` rather than a space/tab/nbsp list: documents exported from word
 * processors are full of thin spaces (U+2009), ideographic spaces (U+3000),
 * form feeds and vertical tabs. Leaving those in meant downstream regexes saw
 * long whitespace runs they were never written for — which is exactly what made
 * the response-column pattern pathological on real files.
 */
function normaliseWhitespace(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extensions the file picker should advertise. */
export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv', '.tsv'];

/** Human-readable list for empty states and hints. */
export const SUPPORTED_LABEL = 'PDF, DOCX, TXT, MD, CSV';
