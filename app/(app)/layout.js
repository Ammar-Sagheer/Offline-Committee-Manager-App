import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/app/_lib/helpers";
import { getSetupState } from "@/app/_lib/data-service";
import { siteConfig } from "@/app/_lib/siteConfig";
import { signOutAction } from "@/app/_lib/actions";
import NavLink from "@/app/_components/ui/NavLink";
import Icon from "@/app/_components/ui/Icon";

/**
 * The shell, and the gate.
 *
 * The check lives here rather than in each page, so every screen under it is
 * covered by default rather than by somebody remembering. proxy.js redirects
 * before this ever runs; this is the second fence, and the manager check inside
 * every Server Action is the third.
 */
export default async function AppLayout({ children }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const setup = await getSetupState();
  if (!setup.isReady) redirect("/setup");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-6 p-4">
          <div className="border-b border-border-strong px-2 pt-2 pb-4">
            <p className="text-lg font-semibold text-heading">{siteConfig.name}</p>
            <p className="mt-0.5 text-sm text-text-light">{siteConfig.committeeName}</p>
          </div>

          <nav className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
            <NavLink href="/" icon="dashboard" exact>Dashboard</NavLink>
            <NavLink href="/month" icon="month">This month</NavLink>
            <NavLink href="/members" icon="members">Members</NavLink>
            <NavLink href="/months" icon="history">Past months</NavLink>
            <NavLink href="/activity" icon="activity">Activity</NavLink>
            <NavLink href="/projection" icon="projection">Projection</NavLink>
            <NavLink href="/settings" icon="settings">Settings</NavLink>
            <NavLink href="/help" icon="help">Guide</NavLink>
          </nav>

          <div className="mt-auto border-t border-border pt-4">
            <p className="px-2 text-base font-medium text-text">{user.name}</p>
            <p className="px-2 text-sm text-text-light">
              {user.role === "manager" ? "Committee manager" : "Read-only"}
            </p>
            <form action={signOutAction} className="mt-2">
              <button type="submit" className="btn-quiet w-full justify-start">
                <Icon name="signout" className="size-5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 p-5 md:p-8">
        {user.role === "viewer" ? (
          <p className="mb-5 flex items-center gap-2 rounded-xl bg-surface-sunk px-4 py-3 text-base text-text-light">
            <Icon name="lock" className="size-5 shrink-0" />
            You are signed in as a viewer. You can read everything and change nothing.
          </p>
        ) : null}
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
