import Link from "next/link";
import { getThesesForDashboard } from "@/lib/db";
import { hasContradictedCritical } from "@/lib/score";
import { ThesisCard } from "@/components/ThesisCard";

// Always reflect the latest DB state (scores change after checks).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const theses = await getThesesForDashboard();
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
        <div className="mt-10 rounded-xl border border-dashed border-border bg-surface/50 p-12 text-center">
          <p className="text-sm text-ink-muted">No theses yet.</p>
          <Link href="/thesis/new" className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
            Create your first thesis →
          </Link>
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
