# 🧪 Serotonin

**GRC questionnaire automation for security teams who have better things to do.**

> Built because answering "do you have SOC 2?" for the 47th time shouldn't take 4 hours.

![React](https://img.shields.io/badge/React_18-20232A?style=flat&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)

---

## 🤔 The problem

Every security team knows the drill. A vendor or customer sends over a 50-question security questionnaire. Half the questions are identical to ones you answered last month. You spend 3–5 hours digging through old spreadsheets, your SOC 2 report, and Slack messages trying to remember what you wrote last time.

Then it happens again next month. And the month after that.

**Serotonin is the tool I wished existed.** It remembers everything you've ever answered, auto-fills the easy ones, flags the uncertain ones for your review, and gets the whole thing out the door in under 30 minutes.

---

## ✨ What it does

**📋 Complete questionnaires** — Import from Gmail, Google Drive, file upload, or paste directly. Serotonin searches your answer history and auto-fills with confidence scoring. High confidence = auto-filled. Low confidence = flagged for you to check. Five-step workflow: import → process → review → approve → send.

**🧠 Knowledge base** — Every questionnaire you complete gets indexed and searchable. Drop in your SOC 2 reports, access control policies, disaster recovery plans — it'll use them as source material. Gets smarter with every questionnaire you run through it.

**📊 Dashboard** — See everything in flight at a glance. Who owns what, where it's at in the workflow, how complete it is, who it's assigned to. One click to pick up where you left off.

**📖 Internal wiki** — Full documentation built directly into the app. 16 articles covering every feature, security posture, tips, and troubleshooting. No external Notion or Confluence required.

**🎨 Five themes** — Forest · Chalk · Obsidian · Aero · Oklou. Yes I spent way too long on this. No I don't regret it.

---

## 🛠 Tech stack

No UI framework. No component library. Just React, inline styles, and a semantic color token system that powers all five themes from a single set of variables.

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite | Fast dev loop, no framework overhead |
| Styling | Inline styles + CSS tokens | Full theme control, zero bundle cost |
| Auth | Supabase Auth | Email/password + Google OAuth out of the box |
| Database | Supabase Postgres | RLS on every table, audit log, real-time |
| Storage | Supabase Storage | Policy documents, avatars |
| Routing | Hash-based (`#editor`, `#kb`) | No React Router dep |
| State | `useState` + `sessionStorage` | Draft persistence without a backend |
| Hosting | Vercel | Push to deploy, security headers via `vercel.json` |

**Security stuff worth mentioning:**
- Row Level Security on all 6 database tables — users can only ever see their own data
- Session inactivity timeout (HIPAA §164.312(a)(2)(iii)) — auto-logout after 15 min idle
- Domain allowlist enforced at the Postgres trigger level — can't be bypassed from the client
- Full audit log on every create/update/delete
- HSTS, CSP, X-Frame-Options, Referrer-Policy headers on all responses

---

## 🏗 Architecture

```
Browser (React SPA)
    │
    ├── Hash router  →  #dashboard · #editor · #knowledge · #wiki
    ├── Shared state →  drafts · kbEntries · kbDocs  (sessionStorage backed)
    ├── Theme system →  5 themes × semantic color tokens
    └── Supabase client
            │
            ├── auth.users        ← Supabase Auth (email + Google OAuth)
            ├── profiles          ← extended user data + preferences
            ├── questionnaires    ← draft and completed assessments
            ├── questions         ← individual Q&A pairs with confidence scores
            ├── documents         ← attached policy files
            ├── notifications     ← real-time notification feed
            └── audit_log         ← immutable action history
```

---

## 🚀 Running locally

**You'll need:** Node 18+, and optionally a Supabase project (the demo runs without one)

```bash
# Clone it
git clone https://github.com/0x5erotonin/Serotonin-public.git
cd Serotonin-public

# Install deps
npm install

# Start the dev server — works without Supabase in demo mode
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — the app loads directly, no login required in demo mode.

**To enable auth + persistence**, connect a Supabase project:

```bash
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

Then run the schema:
```bash
# Paste docs/supabase_schema.sql into your Supabase SQL Editor and hit Run
# Creates 6 tables, RLS policies, storage bucket, and auth triggers
# Takes about 5 seconds
```

---

## 📁 Project structure

```
Serotonin-public/
├── src/
│   ├── Serotonin.jsx   ← the whole app (single-file SPA, ~3,900 lines)
│   ├── main.jsx        ← mounts the app, no auth wrapper in demo mode
│   └── lib/
│       ├── supabase.js ← client init (returns null without .env)
│       └── useAuth.js  ← auth state hook
├── docs/
│   └── supabase_schema.sql
├── index.html
├── vercel.json         ← security headers
├── .env.example
└── package.json
```

---

## 💭 Why I built this

I'm a SOC analyst moving into detection engineering. I kept watching GRC work eat up analyst time that could go toward actual security work — threat hunting, tuning detections, reducing alert fatigue.

The questionnaire problem is a perfect automation target: highly repetitive, well-defined inputs and outputs, clear quality criteria (confidence scoring), and meaningful time savings when you get it right. Building this taught me more about practical security automation than any cert has — threat modeling a real app, implementing HIPAA controls that aren't just checkboxes, designing RLS policies that actually hold up, and thinking through what "secure by default" looks like at the application layer.

The full production version (with auth, domain locking, invite-only access, and Supabase connected) is running internally. This is the cleaned-up public demo.

---

## 📄 License

MIT — fork it, adapt it, build on it.
