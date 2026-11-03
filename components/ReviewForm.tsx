"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSUMPTION_CATEGORIES, OPERATORS, type Operator } from "@/db/enums";
import {
  buildConfirmPayload,
  type ReviewAssumption,
  type ReviewIndicator,
  type ReviewKill,
  type ReviewState,
} from "@/lib/intake/review";

export interface CatalogOption {
  key: string;
  label: string;
  unit: string;
  source: string;
}

const input = "w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-ink";
const OP_LABEL: Record<Operator, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

let counter = 0;
const newKey = (p: string) => `${p}-new-${++counter}`;

function IndicatorEditor({
  value,
  catalog,
  onChange,
  onRemove,
}: {
  value: ReviewIndicator;
  catalog: CatalogOption[];
  onChange: (v: ReviewIndicator) => void;
  onRemove: () => void;
}) {
  const unit = catalog.find((c) => c.key === value.catalogKey)?.unit ?? "";
  return (
    <div className="grid grid-cols-[1fr_4.5rem_6rem_6rem_auto] items-center gap-2">
      <select className={input} value={value.catalogKey} onChange={(e) => onChange({ ...value, catalogKey: e.target.value })}>
        <option value="">Pick a catalog indicator</option>
        {catalog.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label} ({c.unit})
          </option>
        ))}
      </select>
      <select className={input} value={value.operator} onChange={(e) => onChange({ ...value, operator: e.target.value as Operator })}>
        {OPERATORS.map((o) => (
          <option key={o} value={o}>
            {OP_LABEL[o]}
          </option>
        ))}
      </select>
      <input
        className={input}
        value={value.threshold}
        placeholder={`threshold ${unit}`}
        onChange={(e) => onChange({ ...value, threshold: e.target.value })}
      />
      <input
        className={input}
        value={value.breakThreshold}
        placeholder="break (opt.)"
        title="Optional. Between the threshold and this value the verdict is 'weakened'; beyond it, 'contradicted'."
        onChange={(e) => onChange({ ...value, breakThreshold: e.target.value })}
      />
      <button type="button" onClick={onRemove} className="text-xs text-ink-faint hover:text-contradicted">
        Remove
      </button>
    </div>
  );
}

const emptyIndicator = (): ReviewIndicator => ({ catalogKey: "", operator: "gte", threshold: "", breakThreshold: "" });

