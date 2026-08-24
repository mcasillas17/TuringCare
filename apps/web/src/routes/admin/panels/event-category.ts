import type { MessageKey } from "@/i18n/types";

export type Category =
  | "pageViews"
  | "training"
  | "journalDogs"
  | "briefs"
  | "directory"
  | "auth"
  | "other";

export const CATEGORIES: { key: Category; labelKey: MessageKey; color: string }[] = [
  { key: "pageViews", labelKey: "admin.pageViews", color: "#c8893b" },
  { key: "training", labelKey: "admin.eventTraining", color: "#7fb8d6" },
  { key: "journalDogs", labelKey: "admin.journalDogs", color: "#28323d" },
  { key: "briefs", labelKey: "admin.briefs", color: "#e0a85a" },
  { key: "directory", labelKey: "admin.directory", color: "#9bbf9b" },
  { key: "auth", labelKey: "admin.auth", color: "#a98bd0" },
  { key: "other", labelKey: "admin.other", color: "#c9d4dd" },
];

export function eventCategory(name: string): Category {
  if (name === "page.viewed") return "pageViews";
  if (name.startsWith("training.") || name.startsWith("focus.")) return "training";
  if (name.startsWith("journal.") || name.startsWith("dog.")) return "journalDogs";
  if (name.startsWith("brief.")) return "briefs";
  if (name === "trainer.viewed" || name === "course.viewed") return "directory";
  if (name.startsWith("user.")) return "auth";
  return "other";
}
