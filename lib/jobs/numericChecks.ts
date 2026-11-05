// Numeric checks: for every catalog indicator on an active assumption of an
// open thesis, fetch the value, let runCheck compute the verdict in code, and
// collect alerts. Indicators on kill criteria trigger the criterion when their
// condition is met.

import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import {
  assumptions,
  indicatorCatalog,
  indicators,
  killCriteria,
  positions,
  securities,
  theses,
} from "@/db/schema";
import type { CatalogSource } from "@/db/enums";
import type { Db } from "@/db/types";
import {
  runCheck,
  systemActor,
  triggerKillCriterion,
  type Actor,
  type CheckResult,
  type NumericObservation,
} from "@/lib/actions";
import { compare, todayUtc } from "@/lib/actions/rules";
import { createResolver, SourceUnavailableError, type DataSources } from "@/lib/data/values";

export interface CheckScope {
  thesisId?: string;
  securityId?: string;
  sources?: CatalogSource[];
  /** Only indicators using this catalog source code (e.g. a FRED series id). */
  sourceCode?: string;
  trigger: "event" | "sweep" | "manual";
  eventId?: string | null;
  actor?: Actor;
}

export interface CheckRunSummary {
  checks: (CheckResult & { indicatorId: string; assumptionId: string })[];
  killCriteriaTriggered: string[];
  alertIds: string[];
  skipped: { indicatorId: string; reason: string }[];
}

function scopeFilters(scope: CheckScope): SQL[] {
  const f: SQL[] = [eq(theses.status, "open")];
  if (scope.thesisId) f.push(eq(theses.id, scope.thesisId));
  if (scope.securityId) f.push(eq(theses.securityId, scope.securityId));
  if (scope.sources && scope.sources.length > 0) f.push(inArray(indicatorCatalog.source, scope.sources));
  if (scope.sourceCode) f.push(eq(indicatorCatalog.sourceCode, scope.sourceCode));
  if (scope.actor && scope.actor.type === "user") f.push(eq(theses.firmId, scope.actor.firmId));
  return f;
}

export async function runNumericChecks(
  db: Db,
  sources: DataSources,
  scope: CheckScope,
  opts: { now?: Date } = {},
): Promise<CheckRunSummary> {
  const actor = scope.actor ?? systemActor("check.assumption");
  const resolver = createResolver(sources, { today: todayUtc(opts.now) });
  const filters = scopeFilters(scope);

  const select = {
    indicator: indicators,
    catalog: indicatorCatalog,
    ticker: securities.ticker,
    cik: securities.cik,
    entryDate: positions.entryDate,
  };

  const assumptionRows = await db
    .select({ ...select, assumptionId: assumptions.id })
    .from(indicators)
    .innerJoin(indicatorCatalog, eq(indicators.catalogId, indicatorCatalog.id))
    .innerJoin(assumptions, eq(indicators.assumptionId, assumptions.id))
    .innerJoin(theses, eq(assumptions.thesisId, theses.id))
    .innerJoin(securities, eq(theses.securityId, securities.id))
    .leftJoin(positions, eq(positions.thesisId, theses.id))
    .where(and(eq(assumptions.status, "active"), ...filters));

  const killRows = await db
    .select({ ...select, killCriterionId: killCriteria.id })
    .from(indicators)
    .innerJoin(indicatorCatalog, eq(indicators.catalogId, indicatorCatalog.id))
    .innerJoin(killCriteria, eq(indicators.killCriterionId, killCriteria.id))
    .innerJoin(theses, eq(killCriteria.thesisId, theses.id))
    .innerJoin(securities, eq(theses.securityId, securities.id))
    .leftJoin(positions, eq(positions.thesisId, theses.id))
    .where(and(isNull(killCriteria.triggeredAt), ...filters));

  const summary: CheckRunSummary = { checks: [], killCriteriaTriggered: [], alertIds: [], skipped: [] };

  for (const row of assumptionRows) {
    let observation: NumericObservation;
    try {
      observation = await resolver.observe(row.catalog, { ticker: row.ticker, cik: row.cik, entryDate: row.entryDate });
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.message : `fetch failed: ${(err as Error).message}`;
      summary.skipped.push({ indicatorId: row.indicator.id, reason });
      continue;
    }
    const result = await runCheck(db, actor, {
      kind: "numeric",
      indicatorId: row.indicator.id,
      trigger: scope.trigger,
      eventId: scope.eventId ?? null,
      observation,
    });
    summary.checks.push({ ...result, indicatorId: row.indicator.id, assumptionId: row.assumptionId });
    if (result.alertId) summary.alertIds.push(result.alertId);
  }

  const done = new Set<string>();
  for (const row of killRows) {
    if (done.has(row.killCriterionId)) continue;
    let observation: NumericObservation;
    try {
      observation = await resolver.observe(row.catalog, { ticker: row.ticker, cik: row.cik, entryDate: row.entryDate });
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.message : `fetch failed: ${(err as Error).message}`;
      summary.skipped.push({ indicatorId: row.indicator.id, reason });
      continue;
    }
    const v = observation.value;
    if (v === null || !compare(v, row.indicator.operator, row.indicator.threshold)) continue;
    const r = await triggerKillCriterion(db, actor, {
      killCriterionId: row.killCriterionId,
      reason: `${observation.label} = ${v}${observation.asOf ? ` as of ${observation.asOf}` : ""} (${row.indicator.operator} ${row.indicator.threshold})${observation.sourceUrl ? `; source ${observation.sourceUrl}` : ""}`,
    });
    done.add(row.killCriterionId);
    summary.killCriteriaTriggered.push(row.killCriterionId);
    summary.alertIds.push(r.alertId);
  }
  return summary;
}
