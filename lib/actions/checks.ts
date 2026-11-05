import { desc, eq } from "drizzle-orm";
import { alerts, assumptions, checks, documents, evidence, indicators, theses } from "@/db/schema";
import type { Verdict } from "@/db/enums";
import type { Db, Tx } from "@/db/types";
import type { Actor } from "./context";
import { parseInput, requireUser, requireWriter, roleIn } from "./context";
import { ActionError } from "./errors";
import { writeLog } from "./log";
import { canOverride, evidenceProblem, numericVerdict, quoteAppearsIn, resolveTextVerdict, shouldAlert } from "./rules";
import { overrideVerdictSchema, runCheckSchema, type OverrideVerdictInput, type RunCheckInput } from "./schemas";

export interface CheckResult {
  checkId: string;
  verdict: Verdict;
  previousVerdict: Verdict | null;
  alertId: string | null;
}

type EvidenceDraft = Omit<typeof evidence.$inferInsert, "checkId">;

/** Lock the assumption and its thesis, and check the actor may act on them. */
async function loadAssumptionContext(tx: Tx, actor: Actor, assumptionId: string) {
  const a = (await tx.select().from(assumptions).where(eq(assumptions.id, assumptionId)).limit(1).for("update"))[0];
  if (!a) throw new ActionError("NOT_FOUND", "Assumption not found");
  const t = (await tx.select().from(theses).where(eq(theses.id, a.thesisId)).limit(1))[0];
  if (!t) throw new ActionError("NOT_FOUND", "Thesis not found");
  if (actor.type === "user") {
    const writer = await requireWriter(tx, actor);
    if (writer.firmId !== t.firmId) throw new ActionError("NOT_FOUND", "Assumption not found");
  }
  return { assumption: a, thesis: t };
}

async function latestVerdict(tx: Tx, assumptionId: string): Promise<Verdict | null> {
  const row = (
    await tx
      .select({ verdict: checks.verdict })
      .from(checks)
      .where(eq(checks.assumptionId, assumptionId))
      .orderBy(desc(checks.seq))
      .limit(1)
  )[0];
  return row ? row.verdict : null;
}

/**
 * Insert a check with its evidence, and an alert if the verdict changed.
 * Shared by runCheck and overrideVerdict.
 */
async function insertCheck(
  tx: Tx,
  ctx: { firmId: string; thesisId: string; assumptionId: string },
  check: Omit<typeof checks.$inferInsert, "assumptionId">,
  evidenceRows: EvidenceDraft[],
): Promise<CheckResult> {
  const problem = evidenceProblem(check.verdict, evidenceRows.length);
  if (problem) throw new ActionError("VALIDATION", "Check rejected", [problem]);

  const previousVerdict = await latestVerdict(tx, ctx.assumptionId);
  const row = (
    await tx
      .insert(checks)
      .values({ ...check, assumptionId: ctx.assumptionId })
      .returning({ id: checks.id, verdict: checks.verdict })
  )[0];
  for (const e of evidenceRows) {
    await tx.insert(evidence).values({ ...e, checkId: row.id, assumptionId: ctx.assumptionId });
  }

  let alertId: string | null = null;
  if (shouldAlert(previousVerdict, row.verdict)) {
    const alert = (
      await tx
        .insert(alerts)
        .values({
          firmId: ctx.firmId,
          thesisId: ctx.thesisId,
          assumptionId: ctx.assumptionId,
          checkId: row.id,
          kind: "verdict_change",
          previousVerdict,
          newVerdict: row.verdict,
        })
        .returning({ id: alerts.id })
    )[0];
    alertId = alert.id;
  }
  return { checkId: row.id, verdict: row.verdict, previousVerdict, alertId };
}

/**
 * runCheck: record a verdict for an assumption.
 * - numeric: the verdict is computed here from the indicator and the observed
 *   value (rule 4). The caller supplies data, never a verdict.
 * - text: the model's proposed verdict stands only if its quote is found
 *   verbatim in the stored document (rule 5).
 */
