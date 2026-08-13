CREATE TYPE "public"."practice_cue_support" AS ENUM('food_lure', 'hand_signal', 'verbal_cue', 'no_extra_help');--> statement-breakpoint
CREATE TYPE "public"."practice_dimension" AS ENUM('cue_support', 'environment', 'distance', 'duration', 'distraction');--> statement-breakpoint
CREATE TYPE "public"."practice_distance" AS ENUM('at_side', 'few_steps', 'across_room', 'across_yard', 'far_away');--> statement-breakpoint
CREATE TYPE "public"."practice_distraction" AS ENUM('none', 'mild', 'moderate', 'strong');--> statement-breakpoint
CREATE TYPE "public"."practice_duration_band" AS ENUM('under_5_seconds', 'about_15_seconds', 'about_30_seconds', 'one_to_two_minutes', 'five_to_fifteen_minutes', 'about_30_minutes', 'one_to_two_hours', 'half_day_or_more');--> statement-breakpoint
CREATE TYPE "public"."practice_environment" AS ENUM('home_quiet', 'home_busy', 'yard', 'quiet_outdoor', 'busy_outdoor');--> statement-breakpoint
CREATE TYPE "public"."practice_outcome" AS ENUM('went_well', 'mixed', 'too_hard');--> statement-breakpoint
CREATE TYPE "public"."practice_variant" AS ENUM('primary', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."safety_signal_source" AS ENUM('practice_session', 'behavior_concern');--> statement-breakpoint
CREATE TYPE "public"."safety_signal_type" AS ENUM('aggression_or_bite_risk', 'injury_or_pain', 'severe_fear_or_panic', 'severe_behavior_concern');--> statement-breakpoint
CREATE TABLE "dog_safety_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"type" "safety_signal_type" NOT NULL,
	"source" "safety_signal_source" NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "outcome" "practice_outcome";--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "cue_support" "practice_cue_support";--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "environment" "practice_environment";--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "distance" "practice_distance";--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "duration_band" "practice_duration_band";--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "distraction" "practice_distraction";--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "curriculum_level" integer;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "curriculum_version" text;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "practice_variant" "practice_variant";--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "suggestion_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "practice_day" date;--> statement-breakpoint
ALTER TABLE "dog_safety_signals" ADD CONSTRAINT "dog_safety_signals_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dog_safety_signals_dog_reported_idx" ON "dog_safety_signals" USING btree ("dog_id","reported_at");--> statement-breakpoint
CREATE INDEX "practice_sessions_skill_occurred_idx" ON "practice_sessions" USING btree ("skill_id","occurred_at");--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_curriculum_level_range" CHECK ("practice_sessions"."curriculum_level" IS NULL OR "practice_sessions"."curriculum_level" BETWEEN 1 AND 5);--> statement-breakpoint
-- Existing severe concerns already represented a safety condition before this
-- table existed. Preserve that condition even if the concern is later deleted.
INSERT INTO "dog_safety_signals" ("dog_id", "type", "source", "reported_at")
SELECT "dog_id", 'severe_behavior_concern', 'behavior_concern', "created_at"
FROM "behavior_concerns"
WHERE "severity" = 'severe';--> statement-breakpoint
CREATE FUNCTION "persist_severe_behavior_concern_signal"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."severity" = 'severe' THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('dog-safety:' || NEW."dog_id"::text)
    );
    INSERT INTO "dog_safety_signals" ("dog_id", "type", "source", "reported_at")
    SELECT NEW."dog_id", 'severe_behavior_concern', 'behavior_concern', NEW."created_at"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "dog_safety_signals"
      WHERE "dog_id" = NEW."dog_id"
        AND "type" = 'severe_behavior_concern'
        AND "source" = 'behavior_concern'
        AND "reported_at" = NEW."created_at"
    );
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "behavior_concern_severe_signal"
AFTER INSERT OR UPDATE OF "severity" ON "behavior_concerns"
FOR EACH ROW EXECUTE FUNCTION "persist_severe_behavior_concern_signal"();--> statement-breakpoint
-- Same deny-all posture as 0011_enable_rls.sql: RLS on, no policies, and strip
-- any PostgREST grants where those roles exist. `skill_milestones` is included
-- because 0012 created it without RLS.
ALTER TABLE "dog_safety_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  tbl text;
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tbl IN ARRAY ARRAY['dog_safety_signals', 'skill_milestones'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, rol);
      END LOOP;
    END IF;
  END LOOP;
END
$$;
