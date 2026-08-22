WITH ranked_briefs AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "dog_id"
      ORDER BY "version" DESC, "generated_at" DESC, "id" DESC
    ) AS brief_rank
  FROM "briefs"
)
UPDATE "briefs"
SET "share_token" = NULL
FROM ranked_briefs
WHERE "briefs"."id" = ranked_briefs."id"
  AND ranked_briefs.brief_rank > 1
  AND "briefs"."share_token" IS NOT NULL;

--> statement-breakpoint
CREATE UNIQUE INDEX "briefs_one_active_share_per_dog_idx" ON "briefs" USING btree ("dog_id") WHERE "briefs"."share_token" IS NOT NULL;