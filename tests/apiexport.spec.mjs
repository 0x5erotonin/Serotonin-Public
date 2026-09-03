/**
 * The integration export, and the schema that describes it.
 *
 * The point of this format is that a consumer can rely on it, so the schema has
 * to be load-bearing rather than decorative: a generated export is validated
 * against docs/serotonin.api.v1.schema.json here, and the schema uses
 * `additionalProperties: false` throughout — so adding a field to the exporter
 * without documenting it fails, and documenting a field the exporter does not
 * emit fails too.
 *
 * The validator below is a deliberately small one, covering only the JSON Schema
 * constructs this schema uses. There is no validator in the dependency tree and
 * adding one for this is not worth it — but a checker nobody has tested is worse
 * than none, so its own behaviour is verified against deliberately broken input
 * before it is trusted with the real thing.
 *
 *   node tests/apiexport.spec.mjs
 */

import { readFileSync } from 'node:fs';
import { toApiExport, API_EXPORT_FORMAT, API_EXPORT_VERSION } from '../src/lib/apiExport.js';
import { validate } from './apiSchemaCheck.mjs';

let passed = 0;
let failed = 0;
const check = (name, condition, detail = '') => {
  if (condition) passed++; else failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${detail}`}`);
};
const eq = (name, actual, expected) =>
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const schema = JSON.parse(
  readFileSync(new URL('../docs/serotonin.api.v1.schema.json', import.meta.url), 'utf8'),
);

/* ── The validator lives in tests/apiSchemaCheck.mjs, shared with bulkio ──── */
/* ── The validator has to be trustworthy before it is useful ───────────────── */

const tinySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['a', 'b'],
  properties: {
    a: { type: 'string', pattern: '^x' },
    b: { type: 'integer', minimum: 0, maximum: 10 },
    c: { type: ['string', 'null'], format: 'date-time' },
    d: { enum: ['one', 'two'] },
    e: { type: 'array', items: { type: 'number' } },
  },
};

