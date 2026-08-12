"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-checks every assumption on the thesis against current reality, then
 * refreshes the server component so the new statuses + integrity score render.
 */
export function CheckButton({ thesisId }: { thesisId: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const busy = checking || refreshing;

  async function handleCheck() {
    setError(null);
    setChecking(true);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesisId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "The check failed.");
      // Pull the freshly persisted statuses + score into the page.
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check failed.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-1.5">
      <button
        type="button"
        onClick={handleCheck}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        )}
        {checking ? "Checking…" : refreshing ? "Updating…" : "Check thesis now"}
      </button>
      {error && (
        <span className="text-xs text-contradicted">{error}</span>
      )}
    </div>
  );
}
