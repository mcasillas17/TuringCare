import type { MessageKey } from "@/i18n/types";
import { GraduationCap, LayoutDashboard, Users } from "lucide-react";

export type AdminNavItem = {
  to: string;
  labelKey: Extract<MessageKey, `admin.${string}`>;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin", labelKey: "admin.dashboardNav", icon: LayoutDashboard, end: true },
  { to: "/admin/trainers", labelKey: "admin.trainersNav", icon: Users },
  { to: "/admin/courses", labelKey: "admin.coursesNav", icon: GraduationCap },
];
