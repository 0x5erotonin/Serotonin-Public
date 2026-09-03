# Integration export — `serotonin.api` v1

Knowledge base → **Export** → *Integration export (JSON)*.

A defined, versioned shape for feeding another system. Described by
[`serotonin.api.v1.schema.json`](serotonin.api.v1.schema.json), which is
validated against a generated export in `tests/apiexport.spec.mjs` and against a
file downloaded from the running app in `tests/bulkio.spec.mjs` — so the schema
cannot drift from the code without a test failing.

## Why this exists alongside the backup

`serotonin.backup` mirrors the app's internal state, because its job is to
restore it. That makes it a poor integration surface:

| | `serotonin.backup` | `serotonin.api` v1 |
|---|---|---|
| Purpose | Restore into Serotonin | Feed another system |
| Field names | Whatever the UI holds | One meaning each, everywhere |
| Completed vs in-flight | Two collections, incompatible shapes | One collection, a `status` field |
| Files | Inlined base64 | References, with a `scheme` |
| Schema | None | Published and test-enforced |
| Size | Grows with your PDFs | Proportional to text |

The specific trap it removes: in the backup, `kbEntries[].questions` is a
**count** and `drafts[].questions` is an **array of objects**. Same name, same
file, different type. Here the count is `questionCount` and the array is
`answers`, on both.

## Shape

```jsonc
{
  "format": "serotonin.api",
  "version": "1.0.0",
  "generatedAt": "2026-08-31T13:47:00.080Z",
  "generator": { "app": "serotonin", "appVersion": "2.1.0" },

  // Totals, so a truncated file is detectable before you process it.
  "counts": {
    "questionnaires": 2, "completedQuestionnaires": 1, "inProgressQuestionnaires": 1,
    "answers": 4, "documents": 2, "indexedDocuments": 1,
    "passages": 2, "passagesWithVectors": 1
  },

  "questionnaires": [{
    "id": "kb_1",
    "status": "complete",            // complete | in_progress
    "vendor": "Globex Assurance",
    "industry": "SaaS",
    "tags": ["SOC 2"],
    "owner": null, "assignee": null, "step": "complete",
    "questionCount": 2, "answeredCount": 2, "averageConfidence": 100,
    "completedLabel": "Aug 31, 2026",
    "completedAt": "2026-08-31T13:46:53.331Z",
    "updatedAt": "2026-08-31T13:46:53.331Z",
    "answers": [{
      "position": 1,
      "question": "Do you encrypt customer data at rest?",
      "answer": "Yes. AES-256.",
      "status": "answered",          // or auto-filled | flagged | needs-input
      "confidence": null,
      "citation": "information-security-policy.txt · p.1",
      "source": {                    // null when there was no match
        "type": "document",          // document | questionnaire
        "id": "doc_1",
        "name": "information-security-policy.txt",
        "page": 4,
        "addedLabel": "Aug 31, 2026",
        "addedAt": "2026-08-31T10:00:00.000Z"
      }
    }],
    "attachments": [{ "name": "baa-signed.pdf", "file": { /* fileRef */ }, "addedAt": "…" }]
  }],

  "documents": [{
    "id": "doc_1",
    "name": "information-security-policy.txt",
    "category": "Information Security Policy",
    "note": "Version 3.2",
    "tags": ["Information Security Policy"],
    "addedLabel": "Aug 31, 2026",
    "addedAt": "2026-08-31T10:00:00.000Z",
    "origin": "Imported",
    "file": {
      "scheme": "device",            // s3 | device | none
      "ref": "idb://kb-documents/abc-information-security-policy.txt",
      "name": "information-security-policy.txt",
      "contentType": "text/plain",
      "sizeBytes": 260,
      "bytesIncluded": false         // always false here
    },
    "passageCount": 1,
    "indexed": true                  // false = in the library, invisible to matching
  }],

  "passages": [{
    "id": "chunk_1",
    "kind": "document",              // document = extracted text; answer = a previous answer
    "sourceType": "document",        // document | questionnaire
    "sourceId": "doc_1",
    "sourceName": "information-security-policy.txt",
    "category": "Information Security Policy",
    "page": 1,
    "position": 0,
    "question": null,                // set on kind=answer: what matching compares against
    "text": "All customer data is encrypted at rest using AES-256.",
    "embedding": { "model": null, "dimensions": 0, "vector": null },
    "indexedAt": "2026-08-31T10:00:05.000Z"
  }]
}
```

## Conventions

- `*Count` is an integer. `*At` is ISO 8601. `*Label` is a human-readable string
  and must not be parsed. Arrays are plural nouns.
- Every documented field is always present. Absence is expressed as `null`, never
  by omitting the key, so a consumer can destructure without guards.
- `additionalProperties: false` throughout. An undocumented field is a bug.

## Two things to know before you build against it

**Documents come out already parsed.** `passages` holds the extracted text, split
on sentence boundaries with page numbers carried through — the output of PDF.js,
Mammoth and the spreadsheet reader. A consumer never re-implements document
parsing. The raw bytes are *not* here; use `serotonin.backup` if you need them, or
fetch the `s3` reference.

**Embedding vectors are only present when a cloud backend is attached.** With no
backend the export reads the on-device mirror, which strips vectors on purpose — a
256-float vector is ~2.5 KB of JSON and a handful of documents would exhaust the
browser's storage quota. In that case `vector` is `null` and `dimensions` is `0`,
and `counts.passagesWithVectors` will be 0. Re-embed, or attach a backend.

## Not included, on purpose

Notifications (UI state) and the user profile (personal data with no reason to
leave the app).

## Versioning

`version` is semantic. A minor bump adds optional fields and existing consumers
keep working. A breaking change gets a new `$id` and a new schema file rather than
a mutated `v1` — so a consumer pinned to v1 stays correct.

## If you want a live API rather than a file

Once the Amplify backend deploys, AppSync exposes GraphQL over these same
records, with queries, filters and pagination, from the schema in
`amplify/data/resource.ts`. Parsing an export to build an integration is
reimplementing something you would already own. This format is for the cases
where a file is genuinely what you want: a one-off migration, an air-gapped
handover, or a consumer that should not have credentials to your data layer.
