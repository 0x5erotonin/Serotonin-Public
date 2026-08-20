import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { embedText } from '../functions/embed-text/resource';

/**
 * Serotonin data model — AppSync + DynamoDB.
 *
 * ─── A NOTE ON AUTHORIZATION ────────────────────────────────────────────────
 * Auth is deferred, so every model currently allows both guest and
 * authenticated identity-pool callers. Records carry an explicit `ownerKey`
 * (the caller's Cognito identity ID, or their user ID once signed in) and the
 * client filters on it, which keeps one browser's data separate from another's
 * in practice — but it is NOT enforced by IAM. Anyone with the API endpoint
 * could list every row.
 *
 * That is a deliberate, temporary trade for shipping persistence today. When
 * you turn auth on, replace each block:
 *
 *     .authorization((allow) => [allow.guest(), allow.authenticated()])
 *
 * with:
 *
 *     .authorization((allow) => [allow.owner()])
 *
 * and change `defaultAuthorizationMode` to 'userPool'. Amplify then injects an
 * `owner` field automatically and enforces it inside the resolver, so the
 * ownerKey column becomes belt-and-braces rather than the only lock.
 * ────────────────────────────────────────────────────────────────────────────
 */

const schema = a.schema({
  /** Extended user data + UI preferences. One row per identity. */
  UserProfile: a
    .model({
      ownerKey: a.string().required(),
      name: a.string(),
      title: a.string(),
      email: a.string(),
      department: a.string(),
      role: a.string(),
      /** S3 key of the uploaded avatar, resolved to a signed URL at read time. */
      avatarPath: a.string(),
      /** Notification + display toggles from the profile panel. */
      prefs: a.json(),
      themeKey: a.string(),
    })
    .secondaryIndexes((index) => [index('ownerKey')])
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  /**
   * A questionnaire in flight or finished — this is what the dashboard calls an
   * "active assessment" and the editor calls a draft.
   *
   * `questions` is a JSON array of { id, text, answer, confidence, source,
   * status, flagReason, recommendation }. Keeping it denormalised means the
   * editor can round-trip its working state in a single request. DynamoDB caps
   * an item at 400 KB — roughly 1,500 answered questions — so if you ever need
   * bigger assessments, split this into a child Question model keyed by
   * questionnaireId.
   */
  Questionnaire: a
    .model({
      ownerKey: a.string().required(),
      vendor: a.string().required(),
      status: a.string(),
      /** intake | manual | processing | review | approval | complete */
      step: a.string(),
      assignee: a.string(),
      manualText: a.string(),
      questions: a.json(),
      ownerName: a.string(),
      ownerInitials: a.string(),
      progress: a.integer(),
      questionCount: a.integer(),
      savedAt: a.datetime(),
      savedAtLabel: a.string(),
    })
    .secondaryIndexes((index) => [index('ownerKey')])
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  /** A completed questionnaire indexed into the searchable knowledge base. */
  KbEntry: a
    .model({
      ownerKey: a.string().required(),
      vendor: a.string().required(),
      date: a.string(),
      questionCount: a.integer(),
      answered: a.integer(),
      industry: a.string(),
      tags: a.string().array(),
      confidence: a.integer(),
      source: a.string(),
      /** [{ text, answer, source }] — the reusable answer history. */
      qaData: a.json(),
      savedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [index('ownerKey')])
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  /** An imported policy document (SOC 2 report, DR plan, access policy…). */
  KbDocument: a
    .model({
      ownerKey: a.string().required(),
      name: a.string().required(),
      category: a.string(),
      note: a.string(),
      sizeBytes: a.integer(),
      sizeLabel: a.string(),
      contentType: a.string(),
      /** S3 object key. Empty when the file itself was not retained. */
      storagePath: a.string(),
      date: a.string(),
      source: a.string(),
      tags: a.string().array(),
      savedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [index('ownerKey')])
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  /** A file attached to a questionnaire on the final approval step. */
  Attachment: a
    .model({
      ownerKey: a.string().required(),
      questionnaireId: a.string(),
      name: a.string().required(),
      sizeBytes: a.integer(),
      contentType: a.string(),
      storagePath: a.string(),
      savedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [
      index('ownerKey'),
      index('questionnaireId'),
    ])
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  /** Notification feed item. */
  Notification: a
    .model({
      ownerKey: a.string().required(),
      type: a.string().required(),
      title: a.string().required(),
      body: a.string(),
      time: a.string(),
      module: a.string(),
      cta: a.string(),
      read: a.boolean(),
      sortIndex: a.integer(),
      savedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [index('ownerKey')])
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  /**
   * The searchable index behind auto-review — one row per passage.
   *
   * Holds two kinds of material, because both answer the same question ("can we
   * already answer this?") and both should be scored the same way:
   *
   *   sourceType 'qa'        A question/answer pair from a completed
   *                          questionnaire. The strongest signal there is: if
   *                          you have answered this before, reuse it.
   *   sourceType 'document'  A chunk of an imported policy document. Cited as a
   *                          suggestion, never auto-filled.
   *
   * `embedding` is a 256-float Titan V2 vector, or null when the embedding
   * function was unavailable at index time — in which case that row still
   * participates in lexical matching. Chunks are loaded on demand by the
   * matcher, not on app boot, since the vectors make them heavy.
   */
  KbIndexChunk: a
    .model({
      ownerKey: a.string().required(),
      /** 'qa' | 'document' */
      sourceType: a.string().required(),
      /** KbEntry id or KbDocument id. */
      sourceId: a.string().required(),
      sourceName: a.string(),
      category: a.string(),
      /** For 'qa' rows: the original question, which is what we match against. */
      question: a.string(),
      /** The passage, or the previous answer. */
      text: a.string().required(),
      page: a.integer(),
      chunkIndex: a.integer(),
      embedding: a.json(),
      embeddingDims: a.integer(),
      embeddingModel: a.string(),
      savedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [index('ownerKey'), index('sourceId')])
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  /**
   * Embed strings with Bedrock. Stateless — see
   * amplify/functions/embed-text/resource.ts for why it does not read the
   * database itself.
   */
  embedTexts: a
    .mutation()
    .arguments({
      texts: a.string().array().required(),
      dimensions: a.integer(),
    })
    .returns(a.json())
    // .authorization() before .handler(), matching the documented chain order.
    .authorization((allow) => [allow.guest(), allow.authenticated()])
    .handler(a.handler.function(embedText)),

  /** Append-only action history. Nothing in the UI deletes from this. */
  AuditLog: a
    .model({
      ownerKey: a.string().required(),
      action: a.string().required(),
      entityType: a.string(),
      entityId: a.string(),
      metadata: a.json(),
      savedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [index('ownerKey')])
    .authorization((allow) => [
      allow.guest().to(['create', 'read']),
      allow.authenticated().to(['create', 'read']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Identity pool = AWS IAM credentials, handed to guests and signed-in
    // users alike. Switch to 'userPool' when auth lands.
    defaultAuthorizationMode: 'identityPool',
  },
});
