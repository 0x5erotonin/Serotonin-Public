# Alternatives to AWS Amplify

Written after a run of failed Amplify deploys, to answer "should this be on
something else?" honestly rather than in frustration.

---

## First: how much is actually tied to Amplify?

Less than the deploy trouble suggests. The persistence layer was built behind a
seam, because the app has always had to run with no backend at all — that
on-device mode is not a stub, it is a working second implementation, and it is
what proves the seam holds.

Counting references to `aws-amplify`, `getDataClient` or `client.models`:

| File | Lines | Amplify references |
|---|---:|---:|
| `src/Serotonin.jsx` — the entire UI | 5,093 | **0** |
| `src/lib/collections.js` — UI ⇄ model mapping | 298 | 0 |
| `src/lib/usePersisted.js` — the hooks components call | 308 | 0 |
| `src/lib/kbIndex.js` — indexing and coverage | 307 | 0 |
| `src/lib/matcher.js`, `textIndex.js`, `extract.js`, `xlsx.js`, … | ~2,500 | 0 |
| `src/lib/store.js` — CRUD, dirty tracking, tombstones | 610 | 19 |
| `src/lib/files.js` — upload / signed URL / delete | 311 | 3 |
| `src/lib/embeddings.js` — Bedrock Titan client | 192 | 2 |
| `amplify/**` — the backend definition | 503 | — |

So a migration is: rewrite the AWS half of three files, replace `amplify/` with
whatever the new platform's schema looks like, and delete `amplifyClient.js`.
Roughly 600–900 lines of real work. **No component changes.** The dirty-tracking,
tombstone, locking and mirror logic in `store.js` is platform-agnostic and stays
as it is.

That is the number worth holding onto: this is a swappable backend, not a
rewrite. Which also means there is no urgency to choose right — the cost of
switching later is roughly the cost of switching now.

## What the backend actually has to provide

1. **Records** — 8 collections, JSON-shaped, scoped per owner. Small; the largest
   single item is a questionnaire with its questions inline (capped at 400 KB
   today by DynamoDB).
2. **Files** — policy documents, attachments, avatars. Needs private storage and
   short-lived signed URLs.
3. **Auth** — deferred so far, and the reason two people cannot see each other's
   work. Whatever comes next should make record scoping server-enforced.
4. **Embeddings** — one call per review, one per passage at index time. 256-dim
   vectors. **Optional**: with no embedding provider the app degrades to
   keyword-only matching, which is a documented mode, not a failure.
5. **Static hosting** for the Vite build.

Vector *search* is deliberately not on this list. Matching runs in the browser
over the loaded index, so the store only has to hold the vectors, not query them.
A platform with a real vector index would let that move server-side later, but
nothing needs it today.

---

## The options

| | Records | Files | Auth | Embeddings | Browser-only setup | Migration |
|---|---|---|---|---|---|---|
| **Stay on Amplify** | DynamoDB | S3 | Cognito | Bedrock | Build only, no CLI needed | none |
| **Supabase** | Postgres | Storage | GoTrue + RLS | pgvector + Edge Function | Yes — full dashboard | ~2–3 days |
| **Firebase** | Firestore | Cloud Storage | Firebase Auth | via Cloud Function | Yes — full console | ~2–3 days |
| **Cloudflare** | D1 | R2 | Access / DIY | Workers AI + Vectorize | Partly — Wrangler for most things | ~3–4 days |
| **No backend** | localStorage | IndexedDB | none | none | Nothing to set up | none — already built |

### Supabase — the strongest alternative

