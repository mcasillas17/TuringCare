CREATE TABLE "brief_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by_user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brief_sends" ADD CONSTRAINT "brief_sends_brief_id_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."briefs"("id") ON DELETE cascade ON UPDATE no action;