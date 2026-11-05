// Gold-set scoring. Entry point: eval/cli.ts (pnpm eval [--examples] [--file path] [--json]).
//
// Scores the check pipeline against the gold set. Numeric entries are scored
// with the same code that runs in production (numericVerdict). Text entries
// need the cited text-check pipeline and are reported as not yet scored.
//
// By default only eval/gold/gold.jsonl is read. --examples adds the
// illustrative entries in eval/gold/examples.jsonl; their numbers are not
// real results and are printed under an EXAMPLE banner.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { numericVerdict } from "../lib/actions/rules";
import { parseGold, type GoldEntry } from "./gold";
import { computeMetrics, fmt, type Scored } from "./metrics";

const GOLD = fileURLToPath(new URL("./gold/gold.jsonl", import.meta.url));
const EXAMPLES = fileURLToPath(new URL("./gold/examples.jsonl", import.meta.url));

export function scoreEntries(entries: GoldEntry[]): { scored: Scored[]; skipped: { id: string; reason: string }[] } {
  const scored: Scored[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const e of entries) {
    if (e.kind === "text") {
      skipped.push({ id: e.id, reason: "text checks are not scored yet" });
      continue;
    }
    if (!e.indicator || !e.observation) {
      skipped.push({ id: e.id, reason: "no recorded observation" });
      continue;
    }
    const predicted = numericVerdict(e.observation.value, e.indicator);
    scored.push({ id: e.id, control: e.control, expected: e.expectedVerdict, predicted });
  }
  return { scored, skipped };
}

export function main(argv: string[]): number {
  const useExamples = argv.includes("--examples");
  const asJson = argv.includes("--json");
  const fileIdx = argv.indexOf("--file");
  const files = fileIdx >= 0 && argv[fileIdx + 1] ? [argv[fileIdx + 1]] : [GOLD];
  if (useExamples) files.push(EXAMPLES);

  const entries: GoldEntry[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (!existsSync(f)) {
      errors.push(`${f}: file not found`);
      continue;
    }
    const res = parseGold(readFileSync(f, "utf8"), f);
    entries.push(...res.entries);
    errors.push(...res.errors);
  }
  if (errors.length > 0) {
    console.error("Gold set has format errors:");
    for (const e of errors) console.error(`  ${e}`);
    return 1;
  }

  const hasExamples = entries.some((e) => e.example);
  const { scored, skipped } = scoreEntries(entries);
  const m = computeMetrics(scored);

  if (asJson) {
    console.log(JSON.stringify({ entries: entries.length, containsExampleData: hasExamples, skipped, metrics: m }, null, 2));
    return 0;
  }

  if (hasExamples) console.log("=== EXAMPLE DATA: illustrative entries, not real results ===");
  console.log(`Gold entries: ${entries.length} (numeric ${entries.filter((e) => e.kind === "numeric").length}, text ${entries.filter((e) => e.kind === "text").length}, controls ${entries.filter((e) => e.control).length})`);
  console.log(`Scored: ${m.scored}   Skipped: ${skipped.length}`);
  console.log(`Accuracy:                ${fmt(m.accuracy)}`);
  console.log(`Precision (contradicted): ${fmt(m.contradictedPrecision)}  (${m.counts.truePositiveContradicted}/${m.counts.predictedContradicted})`);
  console.log(`Recall (contradicted):    ${fmt(m.contradictedRecall)}  (${m.counts.truePositiveContradicted}/${m.counts.expectedContradicted})`);
  console.log(`False-alert rate:         ${fmt(m.falseAlertRate)}  (${m.counts.falseAlerts}/${m.counts.controls} controls)`);
  console.log(`Abstention rate:          ${fmt(m.abstentionRate)}  (${m.counts.abstentions}/${m.scored})`);
  if (entries.length === 0) console.log("The gold set is empty. Add entries to eval/gold/gold.jsonl (format: eval/gold.ts).");
  for (const s of skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
  return 0;
}

