import { and, eq, inArray } from "drizzle-orm";
import { assumptions, killCriteria, outcomes, positions, securities, theses } from "@/db/schema";
import type { Role } from "@/db/enums";
import type { Db, Tx } from "@/db/types";
import type { Actor, ThesisRow } from "./context";
import { loadThesisForUpdate, parseInput, requireWriter } from "./context";
import { ActionError } from "./errors";
import { insertIndicator, validateIndicatorSpecs } from "./indicators";
import { writeLog } from "./log";
import { assumptionProblems, todayUtc } from "./rules";
import {
  closeThesisSchema,
  confirmExtractionSchema,
  createThesisSchema,
  reviseThesisSchema,
  type AssumptionInput,
  type CloseThesisInput,
  type ConfirmExtractionInput,
  type CreateThesisInput,
  type IndicatorSpec,
  type ReviseThesisInput,
} from "./schemas";
import { buildSnapshot, freezeVersion } from "./snapshot";

export interface ActionOptions {
  /** Clock override for tests. */
  now?: Date;
}

/** Authors may change their own theses; PMs and admins may change any in the firm. */
export function requireAuthorOrPm(role: Role, userId: string, thesis: ThesisRow): void {
  if (thesis.authorId === userId || role === "pm" || role === "admin") return;
  throw new ActionError("FORBIDDEN", "Only the author, a PM or an admin can change this thesis");
}

async function getOrCreateSecurity(
  tx: Tx,
  s: { ticker: string; cik: string | null; name: string | null },
): Promise<typeof securities.$inferSelect> {
  const existing = (await tx.select().from(securities).where(eq(securities.ticker, s.ticker)).limit(1))[0];
  if (existing) {
    if (s.cik && existing.cik && s.cik !== existing.cik) {
      throw new ActionError("VALIDATION", `Ticker ${s.ticker} is already stored with CIK ${existing.cik}`);
    }
    return existing;
  }
  const rows = await tx
    .insert(securities)
    .values({ ticker: s.ticker, cik: s.cik, name: s.name })
    .returning();
  return rows[0];
}

/** Validate assumptions (rule 3) and their indicators (rule 6) together. */
async function validateAssumptionsAndKills(
  tx: Tx,
  list: AssumptionInput[],
  kills: { condition: string; indicators: IndicatorSpec[] }[],
  today: string,
  prefix: string,
): Promise<Map<string, string>> {
  const problems: string[] = [];
  list.forEach((a, i) => {
    for (const p of assumptionProblems(a, today)) problems.push(`${prefix}[${i}]: ${p}`);
  });
  if (problems.length > 0) {
    throw new ActionError("VALIDATION", "Assumptions rejected", problems);
  }
  const specs = [
    ...list.flatMap((a, i) => a.indicators.map((spec, j) => ({ path: `${prefix}[${i}].indicators[${j}]`, spec }))),
    ...kills.flatMap((k, i) => k.indicators.map((spec, j) => ({ path: `killCriteria[${i}].indicators[${j}]`, spec }))),
  ];
  return validateIndicatorSpecs(tx, specs);
}

async function insertAssumptions(
  tx: Tx,
  thesisId: string,
  list: AssumptionInput[],
  catalogIds: Map<string, string>,
  createdBy: string,
  startOrder: number,
): Promise<void> {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const row = (
      await tx
        .insert(assumptions)
        .values({
          thesisId,
          text: a.text,
          falsifiableText: a.falsifiableText,
          critical: a.critical,
          category: a.category,
          probability: a.probability ?? null,
          resolveBy: a.resolveBy ? a.resolveBy : null,
          sortOrder: startOrder + i,
        })
        .returning({ id: assumptions.id })
    )[0];
    for (const spec of a.indicators) {
      await insertIndicator(tx, catalogIds.get(spec.catalogKey) as string, spec, { assumptionId: row.id }, createdBy);
    }
  }
}

