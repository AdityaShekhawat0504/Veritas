# Go-live checklist

Everything below needs accounts, keys or a live network, so it cannot be done from the repository alone. Work through it in order. Every variable is listed in `.env.example`.

## 0. Repository

- [ ] Run `pnpm install` once and commit the generated `pnpm-lock.yaml`. Delete `package-lock.json` (left over from v1) in the same commit.
- [ ] Then switch `.github/workflows/ci.yml` to `pnpm install --frozen-lockfile` and add `cache: pnpm` to `actions/setup-node`.
- [ ] Confirm CI is green on `v2`: install, typecheck, `pnpm test`, `pnpm eval`.
- [ ] Run `pnpm build` locally with no `.env.local`. It should succeed; if it does not, fix before deploying.

## 1. Database (Neon, EU region, pgvector)

- [ ] Create a new Neon project in an EU region (for example `aws-eu-central-1`). Use a new database rather than the v1 one; v1's Prisma tables are not used by v2.
- [ ] Copy the pooled connection string (host contains `-pooler`) into `DATABASE_URL` and the direct one into `DIRECT_URL`.
- [ ] Run `pnpm db:migrate`. The first migration runs `CREATE EXTENSION IF NOT EXISTS vector`; Neon supports pgvector, but confirm it succeeded.
- [ ] Run `pnpm db:seed-catalog` and confirm `SELECT count(*) FROM indicator_catalog;` returns 35.
- [ ] Verify the insert-only triggers (the seed wrote one `action_log` row): in the Neon SQL editor, `UPDATE action_log SET action = action;` must fail with "table action_log is insert-only".

## 2. Google sign-in (Auth.js)

- [ ] Generate `AUTH_SECRET` with `openssl rand -base64 33`.
- [ ] In Google Cloud Console, create an OAuth client (Web). Redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://YOUR-DOMAIN/api/auth/callback/google`. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
- [ ] Sign in once and check that `users`, `firms`, `memberships` and one `createAccount` row in `action_log` were created.

## 3. LLM

- [ ] Set `OPENAI_API_KEY`. Optionally set `LLM_MODEL_EXTRACT` and `LLM_MODEL_DEFAULT` (defaults: `gpt-5.4` and `gpt-5.4-mini`, the models v1 used). Confirm the chosen models support structured outputs with `strict: true`.
- [ ] Set `LLM_PRICE_INPUT_PER_MTOK_USD` and `LLM_PRICE_OUTPUT_PER_MTOK_USD` from the provider's price page for the extract model, or leave them empty to store cost as null.
- [ ] Paste a memo, confirm the draft, and check one `llm_calls` row with model, `extract-thesis@1`, tokens and cost.

## 4. Data sources

- [ ] **EDGAR:** set `EDGAR_USER_AGENT` to `"Veritas <your contact email>"`. SEC requires a real contact. No key needed.
- [ ] **FRED:** request a free key at https://fredaccount.stlouisfed.org/apikeys and set `FRED_API_KEY`.
- [ ] **Tiingo:** read Tiingo's commercial terms for showing prices to users, pick a plan, set `TIINGO_API_KEY` and `TIINGO_MAX_REQUESTS_PER_MINUTE` to your plan's limit.
- [ ] **First live check (Phase 2 done-when):** create a thesis on a real US large cap with its CIK (for example from https://www.sec.gov/cgi-bin/browse-edgar), with a critical assumption bound to `revenue_yoy_pct_q`. Press "Run numeric checks now". Confirm one check with a value, an `as of` date and a working link to the SEC filing index. Compare the value by hand with the 10-Q.
- [ ] Press the button again. A second check row appears and no new row appears in `alerts`.

## 5. Inngest

- [ ] Create an Inngest app, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel.
- [ ] After deploy, sync the app at `https://YOUR-DOMAIN/api/inngest` in the Inngest dashboard. Seven functions should appear: `ingest-edgar`, `ingest-fred`, `ingest-prices`, `check-on-filing`, `check-on-macro`, `check-on-price`, `weekly-sweep`.
- [ ] Trigger `ingest-edgar` by hand and confirm `filing` rows in `events` for the watched CIKs, then a `check-on-filing` run.
- [ ] Locally: `npx inngest-cli@latest dev` with `pnpm dev` to test functions without the cloud.

## 6. Vercel

- [ ] Set every variable from `.env.example` for Production (and Preview if used). `AUTH_URL` is only needed outside Vercel.
- [ ] The build command is now `next build` only. Migrations no longer run on deploy; run `pnpm db:migrate` against `DIRECT_URL` before deploying a schema change.
- [ ] Point the production deployment at the branch you choose. `main` still serves v1 until v2 is merged.

## 7. Email alerts (Resend), Phase 4

Not built yet. When Phase 4 lands: create a Resend account, verify the sending domain, set the API key. Alerts are already written to the `alerts` table and emitted as `alert.created` Inngest events, which the email function will consume.

## 8. Microsoft Entra, Phase 5

Not built yet. Only Google sign-in exists.
