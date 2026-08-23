import { PublicLayout } from "@/components/PublicLayout";
import { AppShell } from "@/components/app-shell/AppShell";
import { useSession } from "@/lib/auth-client";
import { useSessionQueryReady } from "@/lib/session-query-boundary";
import { Outlet } from "react-router-dom";

/**
 * Chrome for the public directory routes (/trainers, /courses, + :id).
 *
 * These routes are reachable by anyone, but the surrounding chrome adapts to
 * auth state so a logged-in user doesn't lose their app shell when they open a
 * directory page (e.g. clicking "Find a trainer" from /my):
 *   - signed in  → render the app shell (sidebar + top bar); AppShell's own
 *                  <Outlet/> renders the matched directory page.
 *   - anonymous  → render the public marketing chrome (SiteNav + footer).
 *
 * While the session is still resolving we render nothing briefly to avoid
 * flashing the wrong chrome. In-app navigations have a cached session, so the
 * signed-in path is flicker-free.
 */
export function DirectoryLayout() {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;
  const identityReady = useSessionQueryReady(typeof userId === "string" ? userId : null);
  if (isPending || !identityReady) return null;
  if (session) return <AppShell />;
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}