export function ReviewForm({
  thesisId,
  initial,
  catalog,
  today,
  dropped,
}: {
  thesisId: string;
  initial: ReviewState;
  catalog: CatalogOption[];
  today: string;
  dropped: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<ReviewState>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const setA = (key: string, patch: Partial<ReviewAssumption>) =>
    setState((s) => ({ ...s, assumptions: s.assumptions.map((a) => (a.key === key ? { ...a, ...patch } : a)) }));
  const setK = (key: string, patch: Partial<ReviewKill>) =>
    setState((s) => ({ ...s, killCriteria: s.killCriteria.map((k) => (k.key === key ? { ...k, ...patch } : k)) }));

  async function save() {
    const { payload, problems: p } = buildConfirmPayload(state, today);
    setProblems(p);
    if (!payload) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/theses/${thesisId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string; details?: string[] };
      if (!res.ok) {
        setProblems([body.error ?? "Save failed.", ...(body.details ?? [])]);
        return;
      }
      router.push(`/thesis/${thesisId}`);
      router.refresh();
    } catch {
      setProblems(["Network error. Try again."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {dropped.length > 0 && (
        <div className="rounded-md border border-weakening/30 bg-weakening/10 px-3 py-2 text-xs text-weakening">
          Removed from the draft because they are not in the indicator catalog or not valid dates:
          <ul className="mt-1 list-disc pl-5">
            {dropped.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <label className="block text-sm">
          <span className="text-ink-muted">Claim</span>
          <textarea className={input} rows={2} value={state.claim} onChange={(e) => setState({ ...state, claim: e.target.value })} />
        </label>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <label>
            <span className="text-ink-muted">Direction</span>
            <select
              className={input}
              value={state.direction}
              onChange={(e) => setState({ ...state, direction: e.target.value === "short" ? "short" : "long" })}
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label>
            <span className="text-ink-muted">Horizon (months)</span>
            <input className={input} value={state.horizonMonths} onChange={(e) => setState({ ...state, horizonMonths: e.target.value })} />
          </label>
          <label>
            <span className="text-ink-muted">Conviction (0-100, required)</span>
            <input className={input} value={state.convictionPct} onChange={(e) => setState({ ...state, convictionPct: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Assumptions</h2>
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() =>
              setState((s) => ({
                ...s,
                assumptions: [
                  ...s.assumptions,
                  {
                    key: newKey("a"),
                    text: "",
                    falsifiableText: "",
                    critical: false,
                    category: "other",
                    probabilityPct: "",
                    resolveBy: "",
                    indicators: [],
                  },
                ],
              }))
            }
          >
            Add assumption
          </button>
        </div>
        {state.assumptions.map((a, i) => (
          <div key={a.key} className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-faint">Assumption {i + 1}</span>
              <button
                type="button"
                className="text-xs text-ink-faint hover:text-contradicted"
                onClick={() => setState((s) => ({ ...s, assumptions: s.assumptions.filter((x) => x.key !== a.key) }))}
              >
                Remove
              </button>
            </div>
            <input className={input} placeholder="Assumption" value={a.text} onChange={(e) => setA(a.key, { text: e.target.value })} />
            <input
              className={input}
              placeholder="Falsifiable restatement (what a later filing or release would prove)"
              value={a.falsifiableText}
              onChange={(e) => setA(a.key, { falsifiableText: e.target.value })}
            />
            <div className="grid grid-cols-4 gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={a.critical} onChange={(e) => setA(a.key, { critical: e.target.checked })} />
                <span>Critical</span>
              </label>
              <select className={input} value={a.category} onChange={(e) => setA(a.key, { category: e.target.value as ReviewAssumption["category"] })}>
                {ASSUMPTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace("_", " ")}
                  </option>
                ))}
              </select>
              <input
                className={input}
                placeholder={a.critical ? "Probability % (required)" : "Probability % (optional)"}
                value={a.probabilityPct}
                onChange={(e) => setA(a.key, { probabilityPct: e.target.value })}
              />
              <input
                className={input}
                type="date"
                value={a.resolveBy}
                min={today}
                onChange={(e) => setA(a.key, { resolveBy: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              {a.indicators.map((ind, j) => (
                <IndicatorEditor
                  key={j}
                  value={ind}
                  catalog={catalog}
                  onChange={(v) => setA(a.key, { indicators: a.indicators.map((x, k) => (k === j ? v : x)) })}
                  onRemove={() => setA(a.key, { indicators: a.indicators.filter((_, k) => k !== j) })}
                />
              ))}
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => setA(a.key, { indicators: [...a.indicators, emptyIndicator()] })}
              >
                Add indicator from catalog
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Kill criteria</h2>
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() =>
              setState((s) => ({ ...s, killCriteria: [...s.killCriteria, { key: newKey("k"), condition: "", indicator: null }] }))
            }
          >
            Add kill criterion
          </button>
        </div>
        {state.killCriteria.map((k) => (
          <div key={k.key} className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="flex gap-2">
              <input className={input} placeholder="Condition" value={k.condition} onChange={(e) => setK(k.key, { condition: e.target.value })} />
              <button
                type="button"
                className="text-xs text-ink-faint hover:text-contradicted"
                onClick={() => setState((s) => ({ ...s, killCriteria: s.killCriteria.filter((x) => x.key !== k.key) }))}
              >
                Remove
              </button>
            </div>
            {k.indicator ? (
              <IndicatorEditor
                value={k.indicator}
                catalog={catalog}
                onChange={(v) => setK(k.key, { indicator: v })}
                onRemove={() => setK(k.key, { indicator: null })}
              />
            ) : (
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setK(k.key, { indicator: emptyIndicator() })}>
                Add indicator from catalog
              </button>
            )}
          </div>
        ))}
      </section>

      {problems.length > 0 && (
        <ul className="list-disc rounded-md bg-contradicted/10 py-2 pl-8 pr-3 text-sm text-contradicted">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Confirm and start tracking"}
      </button>
    </div>
  );
}
