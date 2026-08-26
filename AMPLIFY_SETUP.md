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

In the Amplify console: **App settings → IAM roles** (older consoles:
**General → Edit → Service role**). The service role needs permission to deploy
the backend stack — the AWS managed policy `AmplifyBackendDeployFullAccess`
covers it. Amplify offers to create the role on the first fullstack deploy;
accept it.

Without it the backend phase fails on an `AccessDenied` or
`not authorized to perform: cloudformation:CreateStack`, no outputs file is
written, and the app silently runs on device-only storage. This is the most
common reason a Gen 2 backend never appears despite the build going green.

> **Deploying with no local terminal.** You do not need the Amplify CLI on your
> machine to provision the backend. `npx ampx sandbox` creates a *personal
> development* stack; the branch backend is deployed by
> `npx ampx pipeline-deploy`, which runs inside the AWS build container on every
> push. A locked-down laptop with no Node and no admin rights is not a blocker —
> pushing to the connected branch (the GitHub web UI counts) is the whole
> deployment path. Amplify Gen 2 is code-first and has no click-to-add-resource
> UI, so this build *is* the console equivalent. If you want an interactive shell
> anyway, use **AWS CloudShell** — see "Provisioning without a local terminal"
> below.

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

**A command in `amplify.yml` never runs — no output, no error, no
`# Executing command:` header**

Check whether that command block starts with a `#` comment line. One did, and
Amplify skipped it silently: the backend phase reported success having never run
`pipeline-deploy` at all, which is indistinguishable in the log from a backend
that deployed and did nothing.

Put explanations in YAML comments *outside* the block, before the `- |`, and
start every command with a real statement. `amplify.yml` now echoes
`>>>>> STARTING BACKEND DEPLOY` as its first line for exactly this reason — if
that banner is absent from a log, the deploy did not run.

**`npm error code EUSAGE` — "`npm ci` can only install packages when your
package.json and package-lock.json are in sync"**

Two different situations produce this, and they need different fixes.

*No lockfile was committed.* `npm ci` refuses to run without one. Fix it
properly:

```bash
npm install
git add package-lock.json && git commit -m "Add package-lock.json" && git push
```

*A lockfile appeared mid-build.* This one is subtler and cost a build. With no
lockfile committed, the backend phase runs `npm install` — which writes a
`package-lock.json` as a side effect. The frontend `preBuild` then sees a
lockfile and picks `npm ci`, which rejects it:

```
npm error Invalid: lock file's semver@7.7.1 does not satisfy semver@7.8.5
npm error Missing: @opentelemetry/core@2.0.0 from lock file
```

`npm install --prefer-offline` over a restored `node_modules` cache does not
fully re-resolve the tree, so the lockfile it emits can disagree with
`package.json`. `amplify.yml` now asks the right question — is a lockfile
*committed* (`git ls-files`), not is one *present* — falls back to `npm install`
if `npm ci` fails rather than failing the build, and skips the frontend install
entirely when the backend phase already populated `node_modules` in the same
container.

Committing a lockfile is still the fix worth doing. Without one, a transitive
dependency can change between builds with no diff to review — not a property you
want in a security tool.

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

This is deliberate: the `pipeline-deploy` block in `amplify.yml` catches a failure
rather than aborting. The reasoning is in the comment at the top of that file —
briefly, the app has a real degraded mode, so deploying degraded beats not
deploying at all while the backend is being brought up. **Once the backend deploys
cleanly, change that block's `else` branch to `exit 1` to make it strict again**,
or a later regression will silently drop every user to device-only storage.

## What happens to existing data when the backend arrives

Until `amplify_outputs.json` exists, the device **is** the store of record:
records in `localStorage` under `serotonin.v2.*`, uploaded file bytes in
IndexedDB (`serotonin-files`), referenced as `idb://…`. Nothing is server-side.
A frontend redeploy cannot touch any of it — Amplify replaces static assets on a
CDN, the origin does not change, and browser storage survives. What does lose it
is a change of origin (a custom domain, a different branch URL — the data is
still there, just unreachable), clearing site data, or Safari's ITP evicting
script-writable storage after seven days without a visit.

The dangerous moment is the deploy that finally attaches the backend, and it
needed fixing rather than documenting:

