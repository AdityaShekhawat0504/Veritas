# Veritas IC

Turn an investment memo into a structured, monitorable thesis. Veritas IC reads a
plain-language memo, decomposes it into the core claim, its load-bearing assumptions
(critical vs. supporting), and the evidence behind each, then tracks a thesis-integrity
score as those assumptions hold or break.

## Stack
Next.js (App Router) · TypeScript · Tailwind · Prisma + SQLite · OpenAI API

## Setup
```bash
npm install
cp .env.example .env.local   # add your OPENAI_API_KEY
npx prisma db push
npx prisma db seed
npm run dev
```
Open http://localhost:3000

## How it works
- **New Thesis** — paste a memo, decompose it (GPT-5.4), confirm the structured output, save.
- **Thesis Detail** — assumptions with status, integrity score, conviction-vs-integrity check.
- **Dashboard** — all theses ranked by integrity, breaks surfaced first.