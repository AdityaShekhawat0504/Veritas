// Small presentational badges/chips shared across screens.
import type {
  AssumptionStatus,
  Conviction,
  Criticality,
  Direction,
} from "@/lib/types";

export function StatusChip({ status }: { status: AssumptionStatus }) {
  const map: Record<AssumptionStatus, { label: string; cls: string; dot: string }> = {
    holding: {
      label: "Holding",
      cls: "bg-holding/10 text-holding ring-holding/30",
      dot: "bg-holding",
    },
    weakening: {
      label: "Weakening",
      cls: "bg-weakening/10 text-weakening ring-weakening/30",
      dot: "bg-weakening",
    },
    contradicted: {
      label: "Contradicted",
      cls: "bg-contradicted/10 text-contradicted ring-contradicted/30",
      dot: "bg-contradicted",
    },
  };
  const { label, cls, dot } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function CriticalityTag({ criticality }: { criticality: Criticality }) {
  const isCritical = criticality === "critical";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${
        isCritical
          ? "bg-accent-soft text-accent ring-accent/30"
          : "bg-surface-2 text-ink-faint ring-border"
      }`}
    >
      {isCritical ? "Critical" : "Supporting"}
    </span>
  );
}

export function DirectionBadge({ direction }: { direction: Direction }) {
  const map: Record<Direction, string> = {
    long: "text-holding",
    short: "text-contradicted",
    hold: "text-ink-muted",
  };
  return (
    <span className={`text-xs font-semibold uppercase tracking-wide ${map[direction]}`}>
      {direction}
    </span>
  );
}

export function ConvictionBadge({ conviction }: { conviction: Conviction }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
      <span className="text-ink-faint">Conviction</span>
      <span className="font-medium capitalize text-ink">{conviction}</span>
    </span>
  );
}
