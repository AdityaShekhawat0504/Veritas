import { convictionMismatch } from "@/lib/score";
import type { Conviction } from "@/lib/types";

export function MismatchBanner({
  conviction,
  score,
}: {
  conviction: Conviction;
  score: number;
}) {
  const mismatch = convictionMismatch(conviction, score);
  if (!mismatch) return null;

  const overconfident = mismatch.kind === "overconfident";
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${
        overconfident
          ? "border-contradicted/40 bg-contradicted/10"
          : "border-weakening/40 bg-weakening/10"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`mt-0.5 h-5 w-5 shrink-0 ${overconfident ? "text-contradicted" : "text-weakening"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <div>
        <p className={`text-sm font-semibold ${overconfident ? "text-contradicted" : "text-weakening"}`}>
          Conviction–integrity mismatch
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">{mismatch.message}</p>
      </div>
    </div>
  );
}
