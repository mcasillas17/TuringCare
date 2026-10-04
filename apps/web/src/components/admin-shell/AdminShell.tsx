import { NavShell } from "@/components/app-shell/NavShell";
import { useI18n } from "@/i18n";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { Link, Outlet } from "react-router-dom";
import { ADMIN_NAV_ITEMS } from "./admin-nav-items";

export function AdminShell() {
  const { t } = useI18n();

  return (
    <NavShell
      items={ADMIN_NAV_ITEMS}
      storageKey="tc-admin-nav-expanded"
      menuLabel={t("admin.menu")}
      home="/admin"
      fallbackTitle={t("admin.badge")}
      railTop={
        <div className="mb-1 flex items-center gap-2 px-3 py-2">
          <span className="rounded bg-copper px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {t("admin.badge")}
          </span>
        </div>
      }
      headerActions={
        <Link
          to="/my"
          aria-label={t("admin.backToApp")}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-soft hover:text-slate"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="hidden sm:inline">{t("admin.backToApp")}</span>
        </Link>
      }
    >
      <Suspense fallback={<p className="p-8">{t("common.loading")}</p>}>
        <Outlet />
      </Suspense>
    </NavShell>
  );
}
