ALTER TABLE "briefs" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_share_token_unique" UNIQUE("share_token");