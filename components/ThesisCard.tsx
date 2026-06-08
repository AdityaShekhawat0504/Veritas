import Link from "next/link";
import type { ThesisCardData } from "@/lib/types";
import { hasContradictedCritical, integrityBand } from "@/lib/score";
import { DirectionBadge } from "./badges";

const SCORE_COLOR = {
  high: "text-holding",
  medium: "text-weakening",
  low: "text-contradicted",
} as const;

export function ThesisCard({ thesis }: { thesis: ThesisCardData }) {
  const flag = hasContradictedCritical(thesis.assumptions);
  const band = integrityBand(thesis.integrityScore);
  const criticalCount = thesis.assumptions.filter(
    (a) => a.criticality === "critical",
  ).length;

  return (
    <Link
      href={`/thesis/${thesis.id}`}
      className="group flex flex-col rounded-xl border border-border bg-surface p-5 transition-all hover:border-border-strong hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <DirectionBadge direction={thesis.direction} />
            <span className="text-xs text-ink-faint">·</span>
            <span className="truncate text-xs font-medium text-ink-muted">
              {thesis.actor}
            </span>
          </div>
          <h3 className="mt-1.5 line-clamp-2 text-[15px] font-medium leading-snug text-ink">
            {thesis.claim}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-2xl font-semibold tabular-nums ${SCORE_COLOR[band]}`}>
            {thesis.integrityScore}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">
            integrity
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-ink-faint">
          {thesis.assumptions.length} assumptions · {criticalCount} critical
        </span>
        {flag ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-contradicted/10 px-2 py-0.5 text-xs font-medium text-contradicted ring-1 ring-inset ring-contradicted/30">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            Critical broken
          </span>
        ) : (
          <span className="text-xs text-ink-faint">{thesis.horizon}</span>
        )}
      </div>
    </Link>
  );
}
