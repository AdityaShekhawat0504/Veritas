"use client";

import { useState } from "react";
import Link from "next/link";
import { DEMO_MEMO } from "@/lib/demoMemo";

export default function NewThesisPage() {
  const [memo, setMemo] = useState(DEMO_MEMO);
  const [notice, setNotice] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">
          Dashboard
        </Link>
        <span className="text-ink-faint">/</span>
        <span className="text-ink">New thesis</span>
      </div>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        New thesis
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        Paste an investment memo. Decompose extracts the claim, the load-bearing
        assumptions, and the evidence — which you confirm before saving.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Memo editor */}
        <section className="flex flex-col rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Memo
            </span>
            <button
              type="button"
              onClick={() => setMemo(DEMO_MEMO)}
              className="text-xs text-ink-muted transition-colors hover:text-ink"
            >
              Reset to demo memo
            </button>
          </div>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            spellCheck={false}
            placeholder="Paste your memo here…"
            className="min-h-[460px] w-full resize-none rounded-b-xl bg-transparent px-4 py-3.5 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </section>

        {/* Decompose result (placeholder until LLM is wired in step 3) */}
        <section className="flex flex-col rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
              Structured thesis
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center p-8">
            {notice ? (
              <div className="max-w-xs text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent ring-1 ring-inset ring-accent/30">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8v4l3 3" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-medium text-ink">
                  Decomposition isn&apos;t wired yet
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  This is the skeleton build. The LLM decompose step lands next —
                  it will render editable assumptions here for you to confirm.
                </p>
              </div>
            ) : (
              <p className="max-w-xs text-center text-sm text-ink-faint">
                The extracted claim, assumptions (critical vs supporting), and
                evidence will appear here once you decompose.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setNotice(true)}
          disabled={memo.trim().length === 0}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Decompose
        </button>
        <span className="text-xs text-ink-faint">
          {memo.trim().length.toLocaleString()} characters
        </span>
      </div>
    </div>
  );
}
