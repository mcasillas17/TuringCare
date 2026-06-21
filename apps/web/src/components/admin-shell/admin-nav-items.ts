import { GraduationCap, LayoutDashboard, Users } from "lucide-react";

export type AdminNavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/trainers", label: "Trainers", icon: Users },
  { to: "/admin/courses", label: "Courses", icon: GraduationCap },
];
