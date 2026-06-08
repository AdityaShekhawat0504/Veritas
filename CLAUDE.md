# Veritas IC — v0

## What this is
A web app that turns an investment memo written in plain language into a structured, monitorable **thesis**. It extracts the claim, the assumptions it rests on (ranked by how load-bearing they are), and the evidence; checks each assumption against current reality; and shows a **thesis-integrity score** that drops when assumptions break. It also flags when a person's stated conviction is out of line with how intact their thesis actually is.

This is a demo-grade prototype that must look and feel like a real product. Optimize for a polished, fast UI, a properly architected codebase, and one flawless demo moment. Disciplined feature scope, high code quality. Do not add features outside this spec.

## Stack
- Next.js (App Router) + TypeScript (strict mode)
- Tailwind CSS — clean, modern, fast; product-grade, not student-demo
- Next.js API routes (no separate backend)
- **OpenAI API** for LLM calls (decomposition + assumption checking)
- Prisma + SQLite for persistence (relational model fits thesis → assumption → evidence cleanly; swappable to Postgres later via the data layer)
- API key in `.env.local` as `OPENAI_API_KEY`. MUST be gitignored. Server-side use only — never expose to the client, never use a `NEXT_PUBLIC_` prefix for it.

## Architecture (keep these boundaries clean)
```
/app
  /                      Dashboard (list of theses)
  /thesis/new            New Thesis (memo editor + decompose)
  /thesis/[id]           Thesis Detail (assumptions, check, score)
  /api/decompose         POST memo -> structured thesis (LLM)
  /api/check             POST thesisId -> re-check assumptions (LLM)
  /api/theses            CRUD for theses
/components              Presentational React components
/lib
  openai.ts              OpenAI client init (singleton)
  prompts.ts             ALL prompts live here, nowhere else
  decompose.ts           memo -> structured thesis object
  check.ts               assumption -> {status, reason, source}
  score.ts               integrity score computation (pure function, unit-testable)
  db.ts                  data access layer (wraps Prisma; the rest of the app never calls Prisma directly)
  types.ts               shared TypeScript types (single source of truth)
/prisma/schema.prisma    DB schema
```
Rules: UI never calls the LLM or DB directly — always through `/api` and `/lib`. Prompts only in `prompts.ts`. Scoring is a pure function in `score.ts` with no I/O.

## Data model (Prisma — implement EXACTLY this, do not add objects)
```
Thesis {
  id            String   @id @default(cuid())
  actor         String
  claim         String
  direction     String   // e.g. "long", "short", "hold"
  horizon       String   // e.g. "12 months"
  conviction    String   // "low" | "medium" | "high"
  integrityScore Int     @default(100)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  assumptions   Assumption[]
  decision      Decision?
  checks        Check[]
}
Assumption {
  id          String @id @default(cuid())
  thesisId    String
  text        String
  criticality String // "critical" | "supporting"
  status      String // "holding" | "weakening" | "contradicted"
  reason      String?
  source      String?
  lastChecked DateTime?
  evidence    Evidence[]
  thesis      Thesis @relation(fields: [thesisId], references: [id], onDelete: Cascade)
}
Evidence {
  id           String @id @default(cuid())
  assumptionId String
  text         String
  source       String?
  assumption   Assumption @relation(fields: [assumptionId], references: [id], onDelete: Cascade)
}
Decision {
  id       String @id @default(cuid())
  thesisId String @unique
  action   String // "buy" | "sell" | "size up" | "hold" | etc.
  sizing   String?
  thesis   Thesis @relation(fields: [thesisId], references: [id], onDelete: Cascade)
}
Check {
  id        String   @id @default(cuid())
  thesisId  String
  score     Int
  createdAt DateTime @default(now())
  thesis    Thesis   @relation(fields: [thesisId], references: [id], onDelete: Cascade)
}
```

## Integrity score (pure function in score.ts)
Per assumption: holding = 1.0, weakening = 0.5, contradicted = 0.0.
Weight by criticality: critical = 2, supporting = 1.
Score = round( 100 * sum(statusValue * weight) / sum(weight) ).
A contradicted critical assumption must visibly tank the score. Persist each computed score as a `Check` row so the detail page can show history.

## The three screens (exactly three)
1. **Dashboard (`/`)** — all theses as cards sorted by integrity ascending (breaks at top), each showing claim, direction, integrity score, and a red flag if any critical assumption is contradicted. Seed with 2–3 demo theses so it's never empty.
2. **New Thesis (`/thesis/new`)** — memo editor / paste box → "Decompose" → renders the extracted structured thesis with assumptions (showing critical vs supporting), all editable so the analyst confirms before saving. Human-in-the-loop confirmation is a feature, not a gap.
3. **Thesis Detail (`/thesis/[id]`)** — the thesis, its assumptions with status chips (green=holding / amber=weakening / red=contradicted) and a critical/supporting tag, a "Check thesis now" button that runs the checks, the integrity score with a small history sparkline, and a **conviction-vs-integrity mismatch banner** when stated conviction is high but integrity is low (or vice versa).

## LLM calls (OpenAI, two)
Use the official `openai` npm package. Use `response_format: { type: "json_object" }` for guaranteed valid JSON (no code-fence stripping).

- **Decompose** (`decompose.ts`): model `gpt-4o`. Returns:
  `{ claim, direction, horizon, conviction, decision: {action, sizing}, assumptions: [{ text, criticality, evidence: [{text, source}] }] }`
  System prompt instructs it to identify the *minimum set of load-bearing assumptions* and mark each `critical` or `supporting`.
- **Check** (`check.ts`): model `gpt-4o-mini` (faster/cheaper, run per assumption, can parallelize). Returns `{ status, reason, source }`. If a web-search capability is wired in, use it for real current sources; otherwise reason from the claim and explicitly state what cannot be verified. Never fabricate a source — if unverifiable, say so.

## The one moment to perfect
Paste memo → decompose into a clean thesis with critical/supporting assumptions → "Check" → one critical assumption flips to red with a one-line reason and a source → integrity score drops from 100 to ~65 → mismatch banner appears: "high conviction, 65% intact." Make this 30 seconds flawless and deterministic. Keep a saved demo memo (NVDA / data-center capex / export-control) in the repo so the live demo never depends on the LLM improvising badly.

## Out of scope for v0 — DO NOT BUILD
auth, multi-user, permissions, portfolio/position import, real market-data feeds, attribution / skill-vs-luck engine, cross-asset features, regulatory export, graph database. (Stretch, only if everything else is flawless and time remains: a "what would change my mind" pre-mortem generated at decompose time.)

## Build order (get a clickable, seeded skeleton before any LLM logic)
1. Scaffold Next.js + TypeScript + Tailwind. Set up Prisma + SQLite with the schema. Build the three routes, `types.ts`, `db.ts`, and seed 2–3 demo theses. App must be clickable and look clean with zero LLM logic.
2. Implement `score.ts` (pure function) + the integrity display + sparkline using seeded data.
3. Wire `/api/decompose` + `decompose.ts` into New Thesis.
4. Wire `/api/check` + `check.ts` into Thesis Detail; add the mismatch banner.
5. Polish UI and perfect the demo moment last.

## Conventions
- TypeScript strict. Small, single-responsibility components.
- All prompts in `prompts.ts`; all DB access through `db.ts`.
- `score.ts` is pure and has a unit test.
- No secrets in code. `.gitignore` must include `.env.local` from the first commit.
- do not commit, just say the work is ready to be commited and i will do it