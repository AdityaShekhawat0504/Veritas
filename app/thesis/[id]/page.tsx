import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { currentActor, getThesisDetail } from "@/lib/queries";
import { CriticalTag, DirectionBadge, VerdictChip } from "@/components/badges";
import { RunChecksButton } from "@/components/RunChecksButton";

export const dynamic = "force-dynamic";

const OP: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };
const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16) + " UTC";

export default async function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const actor = await currentActor(db);
  if (!actor) redirect("/signin");
  const d = await getThesisDetail(db, actor.firmId, id);
  if (!d) notFound();
  const t = d.thesis;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-ink">{d.security.ticker}</span>
          <DirectionBadge direction={t.direction} />
          <span className="text-xs text-ink-faint">
            {t.status} · v{t.currentVersion} · {t.horizonMonths} months · conviction {t.convictionPct}%
            {d.position ? ` · size ${d.position.sizePct}%` : ""}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">{t.claim}</h1>
        {t.status === "draft" && (
          <Link href={`/thesis/${t.id}/review`} className="mt-3 inline-block text-sm text-accent hover:underline">
            This thesis is a draft. Review and confirm it →
          </Link>
        )}
        {t.status === "open" && (
          <div className="mt-4">
            <RunChecksButton thesisId={t.id} />
          </div>
        )}
      </div>

      <section>
        <h2 className="text-sm font-semibold text-ink">Assumptions</h2>
        <ul className="mt-3 space-y-3">
          {d.assumptions.map(({ row: a, indicators, checks }) => (
            <li key={a.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <CriticalTag critical={a.critical} />
                  <span className="text-xs text-ink-faint">{a.category.replace("_", " ")}</span>
                  {a.status !== "active" && <span className="text-xs text-ink-faint">({a.status})</span>}
                </div>
                <VerdictChip verdict={checks[0]?.row.verdict ?? null} />
              </div>
              <p className="mt-2 text-[15px] text-ink">{a.text}</p>
              <p className="mt-1 text-sm text-ink-muted">{a.falsifiableText}</p>
              <p className="mt-2 text-xs text-ink-faint">
                {a.probability !== null ? `p = ${Math.round(a.probability * 100)}%` : "no probability"}
                {a.resolveBy ? ` · resolve by ${a.resolveBy}` : ""}
              </p>
              {indicators.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                  {indicators.map((i) => (
                    <li key={i.row.id}>
                      {i.label} {OP[i.row.operator]} {i.row.threshold} {i.unit}
                      {i.row.breakThreshold !== null ? ` (weakened until ${i.row.breakThreshold})` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {checks.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Checks</p>
                  <ul className="mt-1.5 space-y-2">
                    {checks.slice(0, 10).map(({ row: c, evidence }) => (
                      <li key={c.id} className="text-xs text-ink-muted">
                        <span className="mr-2 text-ink-faint">{fmt(c.createdAt)}</span>
                        <VerdictChip verdict={c.verdict} />
                        <span className="ml-2 text-ink-faint">
                          {c.kind}
                          {c.model ? ` · ${c.model} · ${c.promptVersion}` : ""} · {c.trigger}
                        </span>
                        {c.note && <span className="ml-2">“{c.note}”</span>}
                        {evidence.map((e) => (
                          <div key={e.id} className="mt-1 pl-2">
                            “{e.quote}”{" "}
                            <a href={e.sourceUrl} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                              source
                            </a>
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {d.killCriteria.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink">Kill criteria</h2>
          <ul className="mt-3 space-y-2">
            {d.killCriteria.map(({ row: k, indicators }) => (
              <li key={k.id} className="rounded-xl border border-border bg-surface p-3 text-sm text-ink">
                {k.condition}
                {indicators.map((i) => (
                  <span key={i.row.id} className="ml-2 text-xs text-ink-muted">
                    ({i.label} {OP[i.row.operator]} {i.row.threshold} {i.unit})
                  </span>
                ))}
                {k.triggeredAt && (
                  <span className="ml-2 text-xs font-medium text-contradicted">triggered {fmt(k.triggeredAt)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Versions</h2>
          <ul className="mt-3 space-y-1 text-xs text-ink-muted">
            {d.versions.map((v) => (
              <li key={v.id}>
                v{v.version} · {fmt(v.createdAt)} · {v.reason}
              </li>
            ))}
            {d.versions.length === 0 && <li>None yet.</li>}
          </ul>
          <h2 className="mt-6 text-sm font-semibold text-ink">Decisions</h2>
          <ul className="mt-3 space-y-1 text-xs text-ink-muted">
            {d.decisions.map((x) => (
              <li key={x.id}>
                {fmt(x.createdAt)} · {x.action} {x.sizeChangePct >= 0 ? "+" : ""}
                {x.sizeChangePct}% → {x.sizeAfterPct}% · {x.rationale}
              </li>
            ))}
            {d.decisions.length === 0 && <li>None yet.</li>}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">Action log</h2>
          <ul className="mt-3 space-y-1 font-mono text-[11px] text-ink-muted">
            {d.log.map((l) => (
              <li key={l.id}>
                {fmt(l.createdAt)} · {l.action} · {l.actorType === "user" ? "user" : l.actorName}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
