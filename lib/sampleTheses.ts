// The clonable demo set. This is PURE DATA + a pure builder — no Prisma, no I/O.
// Used two ways:
//   • db.cloneSamplesForUser() — "Load samples" clones these into a real user
//   • prisma/seed.ts — local dev seeding under a demo user
// Never auto-seeded into a real user's dashboard (v1 rule).

import { computeIntegrityScore } from "./score";
import type { AssumptionStatus, Criticality } from "./types";

export interface SampleAssumption {
  text: string;
  criticality: Criticality;
  status: AssumptionStatus;
  reason?: string;
  source?: string;
  daysSinceChecked?: number;
  evidence: { text: string; source?: string }[];
}

export interface SampleThesis {
  actor: string;
  claim: string;
  direction: string;
  horizon: string;
  conviction: string;
  decision: { action: string; sizing?: string };
  assumptions: SampleAssumption[];
  history: number[]; // integrity-score history (oldest → newest); last is recomputed
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

export const SAMPLE_THESES: SampleThesis[] = [
  {
    actor: "M. Tanaka",
    claim:
      "Tesla re-rates as auto margins recover and robotaxi optionality gets priced in within a year.",
    direction: "long",
    horizon: "12 months",
    conviction: "high",
    decision: { action: "buy", sizing: "Top-five position" },
    history: [100, 86, 71],
    assumptions: [
      {
        text: "Automotive gross margin troughs and recovers as price cuts end and cost-per-vehicle falls.",
        criticality: "critical",
        status: "contradicted",
        reason:
          "Auto gross margin ex-credits fell again last quarter; management guided to further price actions, not recovery.",
        source: "Q1 earnings call",
        daysSinceChecked: 2,
        evidence: [
          { text: "Cost per vehicle declined ~1% q/q, far slower than price cuts.", source: "Shareholder deck" },
          { text: "Management reiterated growth-over-margin priority.", source: "Earnings call" },
        ],
      },
      {
        text: "Robotaxi / FSD optionality begins to be priced into the multiple within 12 months.",
        criticality: "critical",
        status: "weakening",
        reason:
          "Robotaxi event slipped and regulatory approval timelines remain unspecified, pushing the catalyst right.",
        source: "Company guidance",
        daysSinceChecked: 2,
        evidence: [
          { text: "Unsupervised FSD still geofenced to limited pilots.", source: "Company blog" },
        ],
      },
      {
        text: "Energy storage becomes a material second growth engine.",
        criticality: "critical",
        status: "holding",
        reason: "Storage deployments hit a record and gross margin there is expanding.",
        source: "Q1 earnings",
        daysSinceChecked: 2,
        evidence: [
          { text: "Megapack deployments at record GWh; backlog growing.", source: "10-Q" },
        ],
      },
      {
        text: "Regulatory-credit revenue stays a tailwind near term.",
        criticality: "supporting",
        status: "holding",
        daysSinceChecked: 2,
        evidence: [{ text: "Credit sales steady q/q.", source: "10-Q" }],
      },
    ],
  },
  {
    actor: "J. Reyes",
    claim:
      "Eli Lilly compounds as GLP-1 demand outstrips supply and the oral franchise extends the runway.",
    direction: "long",
    horizon: "18 months",
    conviction: "medium",
    decision: { action: "buy", sizing: "3% starter, add on capacity proof" },
    history: [100, 92],
    assumptions: [
      {
        text: "GLP-1 (tirzepatide) demand continues to outstrip available supply through 2026.",
        criticality: "critical",
        status: "holding",
        reason: "Scripts still supply-constrained; demand signals remain well above capacity.",
        source: "IQVIA script data",
        daysSinceChecked: 5,
        evidence: [
          { text: "Weekly scripts up double digits; intermittent shortages persist.", source: "IQVIA" },
        ],
      },
      {
        text: "Manufacturing capacity expansions come online roughly on schedule.",
        criticality: "critical",
        status: "weakening",
        reason: "New site ramp is running a quarter or two behind the original timeline.",
        source: "Capex update",
        daysSinceChecked: 5,
        evidence: [
          { text: "Site qualification timelines extended in latest disclosure.", source: "Investor day" },
        ],
      },
      {
        text: "Oral GLP-1 (orforglipron) data stays competitive on efficacy and tolerability.",
        criticality: "supporting",
        status: "holding",
        daysSinceChecked: 5,
        evidence: [{ text: "Phase 3 weight-loss readout in line with expectations.", source: "Press release" }],
      },
      {
        text: "Pricing and reimbursement pressure stays manageable.",
        criticality: "supporting",
        status: "holding",
        daysSinceChecked: 5,
        evidence: [{ text: "Coverage expanding with employers; net price stable.", source: "Payer survey" }],
      },
    ],
  },
  {
    actor: "A. Okafor",
    claim:
      "Costco holds its membership flywheel; we keep the position but aren't pressing it here.",
    direction: "hold",
    horizon: "24 months",
    conviction: "low",
    decision: { action: "hold", sizing: "Maintain existing weight" },
    history: [100],
    assumptions: [
      {
        text: "Membership renewal rates stay above 90% in core markets.",
        criticality: "critical",
        status: "holding",
        reason: "Renewal rate held at an all-time high in the latest quarter.",
        source: "Q3 release",
        daysSinceChecked: 9,
        evidence: [{ text: "US/Canada renewal ~93%, worldwide ~90%.", source: "10-Q" }],
      },
      {
        text: "Comparable sales growth stays positive excluding fuel and FX.",
        criticality: "critical",
        status: "holding",
        reason: "Adjusted comps remained solidly positive with strong traffic.",
        source: "Monthly sales",
        daysSinceChecked: 9,
        evidence: [{ text: "Adjusted comps mid-single-digit positive; traffic up.", source: "Sales report" }],
      },
      {
        text: "The recent membership-fee increase sticks without meaningful churn.",
        criticality: "supporting",
        status: "holding",
        daysSinceChecked: 9,
        evidence: [{ text: "Renewal trends unchanged post-increase.", source: "Earnings call" }],
      },
    ],
  },
];

/**
 * Build the nested Prisma `create` payload for one sample thesis owned by
 * `userId`. Computes the current integrity score and spreads the check history
 * across the days leading up to the latest check. Pure — no Prisma import.
 */
export function buildSampleCreateData(sample: SampleThesis, userId: string) {
  const score = computeIntegrityScore(
    sample.assumptions.map((a) => ({ criticality: a.criticality, status: a.status })),
  );
  // Recompute the newest history point from the actual statuses.
  const history = [...sample.history.slice(0, -1), score];
  const anchor = sample.assumptions[0]?.daysSinceChecked ?? 0;
  const anchorDate = daysAgo(anchor);

  return {
    userId,
    actor: sample.actor,
    claim: sample.claim,
    direction: sample.direction,
    horizon: sample.horizon,
    conviction: sample.conviction,
    integrityScore: score,
    decision: { create: sample.decision },
    assumptions: {
      create: sample.assumptions.map((a) => ({
        text: a.text,
        criticality: a.criticality,
        status: a.status,
        reason: a.reason ?? null,
        source: a.source ?? null,
        lastChecked: a.daysSinceChecked != null ? daysAgo(a.daysSinceChecked) : null,
        evidence: {
          create: a.evidence.map((e) => ({ text: e.text, source: e.source ?? null })),
        },
      })),
    },
    checks: {
      create: history.map((s, i) => ({
        score: s,
        createdAt: new Date(
          anchorDate.getTime() - (history.length - 1 - i) * 24 * 60 * 60 * 1000,
        ),
      })),
    },
  };
}
