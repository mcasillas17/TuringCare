CREATE TYPE "public"."guided_setup_action_type" AS ENUM('behavior', 'training', 'progress');--> statement-breakpoint
CREATE TYPE "public"."guided_setup_completion_reason" AS ENUM('first_action_completed', 'skipped', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."guided_setup_intent" AS ENUM('understand_behavior', 'train_skill', 'track_progress');--> statement-breakpoint
CREATE TYPE "public"."guided_setup_step" AS ENUM('intent', 'action');--> statement-breakpoint
CREATE TABLE "guided_setups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"dog_id" uuid,
	"current_step" "guided_setup_step" DEFAULT 'intent' NOT NULL,
	"intent" "guided_setup_intent",
	"completed_at" timestamp with time zone,
	"completion_reason" "guided_setup_completion_reason",
	"first_action_type" "guided_setup_action_type",
	"first_action_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guided_setups_dog_id_unique" UNIQUE("dog_id"),
	CONSTRAINT "guided_setups_completion_fields_match" CHECK (("guided_setups"."completed_at" IS NULL AND "guided_setups"."completion_reason" IS NULL) OR ("guided_setups"."completed_at" IS NOT NULL AND "guided_setups"."completion_reason" IS NOT NULL)),
	CONSTRAINT "guided_setups_active_requires_dog" CHECK ("guided_setups"."completed_at" IS NOT NULL OR "guided_setups"."dog_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "guided_setups" ADD CONSTRAINT "guided_setups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guided_setups" ADD CONSTRAINT "guided_setups_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guided_setups_one_active_owner" ON "guided_setups" USING btree ("user_id") WHERE "guided_setups"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "guided_setups_user_started_idx" ON "guided_setups" USING btree ("user_id","started_at");
--> statement-breakpoint
ALTER TABLE "guided_setups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  tbl text;
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tbl IN ARRAY ARRAY['guided_setups'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, rol);
      END LOOP;
    END IF;
  END LOOP;
END
$$;