# 🧪 Serotonin

**GRC questionnaire automation for security teams who have better things to do.**

> Built because answering "do you have SOC 2?" for the 47th time shouldn't take 4 hours.

![React](https://img.shields.io/badge/React_18-20232A?style=flat&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![AWS Amplify](https://img.shields.io/badge/AWS_Amplify-FF9900?style=flat&logo=awsamplify&logoColor=white)
![DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=flat&logo=amazondynamodb&logoColor=white)

---

## 🤔 The problem

Every security team knows the drill. A vendor or customer sends over a 50-question security questionnaire. Half the questions are identical to ones you answered last month. You spend 3–5 hours digging through old spreadsheets, your SOC 2 report, and Slack messages trying to remember what you wrote last time.

Then it happens again next month. And the month after that.

**Serotonin is the tool I wished existed.** It remembers everything you've ever answered, auto-fills the easy ones, flags the uncertain ones for your review, and gets the whole thing out the door in under 30 minutes.

---

## ✨ What it does

**📋 Complete questionnaires** — Upload the PDF, DOCX or Excel workbook a vendor sent you and Serotonin reads it, pulls the questions out, and checks each one against everything you've answered before and every policy document you've imported. Questions you've answered before come back auto-filled and attributed. Questions your SOC 2 report covers come back with the paragraph cited, for you to accept in a click. The rest are flagged as needing a real answer — and it tells you what the closest near-miss was. Five-step workflow: import → auto-review → review → approve → send.

**📊 It handles the spreadsheets** — A SIG or CAIQ workbook is a cover page, an instructions tab, a glossary, the questionnaire, and usually an old version nobody deleted. Serotonin works out which sheet is the questionnaire and which column holds the questions — they're rarely in column A — skips the rest, and tells you exactly what it picked: *"used column C ("Question") of "Full Questionnaire" — skipped "Instructions" (looks like guidance), "Glossary" (looks like a glossary)"*.

**🧠 Knowledge base** — Every questionnaire you complete gets indexed and searchable, and so does every policy document you import: SOC 2 reports, access control policies, disaster recovery plans are split into passages, embedded, and cited by page. One library, one search — completed questionnaires and imported documents sit side by side under *All entries*. Genuinely gets better with every questionnaire you run through it, because your own answers become the best match for next time.

**🗂 Dashboard** — See everything in flight at a glance. Who owns what, where it's at in the workflow, how complete it is, who it's assigned to. Hand an assessment to a colleague with the Transfer button. One click to pick up where you left off.

**📖 Internal wiki** — Full documentation built directly into the app. 16 articles covering every feature, security posture, tips, and troubleshooting. No external Notion or Confluence required.

**💾 Nothing gets lost** — Drafts autosave as you type. Uploaded documents are stored and downloadable, not just listed. Close the tab, come back tomorrow, pick up mid-questionnaire. Backed by DynamoDB and S3 when a backend is attached, and by durable on-device storage when one isn't.

**🎨 Five themes** — Forest · Chalk · Obsidian · Aero · Oklou. Yes I spent way too long on this. No I don't regret it.

---

## 🛠 Tech stack

No UI framework. No component library. Just React, inline styles, and a semantic color token system that powers all five themes from a single set of variables.

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite | Fast dev loop, no framework overhead |
| Styling | Inline styles + CSS tokens | Full theme control, zero bundle cost |
| Database | Amplify Data → AppSync + DynamoDB | Schema defined in TypeScript, deploys on push |
| Parsing | PDF.js + Mammoth, client-side | No upload round-trip; works with no backend attached |
| Spreadsheets | Own reader, zero dependencies | npm's `xlsx` is stuck on a version with an unpatched CVE |
| Matching | BM25 in-browser + Bedrock Titan embeddings | Either signal alone can carry a match |
| Storage | Amplify Storage → S3 | Policy documents, attachments, avatars |
| Auth | Cognito (provisioned, not yet enforced) | See the security note below |
| Routing | Hash-based (`#editor`, `#kb`) | No React Router dep |
| State | `useState` + an async store layer | Durable, with an on-device fallback |
| Hosting | AWS Amplify Hosting | Push to deploy, headers via `customHttp.yml` |

**Security stuff worth mentioning:**
- Every record carries an owner key and is scoped to its owner on read
- Files land under a per-identity S3 prefix, served via short-lived signed URLs
- Session inactivity timeout (HIPAA §164.312(a)(2)(iii)) — auto-logout after 15 min idle
- Full audit log on every create/update/delete
- HSTS, CSP, X-Frame-Options, Referrer-Policy headers on all responses

> **Auth is provisioned but not yet enforced.** Cognito is deployed and the data
> layer is ready for owner-based authorization, but nothing forces a sign-in yet,
> so record scoping is client-side rather than IAM-enforced. Fine for a demo and
> for your own data; not yet for real customer questionnaires. The exact exposure
> and the five-step fix are in [AMPLIFY_SETUP.md](AMPLIFY_SETUP.md#️-security-posture-while-auth-is-deferred).
>
> The same trade-off is why **two people do not see each other's work**: each
> browser is issued its own Cognito guest identity, so each gets its own private
> library. It is not a network or IP problem. The diagnostic and the options for
> changing it are in [Another user sees none of my
> work](AMPLIFY_SETUP.md#another-user-sees-none-of-my-work--why-and-the-options).

---

## 🏗 Architecture

```
Browser (React SPA)
    │
    ├── Hash router  →  #dashboard · #editor · #knowledge · #wiki
    ├── Theme system →  5 themes × semantic color tokens
    │
    ├── src/lib/  ── the auto-review pipeline
    │       extract.js  →  questionExtract.js  →  matcher.js
    │       PDF.js            (which lines?)      BM25 + embeddings
    │       Mammoth       gridQuestions.js
    │       xlsx.js/unzip.js  (which column?)
    │
    └── src/lib/  ── the persistence seam
            │         store.js · collections.js · files.js · usePersisted.js
            │
            ├─ with a backend ─→  AWS Amplify Gen 2
            │                       ├── UserProfile   ← user data + preferences
            │                       ├── Questionnaire ← drafts and completed
            │                       ├── KbEntry       ← completed questionnaires
            │                       ├── KbDocument    ← imported policy docs
            │                       ├── KbIndexChunk  ← searchable passages + vectors
            │                       ├── Attachment    ← files sent with a package
            │                       ├── Notification  ← notification feed
            │                       ├── AuditLog      ← immutable action history
            │                       ├── embedTexts    ← Lambda → Bedrock Titan
            │                       └── S3 bucket     ← the files themselves
            │
            └─ without one ───→  localStorage (records) + IndexedDB (file bytes)
                                 keyword matching only, no embeddings
```

Both paths are durable. The fallback is not a stub — it is what lets the public
demo work with no AWS account, and it means a misconfigured deploy degrades
instead of breaking.

---

## 🚀 Running locally

**You'll need:** Node 18+. AWS credentials are optional.

```bash
git clone https://github.com/0x5erotonin/Serotonin-public.git
cd Serotonin-public
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). No login, and your data
persists on this device — drafts, uploaded documents and preferences all survive
a refresh with nothing configured.

**To run against real AWS**, start your own isolated cloud sandbox:

```bash
npm run sandbox      # provisions Cognito + AppSync + DynamoDB + S3, writes amplify_outputs.json
npm run dev          # in a second terminal — now backed by the cloud
npm run sandbox:delete   # tear it down when you're done
```

Deploying to Amplify Hosting is a `git push` — `amplify.yml` provisions the
backend and builds the frontend. Full walkthrough, including the two console
settings you need to flip, in **[AMPLIFY_SETUP.md](AMPLIFY_SETUP.md)**.

### Tests

```bash
npm test                      # extraction + matching, plain Node, no browser

# The browser suites need Playwright, which is deliberately not a dependency —
# it downloads ~150MB of browsers and the deploy build has no use for it.
npm i -D playwright && npx playwright install chromium
npm run build && npm run preview &
npm run test:browser
```

`test:unit` runs the extraction, matching and spreadsheet logic in plain Node —
six real questionnaire formats, a SIG-shaped workbook, hybrid scoring, and
performance bounds. `test:browser` adds three suites: one asserting that
everything survives a refresh, one driving a real PDF through the whole
auto-review chain with the real PDF.js, and one covering the library listing and
ownership transfer.

More on how parsing and scoring work, and where the thresholds live, in
**[AUTO_REVIEW.md](AUTO_REVIEW.md)**.

---

## 📁 Project structure

```
Serotonin-public/
├── amplify/                    ← backend as TypeScript, deployed on push
│   ├── auth/resource.ts        ← Cognito user pool + identity pool
│   ├── data/resource.ts        ← 8 models + the embedTexts mutation
│   ├── storage/resource.ts     ← S3 bucket, per-identity prefixes
│   ├── functions/embed-text/   ← Bedrock Titan embeddings (Lambda)
│   └── backend.ts
├── src/
│   ├── Serotonin.jsx           ← the whole app (single-file SPA, ~4,300 lines)
│   ├── main.jsx                ← mounts the app
│   └── lib/
│       ├── amplifyClient.js    ← configure Amplify, resolve owner + identity
│       ├── collections.js      ← UI shape ⇄ data model mapping
│       ├── store.js            ← async CRUD, AWS or on-device, + migration
│       ├── files.js            ← S3 uploads, or IndexedDB with no backend
│       ├── usePersisted.js     ← the hooks the components call
│       ├── extract.js          ← PDF.js / Mammoth / xlsx / CSV extraction
│       ├── unzip.js            ← ZIP reader over DecompressionStream
│       ├── xlsx.js             ← .xlsx → sheets of cell text, no deps
│       ├── questionExtract.js  ← finds questions in raw document text
│       ├── gridQuestions.js    ← finds the question column in a workbook
│       ├── chunk.js            ← splits documents into citable passages
│       ├── textIndex.js        ← tokeniser, GRC synonyms, BM25, cosine
│       ├── embeddings.js       ← Bedrock embedding client + cache
│       ├── matcher.js          ← hybrid scoring and classification
│       ├── kbIndex.js          ← indexing, coverage, backfill
│       ├── supabase.js         ← dormant (see AMPLIFY_SETUP.md)
│       └── useAuth.js          ← dormant
├── tests/                      ← extraction · matching · xlsx · persistence · auto-review · ownership
├── amplify.yml                 ← Amplify build spec (backend + frontend)
├── customHttp.yml              ← security headers
├── AMPLIFY_SETUP.md            ← deployment + the auth to-do list
├── AUTO_REVIEW.md              ← how parsing, scoring and citation work
├── index.html
└── package.json
```

---

## 💭 Why I built this

I'm a Security Engineer moving into detection engineering. I kept watching GRC work eat up analyst time that could go towards deeper security work — threat hunting, tuning detections, reducing alert fatigue.

The questionnaire problem is a perfect automation target: highly repetitive, well-defined inputs and outputs, clear quality criteria (confidence scoring), and meaningful time savings when you get it right. Building this taught me more about practical security automation than any cert has — threat modeling a real app, implementing HIPAA controls that aren't just checkboxes, designing RLS policies that actually hold up, and thinking through what "secure by default" looks like at the application layer.

The full production version (with auth, domain locking and invite-only access) is not available. This is the cleaned-up public demo.

---

## 📄 License


