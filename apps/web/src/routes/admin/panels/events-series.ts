import { dayKey, mondayOf } from "@/lib/week";
import { type Category, eventCategory } from "./event-category";

export type SeriesRow = { bucket: string; total: number } & Partial<Record<Category, number>>;

/** Group day×name event counts into day or Monday-week buckets, summing per
 *  category (and a `total`), dropping hidden categories. Sorted by bucket. */
export function buildSeries(
  eventsByDay: { day: string; name: string; count: number }[],
  granularity: "day" | "week",
  hidden: Set<Category>,
): SeriesRow[] {
  const bucketOf = (day: string) =>
    granularity === "week" ? dayKey(mondayOf(new Date(`${day}T00:00:00`))) : day;

  const map = new Map<string, SeriesRow>();
  for (const { day, name, count } of eventsByDay) {
    const cat = eventCategory(name);
    if (hidden.has(cat)) continue;
    const bucket = bucketOf(day);
    const row = map.get(bucket) ?? { bucket, total: 0 };
    row[cat] = (row[cat] ?? 0) + count;
    row.total += count;
    map.set(bucket, row);
  }
  return [...map.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}