async function insertKillCriteria(
  tx: Tx,
  thesisId: string,
  list: { condition: string; indicators: IndicatorSpec[] }[],
  catalogIds: Map<string, string>,
  createdBy: string,
  startOrder: number,
): Promise<void> {
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    const row = (
      await tx
        .insert(killCriteria)
        .values({ thesisId, condition: k.condition, sortOrder: startOrder + i })
        .returning({ id: killCriteria.id })
    )[0];
    for (const spec of k.indicators) {
      await insertIndicator(tx, catalogIds.get(spec.catalogKey) as string, spec, { killCriterionId: row.id }, createdBy);
    }
  }
}

// ---------- createThesis ----------

export async function createThesisTx(tx: Tx, actor: Actor, input: CreateThesisInput) {
  const data = parseInput(createThesisSchema, input);
  const writer = await requireWriter(tx, actor);
  const security = await getOrCreateSecurity(tx, {
    ticker: data.ticker,
    cik: data.cik ?? null,
    name: data.securityName ?? null,
  });
  const thesis = (
    await tx
      .insert(theses)
      .values({
        firmId: writer.firmId,
        securityId: security.id,
        authorId: writer.userId,
        claim: data.claim,
        direction: data.direction,
        horizonMonths: data.horizonMonths,
        convictionPct: data.convictionPct,
        status: "draft",
        currentVersion: 0,
        memoText: data.memoText ?? null,
        draftExtraction: data.draftExtraction ?? null,
      })
      .returning()
  )[0];
  if (data.position) {
    await tx.insert(positions).values({
      thesisId: thesis.id,
      sizePct: data.position.sizePct,
      entryDate: data.position.entryDate ?? null,
      entryPrice: data.position.entryPrice ?? null,
    });
  }
  await writeLog(tx, actor, {
    firmId: writer.firmId,
    action: "createThesis",
    objectType: "thesis",
    objectId: thesis.id,
    after: {
      thesis: { ...thesis, memoText: undefined, draftExtraction: undefined },
      security: { id: security.id, ticker: security.ticker, cik: security.cik },
      position: data.position ?? null,
    },
  });
  return thesis;
}

/** createThesis: start a draft thesis for a security. */
export async function createThesis(db: Db, actor: Actor, input: CreateThesisInput) {
  return db.transaction((tx) => createThesisTx(tx, actor, input));
}

// ---------- confirmExtraction ----------

export async function confirmExtractionTx(
  tx: Tx,
  actor: Actor,
  input: ConfirmExtractionInput,
  opts: ActionOptions = {},
) {
  const data = parseInput(confirmExtractionSchema, input);
  const writer = await requireWriter(tx, actor);
  const thesis = await loadThesisForUpdate(tx, actor, data.thesisId);
  requireAuthorOrPm(writer.role, writer.userId, thesis);
  if (thesis.status !== "draft") {
    throw new ActionError("CONFLICT", "Only a draft thesis can be confirmed");
  }
  const today = todayUtc(opts.now);
  const catalogIds = await validateAssumptionsAndKills(tx, data.assumptions, data.killCriteria, today, "assumptions");

  await insertAssumptions(tx, thesis.id, data.assumptions, catalogIds, writer.userId, 0);
  await insertKillCriteria(tx, thesis.id, data.killCriteria, catalogIds, writer.userId, 0);
  await tx
    .update(theses)
    .set({
      claim: data.claim ?? thesis.claim,
      direction: data.direction ?? thesis.direction,
      horizonMonths: data.horizonMonths ?? thesis.horizonMonths,
      convictionPct: data.convictionPct ?? thesis.convictionPct,
      status: "open",
      currentVersion: 1,
      updatedAt: opts.now ?? new Date(),
    })
    .where(eq(theses.id, thesis.id));
  const snapshot = await freezeVersion(tx, thesis.id, 1, "Initial confirmed extraction", writer.userId);

  await writeLog(tx, actor, {
    firmId: thesis.firmId,
    action: "confirmExtraction",
    objectType: "thesis",
    objectId: thesis.id,
    before: { status: thesis.status, draftExtraction: thesis.draftExtraction },
    after: snapshot,
  });
  return snapshot;
}

