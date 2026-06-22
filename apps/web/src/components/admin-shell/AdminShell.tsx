import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { ArrowLeft, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Suspense, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ADMIN_NAV_ITEMS } from "./admin-nav-items";

const STORAGE_KEY = "tc-admin-nav-expanded";

export function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const current = ADMIN_NAV_ITEMS.find((i) =>
    i.end ? location.pathname === i.to : location.pathname.startsWith(i.to),
  );

  function toggleExpanded() {
    setExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const rail = (
    <nav
      aria-label="Admin menu"
      className={cn(
        "flex h-full flex-col gap-1 bg-slate p-2 text-cream",
        expanded ? "w-52" : "w-14",
      )}
    >
      <div className="mb-1 flex items-center gap-2 px-3 py-2">
        <span className="rounded bg-copper px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Admin
        </span>
      </div>
      {ADMIN_NAV_ITEMS.map((i) => {
        const Icon = i.icon;
        return (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                isActive ? "bg-cream/15 text-gold" : "text-cream/80 hover:bg-cream/10",
              )
            }
          >
            <Icon className="size-5 shrink-0" />
            {expanded && <span>{i.label}</span>}
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={expanded ? "Collapse menu" : "Expand menu"}
        className="mt-auto flex items-center gap-3 rounded px-3 py-2 text-sm text-cream/70 hover:bg-cream/10"
      >
        {expanded ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
        {expanded && <span>Collapse</span>}
      </button>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex h-16 items-center justify-between border-b border-silver/60 bg-cream px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden"
            aria-label="Admin menu"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-6 text-slate" />
          </button>
          <Link to="/admin">
            <BrandMark />
          </Link>
          <span className="hidden text-slate-soft sm:inline">·</span>
          <span className="hidden font-semibold text-slate sm:inline">
            {current ? current.label : "Admin"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/my"
            aria-label="Back to app"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-soft hover:text-slate"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="hidden sm:inline">Back to app</span>
          </Link>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              toast.success("Signed out");
              navigate("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <div className="flex flex-1">
        <div className="hidden md:block">{rail}</div>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-slate/40"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full">{rail}</div>
          </div>
        )}
        <main className="flex-1 overflow-auto p-6">
          <Suspense fallback={<p className="p-8">Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
