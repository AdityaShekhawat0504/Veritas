# Veritas IC

Turn an investment memo into a structured, monitorable **thesis**.

Veritas IC reads a memo written in plain language and decomposes it into the core
claim, the assumptions it rests on (ranked by how load-bearing they are), and the
evidence behind each. It then checks every assumption against current reality and
shows a **thesis-integrity score** that drops when assumptions break — plus a
banner when a stated conviction is out of line with how intact the thesis
actually is.

Multi-user: each analyst signs in with Google and sees only their own theses.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Prisma ·
Neon Postgres · Auth.js v5 (NextAuth, Google OAuth) · OpenAI API · Vercel

## How it works

**1. New Thesis (`/thesis/new`)** — paste a memo, hit *Decompose*. `gpt-5.4`
returns a strict-JSON-schema structured thesis: claim, direction, horizon,
conviction, the decision, and the minimum set of load-bearing assumptions, each
tagged `critical` or `supporting` with its supporting evidence. You review and
edit the extraction before it is saved — the human-in-the-loop confirmation is
deliberate.

**2. Thesis Detail (`/thesis/[id]`)** — assumptions with status chips
(green = holding, amber = weakening, red = contradicted) and their
critical/supporting tag, a **Check thesis now** button, the integrity score with
a history sparkline, and the conviction-vs-integrity mismatch banner.

*Check* runs `gpt-5.4-mini` once per assumption, in parallel, and returns
`{ status, reason, source }`. A source is never fabricated — if the claim can't
be verified, the model says so. Individual failures are tolerated: a single
model hiccup leaves that assumption's prior status untouched instead of sinking
the whole re-check. Checks run on demand, never on a schedule.

**3. Dashboard (`/`)** — your theses as cards sorted by integrity ascending, so
breaks float to the top, with a red flag on any thesis that has a contradicted
critical assumption. A new account starts empty with a one-click **Load samples**
button that clones three demo theses into that account.

### Integrity score

A pure function in `lib/score.ts` (unit-tested, no I/O):

```
holding = 1.0   weakening = 0.5   contradicted = 0.0
critical × 2    supporting × 1

score = round( 100 × Σ(statusValue × weight) / Σ(weight) )
```

A contradicted critical assumption visibly tanks the score. Every computed score
is persisted as a `Check` row, which is what the sparkline draws.

## Project layout

```
/app
  /                       Dashboard
  /signin                 Google sign-in
  /thesis/new             Memo editor + decompose
  /thesis/[id]            Thesis detail, check, score
  /api/decompose          POST memo   -> structured thesis (LLM)
  /api/check              POST thesisId -> re-check assumptions (LLM)
  /api/theses             POST a confirmed thesis
  /api/samples            POST -> clone demo theses into your account
  /api/auth/*             Auth.js routes
/components               Presentational React components
/lib
  openai.ts               OpenAI client singleton
  prompts.ts              Every prompt + JSON schema lives here
  decompose.ts            memo -> DecomposedThesis
  check.ts                assumption -> { status, reason, source }
  score.ts                Integrity score (pure)
  db.ts                   Data access layer — the only place Prisma is touched
  auth.ts / auth.config.ts  Auth.js config (edge-safe config split out)
  sampleTheses.ts         The clonable demo set (pure data)
  types.ts                Shared domain types
/prisma/schema.prisma     Data model + Auth.js adapter models
middleware.ts             Gates every route behind login
```

Boundaries worth keeping: the UI never calls the LLM or the database directly —
always through `/api` and `/lib`. Prompts live only in `prompts.ts`. Every
function in `db.ts` takes a `userId` and enforces ownership there, not in the UI.

## Setup

```bash
npm install
cp .env.example .env.local      # fill in the values below
npx prisma migrate dev          # create the schema
npm run dev                     # http://localhost:3000
```

Environment variables (all server-side only — never `NEXT_PUBLIC_`):

| Variable | What it is |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI key for decompose + check |
| `DATABASE_URL` | Neon **pooled** connection (`…-pooler.…`), used at runtime |
| `DIRECT_URL` | Neon **direct** connection, used by `prisma migrate` |
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google Cloud Console → Credentials → OAuth client |

The database URLs belong in both `.env.local` (Next runtime) and `.env` (read by
the Prisma CLI). Google OAuth needs the redirect URI
`http://localhost:3000/api/auth/callback/google` in dev, and
`https://YOUR-DOMAIN/api/auth/callback/google` in production.

Optional: `npx prisma db seed` creates a local `demo@veritas.local` user with
the sample theses, so the app is explorable without signing in. Real users are
never auto-seeded — they opt in via *Load samples*.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate && prisma migrate deploy && next build` |
| `npm test` | Vitest — the `score.ts` unit tests |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm run seed` | Seed the demo user |

## Deploy

Deployed on Vercel. Set the five secrets above as Vercel environment variables,
add the production callback URL to the Google OAuth client, and push — the build
command runs `prisma migrate deploy` before `next build`, so migrations apply on
deploy. Schema changes go through `prisma migrate`, never `db push`.
