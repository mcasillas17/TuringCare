ALTER TABLE "brief_sends" ADD COLUMN "delivered_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "brief_sends" SET "delivered_at" = "sent_at";
