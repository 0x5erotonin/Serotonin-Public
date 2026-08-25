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

`amplify_outputs.json` was never written, which means `pipeline-deploy` failed.
The build log ends with a banner saying so, and the last line of the backend phase
reports which storage the app will use.

This is deliberate: the backend phase is followed by `|| echo …` in `amplify.yml`,
so a backend failure is loud but does not abort the build. The reasoning is in the
comment at the top of that file — briefly, the app has a real degraded mode, so
deploying degraded beats not deploying at all while the backend is being brought
up. **Once the backend deploys cleanly, delete the `|| echo …` to make it strict
again**, or a later regression will silently drop every user to device-only
storage.

**Reading a truncated build log**

The Amplify console truncates long logs in the browser. If the error is below the
cut, either use the download-logs link on the build page, or skip the console
entirely and reproduce it locally in about two minutes:

```bash
npx ampx sandbox --once
```

That runs the same validation and deployment against your own isolated stack, and
prints the full error to your terminal. `npm run sandbox:delete` tears it down.

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

### Another user sees none of my work — why, and the options

Reported symptom: *"I can see all of the documents I uploaded, but when another
user logs in from a different IP, they cannot see anything I have worked on."*

**It is not the IP address.** Nothing in the app, in AppSync or in Amplify
Hosting keys on IP. The same thing happens to you in a private window, in a
second browser, or on your phone — which is the quickest way to confirm it in
about ten seconds. What is actually happening is one of the three causes below,
and they need different fixes, so identify which one first.

#### Step 1 — find out which cause you have

| Check | Where | What it tells you |
|---|---|---|
| **Storage & Security panel** | Knowledge base → *Storage info* | If **Primary** reads *"This device only — no backend is attached to this build"*, cause **A**. If it reads *"AWS DynamoDB via AppSync"*, cause **B**. |
| Build log | Amplify console → the build → backend phase | The build prints either `amplify_outputs.json written — the app will use AWS.` or `NO amplify_outputs.json — the app will use on-device storage only.` |
| The URL both people opened | Browser address bar | A different branch or a PR preview is a different backend entirely — cause **C**. |

**Cause A — no backend is attached.** Records live in this browser's
`localStorage`, files in its IndexedDB. Nothing has ever left the machine, so no
other person or device can see any of it, by construction. This is the state the
frontend-only `amplify.yml` produces, and the state a failed backend deploy
produces. Nothing below about sharing matters until this is fixed.

**Cause B — the backend is live, and every browser is its own guest identity.**
Auth is provisioned but not enforced, so each browser is issued its own Cognito
*unauthenticated* identity. Records are written with that identity as `ownerKey`
and read back filtered on it; files go to `guest-files/<identityId>/`. Two people
are two identities, so they see two empty libraries. This is working as designed
— the design just does not include sharing yet.

**Cause C — different backends.** `amplify_outputs.json` is generated per branch.
`main` and a preview branch have separate DynamoDB tables and S3 buckets. Two
people on two branch URLs will never see each other's data no matter what auth
says.

#### Step 2 — pick a fix

Ordered by how much they change. 1 is a prerequisite for everything after it.

**1. Get the backend deploying (fixes cause A).** Not optional — every option
below needs a live AppSync API. `amplify.yml` currently keeps the build green
when the backend fails; the "Troubleshooting the build" section above is how to
get the real error out of a truncated console log.

**2. Turn on Cognito sign-in with owner-based auth.** The five steps under
*Turning auth on later*. This is the right next step regardless of which sharing
model you choose, because it replaces a `localStorage`-resident guest identity
with a durable user ID and makes AppSync enforce scoping instead of trusting the
client. Be clear about what it does *not* do: it gives every user their own
private library. On its own it does not make your work visible to a colleague —
it makes the current behaviour correct and intentional rather than incidental.

