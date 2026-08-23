CREATE TYPE "public"."locale" AS ENUM('en', 'es');--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "locale" "locale" DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locale" "locale";