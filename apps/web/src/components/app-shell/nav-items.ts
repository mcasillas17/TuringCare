import type { MessageKey } from "@/i18n/types";
import {
  ClipboardList,
  Cog,
  FileText,
  GraduationCap,
  LayoutDashboard,
  PawPrint,
  Shield,
  User,
  Users,
} from "lucide-react";

export type NavItem = {
  to: string;
  labelKey: Extract<MessageKey, `shell.${string}`>;
  icon: typeof PawPrint;
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/my", labelKey: "shell.overview", icon: LayoutDashboard },
  { to: "/my/dogs", labelKey: "shell.dogs", icon: PawPrint },
  { to: "/my/journal", labelKey: "shell.journal", icon: ClipboardList },
  { to: "/my/brief", labelKey: "shell.brief", icon: FileText },
  { to: "/my/trainers", labelKey: "shell.trainers", icon: Users },
  { to: "/my/courses", labelKey: "shell.courses", icon: GraduationCap },
  { to: "/my/profile", labelKey: "shell.profile", icon: User },
  { to: "/my/settings", labelKey: "shell.settings", icon: Cog },
  { to: "/admin", labelKey: "shell.admin", icon: Shield, adminOnly: true },
];
