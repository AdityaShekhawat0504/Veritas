import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export const metadata = { title: "Sign in · Veritas IC" };

export default async function SignInPage() {
  // Already signed in? Skip the gate.
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center">
      <div className="w-full rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent-soft text-accent ring-1 ring-inset ring-accent/30">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 4 6v6c0 4.5 3.4 7.5 8 9 4.6-1.5 8-4.5 8-9V6l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-tight text-ink">
            Veritas <span className="text-ink-faint">IC</span>
          </span>
        </div>

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink">
          Sign in
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Turn an investment memo into a structured, monitorable thesis. Sign in
          to see and check your own theses.
        </p>

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-border-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink shadow-sm transition-colors hover:border-accent/50 hover:text-accent"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
            </svg>
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}