Postgres with row-level security is a better fit for this app's actual problem
than anything else on the list. The cross-user visibility question ("my colleague
sees nothing") becomes a policy you write once:

```sql
create policy "team reads the library" on kb_documents
  for select using (tenant_id = auth.jwt() ->> 'tenant_id');
```

Enforced in the database, not in the client — which is the specific weakness of
the current setup, where `ownerKey` filtering is client-side and anyone with the
API endpoint could read every row.

It also fits the constraint that matters most right now: **everything is
configurable from a browser.** Tables, RLS policies, storage buckets, auth
providers, SQL editor. No CLI, no local Node, no admin rights on the laptop.

pgvector holds the embeddings in the same table as the text, so
`KbIndexChunk` stops being a separate concern. Generating them needs an Edge
Function calling an embedding provider — or skip it and run keyword-only until
it matters.

**Be careful of one thing.** `docs/supabase_schema.sql` in this repo is *stale*.
It is v2.0-era, predates the whole auto-review feature, and covers roughly half
of what the app now stores: no `kb_entries`, no `kb_index_chunks`, no standalone
policy documents (its `documents` table hangs off a questionnaire), no owner
transfer fields, no vector column. It is a starting point, not a migration. Do
not read "Supabase is already scaffolded" into it — the scaffolding is a 10-line
client, a 21-line hook, and a schema that would need four more tables and several
reshaped ones.

### Firebase

Firestore's document model maps onto the collections almost directly — closer
than Postgres, since the records are already JSON. Console-driven, mature, and
the auth is the easiest of the three to wire up.

Against it: security rules are their own language and harder to reason about than
SQL policies, querying is limited enough that reporting later would hurt, and
there is no natural home for the embeddings without bolting on a separate vector
service. For an app whose whole value is a searchable knowledge base, that last
one matters.

### Cloudflare

D1 + R2 + Workers AI is the cheapest by a distance, and Workers AI would remove
the Bedrock dependency for embeddings entirely — model access is not a separate
account-level opt-in the way `amazon.titan-embed-text-v2:0` is. Vectorize is a
real vector index if search ever moves server-side.

Against it, and decisively for right now: the workflow assumes Wrangler, the CLI.
That is the exact constraint we are trying to route around.

### No backend at all

Worth stating plainly because it is a real option and it already works. The app
runs fully on localStorage and IndexedDB: drafts, uploaded document bytes,
notification state, themes, the whole auto-review pipeline minus embeddings. For
a portfolio demo that one person shows to interviewers, this is sufficient, costs
nothing, and has no attack surface.

It fails exactly one requirement: two people cannot share a library. If that is
not a real requirement yet, the correct amount of backend is none.

---

## Recommendation

**Finish the Amplify attempt before abandoning it.** Not out of sunk cost — out
of evidence. As of the last build, `npx ampx pipeline-deploy` had *never
executed*: it was silently skipped because its command block in `amplify.yml`
started with a comment. Every prior build failed at dependency install, before
the backend was reached. So there is no evidence that the Amplify backend is
broken. There is evidence that the build spec was, and that is fixed.

Switching platforms now would mean trading something unproven-broken for
something unbuilt, and paying 600–900 lines for the privilege. One more build
tells you which situation you are actually in. The likely remaining blocker is
the service role (AMPLIFY_SETUP.md §2) — a console setting, not a code problem.

**If that build fails on something structural** — Cognito custom attributes that
cannot be changed on an existing pool, the Bedrock IAM grant, the `embedTexts`
mutation wiring — then move, and move to **Supabase**. It is the only option that
solves the sharing problem properly, and the only one whose entire setup happens
in a browser.

**If sharing turns out not to be a real requirement**, keep the on-device mode and
delete `amplify/` altogether. A dependency you do not need is not free, and this
one has cost several days already.

## If the decision is Supabase

Rough order, none of it needing a local terminal:

1. Write the real schema — 8 tables matching `src/lib/collections.js`, with
   `tenant_id` on each and RLS policies from the start, not bolted on later.
   Paste it into the SQL editor.
2. Create a private storage bucket with per-tenant path policies.
3. Reimplement `store.js`'s client half against `supabase-js`. The dirty
   tracking, tombstones, per-record locking and mirror stay untouched — they
   solved problems that have nothing to do with the vendor.
4. Reimplement `files.js` against Supabase Storage signed URLs. The IndexedDB
   fallback stays as the no-backend path.
5. Turn on auth properly this time, with sign-up restricted to your domain.
6. Embeddings last, or never. Keyword-only is a working mode.

Steps 1 and 2 are the ones worth being slow about. Everything else is mechanical.
