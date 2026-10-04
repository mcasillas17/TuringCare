import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { useSignOut } from "@/lib/sign-out";
import { cn } from "@/lib/utils";
import { type LucideIcon, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { toast } from "sonner";

export type ShellNavItem = { to: string; labelKey: MessageKey; icon: LucideIcon; end?: boolean };

/** Shared chrome for the app and admin shells: header, collapsible rail, mobile drawer. */
export function NavShell({
  items,
  storageKey,
  menuLabel,
  home,
  fallbackTitle = "",
  railTop,
  headerActions,
  mainClassName,
  footer,
  children,
}: {
  items: ShellNavItem[];
  storageKey: string;
  menuLabel: string;
  home: string;
  fallbackTitle?: string;
  railTop?: ReactNode;
  headerActions?: ReactNode;
  mainClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const signOutAndNavigate = useSignOut();
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) !== "false";
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const current = items.find(
    (i) => pathname === i.to || (!i.end && pathname.startsWith(`${i.to}/`)),
  );

  function toggleExpanded() {
    setExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const rail = (
    <nav
      aria-label={menuLabel}
      className={cn(
        "flex h-full flex-col gap-1 bg-slate p-2 text-cream",
        expanded ? "w-52" : "w-14",
      )}
    >
      {railTop}
      {items.map((i) => {
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
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex h-16 items-center justify-between border-b border-silver/60 bg-cream px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden"
            aria-label={menuLabel}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-6 text-slate" />
          </button>
          <Link to={home}>
            <BrandMark />
          </Link>
          <span className="hidden text-slate-soft sm:inline">·</span>
          <span className="hidden font-semibold text-slate sm:inline">
            {current ? t(current.labelKey) : fallbackTitle}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {headerActions}
          <Button
            variant="outline"
            onClick={async () => {
              const result = await signOutAndNavigate();
              if (result.ok) {
                toast.success(t("app.signedOut"));
              } else {
                toast.error(t("app.signOutFailed"));
              }
            }}
          >
            {t("app.signOut")}
          </Button>
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <LanguageToggle />
        </div>
      </header>
      <div className="flex flex-1">
        <div className="hidden md:block">{rail}</div>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label={t("shell.close")}
              className="absolute inset-0 bg-slate/40"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full">{rail}</div>
          </div>
        )}
        <main className={cn("flex-1 overflow-auto p-6", mainClassName)}>{children}</main>
      </div>
      {footer}
    </div>
  );
}
