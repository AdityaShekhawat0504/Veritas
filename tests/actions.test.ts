import { beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import {
  actionLog,
  alerts,
  assumptions,
  checks,
  evidence,
  indicators,
  outcomes,
  positions,
  theses,
  thesisVersions,
} from "@/db/schema";
import {
  bindIndicator,
  closeThesis,
  confirmExtraction,
  createConfirmedThesis,
  createThesis,
  overrideVerdict,
  recordDecision,
  resolveAssumption,
  reviseThesis,
  runCheck,
  storeDocument,
  triggerKillCriterion,
} from "@/lib/actions";
import {
  NOW,
  THESIS_INPUT,
  createWorld,
  criticalAssumption,
  expectReject,
  supportingAssumption,
  type World,
} from "./helpers/db";

let w: World;

beforeAll(async () => {
  w = await createWorld();
});

async function logFor(objectId: string) {
  return w.db.select().from(actionLog).where(eq(actionLog.objectId, objectId)).orderBy(asc(actionLog.seq));
}

async function countLog(): Promise<number> {
  return (await w.db.select({ id: actionLog.id }).from(actionLog)).length;
}

/** An open thesis with one critical (numeric) and one supporting assumption. */
async function openThesis(ticker = "EXMP") {
  const snapshot = await createConfirmedThesis(
    w.db,
    w.analyst,
    {
      thesis: { ...THESIS_INPUT, ticker, cik: null, position: { sizePct: 2, entryDate: "2026-01-02", entryPrice: 100 } },
      extraction: {
        assumptions: [criticalAssumption(), supportingAssumption()],
        killCriteria: [
          {
            condition: "Gross margin falls below 35%",
            indicators: [{ catalogKey: "gross_margin_pct_q", operator: "lt", threshold: 35 }],
          },
        ],
      },
    },
    { now: NOW },
  );
  const critical = snapshot.assumptions[0];
  return { snapshot, thesisId: snapshot.thesis.id, critical, indicatorId: critical.indicators[0].id };
}

function obs(value: number | null) {
  return {
    value,
    asOf: "2025-12-31",
    label: "Revenue growth y/y",
    sourceUrl: value === null ? null : "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/0000000001-26-000001-index.htm",
    docId: "0000000001-26-000001",
  };
}

describe("createThesis and confirmExtraction", () => {
  it("creates a draft, then confirms it into version 1, logging both steps", async () => {
    const draft = await createThesis(w.db, w.analyst, { ...THESIS_INPUT, ticker: "DRFT", cik: null });
    expect(draft.status).toBe("draft");
    const snap = await confirmExtraction(
      w.db,
      w.analyst,
      { thesisId: draft.id, assumptions: [criticalAssumption(), supportingAssumption()] },
      { now: NOW },
    );
    expect(snap.thesis.status).toBe("open");
    expect(snap.assumptions).toHaveLength(2);
    expect(snap.assumptions[0].indicators[0].catalogKey).toBe("revenue_yoy_pct_q");

    const versions = await w.db.select().from(thesisVersions).where(eq(thesisVersions.thesisId, draft.id));
    expect(versions.map((v) => v.version)).toEqual([1]);
    const log = await logFor(draft.id);
    expect(log.map((l) => l.action)).toEqual(["createThesis", "confirmExtraction"]);
    expect(log[1].actorId).toBe(w.analyst.userId);
  });

  it("rule 3: rejects the whole save when a critical assumption lacks probability", async () => {
    const draft = await createThesis(w.db, w.analyst, { ...THESIS_INPUT, ticker: "NOPR", cik: null });
    const before = await countLog();
    await expectReject(
      confirmExtraction(
        w.db,
        w.analyst,
        { thesisId: draft.id, assumptions: [supportingAssumption(), criticalAssumption({ probability: null })] },
        { now: NOW },
      ),
      /critical assumptions need a probability/,
    );
    const rows = await w.db.select().from(assumptions).where(eq(assumptions.thesisId, draft.id));
    expect(rows).toHaveLength(0);
    expect(await countLog()).toBe(before);
  });

  it("rule 3: rejects a critical assumption without resolve_by", async () => {
    const draft = await createThesis(w.db, w.analyst, { ...THESIS_INPUT, ticker: "NORB", cik: null });
    await expectReject(
      confirmExtraction(w.db, w.analyst, { thesisId: draft.id, assumptions: [criticalAssumption({ resolveBy: null })] }, { now: NOW }),
      /resolve_by/,
    );
  });

  it("rule 3: the database refuses a critical assumption without a forecast", async () => {
    const { thesisId } = await openThesis("DBRL");
    await expectReject(
      w.client.query(
        `INSERT INTO assumptions (thesis_id, text, falsifiable_text, critical, category) VALUES ($1, 'x', 'x', true, 'other')`,
        [thesisId],
      ),
      /critical_needs_forecast/,
    );
  });

  it("rule 6: rejects indicators that are not in the catalog", async () => {
    const draft = await createThesis(w.db, w.analyst, { ...THESIS_INPUT, ticker: "NOCT", cik: null });
    await expectReject(
      confirmExtraction(
        w.db,
        w.analyst,
        {
          thesisId: draft.id,
          assumptions: [
            criticalAssumption({ indicators: [{ catalogKey: "made_up_metric", operator: "gt", threshold: 1 }] }),
          ],
        },
        { now: NOW },
      ),
      /not in indicator_catalog/,
    );
  });

  it("cannot confirm twice", async () => {
    const { thesisId } = await openThesis("TWCE");
    await expectReject(
      confirmExtraction(w.db, w.analyst, { thesisId, assumptions: [criticalAssumption()] }, { now: NOW }),
      /Only a draft/,
    );
  });

  it("viewers cannot write and other firms cannot see the thesis", async () => {
    await expectReject(createThesis(w.db, w.viewer, { ...THESIS_INPUT, ticker: "VIEW", cik: null }), /Viewers/);
    const draft = await createThesis(w.db, w.analyst, { ...THESIS_INPUT, ticker: "PRIV", cik: null });
    await expectReject(
      confirmExtraction(w.db, w.outsider, { thesisId: draft.id, assumptions: [criticalAssumption()] }, { now: NOW }),
      /not found/i,
    );
  });

  it("system actors cannot create theses", async () => {
    await expectReject(createThesis(w.db, w.system, { ...THESIS_INPUT, ticker: "SYST", cik: null }), /signed-in user/);
  });
});

describe("rule 1: action_log is written in the same transaction", () => {
  it("rolls back the log when the action fails after writing", async () => {
    const before = await countLog();
    const thesesBefore = (await w.db.select({ id: theses.id }).from(theses)).length;
    // createConfirmedThesis writes the thesis and its log row, then confirm fails on rule 3.
    await expectReject(
      createConfirmedThesis(
        w.db,
        w.analyst,
        {
          thesis: { ...THESIS_INPUT, ticker: "RLBK", cik: null },
          extraction: { assumptions: [criticalAssumption({ probability: undefined })] },
        },
        { now: NOW },
      ),
      /probability/,
    );
    expect(await countLog()).toBe(before);
    expect((await w.db.select({ id: theses.id }).from(theses)).length).toBe(thesesBefore);
  });
});

describe("bindIndicator", () => {
  it("binds a catalog indicator and logs it", async () => {
    const { snapshot } = await openThesis("BIND");
    const supporting = snapshot.assumptions[1];
    const row = await bindIndicator(w.db, w.analyst, {
      assumptionId: supporting.id,
      catalogKey: "gross_margin_pct_q",
      operator: "gte",
      threshold: 40,
    });
    expect(row.assumptionId).toBe(supporting.id);
    expect((await logFor(row.id)).map((l) => l.action)).toEqual(["bindIndicator"]);
  });

  it("rule 6: refuses unknown catalog keys and bad break thresholds", async () => {
    const { snapshot } = await openThesis("BIN2");
    const id = snapshot.assumptions[1].id;
    await expectReject(
      bindIndicator(w.db, w.analyst, { assumptionId: id, catalogKey: "nope", operator: "gt", threshold: 1 }),
      /not in indicator_catalog/,
    );
    await expectReject(
      bindIndicator(w.db, w.analyst, { assumptionId: id, catalogKey: "gross_margin_pct_q", operator: "gt", threshold: 40, breakThreshold: 45 }),
      /break threshold/,
    );
  });
});

describe("runCheck (numeric)", () => {
  it("rule 4: computes the verdict in code and stores no model", async () => {
    const { critical, indicatorId } = await openThesis("NUM1");
    const r = await runCheck(w.db, w.system, { kind: "numeric", indicatorId, trigger: "sweep", observation: obs(14) });
    expect(r.verdict).toBe("supported");
    const row = (await w.db.select().from(checks).where(eq(checks.id, r.checkId)))[0];
    expect(row.model).toBeNull();
    expect(row.promptVersion).toBeNull();
    expect(row.assumptionId).toBe(critical.id);
    const ev = await w.db.select().from(evidence).where(eq(evidence.checkId, r.checkId));
    expect(ev).toHaveLength(1);
    expect(ev[0].observedValue).toBe(14);
    expect((await logFor(r.checkId)).map((l) => l.action)).toEqual(["runCheck"]);
  });

  it("rule 4: the database rejects a numeric check that names a model", async () => {
    const { critical, indicatorId } = await openThesis("NUM2");
    await expectReject(
      w.client.query(
        `INSERT INTO checks (assumption_id, kind, verdict, indicator_id, model, prompt_version, trigger)
         VALUES ($1, 'numeric', 'insufficient_evidence', $2, 'some-model', 'p@1', 'manual')`,
        [critical.id, indicatorId],
      ),
      /numeric_has_no_model/,
    );
  });

  it("rule 8: alerts only when the verdict changes", async () => {
    const { indicatorId } = await openThesis("ALRT");
    const run = (v: number | null) =>
      runCheck(w.db, w.system, { kind: "numeric", indicatorId, trigger: "sweep", observation: obs(v) });
    const first = await run(14);
    expect(first.alertId).toBeNull();
    const same = await run(15);
    expect(same.verdict).toBe("supported");
    expect(same.alertId).toBeNull();
    const weak = await run(7);
    expect(weak.verdict).toBe("weakened");
    expect(weak.previousVerdict).toBe("supported");
    expect(weak.alertId).not.toBeNull();
    const weakAgain = await run(6);
    expect(weakAgain.alertId).toBeNull();
    const broken = await run(2);
    expect(broken.verdict).toBe("contradicted");
    expect(broken.alertId).not.toBeNull();
    const assumptionId = (await w.db.select().from(checks).where(eq(checks.id, broken.checkId)))[0].assumptionId;
    const rows = await w.db
      .select()
      .from(alerts)
      .where(eq(alerts.assumptionId, assumptionId))
      .orderBy(asc(alerts.createdAt));
    expect(rows.map((a) => a.newVerdict)).toEqual(["weakened", "contradicted"]);
  });

  it("missing data gives insufficient_evidence with no evidence row", async () => {
    const { indicatorId } = await openThesis("MISS");
    const r = await runCheck(w.db, w.system, { kind: "numeric", indicatorId, trigger: "sweep", observation: obs(null) });
    expect(r.verdict).toBe("insufficient_evidence");
    expect(await w.db.select().from(evidence).where(eq(evidence.checkId, r.checkId))).toHaveLength(0);
  });

  it("kill-criterion indicators cannot be run as assumption checks", async () => {
    const { snapshot } = await openThesis("KILI");
    const killIndicatorId = snapshot.killCriteria[0].indicators[0].id;
    await expectReject(
      runCheck(w.db, w.system, { kind: "numeric", indicatorId: killIndicatorId, trigger: "sweep", observation: obs(1) }),
      /triggerKillCriterion/,
    );
  });
});

describe("runCheck (text)", () => {
  const DOC_TEXT =
    "EXAMPLE CORP quarterly report (test fixture). Revenue declined 8% compared with the prior-year quarter as demand softened.";

  it("rule 5: keeps a verdict whose quote is verbatim in the stored document", async () => {
    const { critical } = await openThesis("TXT1");
    const { document } = await storeDocument(w.db, w.system, {
      sourceUrl: "https://example.com/filings/txt1-10q.htm",
      docType: "10-Q",
      text: DOC_TEXT,
    });
    const r = await runCheck(w.db, w.system, {
      kind: "text",
      assumptionId: critical.id,
      trigger: "event",
      model: "mock-model",
      promptVersion: "text-check@test",
      proposedVerdict: "contradicted",
      quote: "Revenue declined 8% compared with the prior-year quarter",
      documentId: document.id,
    });
    expect(r.verdict).toBe("contradicted");
    expect(r.alertId).not.toBeNull();
    const ev = await w.db.select().from(evidence).where(eq(evidence.checkId, r.checkId));
    expect(ev[0].documentId).toBe(document.id);
  });

  it("rule 5: a quote not found in the document becomes insufficient_evidence", async () => {
    const { critical } = await openThesis("TXT2");
    const { document } = await storeDocument(w.db, w.system, {
      sourceUrl: "https://example.com/filings/txt2-10q.htm",
      docType: "10-Q",
      text: DOC_TEXT,
    });
    const r = await runCheck(w.db, w.system, {
      kind: "text",
      assumptionId: critical.id,
      trigger: "event",
      model: "mock-model",
      promptVersion: "text-check@test",
      proposedVerdict: "contradicted",
      quote: "Revenue collapsed 40% as the company lost its largest customer",
      documentId: document.id,
    });
    expect(r.verdict).toBe("insufficient_evidence");
    const row = (await w.db.select().from(checks).where(eq(checks.id, r.checkId)))[0];
    expect(row.quoteVerified).toBe(false);
  });

  it("rule 5: the database refuses a contradicted check with no evidence", async () => {
    const { critical } = await openThesis("TXT3");
    await expectReject(
      w.client.exec(
        `BEGIN; INSERT INTO checks (assumption_id, kind, verdict, model, prompt_version, trigger)
         VALUES ('${critical.id}', 'text', 'contradicted', 'm', 'p@1', 'manual'); COMMIT;`,
      ),
      /no evidence/,
    );
    await w.client.exec("ROLLBACK;").catch(() => undefined);
  });
});

describe("overrideVerdict", () => {
  it("only PMs override, a reason is required, and contradicted needs a verified quote", async () => {
    const { indicatorId } = await openThesis("OVRD");
    const c = await runCheck(w.db, w.system, { kind: "numeric", indicatorId, trigger: "sweep", observation: obs(14) });
    await expectReject(
      overrideVerdict(w.db, w.analyst, { checkId: c.checkId, verdict: "weakened", reason: "Analyst disagrees" }),
      /PM or admin/,
    );
    await expectReject(
      overrideVerdict(w.db, w.pm, { checkId: c.checkId, verdict: "contradicted", reason: "Guidance cut on the call" }),
      /needs at least one evidence row/,
    );
    const { document } = await storeDocument(w.db, w.system, {
      sourceUrl: "https://example.com/filings/ovrd-8k.htm",
      docType: "8-K",
      text: "The company lowered its full-year revenue outlook to a range below prior guidance.",
    });
    await expectReject(
      overrideVerdict(w.db, w.pm, {
        checkId: c.checkId,
        verdict: "contradicted",
        reason: "Guidance cut",
        evidence: [{ documentId: document.id, quote: "The company withdrew all guidance for the year" }],
      }),
      /not found verbatim/,
    );
    const r = await overrideVerdict(w.db, w.pm, {
      checkId: c.checkId,
      verdict: "contradicted",
      reason: "Guidance cut",
      evidence: [{ documentId: document.id, quote: "lowered its full-year revenue outlook" }],
    });
    expect(r.verdict).toBe("contradicted");
    expect(r.previousVerdict).toBe("supported");
    expect(r.alertId).not.toBeNull();
    const row = (await w.db.select().from(checks).where(eq(checks.id, r.checkId)))[0];
    expect(row.kind).toBe("override");
    expect(row.overridesCheckId).toBe(c.checkId);
    // The original check is untouched.
    expect((await w.db.select().from(checks).where(eq(checks.id, c.checkId)))[0].verdict).toBe("supported");
  });
});

describe("recordDecision", () => {
  it("updates the position and logs before and after", async () => {
    const { thesisId } = await openThesis("DCSN");
    const d = await recordDecision(w.db, w.pm, { thesisId, action: "add", sizeChangePct: 1, rationale: "Checks all supported, adding" });
    expect(d.sizeAfterPct).toBe(3);
    const pos = (await w.db.select().from(positions).where(eq(positions.thesisId, thesisId)))[0];
    expect(pos.sizePct).toBe(3);
    const log = await logFor(d.id);
    expect(log[0].before).toEqual({ sizePct: 2 });
    const exit = await recordDecision(w.db, w.pm, { thesisId, action: "exit", rationale: "Kill criterion hit, exiting" });
    expect(exit.sizeAfterPct).toBe(0);
  });

  it("rejects a decision without a real rationale or with inconsistent size", async () => {
    const { thesisId } = await openThesis("DCS2");
    await expectReject(recordDecision(w.db, w.pm, { thesisId, action: "add", sizeChangePct: 1, rationale: "ok" }), /rationale/);
    await expectReject(
      recordDecision(w.db, w.pm, { thesisId, action: "trim", sizeChangePct: -5, rationale: "Trimming on valuation" }),
      /larger than the position/,
    );
  });
});

describe("reviseThesis", () => {
  it("freezes a new version with the reason and keeps the old one", async () => {
    const { thesisId, critical } = await openThesis("RVSE");
    const r = await reviseThesis(
      w.db,
      w.analyst,
      {
        thesisId,
        reason: "Q3 print lowered my confidence",
        convictionPct: 55,
        assumptionChanges: [{ assumptionId: critical.id, probability: 0.55 }],
      },
      { now: NOW },
    );
    expect(r.version).toBe(2);
    const versions = await w.db
      .select()
      .from(thesisVersions)
      .where(eq(thesisVersions.thesisId, thesisId))
      .orderBy(asc(thesisVersions.version));
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[1].reason).toBe("Q3 print lowered my confidence");
    const v1 = versions[0].snapshot as { assumptions: { probability: number }[] };
    const v2 = versions[1].snapshot as { assumptions: { probability: number }[] };
    expect(v1.assumptions[0].probability).toBe(0.7);
    expect(v2.assumptions[0].probability).toBe(0.55);
  });

  it("requires a reason and keeps rule 3 on edits", async () => {
    const { thesisId, critical } = await openThesis("RVS2");
    await expectReject(reviseThesis(w.db, w.analyst, { thesisId, reason: "", convictionPct: 10 }), /reason/);
    await expectReject(
      reviseThesis(
        w.db,
        w.analyst,
        { thesisId, reason: "drop forecast", assumptionChanges: [{ assumptionId: critical.id, probability: null }] },
        { now: NOW },
      ),
      /critical assumptions need a probability/,
    );
    await expectReject(reviseThesis(w.db, w.analyst, { thesisId, reason: "no change" }), /Nothing to revise/);
  });

  it("a PM can revise an analyst's thesis", async () => {
    const { thesisId } = await openThesis("RVS3");
    const r = await reviseThesis(w.db, w.pm, { thesisId, reason: "PM resets conviction", convictionPct: 40 }, { now: NOW });
    expect(r.version).toBe(2);
  });
});

