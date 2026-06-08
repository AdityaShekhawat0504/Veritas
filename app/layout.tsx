import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veritas IC",
  description: "Turn an investment memo into a structured, monitorable thesis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-border bg-canvas/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-soft text-accent ring-1 ring-inset ring-accent/30">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 4 6v6c0 4.5 3.4 7.5 8 9 4.6-1.5 8-4.5 8-9V6l-8-3Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <span className="text-sm font-semibold tracking-tight text-ink">
                Veritas <span className="text-ink-faint">IC</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                Dashboard
              </Link>
              <Link
                href="/thesis/new"
                className="rounded-md bg-accent px-3 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-accent/90"
              >
                New thesis
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
