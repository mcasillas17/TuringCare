import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const base = import.meta.env.VITE_API_URL || "";
const publicBriefPath = /^\/b\/[^/]+\/?$/i;

export function pageViewPath(pathname: string): string {
  return publicBriefPath.test(pathname) ? "/b/:token" : pathname;
}

/** Fire-and-forget telemetry. Network/HTTP failures are swallowed. */
export function track(name: string, props: Record<string, unknown> = {}): void {
  void fetch(`${base}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, props }),
  }).catch(() => {});
}

/** Mount once inside the Router: emits page.viewed on every route change
 * (including landing/pre-auth, where the server records userId = null).
 * In dev (StrictMode) effects remount, so each view fires twice — expected, dev-only. */
export function PageViewTracker(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    track("page.viewed", { path: pageViewPath(pathname) });
  }, [pathname]);
  return null;
}