describe("resolveAssumption and closeThesis", () => {
  it("stores the forecast with the outcome and resolves once", async () => {
    const { thesisId, critical } = await openThesis("RSLV");
    const o = await resolveAssumption(w.db, w.analyst, { assumptionId: critical.id, result: "true" });
    expect(o.forecastProbability).toBe(0.7);
    await expectReject(resolveAssumption(w.db, w.analyst, { assumptionId: critical.id, result: "false" }), /resolved/);
    const c = await closeThesis(w.db, w.analyst, { thesisId, reason: "Target reached", thesisReturnPct: 18, benchmarkReturnPct: 9 });
    expect(c.snapshot.thesis.status).toBe("closed");
    const out = await w.db.select().from(outcomes).where(eq(outcomes.thesisId, thesisId));
    expect(out.map((x) => x.kind).sort()).toEqual(["assumption", "thesis"]);
    await expectReject(recordDecision(w.db, w.pm, { thesisId, action: "hold", rationale: "Holding after close" }), /open thesis/);
  });
});

describe("triggerKillCriterion", () => {
  it("triggers once and raises an alert", async () => {
    const { snapshot } = await openThesis("KILL");
    const kc = snapshot.killCriteria[0];
    const r = await triggerKillCriterion(w.db, w.system, { killCriterionId: kc.id, reason: "Gross margin 33% < 35%" });
    expect(r.alertId).toBeTruthy();
    await expectReject(
      triggerKillCriterion(w.db, w.system, { killCriterionId: kc.id, reason: "again" }),
      /already triggered/,
    );
  });
});

describe("snapshot contents", () => {
  it("includes indicators for assumptions and kill criteria", async () => {
    const { snapshot } = await openThesis("SNAP");
    expect(snapshot.killCriteria[0].indicators[0].catalogKey).toBe("gross_margin_pct_q");
    const ids = snapshot.assumptions.map((a) => a.id);
    const rows = await w.db.select().from(indicators).where(eq(indicators.assumptionId, ids[0]));
    expect(rows).toHaveLength(1);
    expect(snapshot.position).toEqual({ sizePct: 2, entryDate: "2026-01-02", entryPrice: 100 });
  });
});
