export type Category =
  | "pageViews"
  | "training"
  | "journalDogs"
  | "briefs"
  | "directory"
  | "auth"
  | "other";

export const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: "pageViews", label: "Page views", color: "#c8893b" },
  { key: "training", label: "Training", color: "#7fb8d6" },
  { key: "journalDogs", label: "Journal & dogs", color: "#28323d" },
  { key: "briefs", label: "Briefs", color: "#e0a85a" },
  { key: "directory", label: "Directory", color: "#9bbf9b" },
  { key: "auth", label: "Auth", color: "#a98bd0" },
  { key: "other", label: "Other", color: "#c9d4dd" },
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
