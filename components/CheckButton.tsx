"use client";

import { useState } from "react";

// Placeholder for step 4 — the live re-check wiring lands with /api/check.
export function CheckButton() {
  const [clicked, setClicked] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => setClicked(true)}
        className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink shadow-sm transition-colors hover:border-accent/50 hover:text-accent"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        Check thesis now
      </button>
      {clicked && (
        <span className="text-xs text-ink-faint">
          Live checking arrives with the /api/check wiring.
        </span>
      )}
    </div>
  );
}
