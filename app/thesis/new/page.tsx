"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEMO_MEMO } from "@/lib/demoMemo";
import type {
  DecomposedThesis,
  Direction,
  Conviction,
  Criticality,
} from "@/lib/types";

// ---- Editable draft model (client-only; adds keys + actor, nulls -> "") ----

type EvidenceDraft = { key: string; text: string; source: string };
type AssumptionDraft = {
  key: string;
  text: string;
  criticality: Criticality;
  evidence: EvidenceDraft[];
};
type ThesisDraft = {
  actor: string;
  claim: string;
  direction: Direction;
  horizon: string;
  conviction: Conviction;
  decision: { action: string; sizing: string };
  assumptions: AssumptionDraft[];
};

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Best-effort author guess so the analyst doesn't start from an empty field. */
function guessActor(memo: string): string {
  const m = memo.match(/author\s*:\s*(.+)/i);
  return m ? m[1].trim() : "";
}

function toDraft(d: DecomposedThesis, actor: string): ThesisDraft {
  return {
    actor,
    claim: d.claim,
    direction: d.direction,
    horizon: d.horizon,
    conviction: d.conviction,
    decision: { action: d.decision.action, sizing: d.decision.sizing ?? "" },
    assumptions: d.assumptions.map((a) => ({
      key: uid(),
      text: a.text,
      criticality: a.criticality,
      evidence: a.evidence.map((e) => ({
        key: uid(),
        text: e.text,
        source: e.source ?? "",
      })),
    })),
  };
}

function toPayload(draft: ThesisDraft) {
  return {
    actor: draft.actor.trim() || "Unknown analyst",
    claim: draft.claim.trim(),
    direction: draft.direction,
    horizon: draft.horizon.trim(),
    conviction: draft.conviction,
    decision: {
      action: draft.decision.action.trim(),
      sizing: draft.decision.sizing.trim() || null,
    },
    assumptions: draft.assumptions
      .filter((a) => a.text.trim().length > 0)
      .map((a) => ({
        text: a.text.trim(),
        criticality: a.criticality,
        evidence: a.evidence
          .filter((e) => e.text.trim().length > 0)
          .map((e) => ({ text: e.text.trim(), source: e.source.trim() || null })),
      })),
  };
}

// ---- Shared input styles ----

const inputCls =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent/50 focus:outline-none";
const labelCls =
  "text-[10px] font-medium uppercase tracking-wider text-ink-faint";