export async function runCheck(db: Db, actor: Actor, input: RunCheckInput): Promise<CheckResult> {
  const data = parseInput(runCheckSchema, input);
  return db.transaction(async (tx) => {
    const createdBy = actor.type === "user" ? actor.userId : null;

    if (data.kind === "numeric") {
      const ind = (await tx.select().from(indicators).where(eq(indicators.id, data.indicatorId)).limit(1))[0];
      if (!ind) throw new ActionError("NOT_FOUND", "Indicator not found");
      if (!ind.assumptionId) {
        throw new ActionError("VALIDATION", "Kill-criterion indicators are evaluated by triggerKillCriterion");
      }
      const { assumption, thesis } = await loadAssumptionContext(tx, actor, ind.assumptionId);
      if (assumption.status !== "active") throw new ActionError("CONFLICT", "Assumption is not active");
      if (thesis.status !== "open") throw new ActionError("CONFLICT", "Thesis is not open");

      const obs = data.observation;
      if (obs.value !== null && !obs.sourceUrl) {
        throw new ActionError("VALIDATION", "An observed value needs a source URL");
      }
      const verdict = numericVerdict(obs.value, {
        operator: ind.operator,
        threshold: ind.threshold,
        breakThreshold: ind.breakThreshold,
      });
      const evidenceRows: EvidenceDraft[] =
        obs.value !== null && obs.sourceUrl
          ? [
              {
                sourceUrl: obs.sourceUrl,
                docId: obs.docId ?? null,
                quote: `${obs.label}: ${obs.value}${obs.asOf ? ` (as of ${obs.asOf})` : ""}`,
                observedValue: obs.value,
                publishedAt: obs.publishedAt ? new Date(obs.publishedAt) : null,
              },
            ]
          : [];
      const result = await insertCheck(
        tx,
        { firmId: thesis.firmId, thesisId: thesis.id, assumptionId: assumption.id },
        {
          kind: "numeric",
          verdict,
          observed: {
            ...obs,
            operator: ind.operator,
            threshold: ind.threshold,
            breakThreshold: ind.breakThreshold,
          },
          indicatorId: ind.id,
          model: null,
          promptVersion: null,
          trigger: data.trigger,
          eventId: data.eventId ?? null,
          createdBy,
        },
        evidenceRows,
      );
      await writeLog(tx, actor, {
        firmId: thesis.firmId,
        action: "runCheck",
        objectType: "check",
        objectId: result.checkId,
        before: { verdict: result.previousVerdict },
        after: { kind: "numeric", assumptionId: assumption.id, verdict, value: obs.value, alertId: result.alertId },
      });
      return result;
    }

    // text
    const { assumption, thesis } = await loadAssumptionContext(tx, actor, data.assumptionId);
    if (assumption.status !== "active") throw new ActionError("CONFLICT", "Assumption is not active");
    if (thesis.status !== "open") throw new ActionError("CONFLICT", "Thesis is not open");

    const doc = data.documentId
      ? (await tx.select().from(documents).where(eq(documents.id, data.documentId)).limit(1))[0]
      : undefined;
    if (data.documentId && !doc) throw new ActionError("NOT_FOUND", "Document not found");

    const resolved = resolveTextVerdict({
      proposed: data.proposedVerdict,
      quote: data.quote,
      documentText: doc?.text ?? null,
    });
    const evidenceRows: EvidenceDraft[] =
      resolved.quoteVerified && doc && data.quote
        ? [
            {
              documentId: doc.id,
              sourceUrl: doc.sourceUrl,
              docId: doc.accession,
              quote: data.quote,
              publishedAt: doc.publishedAt,
            },
          ]
        : [];
    const result = await insertCheck(
      tx,
      { firmId: thesis.firmId, thesisId: thesis.id, assumptionId: assumption.id },
      {
        kind: "text",
        verdict: resolved.verdict,
        observed: {
          proposedVerdict: data.proposedVerdict,
          quote: data.quote,
          documentId: data.documentId,
          rationale: data.rationale ?? null,
        },
        model: data.model,
        promptVersion: data.promptVersion,
        trigger: data.trigger,
        eventId: data.eventId ?? null,
        quoteVerified: resolved.quoteVerified,
        createdBy,
      },
      evidenceRows,
    );
    await writeLog(tx, actor, {
      firmId: thesis.firmId,
      action: "runCheck",
      objectType: "check",
      objectId: result.checkId,
      before: { verdict: result.previousVerdict },
      after: {
        kind: "text",
        assumptionId: assumption.id,
        proposedVerdict: data.proposedVerdict,
        verdict: resolved.verdict,
        quoteVerified: resolved.quoteVerified,
        alertId: result.alertId,
      },
    });
    return result;
  });
}

/**
 * overrideVerdict: a PM or admin replaces a verdict. The original check is
 * kept; the override is a new check. A real verdict still needs a quote found
 * verbatim in a stored document.
 */
export async function overrideVerdict(db: Db, actor: Actor, input: OverrideVerdictInput): Promise<CheckResult> {
  const data = parseInput(overrideVerdictSchema, input);
  return db.transaction(async (tx) => {
    const user = requireUser(actor);
    const role = await roleIn(tx, user.userId, user.firmId);
    if (!canOverride(role)) throw new ActionError("FORBIDDEN", "Only a PM or admin can override a verdict");

    const original = (await tx.select().from(checks).where(eq(checks.id, data.checkId)).limit(1))[0];
    if (!original) throw new ActionError("NOT_FOUND", "Check not found");
    const { assumption, thesis } = await loadAssumptionContext(tx, actor, original.assumptionId);

    const problems: string[] = [];
    const evidenceRows: EvidenceDraft[] = [];
    for (const [i, e] of data.evidence.entries()) {
      const doc = (await tx.select().from(documents).where(eq(documents.id, e.documentId)).limit(1))[0];
      if (!doc) {
        problems.push(`evidence[${i}]: document not found`);
        continue;
      }
      if (!quoteAppearsIn(doc.text, e.quote)) {
        problems.push(`evidence[${i}]: quote not found verbatim in the document`);
        continue;
      }
      evidenceRows.push({
        documentId: doc.id,
        sourceUrl: doc.sourceUrl,
        docId: doc.accession,
        quote: e.quote,
        publishedAt: doc.publishedAt,
      });
    }
    if (problems.length > 0) throw new ActionError("VALIDATION", "Override rejected", problems);

    const result = await insertCheck(
      tx,
      { firmId: thesis.firmId, thesisId: thesis.id, assumptionId: assumption.id },
      {
        kind: "override",
        verdict: data.verdict,
        observed: { overriddenVerdict: original.verdict },
        trigger: "override",
        overridesCheckId: original.id,
        quoteVerified: evidenceRows.length > 0 ? true : null,
        note: data.reason,
        createdBy: user.userId,
      },
      evidenceRows,
    );
    await writeLog(tx, actor, {
      firmId: thesis.firmId,
      action: "overrideVerdict",
      objectType: "check",
      objectId: result.checkId,
      before: { checkId: original.id, verdict: original.verdict },
      after: { verdict: data.verdict, reason: data.reason, alertId: result.alertId },
    });
    return result;
  });
}
