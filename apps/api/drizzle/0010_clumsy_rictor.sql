ALTER TABLE "briefs" ADD COLUMN "narrative" text;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "narrative_model" text;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "narrative_generated_at" timestamp with time zone;