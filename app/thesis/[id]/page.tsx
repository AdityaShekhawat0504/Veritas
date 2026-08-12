import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getThesisById } from "@/lib/db";
import type { Assumption } from "@/lib/types";
import { ScoreDial } from "@/components/ScoreDial";
import { Sparkline } from "@/components/Sparkline";
import { MismatchBanner } from "@/components/MismatchBanner";
import { CheckButton } from "@/components/CheckButton";
import { StatusChip, CriticalityTag, DirectionBadge, ConvictionBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null): string {
  if (!d) return "Not checked yet";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AssumptionRow({ a }: { a: Assumption }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <CriticalityTag criticality={a.criticality} />
        </div>
        <StatusChip status={a.status} />
      </div>
      <p className="mt-2.5 text-[15px] leading-snug text-ink">{a.text}</p>

      {a.reason && (
        <p className="mt-2 text-sm text-ink-muted">
          <span className="text-ink-faint">Assessment — </span>
          {a.reason}
        </p>
      )}

      {a.evidence.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            Evidence
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {a.evidence.map((e) => (
              <li key={e.id} className="text-sm text-ink-muted">
                <span className="mr-1.5 text-ink-faint">·</span>
                {e.text}
                {e.source && (
                  <span className="ml-1.5 text-xs text-ink-faint">({e.source})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-ink-faint">
        <span>Checked {fmtDate(a.lastChecked)}</span>
        {a.source && (
          <>
            <span>·</span>
            <span>Source: {a.source}</span>
          </>
        )}
      </div>
    </li>
  );
}

export default async function ThesisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  if (!userId) redirect("/signin");
  const thesis = await getThesisById(id, userId);
  if (!thesis) notFound();

  const history = thesis.checks.map((c) => c.score);
  const critical = thesis.assumptions.filter((a) => a.criticality === "critical");
  const supporting = thesis.assumptions.filter((a) => a.criticality === "supporting");

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">
          Dashboard
        </Link>
        <span className="text-ink-faint">/</span>
        <span className="truncate text-ink">{thesis.actor}</span>
      </div>

      {/* Header */}
      <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <DirectionBadge direction={thesis.direction} />
            <span className="text-xs text-ink-faint">·</span>
            <span className="text-xs text-ink-muted">{thesis.actor}</span>
            <span className="text-xs text-ink-faint">·</span>
            <ConvictionBadge conviction={thesis.conviction} />
            <span className="text-xs text-ink-faint">·</span>
            <span className="text-xs text-ink-muted">{thesis.horizon}</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink">
            {thesis.claim}
          </h1>
          {thesis.decision && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
              <span className="text-ink-faint">Decision</span>
              <span className="font-medium capitalize text-ink">
                {thesis.decision.action}
              </span>
              {thesis.decision.sizing && (
                <span className="text-ink-muted">· {thesis.decision.sizing}</span>
              )}
            </div>
          )}
        </div>

        {/* Score panel */}
        <div className="flex shrink-0 flex-col items-center gap-4 rounded-xl border border-border bg-surface p-5 lg:w-64">
          <ScoreDial score={thesis.integrityScore} />
          <div className="w-full">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-faint">
              <span>History</span>
              <span>{history.length} checks</span>
            </div>
            <Sparkline points={history} width={216} />
          </div>
          <div className="w-full">
            <CheckButton thesisId={thesis.id} />
          </div>
        </div>
      </div>

      {/* Mismatch banner */}
      <div className="mt-6">
        <MismatchBanner conviction={thesis.conviction} score={thesis.integrityScore} />
      </div>

      {/* Assumptions */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
            Critical assumptions
          </h2>
          <span className="text-xs text-ink-faint">{critical.length}</span>
        </div>
        <ul className="mt-3 space-y-3">
          {critical.map((a) => (
            <AssumptionRow key={a.id} a={a} />
          ))}
          {critical.length === 0 && (
            <li className="text-sm text-ink-faint">None.</li>
          )}
        </ul>
      </section>

      {supporting.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
              Supporting assumptions
            </h2>
            <span className="text-xs text-ink-faint">{supporting.length}</span>
          </div>
          <ul className="mt-3 space-y-3">
            {supporting.map((a) => (
              <AssumptionRow key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