eq('validator: accepts a valid object', validate({ a: 'xy', b: 5 }, tinySchema, tinySchema).length, 0);
eq('validator: catches a missing required property', validate({ a: 'xy' }, tinySchema, tinySchema).length, 1);
eq('validator: catches an unexpected property', validate({ a: 'xy', b: 1, z: 1 }, tinySchema, tinySchema).length, 1);
eq('validator: catches a wrong type', validate({ a: 1, b: 1 }, tinySchema, tinySchema).length, 1);
eq('validator: catches a failed pattern', validate({ a: 'yy', b: 1 }, tinySchema, tinySchema).length, 1);
eq('validator: catches a number below minimum', validate({ a: 'xy', b: -1 }, tinySchema, tinySchema).length, 1);
eq('validator: catches a number above maximum', validate({ a: 'xy', b: 99 }, tinySchema, tinySchema).length, 1);
eq('validator: accepts null in a type union', validate({ a: 'xy', b: 1, c: null }, tinySchema, tinySchema).length, 0);
eq('validator: catches a malformed date-time', validate({ a: 'xy', b: 1, c: 'yesterday' }, tinySchema, tinySchema).length, 1);
eq('validator: accepts a real date-time', validate({ a: 'xy', b: 1, c: '2026-08-31T13:47:00.080Z' }, tinySchema, tinySchema).length, 0);
eq('validator: catches a value outside an enum', validate({ a: 'xy', b: 1, d: 'three' }, tinySchema, tinySchema).length, 1);
eq('validator: checks array items', validate({ a: 'xy', b: 1, e: [1, 'no'] }, tinySchema, tinySchema).length, 1);
eq('validator: resolves a $ref', validate({ a: 'xy', b: 1 }, { $ref: '#' }, tinySchema).length, 0);

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const FIXTURE = {
  appVersion: '2.1.0',
  now: new Date('2026-08-31T13:47:00.080Z'),
  entries: [
    {
      id: 'kb_1',
      vendor: 'Globex Assurance',
      date: 'Aug 31, 2026',
      questions: 2,          // a COUNT here — the collision this format removes
      answered: 2,
      industry: 'SaaS',
      tags: ['Completed', 'SOC 2'],
      confidence: 100,
      source: 'Complete questionnaire',
      savedAt: '2026-08-31T13:46:53.331Z',
      qaData: [
        { text: 'Do you encrypt customer data at rest?', answer: 'Yes. AES-256.', source: 'information-security-policy.txt · p.1' },
        { text: 'How often is DR tested?', answer: 'Twice per year.', source: '' },
      ],
    },
  ],
  drafts: [
    {
      id: 'draft_1',
      vendor: 'Northwind Health',
      step: 'review',
      owner: 'Blayqe Forbes',
      assignee: 'Sarah L.',
      questionCount: 2,
      savedAt: '2026-08-30T09:00:00.000Z',
      questions: [           // an ARRAY here — same field name, different type
        {
          id: 1,
          text: 'Describe your encryption at rest.',
          answer: 'AES-256 with KMS-managed keys.',
          status: 'auto-filled',
          confidence: 92,
          source: 'Previously answered — Globex',
          suggestion: {
            sourceType: 'document',
            sourceId: 'doc_1',
            sourceName: 'information-security-policy.txt',
            sourceDate: 'Aug 31, 2026',
            sourceSavedAt: '2026-08-31T10:00:00.000Z',
            page: 4,
          },
        },
        { id: 2, text: 'What is your RTO?', answer: '', status: 'needs-input', confidence: 0, suggestion: null },
      ],
    },
  ],
  docs: [
    {
      id: 'doc_1',
      name: 'information-security-policy.txt',
      category: 'Information Security Policy',
      note: 'Version 3.2',
      tags: ['Information Security Policy'],
      date: 'Aug 31, 2026',
      savedAt: '2026-08-31T10:00:00.000Z',
      source: 'Imported',
      storagePath: 'idb://kb-documents/abc-information-security-policy.txt',
      contentType: 'text/plain',
      sizeBytes: 260,
    },
    {
      id: 'doc_2',
      name: 'unindexed-report.pdf',
      category: 'SOC 2 Report',
      date: 'Aug 1, 2026',
      savedAt: '2026-08-01T10:00:00.000Z',
      storagePath: 'user-files/abc/kb-documents/unindexed-report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 4096,
    },
  ],
  chunks: [
    {
      id: 'chunk_1', sourceType: 'document', sourceId: 'doc_1',
      sourceName: 'information-security-policy.txt', category: 'Information Security Policy',
      question: '', text: 'All customer data is encrypted at rest using AES-256.',
      page: 1, chunkIndex: 0, embedding: null, embeddingDims: 0, embeddingModel: '',
      savedAt: '2026-08-31T10:00:05.000Z',
    },
    {
      id: 'chunk_2', sourceType: 'qa', sourceId: 'kb_1',
      sourceName: 'Globex Assurance · Aug 31, 2026', category: 'SaaS',
      question: 'Do you encrypt customer data at rest?', text: 'Yes. AES-256.',
      page: null, chunkIndex: 0,
      embedding: [0.1, -0.2, 0.3], embeddingDims: 3, embeddingModel: 'titan-embed-text-v2',
      savedAt: '2026-08-31T13:46:58.000Z',
    },
  ],
  attachments: [
    {
      id: 'att_1', questionnaireId: 'kb_1', name: 'baa-signed.pdf',
      storagePath: 'user-files/abc/attachments/baa-signed.pdf',
      contentType: 'application/pdf', sizeBytes: 8192,
      savedAt: '2026-08-31T13:40:00.000Z',
    },
  ],
};

const bundle = toApiExport(FIXTURE);

/* ── The export validates against its own published schema ────────────────── */

const errors = validate(bundle, schema, schema);
check(
  'a generated export validates against docs/serotonin.api.v1.schema.json',
  errors.length === 0,
  errors.slice(0, 6).join(' | '),
);

// The schema is only worth anything if it would have caught a drift.
const withStrayField = JSON.parse(JSON.stringify(bundle));
withStrayField.questionnaires[0].undocumentedField = 'oops';
check(
  'the schema rejects a field the exporter added without documenting it',
  validate(withStrayField, schema, schema).length > 0,
);
const withMissingField = JSON.parse(JSON.stringify(bundle));
delete withMissingField.documents[0].indexed;
check(
  'the schema rejects an export missing a documented field',
  validate(withMissingField, schema, schema).length > 0,
);

