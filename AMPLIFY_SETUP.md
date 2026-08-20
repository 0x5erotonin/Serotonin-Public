# Persistence on AWS Amplify

This document covers the persistence layer added in v2.1: what it does, how to
deploy it, and what is deliberately left undone until auth is wired up.

---

## What was broken

The app worked as a front end but forgot everything:

| Behaviour | Before | After |
|---|---|---|
| Uploaded questionnaires | A placeholder question saying parsing was not connected | Parsed with PDF.js/Mammoth, questions extracted and auto-reviewed |
| Drafts, KB entries, imported docs | `sessionStorage` — gone when the tab closed | DynamoDB, mirrored on device |
| In-progress questionnaire | `sessionStorage`, and `manualText` was never saved at all | `localStorage` scratch copy **plus** a debounced autosave to the backend |
| Uploaded documents | Filename and byte count kept, **the file itself discarded** | Uploaded to S3, downloadable after a refresh |
| Questionnaire attachments | Held in a `File` object that died with the page | S3 + an `Attachment` row per file |
| Profile, preferences | Never persisted anywhere | `UserProfile` row, debounced writes |
| Notifications, read state | Reset to the same eight demo items on every load | Seeded once, then persisted |
| Avatar | `URL.createObjectURL` blob URL — broken after refresh | S3 object, signed URL resolved on load |
| Theme choice | `sessionStorage` | `localStorage` |

`sessionStorage` was the root cause: it is scoped to a single tab and discarded
when that tab closes. Nothing survived.

---

## Architecture

```
Browser (React SPA)
  │
  ├── src/lib/amplifyClient.js   configure Amplify, resolve owner + identity IDs
  ├── src/lib/collections.js     UI shape  ⇄  data model mapping
  ├── src/lib/store.js           async CRUD, AWS or on-device, + legacy migration
  ├── src/lib/files.js           S3 uploads, or IndexedDB with no backend
  ├── src/lib/usePersisted.js    React hooks the components actually call
  └── src/lib/matcher.js         auto-review — see AUTO_REVIEW.md
        │
        └── Amplify (amplify/)
              ├── auth       Cognito user pool + identity pool (guest access on)
              ├── data       AppSync → DynamoDB × 8 models + embedTexts mutation
              ├── storage    S3 bucket, identity-scoped prefixes
              └── embedText  Lambda → Bedrock Titan embeddings
```

### Two backends, one API

Every call goes through `src/lib/store.js`, which picks its implementation at
runtime:

- **`amplify_outputs.json` present** → AppSync/DynamoDB and S3. Each read is also
  mirrored into `localStorage`, so a dropped connection or a cold start with no
  network renders the last known good data instead of an empty dashboard.
- **absent** → `localStorage` for records, IndexedDB for file bytes. This is what
  makes `npm run dev` on a fresh clone survive a refresh, and it keeps the public
  demo working with no AWS account attached.

The fallback is not a stub. It is a real, durable store — which means a
misconfigured deploy degrades instead of breaking.

---

## Deploying

### 1. Push to a repo connected to Amplify Hosting

`amplify.yml` in the repo root drives the build:

```yaml
backend:  npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
frontend: npm run build   →   dist/
```

The backend phase runs first because it is what writes `amplify_outputs.json`
into the repo root; the frontend build then picks it up via `import.meta.glob`.
On first deploy, Amplify detects `amplify/backend.ts` and provisions Cognito,
AppSync, DynamoDB and S3 automatically.

### 2. Give the build role backend permissions

In the Amplify console: **App settings → IAM roles**. The service role needs
permission to deploy the backend stack. Amplify offers to create one on the
first fullstack deploy — accept it. Without it the backend phase fails, no
outputs file is written, and the app silently runs on device-only storage.

### 3. Add the SPA rewrite

**App settings → Rewrites and redirects**, add:

| Source | Target | Type |
|---|---|---|
| `/<*>` | `/index.html` | 200 (Rewrite) |

Routing is hash-based (`#editor`, `#knowledge`) so this is not strictly required,
but it stops a stray deep link from 404ing.

### 4. Enable Bedrock model access (for semantic matching)

Console → **Bedrock → Model access** → enable `amazon.titan-embed-text-v2:0` in
the same region as the deployment. The IAM grant is already in
`amplify/backend.ts`, scoped to that one model, but the account-level opt-in is
separate and cannot be done from code.

