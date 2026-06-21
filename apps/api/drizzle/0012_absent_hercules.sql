CREATE TABLE "skill_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"reached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_milestone_skill_level" UNIQUE("skill_id","level"),
	CONSTRAINT "milestone_level_range" CHECK ("skill_milestones"."level" BETWEEN 2 AND 5)
);
--> statement-breakpoint
ALTER TABLE "skill_milestones" ADD CONSTRAINT "skill_milestones_skill_id_training_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."training_skills"("id") ON DELETE cascade ON UPDATE no action;