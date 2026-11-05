// Format for demo theses loaded into a demo account. Each entry becomes a
// thesis through createConfirmedThesis, so the same rules apply as in the app.
// seed/demo-theses.example.json holds three illustrative EXAMPLE entries on
// fictional companies; real demo theses go in seed/demo-theses.json.

import { z } from "zod";
import { assumptionInputSchema, createThesisSchema, killCriterionInputSchema } from "../lib/actions/schemas";

export const demoThesisSchema = z.object({
  id: z.string().min(1),
  /** true for illustrative entries that are not real research. */
  example: z.boolean(),
  /** Date the author wrote the thesis. */
  writtenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  thesis: createThesisSchema,
  assumptions: z.array(assumptionInputSchema).min(1),
  killCriteria: z.array(killCriterionInputSchema).default([]),
});

export type DemoThesis = z.infer<typeof demoThesisSchema>;

export function parseDemoTheses(raw: unknown): DemoThesis[] {
  return z.array(demoThesisSchema).parse(raw);
}
