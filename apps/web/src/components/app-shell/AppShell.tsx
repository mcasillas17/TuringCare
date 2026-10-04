import { TuringCompanion } from "@/components/turing-companion";
import { TuringProvider } from "@/components/turing/turing-context";
import { useI18n } from "@/i18n";
import { useMe } from "@/lib/me";
import { Outlet } from "react-router-dom";
import { NavShell } from "./NavShell";
import { NAV_ITEMS } from "./nav-items";

export function AppShell() {
  const { t } = useI18n();
  const { data: me } = useMe();
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || me?.role === "admin");

  return (
    <TuringProvider>
      <NavShell
        items={items}
        storageKey="tc-nav-expanded"
        menuLabel={t("shell.menu")}
        home="/my"
        mainClassName="pb-44 md:pb-6"
        footer={<TuringCompanion />}
      >
        <Outlet />
      </NavShell>
    </TuringProvider>
  );
}
