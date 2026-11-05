import type { Extraction } from "@/lib/llm/prompts/extractThesis";

/** A model response as the mock provider returns it (test data, not real). */
export const SAMPLE_EXTRACTION: Extraction = {
  claim: "Example Corp keeps growing revenue double digits",
  direction: "long",
  horizonMonths: 12,
  convictionPct: null,
  assumptions: [
    {
      text: "Revenue keeps growing",
      falsifiableText: "Quarterly revenue grows at least 10% year on year through 2026",
      critical: true,
      category: "revenue",
      suggestedResolveBy: "2026-12-31",
      suggestedIndicators: [
        { catalogKey: "revenue_yoy_pct_q", operator: "gte", threshold: 10, breakThreshold: 5 },
        { catalogKey: "invented_metric", operator: "gt", threshold: 1, breakThreshold: null },
      ],
    },
    {
      text: "Rates fall",
      falsifiableText: "Fed funds rate is below 3% by 2026-12-31",
      critical: false,
      category: "macro",
      suggestedResolveBy: "2020-01-01",
      suggestedIndicators: [],
    },
  ],
  killCriteria: [
    { condition: "Margins collapse", suggestedIndicator: { catalogKey: "made_up", operator: "lt", threshold: 30, breakThreshold: null } },
  ],
};
