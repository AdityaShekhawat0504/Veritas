import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { todayUtc } from "@/lib/actions/rules";
import type { DraftExtraction } from "@/lib/intake/draft";
import { initialReviewState } from "@/lib/intake/review";
import { currentActor, getThesisDetail, listCatalog } from "@/lib/queries";
import { ReviewForm } from "@/components/ReviewForm";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const actor = await currentActor(db);
  if (!actor) redirect("/signin");
  const detail = await getThesisDetail(db, actor.firmId, id);
  if (!detail) notFound();
  if (detail.thesis.status !== "draft") redirect(`/thesis/${id}`);

  const draft = (detail.thesis.draftExtraction ?? null) as DraftExtraction | null;
  const catalog = await listCatalog(db);
  const initial = initialReviewState(draft, {
    claim: detail.thesis.claim,
    direction: detail.thesis.direction,
    horizonMonths: detail.thesis.horizonMonths,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="font-mono text-sm text-ink-muted">{detail.security.ticker}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Review the draft</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Edit every assumption. Critical assumptions need your probability and a resolve-by date.
          Indicators can only come from the catalog.
          {draft ? ` Drafted by ${draft.model} with prompt ${draft.promptVersion}.` : ""}
        </p>
      </div>
      <ReviewForm
        thesisId={id}
        initial={initial}
        catalog={catalog.map((c) => ({ key: c.key, label: c.label, unit: c.unit, source: c.source }))}
        today={todayUtc()}
        dropped={draft?.dropped ?? []}
      />
    </div>
  );
}
