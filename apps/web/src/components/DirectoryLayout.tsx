import { PublicLayout } from "@/components/PublicLayout";
import { AppShell } from "@/components/app-shell/AppShell";
import { useSessionQueriesReady, useSessionResolvedOnce } from "@/lib/session-query-boundary";
import { useHasVerifiedSession } from "@/lib/verified-session";
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
 * Wait for the first session result and private-cache sanitation. Later refreshes
 * preserve the page; a failed session check falls back to public browsing.
 */
export function DirectoryLayout() {
  const verified = useHasVerifiedSession();
  const cacheReady = useSessionQueriesReady();
  const resolvedOnce = useSessionResolvedOnce();
  if (!cacheReady || !resolvedOnce) return null;
  if (verified) return <AppShell />;
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}
