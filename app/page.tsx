import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getThesesForDashboard } from "@/lib/db";
import { hasContradictedCritical } from "@/lib/score";
import { ThesisCard } from "@/components/ThesisCard";
import { LoadSamplesButton } from "@/components/LoadSamplesButton";

// Always reflect the latest DB state (scores change after checks).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin");

  const theses = await getThesesForDashboard(userId);
  const brokenCount = theses.filter((t) =>
    hasContradictedCritical(t.assumptions),
  ).length;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Theses
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {theses.length} tracked · {brokenCount} with a broken critical
            assumption · sorted by integrity
          </p>
        </div>
        <Link
          href="/thesis/new"
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90"
        >
          New thesis
        </Link>
      </div>

      {theses.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-inset ring-accent/30">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 4 6v6c0 4.5 3.4 7.5 8 9 4.6-1.5 8-4.5 8-9V6l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink">
            No theses yet
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-ink-muted">
            Paste an investment memo to decompose it into a monitorable thesis —
            or start with three worked examples to see how integrity scoring and
            the conviction–integrity mismatch work.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <LoadSamplesButton />
            <Link
              href="/thesis/new"
              className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Or create your first thesis →
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {theses.map((t) => (
            <ThesisCard key={t.id} thesis={t} />
          ))}
        </div>
      )}
    </div>
  );
}