/* ── Header ───────────────────────────────────────────────────────────────── */

eq('the format is identified', bundle.format, API_EXPORT_FORMAT);
eq('and is not the backup format', bundle.format === 'serotonin.backup', false);
eq('the version is semantic', bundle.version, API_EXPORT_VERSION);
eq('generation time is ISO 8601', bundle.generatedAt, '2026-08-31T13:47:00.080Z');
eq('the app version is recorded', bundle.generator.appVersion, '2.1.0');

/* ── The collision is gone ────────────────────────────────────────────────── */

const completed = bundle.questionnaires.find((q) => q.id === 'kb_1');
const inProgress = bundle.questionnaires.find((q) => q.id === 'draft_1');

check('completed and in-flight questionnaires are one collection', bundle.questionnaires.length === 2);
eq('a completed one is marked complete', completed.status, 'complete');
eq('an in-flight one is marked in_progress', inProgress.status, 'in_progress');
eq('questionCount is a number on both', typeof completed.questionCount, 'number');
eq('and on the in-flight one too', typeof inProgress.questionCount, 'number');
check('answers is an array on both', Array.isArray(completed.answers) && Array.isArray(inProgress.answers));
check(
  'no field called "questions" survives anywhere',
  !JSON.stringify(bundle).includes('"questions"'),
  'the ambiguous name is still present',
);

/* ── Answers ──────────────────────────────────────────────────────────────── */

eq('answers are positioned from 1', completed.answers[0].position, 1);
eq('the question text comes through', completed.answers[0].question, 'Do you encrypt customer data at rest?');
eq('so does the answer', completed.answers[0].answer, 'Yes. AES-256.');
eq('a completed answer with text is marked answered', completed.answers[0].status, 'answered');
eq('the citation string is preserved', completed.answers[0].citation, 'information-security-policy.txt · p.1');
eq('an empty citation becomes null rather than ""', completed.answers[1].citation, null);
eq('a draft answer keeps its real status', inProgress.answers[0].status, 'auto-filled');
eq('and its confidence', inProgress.answers[0].confidence, 92);
eq('an unanswered draft question is reported as such', inProgress.answers[1].status, 'needs-input');
eq('answeredCount counts only answers with text', inProgress.answeredCount, 1);

eq('a structured source is attached where one exists', inProgress.answers[0].source.type, 'document');
eq('with the source id', inProgress.answers[0].source.id, 'doc_1');
eq('the page', inProgress.answers[0].source.page, 4);
eq('and when the source was added', inProgress.answers[0].source.addedAt, '2026-08-31T10:00:00.000Z');
eq('no source means null, not an empty object', inProgress.answers[1].source, null);

eq('owner and assignee come through on an in-flight questionnaire', inProgress.owner, 'Blayqe Forbes');
eq('assignee too', inProgress.assignee, 'Sarah L.');

/* ── Attachments ──────────────────────────────────────────────────────────── */

eq('an attachment is attached to its questionnaire', completed.attachments.length, 1);
eq('by name', completed.attachments[0].name, 'baa-signed.pdf');
eq('as a reference, not bytes', completed.attachments[0].file.bytesIncluded, false);
eq('with a fetchable scheme when it is in S3', completed.attachments[0].file.scheme, 's3');
eq('an unrelated questionnaire has none', inProgress.attachments.length, 0);

/* ── Documents ────────────────────────────────────────────────────────────── */

const doc1 = bundle.documents.find((d) => d.id === 'doc_1');
const doc2 = bundle.documents.find((d) => d.id === 'doc_2');

eq('a document keeps its name', doc1.name, 'information-security-policy.txt');
eq('and its category', doc1.category, 'Information Security Policy');
eq('added time is ISO', doc1.addedAt, '2026-08-31T10:00:00.000Z');
eq('and the human label is kept separately', doc1.addedLabel, 'Aug 31, 2026');
eq('a device-held file is marked as such', doc1.file.scheme, 'device');
eq('an S3-held file is marked fetchable', doc2.file.scheme, 's3');
eq('no bytes are inlined', doc1.file.bytesIncluded, false);
check('no base64 anywhere in the export', !JSON.stringify(bundle).includes('base64'));
eq('a document with passages is marked indexed', doc1.indexed, true);
eq('with a passage count', doc1.passageCount, 1);
eq('a document with none is marked not indexed', doc2.indexed, false);
eq('and counted as zero', doc2.passageCount, 0);