export default function NewThesisPage() {
  const router = useRouter();
  const [memo, setMemo] = useState(DEMO_MEMO);
  const [draft, setDraft] = useState<ThesisDraft | null>(null);
  const [decomposing, setDecomposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecompose() {
    setError(null);
    setDecomposing(true);
    try {
      const res = await fetch("/api/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Decomposition failed.");
      setDraft(toDraft(data.thesis as DecomposedThesis, guessActor(memo)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decomposition failed.");
    } finally {
      setDecomposing(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(draft)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save the thesis.");
      router.push(`/thesis/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the thesis.");
      setSaving(false);
    }
  }

  // ---- Draft mutators (immutable updates by key) ----

  function patch(p: Partial<ThesisDraft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }
  function patchAssumption(key: string, p: Partial<AssumptionDraft>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            assumptions: d.assumptions.map((a) =>
              a.key === key ? { ...a, ...p } : a,
            ),
          }
        : d,
    );
  }
  function patchEvidence(aKey: string, eKey: string, p: Partial<EvidenceDraft>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            assumptions: d.assumptions.map((a) =>
              a.key === aKey
                ? {
                    ...a,
                    evidence: a.evidence.map((e) =>
                      e.key === eKey ? { ...e, ...p } : e,
                    ),
                  }
                : a,
            ),
          }
        : d,
    );
  }
  function addAssumption() {
    setDraft((d) =>
      d
        ? {
            ...d,
            assumptions: [
              ...d.assumptions,
              { key: uid(), text: "", criticality: "supporting", evidence: [] },
            ],
          }
        : d,
    );
  }
  function removeAssumption(key: string) {
    setDraft((d) =>
      d ? { ...d, assumptions: d.assumptions.filter((a) => a.key !== key) } : d,
    );
  }
  function addEvidence(aKey: string) {
    patchAssumptionEvidence(aKey, (ev) => [
      ...ev,
      { key: uid(), text: "", source: "" },
    ]);
  }
  function removeEvidence(aKey: string, eKey: string) {
    patchAssumptionEvidence(aKey, (ev) => ev.filter((e) => e.key !== eKey));
  }
  function patchAssumptionEvidence(
    aKey: string,
    fn: (ev: EvidenceDraft[]) => EvidenceDraft[],
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            assumptions: d.assumptions.map((a) =>
              a.key === aKey ? { ...a, evidence: fn(a.evidence) } : a,
            ),
          }
        : d,
    );
  }

  const busy = decomposing || saving;
  const critical = draft?.assumptions.filter((a) => a.criticality === "critical") ?? [];
  const supporting =
    draft?.assumptions.filter((a) => a.criticality === "supporting") ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">
          Dashboard
        </Link>
        <span className="text-ink-faint">/</span>
        <span className="text-ink">New thesis</span>
      </div>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        New thesis
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        Paste an investment memo. Decompose extracts the claim, the load-bearing
        assumptions, and the evidence — which you confirm before saving.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Memo editor */}
        <section className="flex flex-col rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Memo
            </span>
            <button
              type="button"
              onClick={() => setMemo(DEMO_MEMO)}
              className="text-xs text-ink-muted transition-colors hover:text-ink"
            >
              Reset to demo memo
            </button>
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            spellCheck={false}
            placeholder="Paste your memo here…"
            className="min-h-[460px] w-full resize-none rounded-b-xl bg-transparent px-4 py-3.5 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </section>

        {/* Structured thesis */}
        <section className="flex flex-col rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Structured thesis
            </span>
            {draft && (
              <span className="text-xs text-ink-faint">Editable — confirm before saving</span>
            )}
          </div>

          {decomposing ? (
            <DecomposingState />
          ) : draft ? (
            <ThesisEditor
              draft={draft}
              critical={critical}
              supporting={supporting}
              patch={patch}
              patchAssumption={patchAssumption}
              patchEvidence={patchEvidence}
              addAssumption={addAssumption}
              removeAssumption={removeAssumption}
              addEvidence={addEvidence}
              removeEvidence={removeEvidence}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="max-w-xs text-center text-sm text-ink-faint">
                The extracted claim, assumptions (critical vs supporting), and
                evidence will appear here once you decompose.
              </p>
            </div>
          )}
        </section>
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-contradicted/40 bg-contradicted/10 px-4 py-3 text-sm text-contradicted">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleDecompose}
          disabled={busy || memo.trim().length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {decomposing && <Spinner />}
          {decomposing ? "Decomposing…" : draft ? "Re-decompose" : "Decompose"}
        </button>

        {draft && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || draft.claim.trim().length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving && <Spinner />}
              {saving ? "Saving…" : "Save thesis"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={busy}
              className="text-sm text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
            >
              Discard
            </button>
          </>
        )}

        {!draft && (
          <span className="text-xs text-ink-faint">
            {memo.trim().length.toLocaleString()} characters
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Sub-components ----

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function DecomposingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <div className="text-accent">
        <Spinner />
      </div>
      <p className="text-sm font-medium text-ink">Decomposing memo…</p>
      <p className="max-w-xs text-center text-xs text-ink-muted">
        Extracting the claim, the load-bearing assumptions, and the evidence
        behind each.
      </p>
    </div>
  );
}

function ThesisEditor({
  draft,
  critical,
  supporting,
  patch,
  patchAssumption,
  patchEvidence,
  addAssumption,
  removeAssumption,
  addEvidence,
  removeEvidence,
}: {
  draft: ThesisDraft;
  critical: AssumptionDraft[];
  supporting: AssumptionDraft[];
  patch: (p: Partial<ThesisDraft>) => void;
  patchAssumption: (key: string, p: Partial<AssumptionDraft>) => void;
  patchEvidence: (aKey: string, eKey: string, p: Partial<EvidenceDraft>) => void;
  addAssumption: () => void;
  removeAssumption: (key: string) => void;
  addEvidence: (aKey: string) => void;
  removeEvidence: (aKey: string, eKey: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header fields */}
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Claim</label>
          <textarea
            value={draft.claim}
            onChange={(e) => patch({ claim: e.target.value })}
            rows={2}
            className={`${inputCls} mt-1 resize-none`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Actor</label>
            <input
              value={draft.actor}
              onChange={(e) => patch({ actor: e.target.value })}
              placeholder="Analyst name"
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className={labelCls}>Horizon</label>
            <input
              value={draft.horizon}
              onChange={(e) => patch({ horizon: e.target.value })}
              placeholder="12 months"
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className={labelCls}>Direction</label>
            <select
              value={draft.direction}
              onChange={(e) => patch({ direction: e.target.value as Direction })}
              className={`${inputCls} mt-1`}
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
              <option value="hold">Hold</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Conviction</label>
            <select
              value={draft.conviction}
              onChange={(e) => patch({ conviction: e.target.value as Conviction })}
              className={`${inputCls} mt-1`}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Decision</label>
            <input
              value={draft.decision.action}
              onChange={(e) =>
                patch({ decision: { ...draft.decision, action: e.target.value } })
              }
              placeholder="buy"
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className={labelCls}>Sizing</label>
            <input
              value={draft.decision.sizing}
              onChange={(e) =>
                patch({ decision: { ...draft.decision, sizing: e.target.value } })
              }
              placeholder="optional"
              className={`${inputCls} mt-1`}
            />
          </div>
        </div>
      </div>

      <AssumptionGroup
        title="Critical assumptions"
        items={critical}
        patchAssumption={patchAssumption}
        patchEvidence={patchEvidence}
        removeAssumption={removeAssumption}
        addEvidence={addEvidence}
        removeEvidence={removeEvidence}
        emptyHint="None marked critical."
      />

      <AssumptionGroup
        title="Supporting assumptions"
        items={supporting}
        patchAssumption={patchAssumption}
        patchEvidence={patchEvidence}
        removeAssumption={removeAssumption}
        addEvidence={addEvidence}
        removeEvidence={removeEvidence}
        emptyHint="None."
      />

      <button
        type="button"
        onClick={addAssumption}
        className="self-start text-xs font-medium text-accent transition-colors hover:text-accent/80"
      >
        + Add assumption
      </button>
    </div>
  );
}

function AssumptionGroup({
  title,
  items,
  patchAssumption,
  patchEvidence,
  removeAssumption,
  addEvidence,
  removeEvidence,
  emptyHint,
}: {
  title: string;
  items: AssumptionDraft[];
  patchAssumption: (key: string, p: Partial<AssumptionDraft>) => void;
  patchEvidence: (aKey: string, eKey: string, p: Partial<EvidenceDraft>) => void;
  removeAssumption: (key: string) => void;
  addEvidence: (aKey: string) => void;
  removeEvidence: (aKey: string, eKey: string) => void;
  emptyHint: string;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          {title}
        </h3>
        <span className="text-xs text-ink-faint">{items.length}</span>
      </div>
      <div className="mt-2 space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-ink-faint">{emptyHint}</p>
        )}
        {items.map((a) => (
          <div key={a.key} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <select
                value={a.criticality}
                onChange={(e) =>
                  patchAssumption(a.key, {
                    criticality: e.target.value as Criticality,
                  })
                }
                className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink focus:border-accent/50 focus:outline-none"
              >
                <option value="critical">Critical</option>
                <option value="supporting">Supporting</option>
              </select>
              <button
                type="button"
                onClick={() => removeAssumption(a.key)}
                className="text-xs text-ink-faint transition-colors hover:text-contradicted"
              >
                Remove
              </button>
            </div>

            <textarea
              value={a.text}
              onChange={(e) => patchAssumption(a.key, { text: e.target.value })}
              rows={2}
              placeholder="Assumption…"
              className={`${inputCls} mt-2.5 resize-none border-border bg-surface`}
            />

            <div className="mt-3 border-t border-border pt-2.5">
              <div className="flex items-center justify-between">
                <span className={labelCls}>Evidence</span>
                <button
                  type="button"
                  onClick={() => addEvidence(a.key)}
                  className="text-[11px] font-medium text-accent transition-colors hover:text-accent/80"
                >
                  + Add
                </button>
              </div>
              <div className="mt-1.5 space-y-2">
                {a.evidence.length === 0 && (
                  <p className="text-xs text-ink-faint">No evidence cited.</p>
                )}
                {a.evidence.map((e) => (
                  <div key={e.key} className="flex items-start gap-2">
                    <div className="flex-1 space-y-1.5">
                      <input
                        value={e.text}
                        onChange={(ev) =>
                          patchEvidence(a.key, e.key, { text: ev.target.value })
                        }
                        placeholder="Evidence"
                        className={`${inputCls} border-border bg-surface py-1.5 text-[13px]`}
                      />
                      <input
                        value={e.source}
                        onChange={(ev) =>
                          patchEvidence(a.key, e.key, { source: ev.target.value })
                        }
                        placeholder="Source (optional)"
                        className={`${inputCls} border-border bg-surface py-1.5 text-[13px]`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEvidence(a.key, e.key)}
                      className="mt-1.5 text-xs text-ink-faint transition-colors hover:text-contradicted"
                      aria-label="Remove evidence"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
