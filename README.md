# Serotonin — GRC Questionnaire Automation Platform

> An end-to-end security questionnaire automation platform built to reduce the time GRC analysts spend on repetitive compliance work.

**Built with:** React 18 · Vite · Supabase · Vercel · Lucide Icons

---

## What this is

Serotonin is a full-stack internal tooling project that automates the security questionnaire lifecycle for GRC (Governance, Risk, and Compliance) teams.

Security teams at mid-to-large companies receive dozens of security questionnaires per year from customers, vendors, and auditors — each one asking variations of the same 40–60 questions. Answering them manually takes 3–5 hours per questionnaire. Serotonin cuts that to under 30 minutes by:

- Pulling answers from a searchable knowledge base of past questionnaires
- Auto-filling high-confidence answers and flagging uncertain ones for review
- Tracking ownership and assignment across the team
- Saving completed questionnaires back to the knowledge base for future reuse

---

## Features

### Complete questionnaires
Five-step workflow: import → process → review → approve → send. Supports Gmail, Google Drive, file upload (PDF/DOCX/XLSX/CSV), and manual paste. Answers are auto-filled from the knowledge base with confidence scoring. Incomplete questionnaires save as drafts and are resumable across sessions.

### Knowledge base
Every completed questionnaire is automatically indexed. Full-text search, tag filtering, expandable Q&A preview per entry. Supports importing policy documents (SOC 2 reports, access control policies, disaster recovery plans, BAAs) as reference material.

### Dashboard
Live active assessments panel showing all in-progress drafts with owner, assignee, step, progress percentage, and last-saved timestamp. One-click resume.

### Internal wiki
16-article documentation system covering getting started, each module, data security, tips, and troubleshooting — built directly into the app.

### Five themes
Forest (warm parchment) · Chalk (clean white) · Obsidian (dark mode) · Aero (Frutiger-style gloss) · Oklou (editorial dark)

---

## Technical highlights

```
Frontend          React 18 + Vite, zero CSS framework, inline styles with a
                  semantic token system shared across all five themes

Auth              Supabase Auth — email/password + Google OAuth SSO
                  Session inactivity timeout (HIPAA §164.312(a)(2)(iii))
                  Domain allowlist enforcement at DB trigger level

Database          Supabase Postgres with Row Level Security on all tables
                  Audit log capturing every create/update/delete

Storage           Supabase Storage for uploaded policy documents

Routing           Hash-based client-side routing (no React Router dependency)

State             React useState lifted to root with sessionStorage persistence
                  for cross-refresh questionnaire progress

Security headers  HSTS · CSP · X-Frame-Options · X-Content-Type-Options ·
                  Referrer-Policy · Permissions-Policy

Hosting           Vercel (auto-deploy on git push)
```

---

## Architecture

```
Browser (React SPA)
    │
    ├── Hash router (#editor, #vendor, #batch, #knowledge, #wiki)
    ├── Shared state: kbEntries, kbDocs, drafts (sessionStorage backed)
    ├── Five theme system with semantic color tokens
    └── Supabase JS client
            │
            ├── auth.users          — Supabase Auth
            ├── profiles            — extended user data
            ├── questionnaires      — draft + completed questionnaires
            ├── questions           — individual Q&A pairs
            ├── documents           — attached policy files
            ├── notifications       — real-time notification feed
            └── audit_log           — immutable action history
```

---

## Running locally

**Prerequisites:** Node 18+, a Supabase project

```bash
# Clone
git clone https://github.com/0x5erotonin/serotonin-public.git
cd Serotonin-public

# Install
npm install

# Configure
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Set up database
# Paste docs/supabase_schema.sql into Supabase SQL Editor and run

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Database setup

The full schema is in `docs/supabase_schema.sql`. It creates 6 tables with RLS policies, a storage bucket, and auth triggers. Paste it into your Supabase SQL Editor and run — takes about 5 seconds.

---

## Configuring domain restriction (optional)

To restrict signups to a specific email domain, set `ALLOWED_DOMAIN` in `public/landing.html` and add the corresponding Postgres trigger from `docs/supabase_schema.sql`.

---

## Project structure

```
serotonin/
├── src/
│   ├── Serotonin.jsx     — Full application (single-file React SPA)
│   ├── main.jsx          — Entry point
│   └── lib/
│       ├── supabase.js   — Client init
│       ├── db.js         — Database layer
│       └── useAuth.js    — Auth hook
├── public/
│   └── landing.html      — Sign-in page (standalone HTML)
├── docs/
│   ├── supabase_schema.sql
│   ├── PRD.md
│   └── QUICKSTART.md
├── vercel.json           — Security headers + routing
├── .env.example
└── package.json
```

---

## Why I built this

Security questionnaire fatigue is a real problem in GRC teams. The average enterprise security team spends 15–20% of their time answering the same questions in different formats for different customers. This project explores what a purpose-built automation layer for that workflow would look like — from the UX of the questionnaire review flow, to the knowledge base architecture, to the compliance considerations (HIPAA session timeout, audit logging, RLS).

---

## License

MIT — free to use, fork, and adapt.
