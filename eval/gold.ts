// Gold-set format. One JSON object per line in eval/gold/*.jsonl.
//
// Each entry is a historical assumption with a known answer taken from a
// later 10-Q or 10-K (or a FRED release). Controls are "clean" assumptions
// where nothing broke; any weakened or contradicted verdict on a control is a
// false alert.

import { z } from "zod";
import { ASSUMPTION_CATEGORIES, OPERATORS, VERDICTS } from "../db/enums";

export const goldEntrySchema = z
  .object({
    id: z.string().min(1),
    /** true only for illustrative entries that are not real data. */
    example: z.boolean().default(false),
    kind: z.enum(["numeric", "text"]),
    control: z.boolean(),
    company: z.object({
      ticker: z.string().min(1),
      cik: z.string().regex(/^\d{10}$/).nullable(),
      name: z.string().min(1),
    }),
    assumption: z.object({
      text: z.string().min(1),
      falsifiableText: z.string().min(1),
      critical: z.boolean(),
      category: z.enum(ASSUMPTION_CATEGORIES),
      /** Date the assumption was written (the check must only use data after it). */
      writtenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    /** Numeric entries: the catalog indicator and threshold. */
    indicator: z
      .object({
        catalogKey: z.string().min(1),
        operator: z.enum(OPERATORS),
        threshold: z.number().finite(),
        breakThreshold: z.number().finite().nullable().default(null),
      })
      .nullable()
      .default(null),
    /**
     * Numeric entries: the value recorded from the answer source, so the
     * numeric pipeline can be scored offline. Null means "not recorded yet".
     */
    observation: z
      .object({
        value: z.number().finite().nullable(),
        asOf: z.string().min(1),
      })
      .nullable()
      .default(null),
    /** Text entries (Phase 3): the stored document text the check runs against. */
    documentText: z.string().nullable().default(null),
    expectedVerdict: z.enum(VERDICTS),
    answerSource: z.object({
      url: z.string().url(),
      description: z.string().min(1),
    }),
    notes: z.string().default(""),
  })
  .superRefine((e, ctx) => {
    if (e.kind === "numeric" && !e.indicator) {
      ctx.addIssue({ code: "custom", message: "numeric entries need an indicator", path: ["indicator"] });
    }
    if (e.control && (e.expectedVerdict === "weakened" || e.expectedVerdict === "contradicted")) {
      ctx.addIssue({ code: "custom", message: "a control cannot expect a weakened or contradicted verdict", path: ["expectedVerdict"] });
    }
  });

export type GoldEntry = z.infer<typeof goldEntrySchema>;

/** Parse JSONL text. Returns entries and per-line errors. */
export function parseGold(text: string, fileName: string): { entries: GoldEntry[]; errors: string[] } {
  const entries: GoldEntry[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      errors.push(`${fileName}:${i + 1}: not valid JSON`);
      return;
    }
    const parsed = goldEntrySchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${fileName}:${i + 1}: ${issue.path.join(".") || "entry"}: ${issue.message}`);
      }
      return;
    }
    if (ids.has(parsed.data.id)) {
      errors.push(`${fileName}:${i + 1}: duplicate id ${parsed.data.id}`);
      return;
    }
    ids.add(parsed.data.id);
    entries.push(parsed.data);
  });
  return { entries, errors };
}
