CREATE TABLE "focus_compatibility_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"week_start" date NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "focus_compatibility_dog_session" UNIQUE("dog_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "legacy_focus_claims" (
	"dog_id" uuid PRIMARY KEY NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_focus" ADD COLUMN "week_start" date;--> statement-breakpoint
ALTER TABLE "weekly_focus" DROP CONSTRAINT "weekly_focus_dog_skill";--> statement-breakpoint
ALTER TABLE "focus_compatibility_weeks" ADD CONSTRAINT "focus_compatibility_weeks_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_focus_claims" ADD CONSTRAINT "legacy_focus_claims_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_focus" ADD CONSTRAINT "weekly_focus_dog_week" UNIQUE("dog_id","week_start");--> statement-breakpoint
ALTER TABLE "weekly_focus" ADD CONSTRAINT "weekly_focus_week_start_monday"
CHECK ("week_start" IS NULL OR extract(isodow from "week_start") = 1);
--> statement-breakpoint
CREATE FUNCTION "protect_weekly_focus_history_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- FK cascades delete at trigger depth 2. Preserve dog/goal/skill deletion
  -- while still rejecting direct unscoped deletes from an old API handler.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  IF OLD."week_start" IS NOT NULL
     AND current_setting('app.allow_weekly_focus_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'week-scoped focus delete requires app.allow_weekly_focus_delete';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "weekly_focus_history_delete_guard"
BEFORE DELETE ON "weekly_focus"
FOR EACH ROW EXECUTE FUNCTION "protect_weekly_focus_history_delete"();--> statement-breakpoint
ALTER TABLE "focus_compatibility_weeks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legacy_focus_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.focus_compatibility_weeks FROM %I', rol);
      EXECUTE format('REVOKE ALL ON TABLE public.legacy_focus_claims FROM %I', rol);
    END IF;
  END LOOP;
END
$$;