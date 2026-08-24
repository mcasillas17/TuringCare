LOCK TABLE "dogs" IN EXCLUSIVE MODE;--> statement-breakpoint
LOCK TABLE "briefs" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
WITH "dogs_with_duplicate_versions" AS (
	SELECT "dog_id"
	FROM "briefs"
	GROUP BY "dog_id"
	HAVING COUNT(*) <> COUNT(DISTINCT "version")
),
"ranked_briefs" AS (
	SELECT
		"briefs"."id",
		(ROW_NUMBER() OVER (
			PARTITION BY "briefs"."dog_id"
			ORDER BY "briefs"."version" ASC, "briefs"."generated_at" ASC, "briefs"."id" ASC
		))::integer AS "next_version"
	FROM "briefs"
	INNER JOIN "dogs_with_duplicate_versions"
		ON "dogs_with_duplicate_versions"."dog_id" = "briefs"."dog_id"
)
UPDATE "briefs"
SET "version" = "ranked_briefs"."next_version"
FROM "ranked_briefs"
WHERE "briefs"."id" = "ranked_briefs"."id"
	AND "briefs"."version" <> "ranked_briefs"."next_version";--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_dog_id_version_unique" UNIQUE("dog_id","version");