/* ── Passages ─────────────────────────────────────────────────────────────── */

const docPassage = bundle.passages.find((p) => p.id === 'chunk_1');
const answerPassage = bundle.passages.find((p) => p.id === 'chunk_2');

eq('an extracted passage is kind=document', docPassage.kind, 'document');
eq('a previous answer is kind=answer', answerPassage.kind, 'answer');
eq('the qa source type is renamed to something meaningful', answerPassage.sourceType, 'questionnaire');
eq('the extracted text is present, so no PDF parsing is needed downstream',
  docPassage.text, 'All customer data is encrypted at rest using AES-256.');
eq('page numbers survive', docPassage.page, 1);
eq('a passage with no page is null, not 0', answerPassage.page, null);
eq('an answer passage carries the question it answers', answerPassage.question, 'Do you encrypt customer data at rest?');
eq('a document passage has no question', docPassage.question, null);

eq('a missing vector is null', docPassage.embedding.vector, null);
eq('with dimensions zero', docPassage.embedding.dimensions, 0);
eq('and a null model rather than an empty string', docPassage.embedding.model, null);
check('a present vector comes through', Array.isArray(answerPassage.embedding.vector) && answerPassage.embedding.vector.length === 3);
eq('with its model', answerPassage.embedding.model, 'titan-embed-text-v2');
eq('and its dimensions', answerPassage.embedding.dimensions, 3);

/* ── Counts, so a truncated file is detectable ─────────────────────────────── */

eq('questionnaires are counted', bundle.counts.questionnaires, 2);
eq('completed separately', bundle.counts.completedQuestionnaires, 1);
eq('in progress separately', bundle.counts.inProgressQuestionnaires, 1);
eq('answers across all questionnaires', bundle.counts.answers, 4);
eq('documents', bundle.counts.documents, 2);
eq('indexed documents', bundle.counts.indexedDocuments, 1);
eq('passages', bundle.counts.passages, 2);
eq('and how many carry vectors', bundle.counts.passagesWithVectors, 1);
check(
  'every count matches the collection it describes',
  bundle.counts.questionnaires === bundle.questionnaires.length &&
    bundle.counts.documents === bundle.documents.length &&
    bundle.counts.passages === bundle.passages.length,
);

/* ── Excluded on purpose ──────────────────────────────────────────────────── */

check('notifications are not exported', !('notifications' in bundle));
check('the user profile is not exported', !('profile' in bundle));

/* ── Degenerate input ─────────────────────────────────────────────────────── */

const empty = toApiExport();
eq('an empty export still validates', validate(empty, schema, schema).length, 0);
eq('with zero counts', empty.counts.questionnaires, 0);
check('and empty arrays rather than missing keys',
  Array.isArray(empty.questionnaires) && Array.isArray(empty.documents) && Array.isArray(empty.passages));

const junk = toApiExport({
  entries: [{ id: 7, vendor: null, qaData: null, savedAt: 'not a date', confidence: 'high' }],
  docs: [{ id: null, name: undefined, savedAt: '', sizeBytes: 'big', tags: 'not-an-array' }],
  chunks: [{ id: 1, sourceId: 2, chunkIndex: '3', page: 'iv', embedding: 'nope', embeddingDims: -5 }],
});
eq('malformed input still produces a valid document', validate(junk, schema, schema).length, 0);
eq('a bad date becomes null', junk.questionnaires[0].completedAt, null);
eq('a non-numeric confidence becomes 0 rather than NaN', junk.questionnaires[0].averageConfidence, 0);
eq('a non-array tag list becomes an empty array', junk.documents[0].tags.length, 0);
eq('a non-array embedding becomes null', junk.passages[0].embedding.vector, null);
eq('a negative dimension count is clamped', junk.passages[0].embedding.dimensions, 0);
eq('a non-numeric page becomes 0 rather than NaN', junk.passages[0].page, 0);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
