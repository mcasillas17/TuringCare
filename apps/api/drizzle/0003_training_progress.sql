CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"name" text NOT NULL,
	"confidence" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "confidence_range" CHECK ("training_skills"."confidence" BETWEEN 1 AND 5)
);
--> statement-breakpoint
INSERT INTO "training_skills" ("goal_id", "name", "confidence", "position")
SELECT "id", "goal", 1, 0 FROM "training_goals"
WHERE "id" NOT IN (SELECT DISTINCT "goal_id" FROM "training_skills");
--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_skill_id_training_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."training_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_skills" ADD CONSTRAINT "training_skills_goal_id_training_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."training_goals"("id") ON DELETE cascade ON UPDATE no action;