/**
 * The integration export: `serotonin.api.v1`.
 *
 * The full backup (`serotonin.backup`) exists to be restored, and its shape is
 * whatever the UI happens to hold — including two fields called `questions` that
 * are a count in one collection and an array in another. That is survivable for
 * a restore, where both ends are this app, and it is a trap for anything else.
 *
 * This shape is the one to point an integration at:
 *
 *   - every field name means one thing, everywhere
 *   - counts are named `*Count`, arrays are plural nouns, timestamps are ISO 8601
 *     and named `*At`, human-readable dates are separate and named `*Label`
 *   - completed and in-flight questionnaires are one collection with a `status`,
 *     rather than two collections with incompatible field types
 *   - files are references, not base64. A backup inlines bytes because it has to
 *     restore them; an integration wants to know what exists and where, and a
 *     library of PDFs turns a JSON document into hundreds of megabytes
 *   - document passages come out already extracted and split, so a consumer
 *     never re-implements PDF parsing
 *   - it is described by docs/serotonin.api.v1.schema.json, which is validated
 *     against a generated export in tests/apiexport.spec.mjs — so the schema
 *     cannot drift from the code without a test failing
 *
 * Deliberately excluded: notifications (UI state, no integration value) and the
 * user profile (personal data with no reason to leave the app). Embedding
 * vectors are included when they exist, which is only when a cloud backend is
 * attached — see the note on `embedding` below.
 *
 * Pure and dependency-free so it can be unit tested in plain Node.
 */

export const API_EXPORT_FORMAT = 'serotonin.api';
export const API_EXPORT_VERSION = '1.0.0';

const iso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const text = (value) => (value === null || value === undefined ? '' : String(value));
const list = (value) => (Array.isArray(value) ? value.filter(Boolean).map(String) : []);
const count = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

/**
 * How to reach a file, without carrying it.
 *
 * `scheme` is the useful part: an `s3` reference can be fetched by anything with
 * credentials, a `device` reference exists only inside one browser's IndexedDB
 * and a consumer needs to know that rather than discovering it by failing.
 */
function fileRef(storagePath, { name, contentType, sizeBytes } = {}) {
  const path = text(storagePath);
  let scheme = 'none';
  if (path.startsWith('idb://')) scheme = 'device';
  else if (path) scheme = 's3';

  return {
    scheme,
    ref: path || null,
    name: text(name) || null,
    contentType: text(contentType) || null,
    sizeBytes: count(sizeBytes),
    // Never true in this format. Stated rather than omitted so a consumer does
    // not have to infer it, and so the backup format stays distinguishable.
    bytesIncluded: false,
  };
}

/** One answer, from either a completed entry's qaData or a draft's questions. */
function answerFrom(source, position) {
  const suggestion = source.suggestion || null;
  return {
    position,
    question: text(source.text ?? source.question),
    answer: text(source.answer),
    // 'answered' covers a completed entry, where per-question status was not
    // retained; drafts carry the real one.
    status: text(source.status) || (text(source.answer).trim() ? 'answered' : 'unanswered'),
    confidence: source.confidence === undefined ? null : count(source.confidence),
    citation: text(source.citation ?? source.source) || null,
    source: suggestion
      ? {
          type: suggestion.sourceType === 'qa' ? 'questionnaire' : 'document',
          id: text(suggestion.sourceId) || null,
          name: text(suggestion.sourceName) || null,
          page: suggestion.page === null || suggestion.page === undefined ? null : count(suggestion.page),
          addedLabel: text(suggestion.sourceDate) || null,
          addedAt: iso(suggestion.sourceSavedAt),
        }
      : null,
  };
}

/**
 * Build an integration export.
 *
 * @param input.entries      kbEntries — completed questionnaires
 * @param input.drafts       questionnaires in flight
 * @param input.docs         kbDocs — imported policy documents
 * @param input.chunks       the index: extracted passages and answer history
 * @param input.attachments  files sent with a questionnaire
 * @param input.appVersion   written into `generator`, for support questions
 * @param input.now          injectable clock, so the output is testable
 */
