import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { currentActor, listTheses } from "@/lib/queries";
import { DirectionBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = getDb();
  const actor = await currentActor(db);
  if (!actor) redirect("/signin");
  const theses = await listTheses(db, actor.firmId);

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Theses</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {theses.length} in your firm · latest verdict per assumption
          </p>
        </div>
        <Link
          href="/thesis/new"
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
        >
          New thesis
        </Link>
      </div>

      {theses.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold text-ink">No theses yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
            Paste a memo to draft a thesis. You confirm each assumption, its probability and its
            resolution date before anything is tracked.
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {theses.map((t) => (
            <li key={t.id}>
              <Link href={`/thesis/${t.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-2">
                <span className="w-16 shrink-0 font-mono text-sm font-semibold text-ink">{t.ticker}</span>
                <DirectionBadge direction={t.direction} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.claim}</span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {t.status} · {t.assumptionCount} assumptions ({t.criticalCount} critical)
                </span>
                <span className="shrink-0 text-xs tabular-nums">
                  <span className="text-holding">{t.verdicts.supported}</span>
                  {" / "}
                  <span className="text-weakening">{t.verdicts.weakened}</span>
                  {" / "}
                  <span className="text-contradicted">{t.verdicts.contradicted}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
