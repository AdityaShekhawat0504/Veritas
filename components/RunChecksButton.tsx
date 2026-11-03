"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunChecksButton({ thesisId }: { thesisId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/theses/${thesisId}/check`, { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        checks?: { changed: boolean }[];
        skipped?: { reason: string }[];
        killCriteriaTriggered?: number;
      };
      if (!res.ok) {
        setMsg(body.error ?? "Check failed.");
        return;
      }
      const n = body.checks?.length ?? 0;
      const changed = body.checks?.filter((c) => c.changed).length ?? 0;
      const skipped = body.skipped ?? [];
      setMsg(
        `${n} numeric check${n === 1 ? "" : "s"} run, ${changed} verdict change${changed === 1 ? "" : "s"}` +
          (body.killCriteriaTriggered ? `, ${body.killCriteriaTriggered} kill criteria triggered` : "") +
          (skipped.length ? `. Skipped ${skipped.length}: ${[...new Set(skipped.map((s) => s.reason))].join("; ")}` : "."),
      );
      router.refresh();
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-sm text-ink hover:border-accent/50 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Run numeric checks now"}
      </button>
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}
