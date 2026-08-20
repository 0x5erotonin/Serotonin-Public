/**
 * Mapping between the shapes the React components already use and the Amplify
 * Data models.
 *
 * The UI shapes are deliberately left exactly as they were — every component in
 * Serotonin.jsx keeps reading `draft.owner`, `entry.questions`, `doc.size` and
 * so on. All translation happens here, in one place, so the persistence layer
 * can evolve without touching the views.
 *
 * Two collisions worth knowing about:
 *   • `owner` in the UI is a person's display name, but Amplify reserves `owner`
 *     for owner-based authorization — the model field is `ownerName`.
 *   • `questions` means an array in a draft and a count in a KB entry. The
 *     models split those into `questions` (json) and `questionCount` (int).
 */

/** Amplify ids are strings; the UI historically minted numbers. Normalise both. */
export const asId = (value) =>
  value === undefined || value === null ? '' : String(value);

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nowIso = () => new Date().toISOString();

/** Newest first, tolerating records saved before `savedAt` existed. */
const byNewest = (a, b) =>
  new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();

export const COLLECTIONS = {
  /** Active assessments — the editor's drafts and the dashboard's cards. */
  drafts: {
    model: 'Questionnaire',
    sort: byNewest,
    toModel: (ui, ownerKey) => ({
      id: asId(ui.id),
      ownerKey,
      vendor: ui.vendor || 'Unnamed vendor',
      status: ui.status || (ui.step === 'complete' ? 'complete' : 'draft'),
      step: ui.step || 'intake',
      assignee: ui.assignee || '',
      manualText: ui.manualText || '',
      questions: Array.isArray(ui.questions) ? ui.questions : [],
      ownerName: ui.owner || '',
      ownerInitials: ui.ownerInitials || '',
      progress: num(ui.progress),
      questionCount: num(ui.questionCount ?? (Array.isArray(ui.questions) ? ui.questions.length : 0)),
      savedAt: ui.savedAt || nowIso(),
      savedAtLabel: ui.savedAtLabel || '',
    }),
    fromModel: (m) => ({
      id: asId(m.id),
      vendor: m.vendor || 'Unnamed vendor',
      status: m.status || 'draft',
      step: m.step || 'intake',
      assignee: m.assignee || '',
      manualText: m.manualText || '',
      questions: parseJson(m.questions, []),
      owner: m.ownerName || '',
      ownerInitials: m.ownerInitials || '',
      progress: num(m.progress),
      questionCount: num(m.questionCount),
      savedAt: m.savedAt || m.updatedAt || m.createdAt || '',
      savedAtLabel: m.savedAtLabel || '',
    }),
  },

  /** Completed questionnaires indexed into the knowledge base. */
  kbEntries: {
    model: 'KbEntry',
    sort: byNewest,
    toModel: (ui, ownerKey) => ({
      id: asId(ui.id),
      ownerKey,
      vendor: ui.vendor || 'Unnamed vendor',
      date: ui.date || '',
      questionCount: num(ui.questions),
      answered: num(ui.answered),
      industry: ui.industry || 'General',
      tags: Array.isArray(ui.tags) ? ui.tags : [],
      confidence: num(ui.confidence),
      source: ui.source || '',
      qaData: Array.isArray(ui.qaData) ? ui.qaData : [],
      savedAt: ui.savedAt || nowIso(),
    }),
    fromModel: (m) => ({
      id: asId(m.id),
      vendor: m.vendor || 'Unnamed vendor',
      date: m.date || '',
      questions: num(m.questionCount),
      answered: num(m.answered),
      industry: m.industry || 'General',
      tags: Array.isArray(m.tags) ? m.tags.filter(Boolean) : [],
      confidence: num(m.confidence),
      source: m.source || '',
      qaData: parseJson(m.qaData, []),
      savedAt: m.savedAt || m.createdAt || '',
    }),
  },

  /** Imported policy documents. `size` is a pre-formatted label in the UI. */
  kbDocs: {
    model: 'KbDocument',
    sort: byNewest,
    toModel: (ui, ownerKey) => ({
      id: asId(ui.id),
      ownerKey,
      name: ui.name || 'Untitled document',
      category: ui.category || '',
      note: ui.note || '',
      sizeBytes: num(ui.sizeBytes),
      sizeLabel: ui.size || '',
      contentType: ui.contentType || '',
      storagePath: ui.storagePath || '',
      date: ui.date || '',
      source: ui.source || 'Imported',
      tags: Array.isArray(ui.tags) ? ui.tags : [],
      savedAt: ui.savedAt || nowIso(),
    }),
    fromModel: (m) => ({
      id: asId(m.id),
      name: m.name || 'Untitled document',
      category: m.category || '',
      note: m.note || '',
      sizeBytes: num(m.sizeBytes),
      size: m.sizeLabel || '',
      contentType: m.contentType || '',
      storagePath: m.storagePath || '',
      date: m.date || '',
      source: m.source || 'Imported',
      tags: Array.isArray(m.tags) ? m.tags.filter(Boolean) : [],
      savedAt: m.savedAt || m.createdAt || '',
    }),
  },

  /** Files attached to a questionnaire on the approval step. */
  attachments: {
    model: 'Attachment',
    sort: byNewest,
    toModel: (ui, ownerKey) => ({
      id: asId(ui.id),
      ownerKey,
      questionnaireId: asId(ui.questionnaireId),
      name: ui.name || 'Untitled file',
      sizeBytes: num(ui.size ?? ui.sizeBytes),
      contentType: ui.contentType || '',
      storagePath: ui.storagePath || '',
      savedAt: ui.savedAt || nowIso(),
    }),
    fromModel: (m) => ({
      id: asId(m.id),
      questionnaireId: asId(m.questionnaireId),
      name: m.name || 'Untitled file',
      size: num(m.sizeBytes),
      sizeBytes: num(m.sizeBytes),
      contentType: m.contentType || '',
      storagePath: m.storagePath || '',
      savedAt: m.savedAt || m.createdAt || '',
    }),
  },

  /**
   * The auto-review search index — one row per passage or past Q&A pair.
   *
   * Not loaded on app boot: the embeddings make these rows heavy, and only a
   * match run or the backfill screen needs them. Fetched on demand via
   * store.listAll('chunks').
   */
  chunks: {
    model: 'KbIndexChunk',
    /**
     * The index can run to thousands of rows — 300 per document — so it gets a
     * higher read ceiling than the user-facing collections.
     */
    maxPages: 100,
    /**
     * Embeddings are dropped from the on-device mirror.
     *
     * A 256-float vector is ~2.5 KB of JSON; one 300-chunk document is about a
     * megabyte, and five would exhaust the ~5 MB localStorage quota — at which
     * point mirror writes fail silently and the index appears to vanish. The
     * mirror exists to render something when the network is down, and lexical
     * matching (which needs only the text) is exactly the documented degraded
     * mode. With no backend attached there are no embeddings to drop anyway,
     * since the embedding function is unreachable.
     */
    stripForMirror: (row) => (row.embedding ? { ...row, embedding: null } : row),
    sort: (a, b) => {
      const bySource = String(a.sourceId).localeCompare(String(b.sourceId));
      return bySource !== 0 ? bySource : num(a.chunkIndex) - num(b.chunkIndex);
    },
    toModel: (ui, ownerKey) => ({
      id: asId(ui.id),
      ownerKey,
      sourceType: ui.sourceType || 'document',
      sourceId: asId(ui.sourceId),
      sourceName: ui.sourceName || '',
      category: ui.category || '',
      question: ui.question || '',
      text: ui.text || '',
      page: ui.page === null || ui.page === undefined ? null : num(ui.page),
      chunkIndex: num(ui.chunkIndex),
      embedding: Array.isArray(ui.embedding) ? ui.embedding : null,
      embeddingDims: num(ui.embeddingDims),
      embeddingModel: ui.embeddingModel || '',
      savedAt: ui.savedAt || nowIso(),
    }),
    fromModel: (m) => ({
      id: asId(m.id),
      sourceType: m.sourceType || 'document',
      sourceId: asId(m.sourceId),
      sourceName: m.sourceName || '',
      category: m.category || '',
      question: m.question || '',
      text: m.text || '',
      page: m.page === null || m.page === undefined ? null : num(m.page),
      chunkIndex: num(m.chunkIndex),
      embedding: parseJson(m.embedding, null),
      embeddingDims: num(m.embeddingDims),
      embeddingModel: m.embeddingModel || '',
      savedAt: m.savedAt || m.createdAt || '',
    }),
  },

  /** Notification feed. Ordered by the seeded index, not by date. */
  notifications: {
    model: 'Notification',
    sort: (a, b) => num(a.sortIndex) - num(b.sortIndex),
    toModel: (ui, ownerKey) => ({
      id: asId(ui.id),
      ownerKey,
      type: ui.type || 'system',
      title: ui.title || '',
      body: ui.body || '',
      time: ui.time || '',
      module: ui.module || 'dashboard',
      cta: ui.cta || '',
      read: !!ui.read,
      sortIndex: num(ui.sortIndex),
      savedAt: ui.savedAt || nowIso(),
    }),
    fromModel: (m) => ({
      id: asId(m.id),
      type: m.type || 'system',
      title: m.title || '',
      body: m.body || '',
      time: m.time || '',
      module: m.module || 'dashboard',
      cta: m.cta || '',
      read: !!m.read,
      sortIndex: num(m.sortIndex),
      savedAt: m.savedAt || m.createdAt || '',
    }),
  },
};

/** Single-record collection, keyed by owner rather than a generated id. */
export const PROFILE_COLLECTION = {
  model: 'UserProfile',
  toModel: (ui, ownerKey) => ({
    id: asId(ownerKey),
    ownerKey,
    name: ui.name || '',
    title: ui.title || '',
    email: ui.email || '',
    department: ui.department || '',
    role: ui.role || 'analyst',
    avatarPath: ui.avatarPath || '',
    prefs: ui.prefs || {},
    themeKey: ui.themeKey || '',
  }),
  fromModel: (m) => ({
    name: m.name || '',
    title: m.title || '',
    email: m.email || '',
    department: m.department || '',
    role: m.role || 'analyst',
    avatarPath: m.avatarPath || '',
    prefs: parseJson(m.prefs, {}) || {},
    themeKey: m.themeKey || '',
  }),
};

/**
 * AppSync returns `a.json()` fields already parsed, but the local-storage
 * mirror and older records can hand back a string. Accept either.
 */
function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