export function toApiExport({
  entries = [],
  drafts = [],
  docs = [],
  chunks = [],
  attachments = [],
  appVersion = '',
  now = new Date(),
} = {}) {
  const passagesBySource = new Map();
  for (const chunk of chunks) {
    const key = String(chunk?.sourceId ?? '');
    if (!passagesBySource.has(key)) passagesBySource.set(key, []);
    passagesBySource.get(key).push(chunk);
  }

  const attachmentsByQuestionnaire = new Map();
  for (const attachment of attachments) {
    const key = String(attachment?.questionnaireId ?? '');
    if (!attachmentsByQuestionnaire.has(key)) attachmentsByQuestionnaire.set(key, []);
    attachmentsByQuestionnaire.get(key).push(attachment);
  }

  const attachmentsFor = (id) =>
    (attachmentsByQuestionnaire.get(String(id)) || []).map((attachment) => ({
      name: text(attachment.name),
      file: fileRef(attachment.storagePath, {
        name: attachment.name,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes ?? attachment.size,
      }),
      addedAt: iso(attachment.savedAt),
    }));

  /* ── Questionnaires: one collection, one shape, a status to tell them apart ── */

  const completed = entries.map((entry) => {
    const answers = (entry.qaData || []).map((pair, index) => answerFrom(pair, index + 1));
    return {
      id: text(entry.id),
      status: 'complete',
      vendor: text(entry.vendor),
      industry: text(entry.industry) || null,
      tags: list(entry.tags),
      owner: null,
      assignee: null,
      step: 'complete',
      // `questions` in the backup format is a count here and an array in
      // drafts. Both are spelled out, so neither name is ambiguous.
      questionCount: count(entry.questions ?? answers.length),
      answeredCount: count(entry.answered ?? answers.filter((a) => a.answer.trim()).length),
      averageConfidence: entry.confidence === undefined ? null : count(entry.confidence),
      completedLabel: text(entry.date) || null,
      completedAt: iso(entry.savedAt),
      updatedAt: iso(entry.savedAt),
      answers,
      attachments: attachmentsFor(entry.id),
    };
  });

  const inFlight = drafts.map((draft) => {
    const questions = Array.isArray(draft.questions) ? draft.questions : [];
    const answers = questions.map((question, index) => answerFrom(question, index + 1));
    return {
      id: text(draft.id),
      status: 'in_progress',
      vendor: text(draft.vendor),
      industry: null,
      tags: [],
      owner: text(draft.owner) || null,
      assignee: text(draft.assignee) || null,
      step: text(draft.step) || 'intake',
      questionCount: count(draft.questionCount ?? questions.length),
      answeredCount: answers.filter((a) => a.answer.trim()).length,
      averageConfidence: null,
      completedLabel: null,
      completedAt: null,
      updatedAt: iso(draft.savedAt),
      answers,
      attachments: attachmentsFor(draft.id),
    };
  });

  /* ── Documents ────────────────────────────────────────────────────────────── */

  const documents = docs.map((doc) => {
    const passages = passagesBySource.get(String(doc.id)) || [];
    return {
      id: text(doc.id),
      name: text(doc.name),
      category: text(doc.category) || null,
      note: text(doc.note) || null,
      tags: list(doc.tags),
      addedLabel: text(doc.date) || null,
      addedAt: iso(doc.savedAt),
      origin: text(doc.source) || null,
      file: fileRef(doc.storagePath, {
        name: doc.name,
        contentType: doc.contentType,
        sizeBytes: doc.sizeBytes,
      }),
      passageCount: passages.length,
      // Whether auto-review can actually find this document. A record with no
      // passages is listed in the library and invisible to matching, which is
      // exactly the kind of thing an integration wants to be told.
      indexed: passages.length > 0,
    };
  });

  /* ── Passages ─────────────────────────────────────────────────────────────── */

  const passages = chunks.map((chunk) => ({
    id: text(chunk.id),
    // 'document' is an extracted passage; 'answer' is a previous answer, whose
    // `question` field is what matching compares against.
    kind: chunk.sourceType === 'qa' ? 'answer' : 'document',
    sourceType: chunk.sourceType === 'qa' ? 'questionnaire' : 'document',
    sourceId: text(chunk.sourceId),
    sourceName: text(chunk.sourceName) || null,
    category: text(chunk.category) || null,
    page: chunk.page === null || chunk.page === undefined ? null : count(chunk.page),
    position: count(chunk.chunkIndex),
    question: text(chunk.question) || null,
    text: text(chunk.text),
    // Present only when a cloud backend is attached. The on-device mirror strips
    // vectors on purpose — a 256-float vector is ~2.5 KB of JSON and a handful
    // of documents would exhaust the browser's storage quota — so a device-only
    // export reports the model and dimensions it would have used, with a null
    // vector, rather than pretending none was ever computed.
    embedding: {
      model: text(chunk.embeddingModel) || null,
      dimensions: count(chunk.embeddingDims),
      vector: Array.isArray(chunk.embedding) ? chunk.embedding : null,
    },
    indexedAt: iso(chunk.savedAt),
  }));

  const questionnaires = [...completed, ...inFlight];

  return {
    format: API_EXPORT_FORMAT,
    version: API_EXPORT_VERSION,
    generatedAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    generator: { app: 'serotonin', appVersion: text(appVersion) || null },
    counts: {
      questionnaires: questionnaires.length,
      completedQuestionnaires: completed.length,
      inProgressQuestionnaires: inFlight.length,
      answers: questionnaires.reduce((sum, q) => sum + q.answers.length, 0),
      documents: documents.length,
      indexedDocuments: documents.filter((d) => d.indexed).length,
      passages: passages.length,
      passagesWithVectors: passages.filter((p) => p.embedding.vector !== null).length,
    },
    questionnaires,
    documents,
    passages,
  };
}