/** confirmExtraction: the analyst's reviewed assumptions become the thesis, version 1. */
export async function confirmExtraction(db: Db, actor: Actor, input: ConfirmExtractionInput, opts: ActionOptions = {}) {
  return db.transaction((tx) => confirmExtractionTx(tx, actor, input, opts));
}

/**
 * createThesis and confirmExtraction in one transaction, for flows where the
 * analyst reviews before anything is saved. Writes both action_log rows.
 */
export async function createConfirmedThesis(
  db: Db,
  actor: Actor,
  input: { thesis: CreateThesisInput; extraction: Omit<ConfirmExtractionInput, "thesisId"> },
  opts: ActionOptions = {},
) {
  return db.transaction(async (tx) => {
    const thesis = await createThesisTx(tx, actor, input.thesis);
    return confirmExtractionTx(tx, actor, { ...input.extraction, thesisId: thesis.id }, opts);
  });
}

// ---------- reviseThesis ----------

/** reviseThesis: change an open thesis, freeze a new version, require a reason. */
export async function reviseThesis(db: Db, actor: Actor, input: ReviseThesisInput, opts: ActionOptions = {}) {
  const data = parseInput(reviseThesisSchema, input);
  return db.transaction(async (tx) => {
    const writer = await requireWriter(tx, actor);
    const thesis = await loadThesisForUpdate(tx, actor, data.thesisId);
    requireAuthorOrPm(writer.role, writer.userId, thesis);
    if (thesis.status !== "open") throw new ActionError("CONFLICT", "Only an open thesis can be revised");

    const thesisFieldsChanged =
      (data.claim !== undefined && data.claim !== thesis.claim) ||
      (data.direction !== undefined && data.direction !== thesis.direction) ||
      (data.horizonMonths !== undefined && data.horizonMonths !== thesis.horizonMonths) ||
      (data.convictionPct !== undefined && data.convictionPct !== thesis.convictionPct);
    if (
      !thesisFieldsChanged &&
      data.assumptionChanges.length === 0 &&
      data.addAssumptions.length === 0 &&
      data.retireAssumptionIds.length === 0 &&
      data.addKillCriteria.length === 0
    ) {
      throw new ActionError("VALIDATION", "Nothing to revise");
    }

    const before = await buildSnapshot(tx, thesis.id);
    const today = todayUtc(opts.now);
    const touchedIds = [...data.assumptionChanges.map((c) => c.assumptionId), ...data.retireAssumptionIds];
    const existing: (typeof assumptions.$inferSelect)[] = touchedIds.length
      ? await tx
          .select()
          .from(assumptions)
          .where(and(eq(assumptions.thesisId, thesis.id), inArray(assumptions.id, touchedIds)))
      : [];
    const byId = new Map(existing.map((a) => [a.id, a]));

    const problems: string[] = [];
    for (const id of touchedIds) {
      const a = byId.get(id);
      if (!a) problems.push(`assumption ${id} is not part of this thesis`);
      else if (a.status !== "active") problems.push(`assumption ${id} is not active`);
    }
    data.assumptionChanges.forEach((c, i) => {
      const a = byId.get(c.assumptionId);
      if (!a) return;
      const merged = {
        text: c.text ?? a.text,
        falsifiableText: c.falsifiableText ?? a.falsifiableText,
        critical: c.critical ?? a.critical,
        probability: c.probability !== undefined ? c.probability : a.probability,
        resolveBy: c.resolveBy !== undefined ? c.resolveBy : a.resolveBy,
      };
      // An unchanged resolve_by may already be in the past; only new dates must be in the future.
      const dateFloor = c.resolveBy !== undefined ? today : "0000-00-00";
      for (const p of assumptionProblems(merged, dateFloor)) problems.push(`assumptionChanges[${i}]: ${p}`);
    });
    if (problems.length > 0) throw new ActionError("VALIDATION", "Revision rejected", problems);

    const catalogIds = await validateAssumptionsAndKills(tx, data.addAssumptions, data.addKillCriteria, today, "addAssumptions");
    const now = opts.now ?? new Date();

    for (const c of data.assumptionChanges) {
      const a = byId.get(c.assumptionId);
      if (!a) continue;
      await tx
        .update(assumptions)
        .set({
          text: c.text ?? a.text,
          falsifiableText: c.falsifiableText ?? a.falsifiableText,
          critical: c.critical ?? a.critical,
          category: c.category ?? a.category,
          probability: c.probability !== undefined ? c.probability : a.probability,
          resolveBy: c.resolveBy !== undefined ? c.resolveBy || null : a.resolveBy,
          updatedAt: now,
        })
        .where(eq(assumptions.id, a.id));
    }
    if (data.retireAssumptionIds.length > 0) {
      await tx
        .update(assumptions)
        .set({ status: "retired", updatedAt: now })
        .where(inArray(assumptions.id, data.retireAssumptionIds));
    }
    await insertAssumptions(tx, thesis.id, data.addAssumptions, catalogIds, writer.userId, before.assumptions.length);
    await insertKillCriteria(tx, thesis.id, data.addKillCriteria, catalogIds, writer.userId, before.killCriteria.length);

    const version = thesis.currentVersion + 1;
    await tx
      .update(theses)
      .set({
        claim: data.claim ?? thesis.claim,
        direction: data.direction ?? thesis.direction,
        horizonMonths: data.horizonMonths ?? thesis.horizonMonths,
        convictionPct: data.convictionPct ?? thesis.convictionPct,
        currentVersion: version,
        updatedAt: now,
      })
      .where(eq(theses.id, thesis.id));
    const after = await freezeVersion(tx, thesis.id, version, data.reason, writer.userId);

    await writeLog(tx, actor, {
      firmId: thesis.firmId,
      action: "reviseThesis",
      objectType: "thesis",
      objectId: thesis.id,
      before,
      after: { reason: data.reason, version, snapshot: after },
    });
    return { version, snapshot: after };
  });
}

