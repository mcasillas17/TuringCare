import type { MessageKey } from "@/i18n/types";
import {
  ClipboardList,
  Cog,
  FileText,
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
  { to: "/app", labelKey: "shell.overview", icon: LayoutDashboard },
  { to: "/app/dogs", labelKey: "shell.dogs", icon: PawPrint },
  { to: "/app/journal", labelKey: "shell.journal", icon: ClipboardList },
  { to: "/app/brief", labelKey: "shell.brief", icon: FileText },
  { to: "/app/trainers", labelKey: "shell.trainers", icon: Users },
  { to: "/app/profile", labelKey: "shell.profile", icon: User },
  { to: "/app/settings", labelKey: "shell.settings", icon: Cog },
  { to: "/admin", labelKey: "shell.admin", icon: Shield, adminOnly: true },
];
