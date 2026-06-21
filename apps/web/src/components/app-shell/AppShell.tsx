import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { TuringCompanion } from "@/components/turing-companion";
import { TuringProvider } from "@/components/turing/turing-context";
import { Button } from "@/components/ui/button";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { useI18n } from "@/i18n";
import { signOut } from "@/lib/auth-client";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { NAV_ITEMS } from "./nav-items";

const STORAGE_KEY = "tc-nav-expanded";

export function AppShell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = NAV_ITEMS.filter((i) => !i.adminOnly || me?.role === "admin");
  const current = items.find(
    (i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`),
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
      aria-label={t("shell.menu")}
      className={cn(
        "flex h-full flex-col gap-1 bg-slate p-2 text-cream",
        expanded ? "w-52" : "w-14",
      )}
    >
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === "/my"}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                isActive ? "bg-cream/15 text-gold" : "text-cream/80 hover:bg-cream/10",
              )
            }
          >
            <Icon className="size-5 shrink-0" />
            {expanded && <span>{t(i.labelKey)}</span>}
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-label={expanded ? t("shell.collapse") : t("shell.expand")}
        className="mt-auto flex items-center gap-3 rounded px-3 py-2 text-sm text-cream/70 hover:bg-cream/10"
      >
        {expanded ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
        {expanded && <span>{t("shell.collapse")}</span>}
      </button>
    </nav>
  );

  return (
    <TuringProvider>
      <div className="flex min-h-screen flex-col bg-cream">
        <header className="flex h-16 items-center justify-between border-b border-silver/60 bg-cream px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden"
              aria-label={t("shell.menu")}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="size-6 text-slate" />
            </button>
            <Link to="/my">
              <BrandMark />
            </Link>
            <span className="hidden text-slate-soft sm:inline">·</span>
            <span className="hidden font-semibold text-slate sm:inline">
              {current ? t(current.labelKey) : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                toast.success(t("app.signedOut"));
                navigate("/login");
              }}
            >
              {t("app.signOut")}
            </Button>
            <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
            <LanguageToggle />
          </div>
        </header>
        <VerifyEmailBanner />
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
            <Outlet />
          </main>
        </div>
        <TuringCompanion />
      </div>
    </TuringProvider>
  );
}