Without it, `embedTexts` returns 403, the matcher falls back to keyword-only, and
the review screen says so. Nothing breaks — auto-review just misses paraphrased
questions. See [AUTO_REVIEW.md](AUTO_REVIEW.md).

⚠️ `embedTexts` is guest-callable while auth is deferred, and unlike the rest of
the data layer this one costs money per invocation. The Lambda caps a request at
120 texts × 8,000 characters, which bounds each call but not the number of them.
Tighten it to `allow.authenticated()` as part of the auth pass.

### 5. Security headers

`customHttp.yml` is read from the repo root on every deploy and sets HSTS, CSP,
`X-Frame-Options`, `Referrer-Policy` and cache-control. `vercel.json` is left in
the repo but is inert on Amplify.

The CSP allows `'unsafe-inline'` for **styles only** — unavoidable, since the
whole UI is built from inline styles and a token system rather than a stylesheet.
`script-src` stays locked to `'self'`.

---

## Troubleshooting the build

**`npm error code EUSAGE` — "The `npm ci` command can only install with an
existing package-lock.json"**

`npm ci` is the correct command for CI, but it refuses to run without a
lockfile, and none was committed. Two fixes, and the first is better:

```bash
# 1. Commit a lockfile (also makes every future build reproducible)
npm install
git add package-lock.json && git commit -m "Add package-lock.json" && git push
```

Or rely on the fallback now in `amplify.yml`, which uses `npm ci` when a lockfile
exists and `npm install` when it does not. Either unblocks the build; committing
the lockfile additionally pins exact versions, which is what you want for a
security tool — without it, a transitive dependency can change between builds
with no diff to review.

**The backend phase fails on `npx ampx` with a missing module**

The backend needs devDependencies (`@aws-amplify/backend`, the CDK libraries, the
Bedrock SDK the Lambda bundles). `amplify.yml` passes `--include=dev` explicitly
so a build environment that sets `NODE_ENV=production` cannot skip them.

**`Failed to set up process.env.secrets`**

Benign. It means no Amplify secrets are configured, which this app does not need
until Google SSO is wired up.

**The frontend builds but the app runs on device-only storage**

`amplify_outputs.json` was never written, which means the backend phase did not
finish. Check the build log for the `pipeline-deploy` step and confirm the service
role has backend deploy permissions (step 2 above). This is deliberate behaviour —
a failed backend deploy degrades to on-device storage rather than shipping a
broken app — but it is not what you want in production.

---

## Local development

```bash
npm install

# Option A — no AWS. Data persists on this device, nothing to configure.
npm run dev

# Option B — your own isolated cloud sandbox.
npx ampx sandbox      # writes amplify_outputs.json, watches amplify/ for changes
npm run dev           # in a second terminal
```

`npm run sandbox` is aliased in `package.json`. The sandbox provisions real AWS
resources under your credentials — run `npm run sandbox:delete` when you are done
so it stops costing anything.

You need AWS credentials configured (`aws configure` or `AWS_PROFILE`) for
Option B. Option A needs nothing.

---

## Data model

Eight models in `amplify/data/resource.ts`, all carrying an `ownerKey`:

| Model | Holds |
|---|---|
| `UserProfile` | Name, title, department, avatar path, preference toggles. Keyed by owner. |
| `Questionnaire` | Drafts and completed assessments. `questions` is a JSON array. |
| `KbEntry` | Completed questionnaires indexed into the knowledge base. |
| `KbDocument` | Imported policy documents + their S3 key. |
| `Attachment` | Files attached on the approval step, linked to a questionnaire. |
| `Notification` | The notification feed, including read state. |
| `AuditLog` | Append-only action history. Create + read only, no update or delete. |
| `KbIndexChunk` | The auto-review search index: document passages and past Q&A pairs, each with a 256-float embedding. Loaded on demand, not at boot. |

Plus one custom mutation, `embedTexts`, backed by the `embed-text` Lambda — it
turns strings into Bedrock Titan vectors and touches no table. See
[AUTO_REVIEW.md](AUTO_REVIEW.md) for why it is a stateless proxy rather than a
search service.

### Why `questions` is denormalised

The editor round-trips its whole working state in one request, which keeps
autosave to a single write. DynamoDB caps an item at 400 KB.