`putRecord` returns before marking anything dirty when there is no client —
correctly, since there is nothing to sync to — so device-era records carry no
"unsynced" marker. `listAll` then reads an empty DynamoDB, succeeds, and writes
that empty result over the mirror. A successful read destroys the only copy that
exists. The uploaded bytes survive in IndexedDB but are orphaned, because the
records pointing at them are gone.

Three things now stand between you and that:

1. **A guard in `listAll`.** An empty cloud result cannot overwrite a collection
   that has never been reconciled with AWS. The device copy is returned and a
   warning is logged instead.
2. **A migration, gated ahead of the first read.** On the first load with a
   reachable backend, device records are uploaded and `idb://` files are
   re-uploaded to S3 with their `storagePath` rewritten. It runs once per device,
   merges by id — so a collection another device already populated gains this
   device's records rather than being skipped or duplicated — and reports what it
   did in a banner. `listAll` awaits it before its first read; without that gate
   the read wins the race and there is nothing left to migrate.
3. **Export and import.** Knowledge base → *Storage info* → **Export everything**
   writes one JSON file with every record and every stored file inline. Restoring
   is additive: a record already present is skipped, not replaced, so an old
   backup cannot roll the library back.

**Take an export before the first backend deploy.** The two mechanisms above are
tested (`npm run test:migration`, 22 checks against a stubbed AppSync), but a
backup costs one click and does not depend on my code being right.

The migration test needs a reachable backend, so it is not part of
`npm run test:browser`. Run it after `npx ampx sandbox`.

## Provisioning without a local terminal

Amplify Gen 2 defines the backend in TypeScript — `amplify/storage/resource.ts`
is the S3 bucket, `amplify/data/resource.ts` is the API and tables. There is no
"add storage" button in the console the way Gen 1 had: in Gen 2 the code is the
source of truth, and provisioning means getting that code deployed. So the
question is not *which UI adds a bucket*, it is *what runs the deploy*.

Three answers, none of which need software on your machine.

**1. The Amplify Hosting build. Already set up; nothing to install.**

Every push to the connected branch runs `npx ampx pipeline-deploy` inside AWS's
own build container, which provisions Cognito, AppSync, DynamoDB and the S3
bucket. Uploading files through the GitHub web UI triggers it just as well as
`git push` does. If the backend is not appearing, the cause is in the build, not
in your laptop:

- Is a service role attached? (§2 above — the usual culprit.)
- Does the build log contain `>>>>> STARTING BACKEND DEPLOY`? If not, the command
  did not run at all.
- If it ran and failed, the last 80 lines are printed after
  `>>>>> BACKEND DEPLOY FAILED`.

**2. AWS CloudShell — a terminal in the browser, inside the console.**

Nothing is installed locally, and it runs as your console identity, so there are
no AWS credentials to configure. Open the console and click the CloudShell icon
in the top bar.

**Get the code in without using git.** CloudShell has a file upload built in, and
it avoids GitHub authentication altogether:

**Actions → Upload file**, pick the project zip, then:

```bash
unzip ~/Serotonin-latest.zip -d /tmp/serotonin
cd /tmp/serotonin
npm install --include=dev
npx ampx sandbox --once                    # your own isolated stack
```

> **Why not `git clone`?** GitHub dropped password authentication for Git in
> August 2021, so an HTTPS clone of a *private* repo in a fresh environment fails
> with `Invalid username or token. Password authentication is not supported for
> Git operations.` Your laptop hides this — its credential manager has a token
> cached — but CloudShell starts with nothing.
>
> A public repo clones anonymously and needs no credentials at all, so **if you
> are being prompted for a username, GitHub is not serving that repo
> anonymously**: it is private, or the owner/name in the URL is wrong. Check by
> opening the URL in a private browser window.
>
> If it is private and you want git anyway, create a **fine-grained personal
> access token** (GitHub → Settings → Developer settings → Personal access
> tokens), scoped to that one repository with *Contents: Read-only* and a short
> expiry, and paste it when prompted for the **password** — not your account
> password. Do not put the token in the clone URL: it persists in
> `.git/config` and in shell history. If you do not want to re-enter it, use
> `git config --global credential.helper 'cache --timeout=3600'` rather than
> `store`, which writes it in plaintext to `~/.git-credentials` — and CloudShell
> keeps `$HOME` for about 120 days.

