import { beforeAll, describe, expect, it } from "vitest";
import { createConfirmedThesis, runCheck } from "@/lib/actions";
import { NOW, THESIS_INPUT, createWorld, criticalAssumption, expectReject, type World } from "./helpers/db";

// Rule 2: action_log, checks and thesis_versions are insert-only. The
// database rejects UPDATE, DELETE and TRUNCATE on them (evidence and llm_calls too).

let w: World;
let thesisId: string;

beforeAll(async () => {
  w = await createWorld();
  const snap = await createConfirmedThesis(
    w.db,
    w.analyst,
    { thesis: { ...THESIS_INPUT, cik: null }, extraction: { assumptions: [criticalAssumption()] } },
    { now: NOW },
  );
  thesisId = snap.thesis.id;
  await runCheck(w.db, w.system, {
    kind: "numeric",
    indicatorId: snap.assumptions[0].indicators[0].id,
    trigger: "sweep",
    observation: {
      value: 12,
      asOf: "2025-12-31",
      label: "Revenue growth y/y",
      sourceUrl: "https://example.com/fixture",
    },
  });
});

describe.each(["action_log", "checks", "thesis_versions", "evidence"])("%s", (table) => {
  it("has rows to protect", async () => {
    const res = await w.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
    expect(res.rows[0].n).toBeGreaterThan(0);
  });
  it("rejects UPDATE", async () => {
    await expectReject(w.client.query(`UPDATE ${table} SET created_at = now()`), /insert-only/);
  });
  it("rejects DELETE", async () => {
    await expectReject(w.client.query(`DELETE FROM ${table}`), /insert-only/);
  });
  it("rejects TRUNCATE", async () => {
    await expectReject(w.client.query(`TRUNCATE ${table} CASCADE`), /insert-only/);
  });
});

describe("thesis_versions", () => {
  it("still accepts new versions", async () => {
    const res = await w.client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM thesis_versions WHERE thesis_id = $1",
      [thesisId],
    );
    expect(res.rows[0].n).toBe(1);
  });
});