**3. Shared team library — one workspace everyone sees.** This is the option that
actually matches the report. Three ways to build it, in increasing order of rigour:

- **3a. Tenant field + `allow.authenticated()`.** Add `tenantId` to every model,
  set it from a single org value, filter on it instead of `ownerKey`. Any
  signed-in user reads the whole tenant. Cheapest to build — an afternoon — but
  enforcement is coarse: *any* member of the user pool can read everything, so
  it is only safe if pool membership is exactly your team. Pair it with a
  pre-sign-up Lambda trigger that rejects addresses outside `@creyos.com`, or
  admin-only user creation (invite-only). Without that gate, self-sign-up means
  anyone on the internet can join the tenant.
- **3b. Cognito groups.** Put people in a group and use
  `allow.group('creyos')`, or `allow.groupsDefinedIn('teamId')` for a per-record
  group. AppSync enforces group membership inside the resolver, so it holds up
  even if the client is bypassed, and it scales to more than one team. This is
  the option to choose if real customer questionnaires are going in.
- **3c. Per-owner private, shared by name.** Keep records owner-scoped and use
  `allow.ownersDefinedIn('editors')` so a record carries a list of users who may
  read and edit it. Most granular and the best fit for "hand this questionnaire
  to Sarah, not the whole team", but it needs real UI: a person picker, an
  invite flow, and a way to see what has been shared with you.

**4. Move the files, not just the records.** Records and S3 objects are separate
problems. Sharing rows without re-keying objects gets you a library where every
document is listed and none of them open. Two parts:

- Change `amplify/storage/resource.ts` — drop `guest-files/*` and add a prefix
  the team can read, e.g. `team-files/*` with `allow.authenticated(['read',
  'write'])`, or a group rule matching 3b.
- Migrate what is already stored. Existing `KbDocument.storagePath` and
  `Attachment.storagePath` values point at `guest-files/<oldIdentityId>/…`. Copy
  the objects to the new prefix and update the rows, or those documents fall back
  to the *"Metadata only — the file itself was not stored"* state.

**5. Make ownership transfer real.** The Dashboard can already hand an assessment
to another person by name, and records it in the audit log — but with no
identities it cannot move the record, so the new owner does not get it in their
library. Once 2 and 3 are in, extend `transferDraftOwner` in `src/Serotonin.jsx`
to set the record's owner key (or its `editors` list) alongside the display name,
and the transfer becomes an actual hand-off.

**6. Stopgaps, if this needs to work before the auth pass.** Both are honest
about their cost:

- **A shared owner key.** In `src/lib/amplifyClient.js`, make `getOwnerKey()`
  return a fixed string — `'creyos-shared'` — and use one shared S3 prefix
  instead of per-identity. Every browser then reads and writes the same library
  immediately; it is a handful of lines. What it costs: the data becomes readable
  and writable by anyone who finds the API endpoint in the JS bundle. Note that
  guest access is *already* unenforced, so this does not lower the enforcement
  bar — it stops relying on per-browser obscurity, which is not a security
  control. Fine for demo data. Not fine for real questionnaires or real SOC 2
  reports.
- **Export and import.** Add a JSON export of the library and an import on the
  other side. No infrastructure, no exposure, and it works today — but it is a
  manual copy, and two people will diverge the moment they both edit.

#### Recommended path

2 → 3b → 4 → 5, with 6's shared owner key only if something has to be
demonstrable to two people this week. Skipping straight to 3a without a domain
gate on sign-up is the one combination worth avoiding: it reads as "we have auth
now" while leaving the library open to any account that can sign itself up.

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
npm run test:browser               # persistence + auto-review + ownership
```

`tests/ownership.spec.mjs` covers the library listing and ownership: that a
policy document is reachable from *All entries* and not only from the Policy
documents tab, and that transferring an assessment survives a refresh **and** the
previous owner reopening it — the editor used to stamp its own profile name onto
every autosave, which quietly undid the transfer.

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
