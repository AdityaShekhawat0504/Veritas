"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** One-click clone of the demo theses into the user's own dashboard. */
export function LoadSamplesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const busy = loading || refreshing;

  async function handleLoad() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/samples", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load samples.");
      startRefresh(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load samples.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleLoad}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && (
          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
        {loading ? "Loading…" : refreshing ? "Opening…" : "Load sample theses"}
      </button>
      {error && <span className="text-xs text-contradicted">{error}</span>}
    </div>
  );
}
