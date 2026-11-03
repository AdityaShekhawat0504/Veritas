import type { Verdict } from "@/db/enums";

const VERDICT_STYLE: Record<Verdict | "unchecked", { label: string; cls: string; dot: string }> = {
  supported: { label: "Supported", cls: "bg-holding/10 text-holding ring-holding/30", dot: "bg-holding" },
  weakened: { label: "Weakened", cls: "bg-weakening/10 text-weakening ring-weakening/30", dot: "bg-weakening" },
  contradicted: {
    label: "Contradicted",
    cls: "bg-contradicted/10 text-contradicted ring-contradicted/30",
    dot: "bg-contradicted",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    cls: "bg-surface-2 text-ink-muted ring-border",
    dot: "bg-ink-faint",
  },
  unchecked: { label: "Not checked", cls: "bg-surface-2 text-ink-faint ring-border", dot: "bg-border-strong" },
};

export function VerdictChip({ verdict }: { verdict: Verdict | null }) {
  const s = VERDICT_STYLE[verdict ?? "unchecked"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function CriticalTag({ critical }: { critical: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
        critical ? "bg-accent-soft text-accent ring-accent/30" : "bg-surface-2 text-ink-faint ring-border"
      }`}
    >
      {critical ? "Critical" : "Supporting"}
    </span>
  );
}

export function DirectionBadge({ direction }: { direction: string }) {
  return (
    <span
      className={`text-xs font-semibold uppercase tracking-wide ${
        direction === "long" ? "text-holding" : "text-contradicted"
      }`}
    >
      {direction}
    </span>
  );
}