Two other caveats. CloudShell persists only about 1 GB in `$HOME`, and this
project's `node_modules` is larger than that with the CDK libraries — hence
`/tmp`, which is roomier but wiped between sessions. And CloudShell inherits
*your* IAM permissions: if your console identity cannot create CloudFormation
stacks, this fails the same way a local CLI would, and the fix is an IAM one
rather than a tooling one.

`sandbox` builds a personal stack, separate from the branch backend. It is the
fastest way to see a real error message, and `npx ampx sandbox delete` removes
it.

**3. A cloud dev environment** — GitHub Codespaces, Gitpod, or similar. Browser
VS Code with a real shell. More setup than CloudShell, because you have to supply
AWS credentials as environment secrets, but worth it if you will be iterating on
the backend rather than deploying it once.

**What about provisioning the bucket by hand?** You can create an S3 bucket and a
Cognito identity pool in the console and hand-write `amplify_outputs.json` to
match. It works, and I would not: you take on writing the CORS rules and IAM
policies that `defineStorage` generates for you, the file is then a hand-edited
artifact the build overwrites the moment the backend deploys properly, and the
TypeScript definitions stop describing what is actually deployed. It trades a
one-off blocker for permanent drift between code and infrastructure.

## Getting the full build log

This deserves its own section, because it has been the actual blocker: several
builds in a row produced a log that ended mid-`npm warn deprecated`, which reads
like a crash and is not one. **`npm warn` lines are warnings.** The console had
simply stopped showing more, and the error was below the cut.

`amplify.yml` now attacks that at the source: both `npm install` steps write to a
file and print nothing unless they fail, which removes several hundred lines of
noise from the log and should leave the real error visible. If a build still ends
somewhere that is obviously not a failure, use one of these instead — in order of
preference.

**1. Reproduce it locally (best — full error, no AWS console involved).**

```bash
npx ampx sandbox --once
```

Runs the same synth, validation and deployment against your own isolated stack and
prints the whole error to your terminal. Nearly every backend failure — a bad
`a.schema()` field, a handler wired up wrong, an IAM grant that will not resolve —
fails here identically and immediately. `npm run sandbox:delete` tears it down.

**2. Pull the log with the AWS CLI (full, untruncated, exposes nothing).**

```bash
APP=d2t1ylfcq4u0bz

# Find the most recent build
aws amplify list-jobs --app-id $APP --branch-name main --max-results 5 \
  --query 'jobSummaries[].{id:jobId,status:status,at:startTime}' --output table

# Grab the presigned log URLs for each step of that build
aws amplify get-job --app-id $APP --branch-name main --job-id <JOB_ID> \
  --query 'job.steps[].{step:stepName,status:status,log:logUrl}' --output text

# Then fetch the BACKEND_BUILD step's URL — this is the complete log
curl -s "<LOG_URL>" | tail -200
curl -s "<LOG_URL>" > build.log     # or keep the whole thing and grep it
```

`grep -n '>>>>>' build.log` jumps straight to the failure banners the build spec
prints.

**3. Download it from the console.** The build page has a download link per phase.
Same content as option 2, more clicking.

**4. Publish it with the site (fastest, but public).** Set `PUBLISH_BUILD_LOG=1`
in App settings → Environment variables and redeploy; the backend deploy log is
copied into the site as `/backend-deploy.log`.

> ⚠️ That file is world-readable, and CDK output contains your AWS account ID,
> role ARNs, and stack and bucket names. Read it, then remove the variable and
> redeploy. Options 1 and 2 leak nothing and are not much slower.

**What to look for once you can read it.** The parts of this backend that were
written without ever being executed, most likely first:

- the custom `embedTexts` mutation and its `a.handler.function(embedText)` wiring
- the Bedrock IAM grant added through the CDK escape hatch in `amplify/backend.ts`
- `allow.entity('identity')` on the `user-files/{entity_id}/*` storage prefix
- the custom Cognito attributes (`custom:department`, `custom:jobTitle`) —
  attribute changes on an existing user pool are a known source of
  `CREATE_FAILED` / immutable-property errors on redeploy

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
