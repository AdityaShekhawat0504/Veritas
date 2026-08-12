import { auth, signOut } from "@/lib/auth";

/** Header identity + sign-out. Server component: renders nothing when signed out. */
export async function UserMenu() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  const label = user.name || user.email || "Signed in";

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-2">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-6 w-6 rounded-full ring-1 ring-inset ring-border"
          />
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold uppercase text-accent">
            {label.slice(0, 1)}
          </span>
        )}
        <span className="hidden max-w-[12rem] truncate text-sm text-ink-muted sm:inline">
          {label}
        </span>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button
          type="submit"
          className="rounded-md px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