// ---------- closeThesis ----------

/** closeThesis: record the thesis outcome and freeze a final version. */
export async function closeThesis(db: Db, actor: Actor, input: CloseThesisInput, opts: ActionOptions = {}) {
  const data = parseInput(closeThesisSchema, input);
  return db.transaction(async (tx) => {
    const writer = await requireWriter(tx, actor);
    const thesis = await loadThesisForUpdate(tx, actor, data.thesisId);
    requireAuthorOrPm(writer.role, writer.userId, thesis);
    if (thesis.status !== "open") throw new ActionError("CONFLICT", "Only an open thesis can be closed");

    const now = opts.now ?? new Date();
    const outcome = (
      await tx
        .insert(outcomes)
        .values({
          thesisId: thesis.id,
          kind: "thesis",
          thesisReturnPct: data.thesisReturnPct ?? null,
          benchmarkReturnPct: data.benchmarkReturnPct ?? null,
          note: data.reason,
          resolvedBy: writer.userId,
        })
        .returning()
    )[0];
    const version = thesis.currentVersion + 1;
    await tx
      .update(theses)
      .set({ status: "closed", closedAt: now, updatedAt: now, currentVersion: version })
      .where(eq(theses.id, thesis.id));
    const snapshot = await freezeVersion(tx, thesis.id, version, `Closed: ${data.reason}`, writer.userId);

    await writeLog(tx, actor, {
      firmId: thesis.firmId,
      action: "closeThesis",
      objectType: "thesis",
      objectId: thesis.id,
      before: { status: thesis.status },
      after: { status: "closed", outcome, version },
    });
    return { outcome, snapshot };
  });
}
