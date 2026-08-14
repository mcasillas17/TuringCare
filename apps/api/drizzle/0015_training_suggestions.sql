CREATE TYPE "public"."advancement_status" AS ENUM('proposed', 'confirmed', 'stayed', 'rejected', 'regressed', 'insufficient_evidence', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."suggestion_action" AS ENUM('started', 'skipped', 'rated_useful', 'rated_not_useful');--> statement-breakpoint
CREATE TYPE "public"."suggestion_evidence_category" AS ENUM('curriculum_only', 'recent_practice', 'recent_observation');--> statement-breakpoint
CREATE TYPE "public"."suggestion_type" AS ENUM('exercise', 'safety_suppressed', 'needs_focus_skill', 'custom_skill_unsupported');--> statement-breakpoint
CREATE TABLE "advancement_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"rule_id" text NOT NULL,
	"evidence_session_count" integer NOT NULL,
	"evidence_day_count" integer NOT NULL,
	"evidence_window_days" integer NOT NULL,
	"evidence_session_ids" uuid[] NOT NULL,
	"evidence_occurred_at" timestamp with time zone[] NOT NULL,
	"evidence_practice_days" text[] NOT NULL,
	"evidence_outcomes" "practice_outcome"[] NOT NULL,
	"evidence_last_session_at" timestamp with time zone NOT NULL,
	"status" "advancement_status" DEFAULT 'proposed' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advancement_levels_range" CHECK ("advancement_proposals"."from_level" BETWEEN 1 AND 5 AND "advancement_proposals"."to_level" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "training_suggestion_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"action" "suggestion_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_suggestion_actions_once" UNIQUE("suggestion_id","action")
);
--> statement-breakpoint
CREATE TABLE "training_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dog_id" uuid NOT NULL,
	"skill_id" uuid,
	"catalog_skill_key" text,
	"week_start" date NOT NULL,
	"curriculum_version" text NOT NULL,
	"suggestion_type" "suggestion_type" NOT NULL,
	"rule_id" text,
	"level" integer,
	"fallback_level" integer,
	"fallback_dimension" "practice_dimension",
	"fallback_strategy" text,
	"evidence_category" "suggestion_evidence_category",
	"suppressed" boolean DEFAULT false NOT NULL,
	"safety_rule_id" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_suggestions_dedupe_key" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "advancement_proposals" ADD CONSTRAINT "advancement_proposals_skill_id_training_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."training_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_suggestion_actions" ADD CONSTRAINT "training_suggestion_actions_suggestion_id_training_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."training_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_suggestions" ADD CONSTRAINT "training_suggestions_dog_id_dogs_id_fk" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_suggestions" ADD CONSTRAINT "training_suggestions_skill_id_training_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."training_skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advancement_proposals_skill_idx" ON "advancement_proposals" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "training_suggestion_actions_suggestion_idx" ON "training_suggestion_actions" USING btree ("suggestion_id");--> statement-breakpoint
CREATE INDEX "training_suggestions_dog_created_idx" ON "training_suggestions" USING btree ("dog_id","created_at");--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_suggestion_id_training_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."training_suggestions"("id") ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
-- At most one open proposal per skill. Expressed as a partial index in raw SQL
-- because it is enforced only for `proposed` rows; the drizzle schema keeps the
-- plain index and this migration adds the constraint.
CREATE UNIQUE INDEX "advancement_proposals_open_skill_idx" ON "advancement_proposals" USING btree ("skill_id") WHERE "status" = 'proposed';--> statement-breakpoint
ALTER TABLE "training_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_suggestion_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "advancement_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  tbl text;
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tbl IN ARRAY ARRAY[
        'training_suggestions', 'training_suggestion_actions', 'advancement_proposals'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, rol);
      END LOOP;
    END IF;
  END LOOP;
END
$$;