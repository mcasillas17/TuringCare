CREATE TYPE "public"."journal_entry_kind" AS ENUM('moment', 'daily_checkin');
--> statement-breakpoint
CREATE TYPE "public"."journal_trend" AS ENUM('better', 'same', 'harder');
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "kind" "journal_entry_kind" DEFAULT 'moment';
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "note" text;
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "trend" "journal_trend";
--> statement-breakpoint
UPDATE "journal_entries"
SET "kind" = 'moment'
WHERE "kind" IS NULL;
--> statement-breakpoint
UPDATE "journal_entries"
SET "note" = trim(both ' ' from concat_ws(' ',
  CASE WHEN nullif(trim("antecedent"), '') IS NOT NULL THEN 'A: ' || trim("antecedent") END,
  CASE WHEN nullif(trim("behavior"), '') IS NOT NULL THEN 'B: ' || trim("behavior") END,
  CASE WHEN nullif(trim("consequence"), '') IS NOT NULL THEN 'C: ' || trim("consequence") END
))
WHERE "note" IS NULL;
--> statement-breakpoint
UPDATE "journal_entries"
SET "note" = trim("behavior")
WHERE nullif(trim("note"), '') IS NULL AND nullif(trim("behavior"), '') IS NOT NULL;
--> statement-breakpoint
UPDATE "journal_entries"
SET "note" = 'Legacy journal entry'
WHERE nullif(trim("note"), '') IS NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "kind" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "note" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "antecedent" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "behavior" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "consequence" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "intensity" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "journal_entries" DROP CONSTRAINT "intensity_range";
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_intensity_range" CHECK ("journal_entries"."intensity" IS NULL OR "journal_entries"."intensity" BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_daily_checkin_trend" CHECK ("journal_entries"."kind" <> 'daily_checkin' OR "journal_entries"."trend" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_moment_trend_null" CHECK ("journal_entries"."kind" <> 'moment' OR "journal_entries"."trend" IS NULL);
