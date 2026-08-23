import { type Locale, formatDateInUtc } from "@turingcare/i18n";

export function formatAdminChartDate(locale: Locale, dateBucket: unknown): string {
  if (typeof dateBucket !== "string") return "";
  return (
    formatDateInUtc(locale, dateBucket, {
      day: "numeric",
      month: "short",
    }) ?? ""
  );
}