Auto-review made that limit real: it attaches a cited passage to every question,
and a 261-question CAIQ came to 437 KB — past the cap, so every autosave failed
while the UI still said "Saved". Passages are therefore truncated to 240
characters for storage (`trimQuestion` in `src/Serotonin.jsx`), which keeps a
CAIQ-sized questionnaire around 100 KB while preserving the citation. If you need
larger assessments than that, split `questions` into a child `Question` model
keyed by `questionnaireId`; `src/lib/collections.js` is the only file that would
change.

### Two field-name collisions, handled in `collections.js`

- The UI's `draft.owner` is a person's display name, but Amplify reserves `owner`
  for owner-based authorization. The model field is `ownerName`.
- `questions` is an array on a draft and a count on a KB entry. The models split
  these into `questions` (json) and `questionCount` (int).

---

## ⚠️ Security posture while auth is deferred

You chose to handle auth later. That is a real trade-off, and it is worth being
precise about what it costs:

**Records.** Every model allows `allow.guest()` and `allow.authenticated()`
through the identity pool. Rows carry an `ownerKey` and the client filters on it,
so browsers do not see each other's data in practice — but **AppSync is not
enforcing that**. Anyone who extracts the API endpoint from the JS bundle could
list every row in every table.

**Files.** `user-files/{entity_id}/*` is IAM-enforced per identity and is what
signed-in users get. Guests write to `guest-files/<identityId>/…`, which is scoped
per browser in the UI but **not enforced** — unauthenticated identities cannot be
isolated that way. A guest who guessed a key could read another guest's object.

**Identity durability.** A guest's Cognito identity ID lives in the Amplify SDK's
`localStorage`. Clearing site data orphans their records. Signing in fixes this
permanently, because the owner key becomes the Cognito user ID.

**So:** this is safe for a portfolio demo and for your own data. Do not put real
customer questionnaires or real SOC 2 reports in it until the steps below are
done.

### Turning auth on later

1. **`amplify/auth/resource.ts`** — add providers (a commented-out Google SSO
   block is already there).
2. **`amplify/data/resource.ts`** — replace every
   `.authorization((allow) => [allow.guest(), allow.authenticated()])` with
   `.authorization((allow) => [allow.owner()])`, and change
   `defaultAuthorizationMode` to `'userPool'`. Amplify then injects and enforces
   an `owner` field inside the resolver, and `ownerKey` becomes redundant
   belt-and-braces.
3. **`amplify/storage/resource.ts`** — delete the `guest-files/*` rule.
4. **`src/lib/amplifyClient.js`** — change `generateClient({ authMode: … })` to
   `'userPool'`.
5. **`src/Serotonin.jsx`** — replace `SignInScreen` and the residual Supabase
   session code with `signIn` / `signUp` / `signOut` from `aws-amplify/auth`, and
   call `resetIdentityCache()` after each, so record scoping and the S3 prefix
   re-resolve against the new caller.

`src/lib/files.js` already picks the enforced prefix automatically once a user is
signed in — no changes needed there.

### Supabase leftovers

`src/lib/supabase.js`, `src/lib/useAuth.js`, `docs/supabase_schema.sql` and the
`SignInScreen` component are untouched and dormant: with no `VITE_SUPABASE_*`
env vars they no-op, and the app never renders a sign-in gate. They are the
natural thing to delete in the auth pass.

---

## Testing

`tests/persistence.spec.mjs` drives a real browser against the built app and
asserts that a draft, an uploaded document, notification read state, profile
edits and the theme all survive a refresh:

```bash
npm install
npm i -D playwright && npx playwright install chromium
npm run build
npm run preview &                  # serves dist/ on :4173
node tests/persistence.spec.mjs
```

Playwright is intentionally not a dependency: some versions download ~150MB of
browsers on install, which would run on every Amplify build and is never used
there.

It runs against the on-device path, which exercises every store and hook seam
the AWS path also uses. Run it after `npx ampx sandbox` to cover the AWS path
end to end against real infrastructure.

---

## Costs

At demo volume this sits inside the AWS free tier. Beyond it: DynamoDB on-demand
is per-request, S3 is per-GB-month plus requests, AppSync is per-query, and
Cognito's free tier covers 10,000 monthly active users. The thing to watch is
autosave — it writes at most once per 1.2 s of editing, which is cheap, but
lowering the debounce would multiply write costs directly.

Auto-review adds Bedrock: one `embedTexts` call per questionnaire reviewed, plus
one call per passage when a document is indexed (once). Titan V2 is billed per
input token, so a 50-question review is a fraction of a cent and the index is the
larger one-off. Lexical matching costs nothing — it runs in the browser.
